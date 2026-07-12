/* eslint-disable @typescript-eslint/unbound-method */
import {
  AssistantMessage,
  getMessageText,
  isDangerousBashCommand,
  isExecutableTool,
  isRunnableConversation,
  Message,
  normalizeThread,
  reduceMessages,
  RUN_LAST_MESSAGE_ERROR,
  streamThread,
  Tool as ToolSchema,
  uuid,
  type AgentTransport,
  type BuiltinTool,
  type McpTool,
  type MessageContent,
  type ModelConfig,
  type ModelConfigParams,
  type ReducedMessageContent,
  type Thread,
  type ThreadContext,
  type ThreadVariable,
  type ThreadVariableVariants,
  type ThreadVariables,
  type Tool,
  type ToolCall,
  type UserMessage,
} from "@llm-space/core";
import {
  aggregateMessageUsage,
  createMessagePromptVariablePlaceKey,
  createToolResultPromptVariablePlaceKey,
  DEFAULT_VARIABLE_VARIANT_NAME,
  ensureThreadVariableState,
  normalizeEvaluationRubrics,
  normalizeEvaluations,
  normalizePromptVariableState,
  normalizeRunHistory,
  PromptVariableError,
  recordRun,
  removePromptVariableSnapshotPlaces,
  renderThreadPromptVariables,
  replaceThreadPromptVariableReferences,
  SYSTEM_PROMPT_PLACE_KEY,
  upsertEvaluation,
  upsertEvaluationRubric,
  withPromptVariableSnapshot,
  withRunMetadata,
  type EvaluationRecord,
  type EvaluationRubricInput,
  type EvaluationRubricRecord,
  type EvaluationRubricSnapshot,
  type EvaluationRunScores,
  type RunSnapshot,
} from "@llm-space/core/thread";
import { createContext, useContext } from "react";
import { toast } from "sonner";
import { Compile } from "typebox/compile";
import { createStore, useStore, type StoreApi } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/shallow";

import { createFrameThrottle } from "@/lib/frame-throttle";

import { PREVIEW_THROTTLE_MS } from "../streaming-preview";
import { listEnabledPromptVariableSkills } from "../variable/prompt-variable-skills";

import {
  createInitialHistory,
  recordSnapshot,
  redo as redoHistory,
  undo as undoHistory,
  type ChangeHistory,
} from "./thread-history";

const toolValidator = Compile(ToolSchema);

/**
 * Upper bound on model turns in a single auto-call-tools run. Each turn is one
 * model call (the server terminates the agent loop after tool calls), so this
 * caps how many times a run will auto-execute tools and continue — a backstop
 * against a model that calls tools without ever settling on an answer.
 */
const MAX_AUTO_TOOL_TURNS = 50;

export type ThreadStoreStatus = "idle" | "running";
export interface ThreadState {
  thread: Thread;
  streamingMessage: AssistantMessage | null;
  status: ThreadStoreStatus;
  abortController: AbortController | null;
  activeRunId: string | null;
  collapsedMessageIds: string[];
  /**
   * Id of the message whose editor should grab focus on mount — set only by
   * append/insert. Every other editor mounts with autoFocus off so opening a
   * thread doesn't thrash focus/scroll across N editors. Store-only; never
   * serialized into the thread.
   */
  autoFocusMessageId: string | null;
  changeHistory: ChangeHistory;
  /** Thread snapshot + completion time after each run; most recent last. */
  runHistory: RunSnapshot[];
  /** Manual verdicts comparing durable run snapshots. */
  evaluations: EvaluationRecord[];
  /** Reusable manual evaluation rubrics owned by this thread. */
  evaluationRubrics: EvaluationRubricRecord[];

  run(fromMessageId?: string): Promise<void>;
  undo(): void;
  redo(): void;
  restoreThread(thread: Thread): void;
  removeRun(run: RunSnapshot): void;
  saveEvaluation(input: {
    leftRunId: string;
    rightRunId: string;
    verdict: EvaluationRecord["verdict"];
    note?: string;
    rubric?: EvaluationRubricSnapshot;
    runScores?: EvaluationRunScores[];
  }): boolean;
  removeEvaluation(evaluation: EvaluationRecord): void;
  saveEvaluationRubric(
    input: EvaluationRubricInput
  ): EvaluationRubricRecord | null;
  removeEvaluationRubric(id: string): boolean;
  appendMessage(): void;
  insertMessageBefore(beforeMessageId: string): void;
  moveMessage(fromIndex: number, toIndex: number): void;
  removeMessage(id: string): void;
  updateSystemPrompt(systemPrompt: string): void;
  updatePromptVariable(name: string, variable: ThreadVariable): void;
  renamePromptVariable(oldName: string, newName: string): boolean;
  addCustomVariable(name: string, value?: string): boolean;
  updateCustomVariable(name: string, value: string): void;
  renameCustomVariable(oldName: string, newName: string): boolean;
  removeCustomVariable(name: string): void;
  updateTitle(title: string | undefined): void;
  syncTitle(title: string): void;
  updateModelParams(params: Partial<ModelConfigParams>): void;
  updateModel(model: Pick<ModelConfig, "id" | "provider">): void;
  updateMessageTextContent(id: string, text: string): void;
  addMessageImageContent(id: string, mimeType: string, data: string): void;
  removeMessageImageContent(id: string, contentIndex: number): void;
  updateToolCallOutputTextContent(
    messageId: string,
    toolCallId: string,
    text: string,
    isError?: boolean
  ): void;
  addTool(tool: Tool): boolean;
  updateTool(name: string, tool: Tool): boolean;
  removeTool(name: string): void;
  toggleMessageRole(id: string): void;
  toggleMessageCollapsed(id: string): void;
  abort(): void;
}

export type ThreadStore = StoreApi<ThreadState>;

export function createThreadStore(
  initialThread: Thread,
  options: {
    transport?: AgentTransport;
    /**
     * Resolve the model a run/edit should use given the thread's saved model:
     * the saved model when still available, else the user's default, else the
     * first available model (`null` when none are configured). Supplied by the
     * UI, which holds the live provider list and default. Catches both threads
     * with no model and threads with a stale (removed) reference.
     */
    resolveModel?: (
      saved: ModelConfig | null | undefined
    ) => ModelConfig | null;
    /**
     * Whether a run should automatically execute a model turn's pending tool
     * calls (instead of waiting for the user to click "Call tools"). Read fresh
     * at run time. On its own it runs tools once and stops; combined with
     * {@link getReactLoop} it keeps looping. Defaults to `false`.
     */
    getAutoRunTools?: () => boolean;
    /**
     * Whether the ReAct loop is enabled: keep alternating model turn ⇄ tool
     * execution until the model stops calling tools. Implies auto-running tools.
     * Read fresh at run time. Defaults to `false`.
     */
    getReactLoop?: () => boolean;
    /**
     * Execute an MCP or built-in tool call, returning its textual result. Only
     * used by the auto-run-tools path; manual tool runs go through the UI's own
     * runner. Injected so the store stays decoupled from the RPC layer.
     */
    executeTool?: (
      tool: McpTool | BuiltinTool,
      args: Record<string, unknown>
    ) => Promise<{ contentText: string; isError: boolean }>;
  } = {}
): ThreadStore {
  const normalizedInputThread = ensureThreadVariableState(
    normalizeThread(initialThread)
  );
  const initialRunHistory = normalizeRunHistory(
    normalizedInputThread.runHistory
  );
  const initialEvaluations = normalizeEvaluations(
    normalizedInputThread.evaluations,
    initialRunHistory
  );
  const initialEvaluationRubrics = normalizeEvaluationRubrics(
    normalizedInputThread.evaluationRubrics
  );
  const normalizedInitialThread = withRunMetadata(normalizedInputThread, {
    runHistory: initialRunHistory,
    evaluations: initialEvaluations,
    evaluationRubrics: initialEvaluationRubrics,
  });

  return createStore<ThreadState>()(
    subscribeWithSelector((set, get) => {
      // --- internal helpers ---------------------------------------------------

      let stopActiveRun: (() => void) | null = null;

      const patchThread = (partial: Partial<Thread>) => {
        const next = { ...get().thread, ...partial };
        set({ thread: next });
        // Streaming changes are folded into a single record by run(); skip them
        // here so each chunk doesn't become its own undo step.
        if (get().status !== "running") {
          set({ changeHistory: recordSnapshot(get().changeHistory, next) });
        }
      };

      const patchContext = (partial: Partial<Thread["context"]>) => {
        patchThread({ context: { ...get().thread.context, ...partial } });
      };

      const getVariableState = () =>
        normalizePromptVariableState(get().thread.context);

      const setVariableState = (
        variables: ThreadVariables,
        variableVariants: ThreadVariableVariants,
        systemPrompt = get().thread.context?.systemPrompt
      ) => {
        patchContext({ variables, variableVariants, systemPrompt });
      };

      const defaultCustomValues = (variableVariants: ThreadVariableVariants) =>
        variableVariants.variants[DEFAULT_VARIABLE_VARIANT_NAME] ?? {};

      const customVariableNames = (variableVariants: ThreadVariableVariants) =>
        new Set(Object.keys(defaultCustomValues(variableVariants)));

      const withDefaultCustomValues = (
        values: Record<string, string>
      ): ThreadVariableVariants => ({
        active: DEFAULT_VARIABLE_VARIANT_NAME,
        variants: { [DEFAULT_VARIABLE_VARIANT_NAME]: values },
      });

      /*
       * Custom variables now expose one explicit default set, so every edit
       * rewrites the state to that single bucket.
       */
      const setDefaultCustomValues = (
        variables: ThreadVariables,
        values: Record<string, string>,
        systemPrompt = get().thread.context?.systemPrompt
      ) => {
        setVariableState(
          variables,
          withDefaultCustomValues(values),
          systemPrompt
        );
      };

      const allCustomVariableNames = (
        variableVariants: ThreadVariableVariants
      ) => {
        const names = new Set<string>();
        for (const values of Object.values(variableVariants.variants)) {
          for (const name of Object.keys(values)) {
            names.add(name);
          }
        }
        return names;
      };

      const showDuplicateVariableName = (name: string) => {
        toast.error("Variable name already exists", {
          description: `"${name}" is already used by another variable.`,
        });
      };

      const setMessages = (messages: Message[]) => {
        patchContext({ messages });
      };

      /** Replace the messages array; skips the update if nothing changed. */
      const updateMessages = (updater: (messages: Message[]) => Message[]) => {
        const messages = get().thread.context?.messages ?? [];
        const next = updater(messages);
        if (next !== messages) {
          setMessages(next);
        }
      };

      const getMessage = (id: string) =>
        (get().thread.context?.messages ?? []).find(
          (message) => message.id === id
        );

      /** Replace a single message by id; no-op (same array ref) if not found. */
      const updateMessage = (
        id: string,
        updater: (message: Message) => Message
      ) => {
        updateMessages((messages) => {
          let changed = false;
          const next = messages.map((message) => {
            if (message.id !== id) {
              return message;
            }
            changed = true;
            return updater(message);
          });
          return changed ? next : messages;
        });
      };

      const createUserMessage = (): UserMessage => ({
        id: uuid(),
        role: "user",
        content: [{ type: "text", text: "" }],
      });

      /** Validate a tool against the schema, toasting the first errors. */
      const validateTool = (tool: Tool): boolean => {
        if (!toolValidator.Check(tool)) {
          const errors = [...toolValidator.Errors(tool)];
          toast.error("Error", {
            description:
              errors.map((e) => e.message).join(", ") || "Invalid tool",
          });
          return false;
        }
        return true;
      };

      /** Keep image contents before any other content, preserving order. */
      const partitionImagesFirst = (content: UserMessage["content"]) => [
        ...content.filter((c) => c.type === "image_data"),
        ...content.filter((c) => c.type !== "image_data"),
      ];

      const hasContent = (message: AssistantMessage): boolean =>
        Boolean(message.thinking) ||
        message.content.length > 0 ||
        (message.toolCalls?.length ?? 0) > 0;

      /**
       * Auto-call the pending tool calls on the last message so a run can loop
       * without manual intervention. Returns the updated message list when
       * every trailing tool call was executed (the conversation can stream
       * again), or `null` when there is nothing to auto-call — no trailing tool
       * calls, a non-executable (`function`) tool among them, missing executor,
       * or an abort mid-flight. In the `null` case the loop stops and the user
       * drives the next step by hand.
       */
      const executePendingToolCalls = async (
        messages: Message[],
        signal: AbortSignal
      ): Promise<Message[] | null> => {
        const execute = options.executeTool;
        if (!execute) {
          return null;
        }
        const last = messages[messages.length - 1];
        if (last?.role !== "assistant") {
          return null;
        }
        const toolCalls = last.toolCalls ?? [];
        if (toolCalls.length === 0) {
          return null;
        }
        const toolsByName = new Map(
          (get().thread.context?.tools ?? []).map((tool) => [tool.name, tool])
        );
        // Every tool call must map to an executable (MCP/built-in) tool; a
        // single `function` stub means the turn needs a hand-written result, so
        // we bail and let the user fill it in.
        const executable: {
          toolCall: ToolCall;
          tool: McpTool | BuiltinTool;
        }[] = [];
        for (const toolCall of toolCalls) {
          const tool = toolsByName.get(toolCall.input.name);
          if (!tool || !isExecutableTool(tool)) {
            return null;
          }
          // A destructive `bash` command must never be auto-executed, even under
          // "auto run tools" or the ReAct loop — treat it like a `terminate`
          // tool: stop the loop and leave it pending for the user to review and
          // run by hand.
          if (tool.type === "builtin" && tool.name === "bash") {
            const command = (toolCall.input.arguments as { command?: unknown })
              ?.command;
            if (
              typeof command === "string" &&
              isDangerousBashCommand(command)
            ) {
              toast.warning("Auto-run paused for a risky command", {
                description:
                  "A bash command looked destructive, so it wasn't run automatically. Review it and run it by hand if it's safe.",
              });
              return null;
            }
          }
          executable.push({ toolCall, tool });
        }
        const results = await Promise.all(
          executable.map(async ({ toolCall, tool }) => {
            try {
              const { contentText, isError } = await execute(
                tool,
                toolCall.input.arguments
              );
              return { id: toolCall.id, text: contentText, isError };
            } catch (error) {
              const text =
                error instanceof Error ? error.message : "Tool call failed";
              return { id: toolCall.id, text, isError: true };
            }
          })
        );
        // An abort could have landed while tools were in flight; drop the
        // results and let the run's abort handling take over.
        if (signal.aborted) {
          return null;
        }
        const resultById = new Map(results.map((r) => [r.id, r]));
        const nextLast: AssistantMessage = {
          ...last,
          toolCalls: toolCalls.map((toolCall) => {
            const result = resultById.get(toolCall.id)!;
            return {
              ...toolCall,
              output: {
                content: [{ type: "text", text: result.text }],
                isError: result.isError,
              },
            };
          }),
        };
        const next = [...messages.slice(0, -1), nextLast];
        setMessages(next);
        return next;
      };

      // --- store --------------------------------------------------------------

      return {
        thread: normalizedInitialThread,
        streamingMessage: null,
        status: "idle",
        abortController: null,
        activeRunId: null,
        collapsedMessageIds: [],
        autoFocusMessageId: null,
        changeHistory: createInitialHistory(normalizedInitialThread),
        runHistory: initialRunHistory,
        evaluations: initialEvaluations,
        evaluationRubrics: initialEvaluationRubrics,

        appendMessage() {
          const message = createUserMessage();
          updateMessages((messages) => [...messages, message]);
          set({ autoFocusMessageId: message.id });
          return message.id;
        },
        insertMessageBefore(beforeMessageId: string) {
          const messages = get().thread.context?.messages ?? [];
          const index = messages.findIndex((m) => m.id === beforeMessageId);
          if (index === -1) {
            return;
          }
          const message = createUserMessage();
          setMessages([
            ...messages.slice(0, index),
            message,
            ...messages.slice(index),
          ]);
          set({ autoFocusMessageId: message.id });
        },
        moveMessage(fromIndex: number, toIndex: number) {
          updateMessages((messages) => {
            if (
              fromIndex === toIndex ||
              fromIndex < 0 ||
              toIndex < 0 ||
              fromIndex >= messages.length ||
              toIndex >= messages.length
            ) {
              return messages;
            }
            const next = [...messages];
            const [moved] = next.splice(fromIndex, 1);
            if (!moved) {
              return messages;
            }
            next.splice(toIndex, 0, moved);
            return next;
          });
        },
        removeMessage(id: string) {
          updateMessages((messages) => messages.filter((m) => m.id !== id));
          const { collapsedMessageIds } = get();
          if (collapsedMessageIds.includes(id)) {
            set({
              collapsedMessageIds: collapsedMessageIds.filter(
                (cid) => cid !== id
              ),
            });
          }
        },
        updateSystemPrompt(systemPrompt: string) {
          const context = get().thread.context ?? {};
          if (context.systemPrompt === systemPrompt) {
            return;
          }
          patchContext({
            systemPrompt,
            snapshot: removePromptVariableSnapshotPlaces(context.snapshot, [
              SYSTEM_PROMPT_PLACE_KEY,
            ]),
          });
        },
        updatePromptVariable(name, variable) {
          const { variables, variableVariants } = getVariableState();
          setVariableState(
            { ...variables, [name]: variable },
            variableVariants
          );
        },
        renamePromptVariable(oldName, newName) {
          if (oldName === newName) {
            return true;
          }
          const { variables, variableVariants } = getVariableState();
          if (
            Object.prototype.hasOwnProperty.call(variables, newName) ||
            allCustomVariableNames(variableVariants).has(newName)
          ) {
            showDuplicateVariableName(newName);
            return false;
          }
          const variable = variables[oldName];
          if (!variable) {
            return false;
          }
          const nextVariables = { ...variables };
          delete nextVariables[oldName];
          nextVariables[newName] = variable;
          patchThread({
            context: replaceThreadPromptVariableReferences(
              {
                ...(get().thread.context ?? {}),
                variables: nextVariables,
                variableVariants,
              },
              oldName,
              newName
            ),
          });
          return true;
        },
        addCustomVariable(name, value = "") {
          const { variables, variableVariants } = getVariableState();
          const customValues = defaultCustomValues(variableVariants);
          if (Object.prototype.hasOwnProperty.call(variables, name)) {
            showDuplicateVariableName(name);
            return false;
          }
          if (Object.prototype.hasOwnProperty.call(customValues, name)) {
            showDuplicateVariableName(name);
            return false;
          }
          setDefaultCustomValues(variables, { ...customValues, [name]: value });
          return true;
        },
        updateCustomVariable(name, value) {
          const { variables, variableVariants } = getVariableState();
          const customValues = defaultCustomValues(variableVariants);
          setDefaultCustomValues(variables, { ...customValues, [name]: value });
        },
        renameCustomVariable(oldName, newName) {
          if (oldName === newName) {
            return true;
          }
          const { variables, variableVariants } = getVariableState();
          const existingCustomNames = customVariableNames(variableVariants);
          existingCustomNames.delete(oldName);
          if (
            Object.prototype.hasOwnProperty.call(variables, newName) ||
            existingCustomNames.has(newName)
          ) {
            showDuplicateVariableName(newName);
            return false;
          }
          const customValues = defaultCustomValues(variableVariants);
          if (!Object.prototype.hasOwnProperty.call(customValues, oldName)) {
            return false;
          }
          const nextValues = { ...customValues };
          const value = nextValues[oldName];
          delete nextValues[oldName];
          nextValues[newName] = value;
          patchThread({
            context: replaceThreadPromptVariableReferences(
              {
                ...(get().thread.context ?? {}),
                variables,
                variableVariants: withDefaultCustomValues(nextValues),
              },
              oldName,
              newName
            ),
          });
          return true;
        },
        removeCustomVariable(name) {
          const { variables, variableVariants } = getVariableState();
          const nextValues = { ...defaultCustomValues(variableVariants) };
          delete nextValues[name];
          setDefaultCustomValues(variables, nextValues);
        },
        updateTitle(title: string | undefined) {
          patchThread({ title });
        },
        syncTitle(title: string) {
          const current = get().thread;
          if (current.title === title) {
            return;
          }
          set({ thread: { ...current, title } });
        },
        updateModelParams(params: Partial<ModelConfigParams>) {
          // Materialize the model on explicit param edits: resolve the thread's
          // model (falling back when it has none, or a stale reference).
          const base = options.resolveModel?.(get().thread.model);
          if (!base) {
            return;
          }
          patchThread({
            model: { ...base, params: { ...base.params, ...params } },
          });
        },
        updateModel(model: Pick<ModelConfig, "id" | "provider">) {
          const current = get().thread.model;
          patchThread({
            model: { ...current, provider: model.provider, id: model.id },
          });
        },
        updateMessageTextContent(id: string, text: string) {
          const context = get().thread.context ?? {};
          const messages = context.messages ?? [];
          let changed = false;
          const nextMessages = messages.map((message) => {
            if (message.id !== id) {
              return message;
            }
            if (getMessageText(message) === text) {
              return message;
            }
            changed = true;
            const content = [...message.content] as MessageContent[];
            const index = content.findIndex((c) => c.type === "text");
            if (index === -1) {
              content.push({ type: "text", text });
            } else {
              content[index] = { type: "text", text };
            }
            return { ...message, content } as Message;
          });
          if (!changed) {
            return;
          }
          patchContext({
            messages: nextMessages,
            snapshot: removePromptVariableSnapshotPlaces(context.snapshot, [
              createMessagePromptVariablePlaceKey(id),
            ]),
          });
        },
        addMessageImageContent(id: string, mimeType: string, data: string) {
          if (getMessage(id)?.role !== "user") {
            return;
          }
          updateMessage(id, (message) => {
            const user = message as UserMessage;
            return {
              ...user,
              content: partitionImagesFirst([
                ...user.content,
                { type: "image_data", mimeType, data },
              ]),
            };
          });
        },
        removeMessageImageContent(id: string, contentIndex: number) {
          const message = getMessage(id);
          if (message?.role !== "user") {
            return;
          }
          if (message.content[contentIndex]?.type !== "image_data") {
            return;
          }
          updateMessage(id, (m) => {
            const user = m as UserMessage;
            return {
              ...user,
              content: partitionImagesFirst(
                user.content.filter((_, index) => index !== contentIndex)
              ),
            };
          });
        },
        addTool(tool) {
          const { thread } = get();
          if (thread.context?.tools?.some((t) => t.name === tool.name)) {
            toast.error("Error", {
              description: `Tool "${tool.name}" already exists`,
            });
            return false;
          }
          if (!validateTool(tool)) {
            return false;
          }
          patchContext({ tools: [...(thread.context?.tools ?? []), tool] });
          return true;
        },
        updateTool(name, tool) {
          const tools = get().thread.context?.tools ?? [];
          const index = tools.findIndex((t) => t.name === name);
          if (index === -1) {
            return false;
          }
          if (!validateTool(tool)) {
            return false;
          }
          if (tool.name !== name && tools.some((t) => t.name === tool.name)) {
            toast.error("Error", {
              description: `Tool "${tool.name}" already exists`,
            });
            return false;
          }
          const next = [...tools];
          next[index] = tool;
          patchContext({ tools: next });
          return true;
        },
        removeTool(name) {
          patchContext({
            tools: get().thread.context?.tools?.filter((t) => t.name !== name),
          });
        },
        updateToolCallOutputTextContent(messageId, toolCallId, text, isError) {
          const context = get().thread.context ?? {};
          const messages = context.messages ?? [];
          let changed = false;
          let textChanged = false;
          const nextMessages = messages.map((message) => {
            if (message.id !== messageId || message.role !== "assistant") {
              return message;
            }
            let toolCallChanged = false;
            const toolCalls = message.toolCalls?.map((toolCall) => {
              if (toolCall.id !== toolCallId) {
                return toolCall;
              }
              const currentText =
                toolCall.output?.content.map((item) => item.text).join("\n") ??
                "";
              const nextIsError = isError ?? toolCall.output?.isError;
              if (
                currentText === text &&
                toolCall.output?.isError === nextIsError
              ) {
                return toolCall;
              }
              toolCallChanged = true;
              textChanged ||= currentText !== text;
              return {
                ...toolCall,
                output: {
                  content: [{ type: "text" as const, text }],
                  isError: nextIsError,
                },
              };
            });
            if (!toolCallChanged) {
              return message;
            }
            changed = true;
            return { ...message, toolCalls };
          });
          if (!changed) {
            return;
          }
          patchContext({
            messages: nextMessages,
            ...(textChanged
              ? {
                  snapshot: removePromptVariableSnapshotPlaces(
                    context.snapshot,
                    [
                      createToolResultPromptVariablePlaceKey(
                        messageId,
                        toolCallId
                      ),
                    ]
                  ),
                }
              : {}),
          });
        },
        toggleMessageRole(id: string) {
          updateMessage(
            id,
            (message) =>
              ({
                ...message,
                role: message.role === "user" ? "assistant" : "user",
              }) as Message
          );
        },
        toggleMessageCollapsed(id: string) {
          const { collapsedMessageIds } = get();
          set({
            collapsedMessageIds: collapsedMessageIds.includes(id)
              ? collapsedMessageIds.filter((i) => i !== id)
              : [...collapsedMessageIds, id],
          });
        },
        async run(fromMessageId?: string) {
          if (get().status === "running") {
            throw new Error("Thread is already running");
          }
          // Resolve the model to run with: the thread's own when available,
          // else the default/first available. A thread with no resolvable model
          // cannot run.
          const model = options.resolveModel?.(get().thread.model) ?? null;
          if (!model) {
            toast.error("Select a model to run");
            return;
          }
          // Pre-flight: resolve the message list the run would use (including
          // the rerun-from truncation) and validate it before entering the
          // running state, so an unrunnable thread is a complete no-op — no
          // truncation, no undo step, no run-history entry.
          let messages = [...(get().thread.context?.messages ?? [])];
          let truncated = false;
          if (fromMessageId) {
            const index = messages.findIndex((m) => m.id === fromMessageId);
            if (index !== -1 && index !== messages.length - 1) {
              messages = messages.slice(0, index + 1);
              truncated = true;
            }
          }
          if (!isRunnableConversation(messages)) {
            toast.error("Error", { description: RUN_LAST_MESSAGE_ERROR });
            return;
          }
          let promptSnapshot: ThreadContext["snapshot"] =
            get().thread.context?.snapshot;
          let preparedContext: ThreadContext | null = null;
          try {
            const rendered = await renderThreadPromptVariables({
              context: { ...get().thread.context, messages },
              loadSkills: listEnabledPromptVariableSkills,
            });
            preparedContext = rendered.context;
            promptSnapshot = rendered.snapshot;
          } catch (error) {
            toast.error("Unable to render prompt variables", {
              description:
                error instanceof PromptVariableError || error instanceof Error
                  ? error.message
                  : "Please check the system prompt variables.",
            });
            return;
          }
          const abortController = new AbortController();
          const runId = uuid();
          const isActiveRun = () => get().activeRunId === runId;
          set({
            status: "running",
            abortController,
            activeRunId: runId,
            streamingMessage: null,
          });

          // Commit the truncation while running so it folds into the run's
          // single undo step instead of becoming its own snapshot.
          if (truncated) {
            setMessages(messages);
          }
          const runStartMessageCount = messages.length;

          // Append a finished assistant message to the thread.
          const commit = (message: AssistantMessage) => {
            if (!isActiveRun()) {
              return;
            }
            messages = [...messages, message];
            setMessages(messages);
          };

          // Live-preview state for the turn currently streaming; reset per turn.
          let streamingMessage: AssistantMessage | null = null;
          let content: ReducedMessageContent[] = [];
          // Whether any turn produced at least one event — i.e. the run actually
          // started. A run that dies earlier (transport/auth/network failure) is
          // not recorded in the run history.
          let sawEvent = false;
          // Whether the run ended in an error. The agent loop emits lifecycle
          // events before the model call, and a model API failure completes
          // the stream normally with the error tucked into the message
          // (surfaced as a throw by reduceMessages on agent_end) — so
          // `sawEvent` alone can't tell a failed run from a successful one.
          // A failed run is never recorded in the run history.
          let failed = false;

          // Throttle live-preview updates (frame-aligned, at most one per
          // PREVIEW_THROTTLE_MS) — see createFrameThrottle for why per-event
          // set() calls are unsafe and re-rendering the growing document per
          // frame is too expensive.
          const {
            schedule: schedulePreview,
            cancel: cancelPreview,
          } = createFrameThrottle(() => {
            if (isActiveRun()) {
              set({ streamingMessage });
            }
          }, PREVIEW_THROTTLE_MS);

          const finalizeActiveRun = () => {
            if (!isActiveRun()) {
              return;
            }
            // Drop any pending frame before the terminal clear so a late flush
            // can't resurrect a stale streamingMessage after we reset to null.
            cancelPreview();
            set({
              streamingMessage: null,
              status: "idle",
              abortController: null,
              activeRunId: null,
            });
            stopActiveRun = null;

            // Fold the whole run (truncation + generated messages) into one
            // undo step, and record a run snapshot. No-op for undo if the
            // thread is unchanged.
            const finalThread = get().thread;
            if (sawEvent && !failed) {
              const threadWithSnapshot = withPromptVariableSnapshot(
                finalThread,
                promptSnapshot
              );
              const runUsage = aggregateMessageUsage(
                (threadWithSnapshot.context?.messages ?? []).slice(
                  runStartMessageCount
                )
              );
              const runHistory = recordRun(
                get().runHistory,
                threadWithSnapshot,
                Date.now(),
                { usage: runUsage }
              );
              const evaluations = normalizeEvaluations(
                get().evaluations,
                runHistory
              );
              const thread = withRunMetadata(threadWithSnapshot, {
                runHistory,
                evaluations,
                evaluationRubrics: get().evaluationRubrics,
              });
              set({
                thread,
                changeHistory: recordSnapshot(get().changeHistory, thread),
                runHistory,
                evaluations,
              });
            } else {
              set({
                changeHistory: recordSnapshot(get().changeHistory, finalThread),
              });
            }
          };

          stopActiveRun = () => {
            if (!isActiveRun()) {
              return;
            }
            try {
              abortController.abort();
            } catch {
              // Ignored
            }
            if (streamingMessage && hasContent(streamingMessage)) {
              commit(streamingMessage);
              streamingMessage = null;
            }
            finalizeActiveRun();
          };

          // Stream a single model turn into `messages`. Returns whether it
          // finished cleanly, was aborted, or failed — the auto-call loop only
          // continues after a clean turn.
          const streamTurn = async (): Promise<
            "completed" | "aborted" | "failed"
          > => {
            streamingMessage = null;
            content = [];
            try {
              const context = preparedContext
                ? preparedContext
                : (
                    await renderThreadPromptVariables({
                      context: {
                        ...get().thread.context,
                        messages,
                        snapshot: promptSnapshot,
                      },
                      loadSkills: listEnabledPromptVariableSkills,
                    })
                  ).context;
              preparedContext = null;
              promptSnapshot = context.snapshot;
              const response = streamThread(
                {
                  context,
                  model,
                },
                {
                  signal: abortController.signal,
                  transport: options.transport,
                }
              );
              for await (const chunk of response) {
                if (!isActiveRun()) {
                  return "aborted";
                }
                sawEvent = true;
                const reduced = reduceMessages(chunk, {
                  streamingMessage,
                  content,
                });
                if (!reduced) {
                  continue;
                }
                if (reduced.type === "message_start" && streamingMessage) {
                  commit(streamingMessage);
                  // The committed message now lives in `messages`; drop the
                  // stale preview so it isn't rendered twice before the next
                  // frame.
                  cancelPreview();
                  if (isActiveRun()) {
                    set({ streamingMessage: null });
                  }
                }
                streamingMessage = reduced.message;
                content = reduced.content;
                schedulePreview();
              }
              if (!isActiveRun()) {
                return "aborted";
              }
              if (streamingMessage) {
                commit(streamingMessage);
                // The turn's message now lives in `messages`; clear the preview
                // so it isn't rendered a second time during the gap before the
                // next turn (e.g. while auto-run tools execute). The trailing
                // frame is cancelled so a late flush can't resurrect it.
                cancelPreview();
                if (isActiveRun()) {
                  set({ streamingMessage: null });
                }
                streamingMessage = null;
              }
              return "completed";
            } catch (error) {
              if (abortController.signal.aborted) {
                if (
                  isActiveRun() &&
                  streamingMessage &&
                  hasContent(streamingMessage)
                ) {
                  commit(streamingMessage);
                }
                return "aborted";
              }
              if (!isActiveRun()) {
                return "aborted";
              }
              failed = true;
              console.error(error);
              if (error instanceof Error) {
                toast.error("Error", { description: error.message });
              }
              return "failed";
            }
          };

          try {
            // Drive the run:
            //  - a model turn always runs;
            //  - when tools are auto-run, execute the turn's trailing tool
            //    calls (unless one needs a hand-written result — then stop and
            //    let the user fill it in);
            //  - only the ReAct loop continues to the next turn; plain auto-run
            //    executes tools once and stops, staying step-by-step.
            // Capped so a model that calls tools forever can't spin forever.
            for (let turn = 0; turn < MAX_AUTO_TOOL_TURNS; turn++) {
              const outcome = await streamTurn();
              if (outcome !== "completed") {
                break;
              }
              const reactLoop = options.getReactLoop?.() ?? false;
              const autoRunTools =
                reactLoop || (options.getAutoRunTools?.() ?? false);
              if (!autoRunTools) {
                break;
              }
              const withResults = await executePendingToolCalls(
                messages,
                abortController.signal
              );
              if (!isActiveRun()) {
                break;
              }
              if (!withResults) {
                break;
              }
              messages = withResults;
              if (!reactLoop) {
                break;
              }
            }
          } finally {
            finalizeActiveRun();
          }
        },
        undo() {
          if (get().status === "running") {
            return;
          }
          const result = undoHistory(get().changeHistory);
          if (!result) {
            return;
          }
          const thread = withRunMetadata(result.thread, {
            runHistory: get().runHistory,
            evaluations: get().evaluations,
            evaluationRubrics: get().evaluationRubrics,
          });
          set({
            thread,
            changeHistory: {
              ...result.history,
              snapshots: result.history.snapshots.map((snapshot, index) =>
                index === result.history.index ? thread : snapshot
              ),
            },
          });
        },
        redo() {
          if (get().status === "running") {
            return;
          }
          const result = redoHistory(get().changeHistory);
          if (!result) {
            return;
          }
          const thread = withRunMetadata(result.thread, {
            runHistory: get().runHistory,
            evaluations: get().evaluations,
            evaluationRubrics: get().evaluationRubrics,
          });
          set({
            thread,
            changeHistory: {
              ...result.history,
              snapshots: result.history.snapshots.map((snapshot, index) =>
                index === result.history.index ? thread : snapshot
              ),
            },
          });
        },
        restoreThread(thread: Thread) {
          if (get().status === "running") {
            return;
          }
          const next = withRunMetadata(thread, {
            runHistory: get().runHistory,
            evaluations: get().evaluations,
            evaluationRubrics: get().evaluationRubrics,
          });
          if (next === get().thread) {
            return;
          }
          // Replace the whole thread; recorded as a single undoable step.
          set({
            thread: next,
            changeHistory: recordSnapshot(get().changeHistory, next),
          });
        },
        removeRun(run: RunSnapshot) {
          if (get().status === "running") {
            return;
          }
          const current = get().runHistory;
          const runHistory = current.filter((r) => r !== run);
          if (runHistory.length === current.length) {
            return;
          }
          const evaluations = normalizeEvaluations(
            get().evaluations,
            runHistory
          );
          // Deleting a run is not an undoable edit — undo/redo re-attach the
          // live runHistory anyway — so update the current snapshot in place
          // instead of recording a new step.
          const thread = withRunMetadata(get().thread, {
            runHistory,
            evaluations,
            evaluationRubrics: get().evaluationRubrics,
          });
          const history = get().changeHistory;
          set({
            thread,
            runHistory,
            evaluations,
            changeHistory: {
              ...history,
              snapshots: history.snapshots.map((snapshot, index) =>
                index === history.index ? thread : snapshot
              ),
            },
          });
        },
        saveEvaluation(input) {
          if (get().status === "running") {
            return false;
          }
          const evaluations = upsertEvaluation(
            get().evaluations,
            get().runHistory,
            input
          );
          if (!evaluations) {
            return false;
          }
          const thread = withRunMetadata(get().thread, {
            runHistory: get().runHistory,
            evaluations,
            evaluationRubrics: get().evaluationRubrics,
          });
          // Evaluation records are durable run metadata, not a text-edit undo
          // step; replace the current history tip so undo stays content-focused.
          const changeHistory = get().changeHistory;
          set({
            thread,
            evaluations,
            changeHistory: {
              ...changeHistory,
              snapshots: changeHistory.snapshots.map((snapshot, index) =>
                index === changeHistory.index ? thread : snapshot
              ),
            },
          });
          return true;
        },
        removeEvaluation(evaluation: EvaluationRecord) {
          if (get().status === "running") {
            return;
          }
          const current = get().evaluations;
          const evaluations = current.filter((e) => e.id !== evaluation.id);
          if (evaluations.length === current.length) {
            return;
          }
          // Like removeRun, deleting an evaluation is not an undoable edit;
          // update the current history snapshot in place instead of recording
          // a new step.
          const thread = withRunMetadata(get().thread, {
            runHistory: get().runHistory,
            evaluations,
            evaluationRubrics: get().evaluationRubrics,
          });
          const changeHistory = get().changeHistory;
          set({
            thread,
            evaluations,
            changeHistory: {
              ...changeHistory,
              snapshots: changeHistory.snapshots.map((snapshot, index) =>
                index === changeHistory.index ? thread : snapshot
              ),
            },
          });
        },
        saveEvaluationRubric(input) {
          if (get().status === "running") {
            return null;
          }
          const result = upsertEvaluationRubric(get().evaluationRubrics, input);
          if (!result) {
            return null;
          }
          const thread = withRunMetadata(get().thread, {
            runHistory: get().runHistory,
            evaluations: get().evaluations,
            evaluationRubrics: result.rubrics,
          });
          const changeHistory = get().changeHistory;
          set({
            thread,
            evaluationRubrics: result.rubrics,
            changeHistory: {
              ...changeHistory,
              snapshots: changeHistory.snapshots.map((snapshot, index) =>
                index === changeHistory.index ? thread : snapshot
              ),
            },
          });
          return result.rubric;
        },
        removeEvaluationRubric(id) {
          if (get().status === "running") {
            return false;
          }
          const current = get().evaluationRubrics;
          const evaluationRubrics = current.filter(
            (rubric) => rubric.id !== id
          );
          if (evaluationRubrics.length === current.length) {
            return false;
          }
          const thread = withRunMetadata(get().thread, {
            runHistory: get().runHistory,
            evaluations: get().evaluations,
            evaluationRubrics,
          });
          const changeHistory = get().changeHistory;
          set({
            thread,
            evaluationRubrics,
            changeHistory: {
              ...changeHistory,
              snapshots: changeHistory.snapshots.map((snapshot, index) =>
                index === changeHistory.index ? thread : snapshot
              ),
            },
          });
          return true;
        },
        abort() {
          const { status } = get();
          if (status !== "running") {
            return;
          }
          stopActiveRun?.();
        },
      };
    })
  );
}

export const ThreadStoreContext = createContext<ThreadStore | null>(null);

function useThreadStoreApi(): ThreadStore {
  const store = useContext(ThreadStoreContext);
  if (!store) throw new Error("hooks must be used within <ThreadPlayground>");
  return store;
}

export function useThreadStore<T>(selector: (s: ThreadState) => T): T {
  return useStore(useThreadStoreApi(), selector);
}

const selectActions = (s: ThreadState) => ({
  run: s.run,
  abort: s.abort,
  undo: s.undo,
  redo: s.redo,
  restoreThread: s.restoreThread,
  removeRun: s.removeRun,
  saveEvaluation: s.saveEvaluation,
  removeEvaluation: s.removeEvaluation,
  saveEvaluationRubric: s.saveEvaluationRubric,
  removeEvaluationRubric: s.removeEvaluationRubric,

  appendMessage: s.appendMessage,
  insertMessageBefore: s.insertMessageBefore,
  moveMessage: s.moveMessage,
  removeMessage: s.removeMessage,
  updateSystemPrompt: s.updateSystemPrompt,
  updatePromptVariable: s.updatePromptVariable,
  renamePromptVariable: s.renamePromptVariable,
  addCustomVariable: s.addCustomVariable,
  updateCustomVariable: s.updateCustomVariable,
  renameCustomVariable: s.renameCustomVariable,
  removeCustomVariable: s.removeCustomVariable,
  updateTitle: s.updateTitle,
  syncTitle: s.syncTitle,
  updateModelParams: s.updateModelParams,
  updateModel: s.updateModel,
  updateMessageTextContent: s.updateMessageTextContent,
  addMessageImageContent: s.addMessageImageContent,
  removeMessageImageContent: s.removeMessageImageContent,
  updateToolCallOutputText: s.updateToolCallOutputTextContent,
  addTool: s.addTool,
  updateTool: s.updateTool,
  removeTool: s.removeTool,
  toggleMessageRole: s.toggleMessageRole,
  toggleMessageCollapsed: s.toggleMessageCollapsed,
});
export function useThreadStoreActions() {
  return useStore(useThreadStoreApi(), useShallow(selectActions));
}

/* eslint-disable @typescript-eslint/unbound-method */
import {
  AssistantMessage,
  getMessageText,
  getToolDisplayName,
  getToolKey,
  Message,
  normalizeThread,
  reduceMessages,
  runThread,
  streamThread,
  Tool as ToolSchema,
  uuid,
  type AgentTransport,
  type AgentEvent,
  type BuiltinTool,
  type McpTool,
  type PluginTool,
  type MessageContent,
  type ModelConfig,
  type ModelConfigParams,
  type ReducedMessageContent,
  type SkillInfo,
  type Thread,
  type ThreadContext,
  type ThreadRunReference,
  type ThreadSnapshot,
  type ThreadVariable,
  type ThreadVariableVariants,
  type ThreadVariables,
  type Tool,
  type ToolCall,
  type ToolCallOutput,
  type UserMessage,
} from "@llm-space/core";
import {
  aggregateMessageUsage,
  createMessagePromptVariablePlaceKey,
  createToolResultPromptVariablePlaceKey,
  DEFAULT_VARIABLE_VARIANT_NAME,
  ensureThreadVariableState,
  getToolCallOutputText,
  getToolResultText,
  normalizeEvaluationRubrics,
  normalizeEvaluations,
  normalizePromptVariableState,
  normalizeRunHistory,
  PromptVariableError,
  recordRun,
  removePromptVariableSnapshotNames,
  removePromptVariableSnapshotPlaces,
  renderThreadPromptVariables,
  replaceThreadPromptVariableReferences,
  resolveThreadPromptVariableValues,
  resolveThreadRunPolicy,
  runThreadLoop,
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
  isRunSnapshot,
  type RunHistoryEntry,
  type RunSnapshot,
  type ThreadRunEvent,
  type ThreadRunTransport,
} from "@llm-space/core/thread";
import { createContext, useContext } from "react";
import { toast } from "sonner";
import { Compile } from "typebox/compile";
import { createStore, useStore, type StoreApi } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/shallow";

import { createFrameThrottle } from "@llm-space/ui/lib/frame-throttle";

import { PREVIEW_THROTTLE_MS } from "../streaming-preview";

import { getRunValidationIssue } from "./run-validation";
import type { RunValidationIssue } from "./run-validation-issue";
import {
  createInitialHistory,
  recordSnapshot,
  redo as redoHistory,
  undo as undoHistory,
  type ChangeHistory,
} from "./thread-history";

const toolValidator = Compile(ToolSchema);

/** Default `loadSkills` for hosts with no skills access (e.g. web display-only). */
const _noSkills = (): Promise<SkillInfo[]> => Promise.resolve([]);

/** Default `loadFile` for hosts with no filesystem (e.g. web display-only). */
const _noFile = (): Promise<string> => Promise.resolve("");
const _noFileExists = (): Promise<boolean> => Promise.resolve(false);

export type ThreadStoreStatus = "idle" | "preparing" | "running";
export interface ThreadState {
  thread: Thread;
  runtimeId?: string;
  streamingMessage: AssistantMessage | null;
  status: ThreadStoreStatus;
  abortController: AbortController | null;
  activeRunId: string | null;
  /** Auto-executing tool calls for in-flight UI feedback; never persisted. */
  executingToolCallIds: string[];
  collapsedMessageIds: string[];
  runValidationIssue: RunValidationIssue | null;
  /**
   * Id of the message whose editor should grab focus on mount — set only by
   * append/insert. Every other editor mounts with autoFocus off so opening a
   * thread doesn't thrash focus/scroll across N editors. Store-only; never
   * serialized into the thread.
   */
  autoFocusMessageId: string | null;
  changeHistory: ChangeHistory;
  /** Thread snapshot + completion time after each run; most recent last. */
  runHistory: RunHistoryEntry[];
  /** Manual verdicts comparing durable run snapshots. */
  evaluations: EvaluationRecord[];
  /** Reusable manual evaluation rubrics owned by this thread. */
  evaluationRubrics: EvaluationRubricRecord[];

  run(fromMessageId?: string): Promise<void>;
  resolveRunValidationIssue(): void;
  undo(): void;
  redo(): void;
  restoreThread(thread: Thread): void;
  loadRunSnapshot(run: RunHistoryEntry): Promise<RunSnapshot>;
  removeRun(run: RunHistoryEntry): void;
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
  removePromptVariable(name: string): void;
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
  /** Replace editable tool-result text while retaining structured images. */
  updateToolCallOutputTextContent(
    messageId: string,
    toolCallId: string,
    text: string,
    isError?: boolean
  ): void;
  /** Replace the complete model-facing output produced by a tool execution. */
  updateToolCallOutputContent(
    messageId: string,
    toolCallId: string,
    content: ToolCallOutput["content"],
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
     * Host-owned full-loop transport. When set, bun/runtime drives ReAct and
     * tool execution; the store only displays events.
     */
    runTransport?: ThreadRunTransport;
    runtimeId?: string;
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
    /** Resolve the current tab's ephemeral connection choice for a provider. */
    getProfileId?: (providerId: string) => string | undefined;
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
     * Execute an MCP or built-in tool call, returning structured model-facing
     * content. Only used by the auto-run-tools path; manual tool runs go through
     * the UI's own runner. Injected so the store stays decoupled from the RPC
     * layer.
     */
    executeTool?: (
      tool: McpTool | BuiltinTool | PluginTool,
      args: Record<string, unknown>,
      context: {
        thread: Thread;
        variables: Awaited<
          ReturnType<typeof resolveThreadPromptVariableValues>
        >;
      }
    ) => Promise<{
      content: ToolCallOutput["content"];
      isError: boolean;
    }>;
    /**
     * Load the enabled local skills used when rendering prompt variables.
     * Injected so the store stays decoupled from the skills/RPC layer; defaults
     * to none (e.g. a display-only web host).
     */
    loadSkills?: () => Promise<SkillInfo[]>;
    /**
     * Read a file's contents for the prompt `@include` macro. Injected like
     * `loadSkills`; defaults to none (e.g. a display-only web host).
     */
    loadFile?: (path: string) => Promise<string>;
    /** Test readable-file existence for template `exists(path)` conditions. */
    fileExists?: (path: string) => Promise<boolean>;
    /** Resolve working-directory values to absolute paths. */
    resolvePath?: (path: string) => Promise<string>;
    /** Monotonic clock used for client-observed model timing. */
    now?: () => number;
    /** Archive a completed run outside the main thread document. */
    archiveRunSnapshot?: (run: RunSnapshot) => Promise<ThreadRunReference>;
    /** Load a complete run snapshot from an opaque persisted reference. */
    readRunSnapshot?: (snapshotRef: string) => Promise<ThreadSnapshot>;
  } = {}
): ThreadStore {
  const normalizedInputThread = ensureThreadVariableState(
    normalizeThread(initialThread)
  );
  const initialRunHistory = normalizeRunHistory(
    normalizedInputThread.runHistory,
    normalizedInputThread.runHistoryIndex
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

  const store = createStore<ThreadState>()(
    subscribeWithSelector((set, get) => {
      // --- internal helpers ---------------------------------------------------

      let stopActiveRun: (() => void) | null = null;
      const loadedRuns = new Map<string, RunSnapshot>();

      const cacheLoadedRun = (run: RunSnapshot) => {
        loadedRuns.delete(run.id);
        loadedRuns.set(run.id, run);
        const oldest = loadedRuns.keys().next().value;
        if (loadedRuns.size > 2 && typeof oldest === "string") {
          loadedRuns.delete(oldest);
        }
        return run;
      };

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
        systemPrompt = get().thread.context?.systemPrompt,
        // Variable names whose captured snapshot values must be dropped so their
        // existing references re-render with the edited value (see below).
        invalidateSnapshotNames?: Iterable<string>
      ) => {
        const partial: Partial<Thread["context"]> = {
          variables,
          variableVariants,
          systemPrompt,
        };
        if (invalidateSnapshotNames) {
          partial.snapshot = removePromptVariableSnapshotNames(
            get().thread.context?.snapshot,
            invalidateSnapshotNames
          );
        }
        patchContext(partial);
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
        systemPrompt = get().thread.context?.systemPrompt,
        invalidateSnapshotNames?: Iterable<string>
      ) => {
        setVariableState(
          variables,
          withDefaultCustomValues(values),
          systemPrompt,
          invalidateSnapshotNames
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

      const reconcileRunValidationIssue = (messages: Message[]) => {
        const current = get().runValidationIssue;
        if (!current) {
          return;
        }
        const next = getRunValidationIssue(messages);
        if (
          next?.messageId !== current.messageId ||
          next?.code !== current.code
        ) {
          set({ runValidationIssue: null });
        }
      };

      const setMessages = (messages: Message[]) => {
        patchContext({ messages });
        reconcileRunValidationIssue(messages);
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

      /**
       * Replace one tool result while preserving copy-on-write message updates
       * and invalidating only the rendered text snapshot affected by the edit.
       */
      const setToolCallOutput = (
        messageId: string,
        toolCallId: string,
        createOutput: (toolCall: ToolCall) => ToolCallOutput | undefined
      ) => {
        const context = get().thread.context ?? {};
        const messages = context.messages ?? [];
        let changed = false;
        let textChanged = false;
        const nextMessages = messages.map((message) => {
          if (message.id !== messageId || message.role !== "assistant") {
            return message;
          }
          let messageChanged = false;
          const toolCalls = message.toolCalls?.map((toolCall) => {
            if (toolCall.id !== toolCallId) {
              return toolCall;
            }
            const output = createOutput(toolCall);
            if (!output) {
              return toolCall;
            }
            changed = true;
            messageChanged = true;
            textChanged ||=
              getToolCallOutputText(toolCall) !==
              getToolResultText(output.content);
            return { ...toolCall, output };
          });
          return messageChanged ? { ...message, toolCalls } : message;
        });
        if (!changed) {
          return;
        }
        patchContext({
          messages: nextMessages,
          ...(textChanged
            ? {
                snapshot: removePromptVariableSnapshotPlaces(context.snapshot, [
                  createToolResultPromptVariablePlaceKey(messageId, toolCallId),
                ]),
              }
            : {}),
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
        ...content.filter((c) => c.type === "image"),
        ...content.filter((c) => c.type !== "image"),
      ];

      const hasContent = (message: AssistantMessage): boolean =>
        Boolean(message.thinking) ||
        message.content.length > 0 ||
        (message.toolCalls?.length ?? 0) > 0 ||
        (message.providerHostedToolActivities?.length ?? 0) > 0;

      // --- store --------------------------------------------------------------

      return {
        thread: normalizedInitialThread,
        runtimeId: options.runtimeId,
        streamingMessage: null,
        status: "idle",
        abortController: null,
        activeRunId: null,
        executingToolCallIds: [],
        collapsedMessageIds: [],
        runValidationIssue: null,
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
        resolveRunValidationIssue() {
          const resolution = get().runValidationIssue?.resolution;
          if (resolution?.type === "appendUserMessage") {
            get().appendMessage();
          }
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
            variableVariants,
            undefined,
            [name]
          );
        },
        removePromptVariable(name) {
          const { variables, variableVariants } = getVariableState();
          const nextVariables = { ...variables };
          delete nextVariables[name];
          setVariableState(nextVariables, variableVariants, undefined, [name]);
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
          setDefaultCustomValues(
            variables,
            { ...customValues, [name]: value },
            undefined,
            [name]
          );
          return true;
        },
        updateCustomVariable(name, value) {
          const { variables, variableVariants } = getVariableState();
          const customValues = defaultCustomValues(variableVariants);
          setDefaultCustomValues(
            variables,
            { ...customValues, [name]: value },
            undefined,
            [name]
          );
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
          setDefaultCustomValues(variables, nextValues, undefined, [name]);
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
                { type: "image", mimeType, data },
              ]),
            };
          });
        },
        removeMessageImageContent(id: string, contentIndex: number) {
          const message = getMessage(id);
          if (message?.role !== "user") {
            return;
          }
          if (message.content[contentIndex]?.type !== "image") {
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
          const toolKey = getToolKey(tool);
          if (thread.context?.tools?.some((t) => getToolKey(t) === toolKey)) {
            toast.error("Error", {
              description: `Tool "${getToolDisplayName(tool)}" already exists`,
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
          const index = tools.findIndex((t) => getToolKey(t) === name);
          if (index === -1) {
            return false;
          }
          if (!validateTool(tool)) {
            return false;
          }
          const nextKey = getToolKey(tool);
          if (
            nextKey !== name &&
            tools.some((t) => getToolKey(t) === nextKey)
          ) {
            toast.error("Error", {
              description: `Tool "${getToolDisplayName(tool)}" already exists`,
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
            tools: get().thread.context?.tools?.filter(
              (tool) => getToolKey(tool) !== name
            ),
          });
        },
        updateToolCallOutputTextContent(messageId, toolCallId, text, isError) {
          setToolCallOutput(messageId, toolCallId, (toolCall) => {
            const currentText = getToolCallOutputText(toolCall);
            const nextIsError = isError ?? toolCall.output?.isError;
            if (
              currentText === text &&
              toolCall.output?.isError === nextIsError
            ) {
              return undefined;
            }
            return {
              content: [
                { type: "text", text },
                ...(toolCall.output?.content.filter(
                  (item) => item.type === "image"
                ) ?? []),
              ],
              isError: nextIsError,
            };
          });
        },
        updateToolCallOutputContent(messageId, toolCallId, content, isError) {
          setToolCallOutput(messageId, toolCallId, (toolCall) => {
            const nextIsError = isError ?? toolCall.output?.isError;
            if (
              toolCall.output?.content === content &&
              toolCall.output?.isError === nextIsError
            ) {
              return undefined;
            }
            return { content, isError: nextIsError };
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
          if (get().status !== "idle") {
            throw new Error("Thread is already running");
          }
          const runId = uuid();
          const isPreparingRun = () =>
            get().status === "preparing" && get().activeRunId === runId;
          const finishPreparingRun = () => {
            if (isPreparingRun()) {
              set({ status: "idle", activeRunId: null });
            }
          };
          // Claim the run lifecycle before any async prompt-variable work. A
          // host can now prevent the pane from being torn down while preflight
          // is still awaiting skills/files and before a transport exists.
          set({ status: "preparing", activeRunId: runId });
          if (!isPreparingRun()) return;
          // Resolve the model to run with: the thread's own when available,
          // else the default/first available. A thread with no resolvable model
          // cannot run.
          let model: ModelConfig | null = null;
          try {
            model = options.resolveModel?.(get().thread.model) ?? null;
          } catch (error) {
            toast.error("Unable to resolve a model", {
              description:
                error instanceof Error ? error.message : "Please try again.",
            });
            finishPreparingRun();
            return;
          }
          if (!model) {
            toast.error("Select a model to run");
            finishPreparingRun();
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
          const runValidationIssue = getRunValidationIssue(messages);
          if (runValidationIssue) {
            if (isPreparingRun()) {
              set({
                runValidationIssue,
                status: "idle",
                activeRunId: null,
              });
            }
            return;
          }
          set({ runValidationIssue: null });
          let promptSnapshot: ThreadContext["snapshot"] =
            get().thread.context?.snapshot;
          let preparedContext: ThreadContext;
          try {
            const rendered = await renderThreadPromptVariables({
              context: { ...get().thread.context, messages },
              loadSkills: options.loadSkills ?? _noSkills,
              loadFile: options.loadFile ?? _noFile,
              fileExists: options.fileExists ?? _noFileExists,
              resolvePath: options.resolvePath,
            });
            preparedContext = rendered.context;
            promptSnapshot = rendered.snapshot;
          } catch (error) {
            if (!isPreparingRun()) return;
            toast.error("Unable to render prompt variables", {
              description:
                error instanceof PromptVariableError || error instanceof Error
                  ? error.message
                  : "Please check the system prompt variables.",
            });
            finishPreparingRun();
            return;
          }
          if (!isPreparingRun()) return;
          const abortController = new AbortController();
          let finalizing = false;
          const isActiveRun = () =>
            !finalizing && get().activeRunId === runId;
          set({
            status: "running",
            abortController,
            activeRunId: runId,
            streamingMessage: null,
            executingToolCallIds: [],
          });

          // Commit the truncation while running so it folds into the run's
          // single undo step instead of becoming its own snapshot.
          if (truncated) {
            setMessages(messages);
          }
          const runStartMessageCount = messages.length;
          const runPolicy = resolveThreadRunPolicy({
            autoRunTools: options.getAutoRunTools?.() ?? false,
            reactLoop: options.getReactLoop?.() ?? false,
          });

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
          const { schedule: schedulePreview, cancel: cancelPreview } =
            createFrameThrottle(() => {
              if (isActiveRun()) {
                set({ streamingMessage });
              }
            }, PREVIEW_THROTTLE_MS);

          let finalizePromise: Promise<void> | null = null;
          const finalizeActiveRun = (): Promise<void> => {
            if (finalizePromise) {
              return finalizePromise;
            }
            if (!isActiveRun()) {
              return Promise.resolve();
            }
            // Drop any pending frame before the terminal clear so a late flush
            // can't resurrect a stale streamingMessage after we reset to null.
            finalizing = true;
            cancelPreview();
            finalizePromise = (async () => {
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
                let runHistory = recordRun(
                  get().runHistory,
                  threadWithSnapshot,
                  Date.now(),
                  { usage: runUsage, policy: runPolicy }
                );
                const newestRun = runHistory[runHistory.length - 1];
                if (
                  newestRun &&
                  isRunSnapshot(newestRun) &&
                  options.archiveRunSnapshot
                ) {
                  try {
                    const reference =
                      await options.archiveRunSnapshot(newestRun);
                    runHistory = [...runHistory.slice(0, -1), reference];
                  } catch (error) {
                    toast.error("Failed to archive run snapshot", {
                      description:
                        error instanceof Error
                          ? error.message
                          : "The snapshot will be archived on the next save.",
                    });
                  }
                }
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
                  changeHistory: recordSnapshot(
                    get().changeHistory,
                    finalThread
                  ),
                });
              }
              set({
                streamingMessage: null,
                status: "idle",
                abortController: null,
                activeRunId: null,
                executingToolCallIds: [],
              });
              stopActiveRun = null;
            })();
            return finalizePromise;
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
            void finalizeActiveRun();
          };

          const now = options.now ?? (() => performance.now());
          let firstTokenAt: number | null = null;
          let turnStartedAt = 0;
          let armTurnClock = true;
          const profileId = options.getProfileId?.(model.provider);
          const connection = {
            providerId: model.provider,
            ...(profileId ? { profileId } : {}),
          };

          const processAgentEvent = (chunk: AgentEvent) => {
            if (!isActiveRun()) {
              return;
            }
            const receivedAt = now();
            if (firstTokenAt === null && _isNonEmptyAssistantDelta(chunk)) {
              firstTokenAt = receivedAt;
            }
            sawEvent = true;
            const reduced = reduceMessages(chunk, {
              streamingMessage,
              content,
            });
            if (!reduced) {
              return;
            }
            if (reduced.type === "message_start" && streamingMessage) {
              commit(streamingMessage);
              cancelPreview();
              if (isActiveRun()) {
                set({ streamingMessage: null });
              }
            }
            streamingMessage =
              reduced.type === "message_end"
                ? {
                    ...reduced.message,
                    timing: {
                      ...(firstTokenAt === null
                        ? {}
                        : {
                            firstTokenMs: Math.max(
                              0,
                              firstTokenAt - turnStartedAt
                            ),
                          }),
                      durationMs: Math.max(0, receivedAt - turnStartedAt),
                    },
                  }
                : reduced.message;
            content = reduced.content;
            if (reduced.type === "message_end") {
              commit(streamingMessage);
              cancelPreview();
              if (isActiveRun()) {
                set({ streamingMessage: null });
              }
              streamingMessage = null;
              content = [];
              return;
            }
            schedulePreview();
          };

          const applyToolResult = (
            toolCallId: string,
            output: { content: ToolCallOutput["content"]; isError: boolean }
          ) => {
            const last = messages[messages.length - 1];
            if (last?.role !== "assistant" || !last.toolCalls) {
              return;
            }
            const nextLast: AssistantMessage = {
              ...last,
              toolCalls: last.toolCalls.map((toolCall) =>
                toolCall.id === toolCallId
                  ? { ...toolCall, output }
                  : toolCall
              ),
            };
            messages = [...messages.slice(0, -1), nextLast];
            setMessages(messages);
          };

          const processRunEvent = (event: ThreadRunEvent) => {
            if (event.type === "agent_event") {
              if (armTurnClock) {
                firstTokenAt = null;
                turnStartedAt = now();
                armTurnClock = false;
              }
              processAgentEvent(event.event);
              return;
            }
            if (event.type === "tool_start") {
              armTurnClock = true;
              if (isActiveRun()) {
                set({ executingToolCallIds: event.toolCallIds });
              }
              return;
            }
            if (event.type === "tool_result") {
              applyToolResult(event.toolCallId, {
                content: event.content,
                isError: event.isError,
              });
              if (isActiveRun()) {
                set({
                  executingToolCallIds: get().executingToolCallIds.filter(
                    (id) => id !== event.toolCallId
                  ),
                });
              }
              return;
            }
            if (event.type === "paused") {
              if (event.reason === "dangerous_bash") {
                toast.warning("Auto-run paused for a risky command", {
                  description:
                    "A bash command looked destructive, so it wasn't run automatically. Review it and run it by hand if it's safe.",
                });
              }
              return;
            }
            if (event.type === "run_end" && event.reason === "failed") {
              failed = true;
              if (event.error) {
                toast.error("Error", { description: event.error });
              }
            }
          };

          try {
            const preparedThread: Thread = {
              ...get().thread,
              context: {
                ...preparedContext,
                messages,
                snapshot: promptSnapshot,
              },
            };
            if (options.runTransport) {
              for await (const event of runThread(
                {
                  context: preparedThread.context ?? { messages },
                  model,
                  thread: preparedThread,
                  policy: runPolicy,
                },
                {
                  signal: abortController.signal,
                  transport: options.runTransport,
                  connection,
                  onPause: "pause",
                }
              )) {
                if (!isActiveRun()) {
                  break;
                }
                processRunEvent(event);
              }
            } else {
              for await (const event of runThreadLoop({
                thread: preparedThread,
                messages,
                policy: runPolicy,
                signal: abortController.signal,
                executeTool: options.executeTool,
                loadSkills: options.loadSkills ?? _noSkills,
                loadFile: options.loadFile ?? _noFile,
                fileExists: options.fileExists ?? _noFileExists,
                resolvePath: options.resolvePath,
                onPause: "pause",
                streamTurn: (context) =>
                  streamThread(
                    { context, model },
                    {
                      signal: abortController.signal,
                      transport: options.transport,
                      connection,
                    }
                  ),
              })) {
                if (!isActiveRun()) {
                  break;
                }
                processRunEvent(event);
              }
            }
            if (streamingMessage && hasContent(streamingMessage)) {
              commit(streamingMessage);
              cancelPreview();
              streamingMessage = null;
            }
          } catch (error) {
            if (abortController.signal.aborted) {
              if (
                isActiveRun() &&
                streamingMessage &&
                hasContent(streamingMessage)
              ) {
                commit(streamingMessage);
              }
            } else if (isActiveRun()) {
              failed = true;
              console.error(error);
              if (error instanceof Error) {
                toast.error("Error", { description: error.message });
              }
            }
          } finally {
            await finalizeActiveRun();
          }
        },
        undo() {
          if (get().status !== "idle") {
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
            runValidationIssue: null,
            changeHistory: {
              ...result.history,
              snapshots: result.history.snapshots.map((snapshot, index) =>
                index === result.history.index ? thread : snapshot
              ),
            },
          });
        },
        redo() {
          if (get().status !== "idle") {
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
            runValidationIssue: null,
            changeHistory: {
              ...result.history,
              snapshots: result.history.snapshots.map((snapshot, index) =>
                index === result.history.index ? thread : snapshot
              ),
            },
          });
        },
        restoreThread(thread: Thread) {
          if (get().status !== "idle") {
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
            runValidationIssue: null,
            changeHistory: recordSnapshot(get().changeHistory, next),
          });
        },
        async loadRunSnapshot(run: RunHistoryEntry) {
          if (isRunSnapshot(run)) {
            return run;
          }
          const cached = loadedRuns.get(run.id);
          if (cached) {
            return cacheLoadedRun(cached);
          }
          if (!options.readRunSnapshot) {
            throw new Error("Run snapshot storage is unavailable.");
          }
          const thread = await options.readRunSnapshot(run.snapshotRef);
          return cacheLoadedRun({
            id: run.id,
            timestamp: run.timestamp,
            thread,
            ...(run.usage ? { usage: run.usage } : {}),
          });
        },
        removeRun(run: RunHistoryEntry) {
          if (get().status !== "idle") {
            return;
          }
          const current = get().runHistory;
          const runHistory = current.filter((r) => r !== run);
          if (runHistory.length === current.length) {
            return;
          }
          loadedRuns.delete(run.id);
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
          if (get().status !== "idle") {
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
          if (get().status !== "idle") {
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
          if (get().status !== "idle") {
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
          if (get().status !== "idle") {
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
          if (status === "preparing") {
            set({ status: "idle", activeRunId: null });
            return;
          }
          if (status !== "running") {
            return;
          }
          stopActiveRun?.();
        },
      };
    })
  );

  if (options.resolvePath) {
    const initialVariables = normalizedInitialThread.context?.variables ?? {};
    const workingDirectories = Object.entries(initialVariables).filter(
      (entry): entry is [string, Extract<ThreadVariable, { type: "workingDirectory" }>] =>
        entry[1].type === "workingDirectory" && entry[1].value.trim().length > 0
    );
    void Promise.all(
      workingDirectories.map(async ([name, variable]) => [
        name,
        variable.value,
        await options.resolvePath!(variable.value).catch(() => variable.value),
      ] as const)
    ).then((resolved) => {
      const current = store.getState();
      const variables = current.thread.context?.variables;
      if (!variables) return;
      let changed = false;
      const changedNames: string[] = [];
      const nextVariables = { ...variables };
      for (const [name, original, absolute] of resolved) {
        const variable = variables[name];
        if (
          variable?.type === "workingDirectory" &&
          variable.value === original &&
          absolute !== original
        ) {
          nextVariables[name] = { ...variable, value: absolute };
          changedNames.push(name);
          changed = true;
        }
      }
      if (!changed) return;
      const thread = {
        ...current.thread,
        context: {
          ...current.thread.context,
          variables: nextVariables,
          snapshot: removePromptVariableSnapshotNames(
            current.thread.context?.snapshot,
            changedNames
          ),
        },
      };
      store.setState({ thread, changeHistory: createInitialHistory(thread) });
    });
  }

  return store;
}

function _isNonEmptyAssistantDelta(event: AgentEvent): boolean {
  if (
    event.type === "message_end" &&
    event.message.role === "assistant" &&
    (event.message.nativeToolActivities?.length ?? 0) > 0
  ) {
    return true;
  }
  if (event.type !== "message_update") {
    return false;
  }
  const update = event.assistantMessageEvent;
  return (
    (update.type === "thinking_delta" ||
      update.type === "text_delta" ||
      update.type === "toolcall_delta") &&
    update.delta.length > 0
  );
}

export const ThreadStoreContext = createContext<ThreadStore | null>(null);

export function useThreadStoreApi(): ThreadStore {
  const store = useContext(ThreadStoreContext);
  if (!store) throw new Error("hooks must be used within <ThreadPlayground>");
  return store;
}

export function useThreadStore<T>(selector: (s: ThreadState) => T): T {
  return useStore(useThreadStoreApi(), selector);
}

const selectActions = (s: ThreadState) => ({
  run: s.run,
  resolveRunValidationIssue: s.resolveRunValidationIssue,
  abort: s.abort,
  undo: s.undo,
  redo: s.redo,
  restoreThread: s.restoreThread,
  loadRunSnapshot: s.loadRunSnapshot,
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
  removePromptVariable: s.removePromptVariable,
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
  updateToolCallOutput: s.updateToolCallOutputContent,
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

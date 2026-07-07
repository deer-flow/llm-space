/* eslint-disable @typescript-eslint/unbound-method */
import {
  AssistantMessage,
  isRunnableConversation,
  Message,
  reduceMessages,
  RUN_LAST_MESSAGE_ERROR,
  streamThread,
  Tool as ToolSchema,
  uuid,
  type AgentTransport,
  type FunctionTool,
  type MessageContent,
  type ModelConfig,
  type ModelConfigParams,
  type ReducedMessageContent,
  type Thread,
  type UserMessage,
} from "@llm-space/core";
import { createContext, useContext } from "react";
import { toast } from "sonner";
import { Compile } from "typebox/compile";
import { createStore, useStore, type StoreApi } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/shallow";

import { aggregateMessageUsage } from "../token-usage";

import {
  createInitialHistory,
  normalizeEvaluations,
  normalizeRunHistory,
  recordRun,
  recordSnapshot,
  redo as redoHistory,
  undo as undoHistory,
  upsertEvaluation,
  withRunHistory,
  type ChangeHistory,
  type EvaluationRecord,
  type RunSnapshot,
} from "./thread-history";

const toolValidator = Compile(ToolSchema);

export type ThreadStoreStatus = "idle" | "running";
export interface ThreadState {
  thread: Thread;
  streamingMessage: AssistantMessage | null;
  status: ThreadStoreStatus;
  abortController: AbortController | null;
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
  }): void;
  removeEvaluation(evaluation: EvaluationRecord): void;
  appendMessage(): void;
  insertMessageBefore(beforeMessageId: string): void;
  moveMessage(fromIndex: number, toIndex: number): void;
  removeMessage(id: string): void;
  updateSystemPrompt(systemPrompt: string): void;
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
  addTool(tool: FunctionTool): boolean;
  updateTool(name: string, tool: FunctionTool): boolean;
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
     * Resolve the model to use when the thread has no saved model — the first
     * available model, or `null` when none are configured. Supplied by the UI,
     * which holds the live provider list.
     */
    getFallbackModel?: () => ModelConfig | null;
  } = {}
): ThreadStore {
  const initialRunHistory = normalizeRunHistory(initialThread.runHistory);
  const initialEvaluations = normalizeEvaluations(
    initialThread.evaluations,
    initialRunHistory
  );
  const normalizedInitialThread = withRunHistory(
    initialThread,
    initialRunHistory,
    initialEvaluations
  );

  return createStore<ThreadState>()(
    subscribeWithSelector((set, get) => {
      // --- internal helpers ---------------------------------------------------

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
      const validateTool = (tool: FunctionTool): boolean => {
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

      // --- store --------------------------------------------------------------

      return {
        thread: normalizedInitialThread,
        streamingMessage: null,
        status: "idle",
        abortController: null,
        collapsedMessageIds: [],
        autoFocusMessageId: null,
        changeHistory: createInitialHistory(normalizedInitialThread),
        runHistory: initialRunHistory,
        evaluations: initialEvaluations,

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
          patchContext({ systemPrompt });
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
          // Materialize the model on explicit param edits: fall back to the
          // first available model when the thread has none yet.
          const base = get().thread.model ?? options.getFallbackModel?.();
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
          updateMessage(id, (message) => {
            const content = [...message.content] as MessageContent[];
            const index = content.findIndex((c) => c.type === "text");
            if (index === -1) {
              content.push({ type: "text", text });
            } else {
              content[index] = { type: "text", text };
            }
            return { ...message, content } as Message;
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
          const message = getMessage(messageId);
          if (message?.role !== "assistant") {
            return;
          }
          if (!message.toolCalls?.some((tc) => tc.id === toolCallId)) {
            return;
          }
          updateMessage(messageId, (m) => {
            const assistant = m as AssistantMessage;
            return {
              ...assistant,
              toolCalls: assistant.toolCalls?.map((toolCall) =>
                toolCall.id === toolCallId
                  ? {
                      ...toolCall,
                      output: {
                        content: [{ type: "text", text }],
                        isError: isError ?? toolCall.output?.isError,
                      },
                    }
                  : toolCall
              ),
            };
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
          // Resolve the model to run with: the thread's own, else the first
          // available. A thread with no resolvable model cannot run.
          const model =
            get().thread.model ?? options.getFallbackModel?.() ?? null;
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
          const abortController = new AbortController();
          set({ status: "running", abortController });

          // Commit the truncation while running so it folds into the run's
          // single undo step instead of becoming its own snapshot.
          if (truncated) {
            setMessages(messages);
          }
          const runStartMessageCount = messages.length;

          // Append a finished assistant message to the thread.
          const commit = (message: AssistantMessage) => {
            messages = [...messages, message];
            setMessages(messages);
          };

          let streamingMessage: AssistantMessage | null = null;
          let content: ReducedMessageContent[] = [];
          // Whether the stream produced at least one event — i.e. the run
          // actually started. A run that dies earlier (transport/auth/network
          // failure) is not recorded in the run history.
          let sawEvent = false;
          // Whether the run ended in an error. The agent loop emits lifecycle
          // events before the model call, and a model API failure completes
          // the stream normally with the error tucked into the message
          // (surfaced as a throw by reduceMessages on agent_end) — so
          // `sawEvent` alone can't tell a failed run from a successful one.
          // A failed run is never recorded in the run history.
          let failed = false;

          // Coalesce live-preview updates to at most one per animation frame.
          // A fast stream delivers a burst of events that the transport drains
          // synchronously; calling set() on every one fires a synchronous
          // useSyncExternalStore re-render per event within a single microtask
          // chain, which never crosses the task boundary React uses to reset
          // its nested-update counter — tripping "Maximum update depth
          // exceeded". Batching by frame also lets the UI paint between chunks.
          const canRaf = typeof requestAnimationFrame === "function";
          let previewFrame: number | null = null;
          const flushPreview = () => {
            previewFrame = null;
            set({ streamingMessage });
          };
          const schedulePreview = () => {
            if (!canRaf) {
              set({ streamingMessage });
              return;
            }
            previewFrame ??= requestAnimationFrame(flushPreview);
          };
          const cancelPreview = () => {
            if (previewFrame !== null) {
              cancelAnimationFrame(previewFrame);
              previewFrame = null;
            }
          };
          try {
            const response = streamThread(
              {
                context: { ...get().thread.context, messages },
                model,
              },
              { signal: abortController.signal, transport: options.transport }
            );
            for await (const chunk of response) {
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
                // The committed message now lives in `messages`; drop the stale
                // preview so it isn't rendered twice before the next frame.
                cancelPreview();
                set({ streamingMessage: null });
              }
              streamingMessage = reduced.message;
              content = reduced.content;
              schedulePreview();
            }
            if (streamingMessage) {
              commit(streamingMessage);
            }
          } catch (error) {
            if (abortController.signal.aborted) {
              if (streamingMessage && hasContent(streamingMessage)) {
                commit(streamingMessage);
              }
            } else {
              failed = true;
              console.error(error);
              if (error instanceof Error) {
                toast.error("Error", { description: error.message });
              }
            }
          } finally {
            // Drop any pending frame before the terminal clear so a late flush
            // can't resurrect a stale streamingMessage after we reset to null.
            cancelPreview();
            set({
              streamingMessage: null,
              status: "idle",
              abortController: null,
            });
            // Fold the whole run (truncation + generated messages) into one
            // undo step, and record a run snapshot. No-op for undo if the
            // thread is unchanged.
            const finalThread = get().thread;
            if (sawEvent && !failed) {
              const runUsage = aggregateMessageUsage(
                (finalThread.context?.messages ?? []).slice(
                  runStartMessageCount
                )
              );
              const runHistory = recordRun(
                get().runHistory,
                finalThread,
                Date.now(),
                { usage: runUsage }
              );
              const evaluations = normalizeEvaluations(
                get().evaluations,
                runHistory
              );
              const thread = withRunHistory(
                finalThread,
                runHistory,
                evaluations
              );
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
          const thread = withRunHistory(
            result.thread,
            get().runHistory,
            get().evaluations
          );
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
          const thread = withRunHistory(
            result.thread,
            get().runHistory,
            get().evaluations
          );
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
          const next = withRunHistory(
            thread,
            get().runHistory,
            get().evaluations
          );
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
          const thread = withRunHistory(get().thread, runHistory, evaluations);
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
            return;
          }
          const evaluations = upsertEvaluation(
            get().evaluations,
            get().runHistory,
            input
          );
          const thread = withRunHistory(
            get().thread,
            get().runHistory,
            evaluations
          );
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
          const thread = withRunHistory(
            get().thread,
            get().runHistory,
            evaluations
          );
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
        abort() {
          const { status, abortController } = get();
          if (status !== "running") {
            return;
          }
          try {
            abortController?.abort();
          } catch {
            // Ignored
          }
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

  appendMessage: s.appendMessage,
  insertMessageBefore: s.insertMessageBefore,
  moveMessage: s.moveMessage,
  removeMessage: s.removeMessage,
  updateSystemPrompt: s.updateSystemPrompt,
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

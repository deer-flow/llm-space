/* eslint-disable @typescript-eslint/unbound-method */
import {
  AssistantMessage,
  isRunnableConversation,
  Message,
  normalizeThread,
  reduceMessages,
  RUN_LAST_MESSAGE_ERROR,
  streamThread,
  Tool as ToolSchema,
  uuid,
  type AgentTransport,
  type MessageContent,
  type ModelConfig,
  type ModelConfigParams,
  type ReducedMessageContent,
  type Thread,
  type Tool,
  type ToolCall,
  type UserMessage,
} from "@llm-space/core";
import { createContext, useContext } from "react";
import { toast } from "sonner";
import { Compile } from "typebox/compile";
import { createStore, useStore, type StoreApi } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useShallow } from "zustand/shallow";

import { openFirecrawlLimitDialog } from "@/components/firecrawl-limit-dialog";
import { isFirecrawlLimitError } from "@/lib/firecrawl";

import { getToolCallStatus } from "../message/tool-call-status";
import { aggregateMessageUsage } from "../token-usage";
import type {
  CallableTool,
  CallableToolResult,
} from "../tool/call-thread-tool";

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

export type ThreadRunMode = "step" | "auto";

/** Hard cap on model calls per auto-run episode. */
export const MAX_AUTO_RUN_ROUNDS = 10;

/** Consecutive failed rounds of one tool before an auto-run episode stops. */
const MAX_AUTO_RUN_TOOL_FAILURE_ROUNDS = 2;

/** Live auto-run episode state; store-only, never serialized. */
export interface AutoRunState {
  /** 1-based model-call round the episode is currently on. */
  round: number;
}

/** A pending request to approve auto-running the named tools. */
export interface AutoRunApprovalRequest {
  /** Distinct tool names awaiting the user's permission to auto-run. */
  toolNames: string[];
}

/** How a single run ended; drives whether an auto-run episode continues. */
type RunOutcome = "completed" | "failed" | "aborted" | "skipped";

/**
 * Whether a run or an auto-run episode is in flight. Unlike `status`, this
 * stays true across an episode's round boundaries (tool execution, approval),
 * so it is the gate for readonly UI and for run/undo/history actions.
 */
export function isThreadBusy(
  state: Pick<ThreadState, "status" | "autoRun">
): boolean {
  return state.status === "running" || state.autoRun !== null;
}

export interface ThreadState {
  thread: Thread;
  streamingMessage: AssistantMessage | null;
  status: ThreadStoreStatus;
  abortController: AbortController | null;
  /**
   * How run() behaves: "step" stops at every tool call for manual handling;
   * "auto" executes MCP / built-in tool calls and continues until the model
   * produces a final answer (or an episode guard stops it). Session-only.
   */
  runMode: ThreadRunMode;
  /** The in-flight auto-run episode; null when none is active. */
  autoRun: AutoRunState | null;
  /** Tool approval awaiting the user's answer; rendered by the playground. */
  autoRunApproval: AutoRunApprovalRequest | null;
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
  setRunMode(runMode: ThreadRunMode): void;
  respondToAutoRunApproval(approved: boolean): void;
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
     * Execute one MCP / built-in tool call on behalf of auto-run. Injected
     * like `transport` so the store stays free of RPC imports; without it
     * auto-run stops at tool calls like step-by-step.
     */
    callTool?: (
      tool: CallableTool,
      args: Record<string, unknown>
    ) => Promise<CallableToolResult>;
  } = {}
): ThreadStore {
  const normalizedInputThread = normalizeThread(initialThread);
  const initialRunHistory = normalizeRunHistory(
    normalizedInputThread.runHistory
  );
  const initialEvaluations = normalizeEvaluations(
    normalizedInputThread.evaluations,
    initialRunHistory
  );
  const normalizedInitialThread = withRunHistory(
    normalizedInputThread,
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
       * Write tool call outputs onto an assistant message in one update — so
       * a batch (e.g. one auto-run round) costs a single state set and undo
       * snapshot. An omitted `isError` keeps the call's existing error flag.
       */
      const writeToolCallOutputs = (
        messageId: string,
        outputs: { toolCallId: string; text: string; isError?: boolean }[]
      ) => {
        const message = getMessage(messageId);
        if (message?.role !== "assistant") {
          return;
        }
        const outputsById = new Map(
          outputs.map((output) => [output.toolCallId, output])
        );
        if (!message.toolCalls?.some((tc) => outputsById.has(tc.id))) {
          return;
        }
        updateMessage(messageId, (m) => {
          const assistant = m as AssistantMessage;
          return {
            ...assistant,
            toolCalls: assistant.toolCalls?.map((toolCall) => {
              const output = outputsById.get(toolCall.id);
              if (!output) {
                return toolCall;
              }
              return {
                ...toolCall,
                output: {
                  content: [{ type: "text", text: output.text }],
                  isError: output.isError ?? toolCall.output?.isError,
                },
              };
            }),
          };
        });
      };

      // --- auto-run episode -----------------------------------------------

      // Episode plumbing lives in the closure (not in state): only the store's
      // own actions touch it, and approvals are remembered per store — i.e.
      // per open tab, gone when the tab closes.
      let autoRunController: AbortController | null = null;
      let autoRunApprovalRespond: ((approved: boolean) => void) | null = null;
      const autoRunApprovedToolKeys = new Set<string>();

      /**
       * Stable identity for approval memory. Keyed by what actually executes
       * — not the display name — so a same-named tool swapped to a different
       * MCP server between episodes has to be approved again.
       */
      const autoRunToolKey = (tool: CallableTool): string =>
        tool.type === "mcp"
          ? `mcp:${tool.serverId}:${tool.toolName}`
          : `builtin:${tool.name}`;

      interface AutoRunContinuation {
        messageId: string;
        pendingCalls: { toolCall: ToolCall; tool: CallableTool }[];
      }

      /**
       * Resolve how an auto-run episode continues from the current thread:
       * the trailing assistant message's unanswered tool calls, provided every
       * one of them maps to an executable (MCP / built-in) tool. Returns null
       * when the thread ends in a final answer — or when any call needs a
       * manual response, degrading the episode back to step-by-step.
       */
      const getAutoRunContinuation = (): AutoRunContinuation | null => {
        if (!options.callTool) {
          return null;
        }
        const messages = get().thread.context?.messages ?? [];
        const last = messages[messages.length - 1];
        if (last?.role !== "assistant" || !last.toolCalls?.length) {
          return null;
        }
        const toolsByName = new Map(
          (get().thread.context?.tools ?? []).map((tool) => [tool.name, tool])
        );
        const pendingCalls: AutoRunContinuation["pendingCalls"] = [];
        for (const toolCall of last.toolCalls) {
          if (getToolCallStatus(toolCall) !== "needsResponse") {
            continue;
          }
          const tool = toolsByName.get(toolCall.input.name);
          if (tool?.type !== "mcp" && tool?.type !== "builtin") {
            return null;
          }
          pendingCalls.push({ toolCall, tool });
        }
        return { messageId: last.id, pendingCalls };
      };

      /**
       * Ask the user to approve auto-running the named tools, resolving false
       * when denied — or when the episode aborts while the dialog is open.
       */
      const requestAutoRunApproval = (
        toolNames: string[],
        signal: AbortSignal
      ): Promise<boolean> =>
        new Promise((resolve) => {
          if (signal.aborted) {
            resolve(false);
            return;
          }
          const settle = (approved: boolean) => {
            autoRunApprovalRespond = null;
            signal.removeEventListener("abort", onAbort);
            set({ autoRunApproval: null });
            resolve(approved);
          };
          const onAbort = () => settle(false);
          autoRunApprovalRespond = settle;
          signal.addEventListener("abort", onAbort);
          set({ autoRunApproval: { toolNames } });
        });

      /** Resolve to null as soon as the signal aborts. */
      const raceWithAbort = async <T>(
        promise: Promise<T>,
        signal: AbortSignal
      ): Promise<T | null> => {
        // An already-aborted signal never fires its listener; bail up front.
        if (signal.aborted) {
          return null;
        }
        let onAbort!: () => void;
        try {
          return await Promise.race([
            promise,
            new Promise<null>((resolve) => {
              onAbort = () => resolve(null);
              signal.addEventListener("abort", onAbort, { once: true });
            }),
          ]);
        } finally {
          signal.removeEventListener("abort", onAbort);
        }
      };

      /**
       * Execute a round's pending tool calls and persist their outputs.
       * Returns whether the episode may continue with another model call.
       */
      const callPendingToolCalls = async (
        continuation: AutoRunContinuation,
        signal: AbortSignal,
        failedRoundsByTool: Map<string, number>
      ): Promise<"continue" | "stop"> => {
        const callTool = options.callTool;
        if (!callTool) {
          return "stop";
        }
        const results = await raceWithAbort(
          Promise.all(
            continuation.pendingCalls.map(async ({ toolCall, tool }) => ({
              toolCall,
              tool,
              result: await callTool(tool, toolCall.input.arguments),
            }))
          ),
          signal
        );
        // Stopping mid-execution discards the results: nothing is written, so
        // the calls stay open for manual handling. (The tools may still have
        // run on the bun side — the RPC itself cannot be cancelled.)
        if (!results || signal.aborted) {
          return "stop";
        }
        let firecrawlLimited = false;
        const toolErroredThisRound = new Map<string, boolean>();
        for (const { tool, result } of results) {
          toolErroredThisRound.set(
            tool.name,
            (toolErroredThisRound.get(tool.name) ?? false) || result.isError
          );
          if (result.isError && isFirecrawlLimitError(result.text)) {
            firecrawlLimited = true;
          }
        }
        writeToolCallOutputs(
          continuation.messageId,
          results.map(({ toolCall, result }) => ({
            toolCallId: toolCall.id,
            text: result.text,
            isError: result.isError,
          }))
        );
        if (firecrawlLimited) {
          // The dialog explains the failure and how to fix it; error outputs
          // are already persisted above for inspection.
          openFirecrawlLimitDialog();
          return "stop";
        }
        // A failure streak survives only across consecutive rounds in which
        // the tool kept failing; succeeding — or a round that doesn't call
        // the tool at all — resets it.
        for (const name of [...failedRoundsByTool.keys()]) {
          if (toolErroredThisRound.get(name) !== true) {
            failedRoundsByTool.delete(name);
          }
        }
        for (const [name, errored] of toolErroredThisRound) {
          if (!errored) {
            continue;
          }
          const failedRounds = (failedRoundsByTool.get(name) ?? 0) + 1;
          failedRoundsByTool.set(name, failedRounds);
          if (failedRounds >= MAX_AUTO_RUN_TOOL_FAILURE_ROUNDS) {
            toast.error("Auto-run stopped", {
              description: `"${name}" failed ${failedRounds} rounds in a row.`,
            });
            return "stop";
          }
        }
        return "continue";
      };

      /** Toast when an episode ends on tool calls auto-run cannot answer. */
      const notifyManualToolCalls = () => {
        const messages = get().thread.context?.messages ?? [];
        const last = messages[messages.length - 1];
        if (last?.role !== "assistant" || !last.toolCalls?.length) {
          return;
        }
        const pending = last.toolCalls.filter(
          (toolCall) => getToolCallStatus(toolCall) === "needsResponse"
        ).length;
        if (pending > 0) {
          toast.info("Auto-run paused", {
            description:
              pending === 1
                ? "1 tool call needs a manual response."
                : `${pending} tool calls need a manual response.`,
          });
        }
      };

      /**
       * Run a single model turn (one round). This is the whole of a "step"
       * mode run; auto-run episodes chain it. Reports how the run ended so
       * the episode knows whether to continue.
       */
      const runOnce = async (fromMessageId?: string): Promise<RunOutcome> => {
        // Resolve the model to run with: the thread's own when available,
        // else the default/first available. A thread with no resolvable model
        // cannot run.
        const model = options.resolveModel?.(get().thread.model) ?? null;
        if (!model) {
          toast.error("Select a model to run");
          return "skipped";
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
          return "skipped";
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
              (finalThread.context?.messages ?? []).slice(runStartMessageCount)
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
            const thread = withRunHistory(finalThread, runHistory, evaluations);
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
        }
        if (abortController.signal.aborted) {
          return "aborted";
        }
        return failed ? "failed" : "completed";
      };

      /**
       * Drive an auto-run episode: run a round, execute its tool calls, and
       * loop until the model produces a final answer or a guard stops it —
       * the round cap, repeated tool failures, the Firecrawl limit, a denied
       * approval, a failed run, or the user stopping the thread. Tool calls
       * that need a manual response end the episode like step-by-step.
       */
      const runAuto = async (fromMessageId?: string): Promise<void> => {
        const controller = new AbortController();
        autoRunController = controller;
        // Tool name → consecutive failed rounds. Errors are fed back so the
        // model can react, but a tool that keeps failing would otherwise burn
        // model calls retrying forever.
        const failedRoundsByTool = new Map<string, number>();
        const lastMessageId = () => {
          const messages = get().thread.context?.messages ?? [];
          return messages[messages.length - 1]?.id ?? null;
        };
        try {
          let from = fromMessageId;
          for (let round = 1; ; round++) {
            const lastMessageIdBeforeRun = lastMessageId();
            set({ autoRun: { round } });
            const outcome = await runOnce(from);
            from = undefined;
            if (outcome !== "completed" || controller.signal.aborted) {
              return;
            }
            const continuation = getAutoRunContinuation();
            if (!continuation) {
              // Final answer — or tool calls that need a manual response, in
              // which case the episode degrades back to step-by-step.
              notifyManualToolCalls();
              return;
            }
            if (
              continuation.pendingCalls.length === 0 &&
              continuation.messageId === lastMessageIdBeforeRun
            ) {
              // The round appended nothing (e.g. an empty stream) and there is
              // nothing left to execute — bail instead of burning model calls
              // until the round cap.
              return;
            }
            const unapprovedTools = [
              ...new Map(
                continuation.pendingCalls
                  .filter(
                    ({ tool }) =>
                      !autoRunApprovedToolKeys.has(autoRunToolKey(tool))
                  )
                  .map(({ tool }) => [autoRunToolKey(tool), tool])
              ).values(),
            ];
            if (unapprovedTools.length > 0) {
              const approved = await requestAutoRunApproval(
                [...new Set(unapprovedTools.map((tool) => tool.name))],
                controller.signal
              );
              if (!approved) {
                return;
              }
              for (const tool of unapprovedTools) {
                autoRunApprovedToolKeys.add(autoRunToolKey(tool));
              }
            }
            if (continuation.pendingCalls.length > 0) {
              const result = await callPendingToolCalls(
                continuation,
                controller.signal,
                failedRoundsByTool
              );
              if (result === "stop") {
                return;
              }
            }
            // Cap model calls, not tool calls: the round's results are
            // already filled above, so a plain Run resumes cleanly.
            if (round >= MAX_AUTO_RUN_ROUNDS) {
              toast.info("Auto-run paused", {
                description: `Reached ${MAX_AUTO_RUN_ROUNDS} model calls. Tool results are filled — run again to continue.`,
              });
              return;
            }
          }
        } finally {
          autoRunController = null;
          set({ autoRun: null });
        }
      };

      // --- store --------------------------------------------------------------

      return {
        thread: normalizedInitialThread,
        streamingMessage: null,
        status: "idle",
        abortController: null,
        runMode: "step",
        autoRun: null,
        autoRunApproval: null,
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
          writeToolCallOutputs(messageId, [{ toolCallId, text, isError }]);
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
          if (isThreadBusy(get())) {
            throw new Error("Thread is already running");
          }
          if (get().runMode === "auto") {
            await runAuto(fromMessageId);
            return;
          }
          await runOnce(fromMessageId);
        },
        setRunMode(runMode: ThreadRunMode) {
          if (isThreadBusy(get())) {
            return;
          }
          set({ runMode });
        },
        respondToAutoRunApproval(approved: boolean) {
          autoRunApprovalRespond?.(approved);
        },
        undo() {
          if (isThreadBusy(get())) {
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
          if (isThreadBusy(get())) {
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
          if (isThreadBusy(get())) {
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
          if (isThreadBusy(get())) {
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
          if (isThreadBusy(get())) {
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
          if (isThreadBusy(get())) {
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
          // Stop any auto-run episode first so a round boundary doesn't start
          // another model call, then cancel the in-flight stream (if any).
          autoRunController?.abort();
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
  setRunMode: s.setRunMode,
  respondToAutoRunApproval: s.respondToAutoRunApproval,
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

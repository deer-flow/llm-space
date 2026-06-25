/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/unbound-method */
import {
  AssistantMessage,
  Message,
  reduceMessages,
  streamThread,
  Tool as ToolSchema,
  uuid,
  type FunctionTool,
  type MessageContent,
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

const toolValidator = Compile(ToolSchema);

export type ThreadStoreStatus = "idle" | "running";
export interface ThreadState {
  thread: Thread;
  streamingMessage: AssistantMessage | null;
  status: ThreadStoreStatus;
  abortController: AbortController | null;
  collapsedMessageIds: string[];

  run(fromMessageId?: string): Promise<void>;
  appendMessage(): void;
  insertMessageBefore(beforeMessageId: string): void;
  moveMessage(fromIndex: number, toIndex: number): void;
  removeMessage(id: string): void;
  updateSystemPrompt(systemPrompt: string): void;
  updateTitle(title: string | undefined): void;
  updateModelParams(params: Partial<ModelConfigParams>): void;
  updateMessageTextContent(id: string, text: string): void;
  addMessageImageContent(id: string, mimeType: string, data: string): void;
  removeMessageImageContent(id: string, contentIndex: number): void;
  updateToolCallOutputTextContent(
    messageId: string,
    toolCallId: string,
    text: string
  ): void;
  addTool(tool: FunctionTool): boolean;
  updateTool(name: string, tool: FunctionTool): boolean;
  removeTool(name: string): void;
  toggleMessageRole(id: string): void;
  toggleMessageCollapsed(id: string): void;
  abort(): void;
}

export type ThreadStore = StoreApi<ThreadState>;

export function createThreadStore(initialThread: Thread): ThreadStore {
  return createStore<ThreadState>()(
    subscribeWithSelector((set, get) => {
      // --- internal helpers ---------------------------------------------------

      const patchThread = (partial: Partial<Thread>) => {
        set({ thread: { ...get().thread, ...partial } });
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
          toast.error(
            errors.map((e) => e.message).join(", ") || "Invalid tool"
          );
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
        thread: initialThread,
        streamingMessage: null,
        status: "idle",
        abortController: null,
        collapsedMessageIds: [],

        appendMessage() {
          const message = createUserMessage();
          updateMessages((messages) => [...messages, message]);
          return message.id;
        },
        insertMessageBefore(beforeMessageId: string) {
          updateMessages((messages) => {
            const index = messages.findIndex((m) => m.id === beforeMessageId);
            if (index === -1) {
              return messages;
            }
            return [
              ...messages.slice(0, index),
              createUserMessage(),
              ...messages.slice(index),
            ];
          });
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
        updateModelParams(params: Partial<ModelConfigParams>) {
          const { model } = get().thread;
          patchThread({
            model: { ...model, params: { ...model.params, ...params } },
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
            toast.error(`Tool "${tool.name}" already exists`);
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
            toast.error(`Tool "${tool.name}" already exists`);
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
        updateToolCallOutputTextContent(messageId, toolCallId, text) {
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
                      output: { content: [{ type: "text", text }] },
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
          const abortController = new AbortController();
          set({ status: "running", abortController });

          // Truncate trailing messages when re-running from a given message.
          let messages = [...(get().thread.context?.messages ?? [])];
          if (fromMessageId) {
            const index = messages.findIndex((m) => m.id === fromMessageId);
            if (index !== -1 && index !== messages.length - 1) {
              messages = messages.slice(0, index + 1);
              setMessages(messages);
            }
          }

          // Append a finished assistant message to the thread.
          const commit = (message: AssistantMessage) => {
            messages = [...messages, message];
            setMessages(messages);
          };

          let streamingMessage: AssistantMessage | null = null;
          let content: ReducedMessageContent[] = [];
          try {
            const response = streamThread(
              {
                ...get().thread,
                context: { ...get().thread.context, messages },
              },
              { signal: abortController.signal }
            );
            for await (const chunk of response) {
              const reduced = reduceMessages(chunk, {
                streamingMessage,
                content,
              });
              if (!reduced) {
                continue;
              }
              if (reduced.type === "message_start" && streamingMessage) {
                commit(streamingMessage);
              }
              streamingMessage = reduced.message;
              content = reduced.content;
              set({ streamingMessage });
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
              console.error(error);
              if (error instanceof Error) {
                toast.error(error.message);
              }
            }
          } finally {
            set({
              streamingMessage: null,
              status: "idle",
              abortController: null,
            });
          }
        },
        abort() {
          const { status, abortController } = get();
          if (status === "running") {
            try {
              abortController?.abort();
            } catch {
              // Ignored
            }
            set({ status: "idle", abortController: null });
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

  appendMessage: s.appendMessage,
  insertMessageBefore: s.insertMessageBefore,
  moveMessage: s.moveMessage,
  removeMessage: s.removeMessage,
  updateSystemPrompt: s.updateSystemPrompt,
  updateTitle: s.updateTitle,
  updateModelParams: s.updateModelParams,
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

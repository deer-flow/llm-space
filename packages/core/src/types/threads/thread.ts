import { Type, type Static } from "typebox";

import { Message } from "../messages";
import { ModelConfig } from "../models";
import { Tool } from "../tools";

/**
 * The context of a thread, including the system prompt, messages, and tools.
 */
export const ThreadContext = Type.Object({
  /**
   * The system prompt of the thread.
   */
  systemPrompt: Type.Optional(Type.String()),

  /**
   * The tools of the thread.
   */
  tools: Type.Optional(Type.Array(Tool)),

  /**
   * The messages of the thread.
   */
  messages: Type.Optional(Type.Array(Message)),
});
export type ThreadContext = Static<typeof ThreadContext>;

/**
 * The definition of a thread.
 */
export const Thread = Type.Object({
  /**
   * The title of the thread.
   */
  title: Type.Optional(Type.String()),

  /**
   * The model configuration of the thread.
   */
  model: ModelConfig,

  /**
   * The context of the thread, including the system prompt, messages, and tools.
   */
  context: Type.Optional(ThreadContext),
});
export type Thread = Static<typeof Thread>;

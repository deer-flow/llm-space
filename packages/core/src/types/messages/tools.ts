import { Type, type Static } from "typebox";

import { AgentStatusToolCallMetadata } from "../../agent-status/types";

import { ImageContent, TextContent } from "./contents";

/**
 * The input of a tool call.
 */
export const ToolCallInput = Type.Object({
  /**
   * The name of the tool.
   */
  name: Type.String(),

  /**
   * The arguments of the tool call.
   */
  arguments: Type.Record(Type.String(), Type.Any()),

  partialArguments: Type.Optional(Type.String()),
});
export type ToolCallInput = Static<typeof ToolCallInput>;

/**
 * The output of a tool call.
 */
export const ToolCallOutput = Type.Object({
  content: Type.Array(Type.Union([TextContent, ImageContent])),
  /**
   * Whether the tool runtime reported a failed call. This is forwarded back to
   * model providers that distinguish failed tool results from observations.
   */
  isError: Type.Optional(Type.Boolean()),

  /**
   * 工具状态计数、TODO、错误与运行时 effect 的可重建元数据。
   */
  agentStatus: Type.Optional(AgentStatusToolCallMetadata),
});
export type ToolCallOutput = Static<typeof ToolCallOutput>;

/**
 * The tool call from the AI model.
 */
export const ToolCall = Type.Object({
  /**
   * The unique ID of the tool call.
   */
  id: Type.String(),

  /**
   * The input of the tool call.
   */
  input: ToolCallInput,

  /**
   * The output of the tool call.
   */
  output: Type.Optional(ToolCallOutput),
});
export type ToolCall = Static<typeof ToolCall>;

import { Type, type Static } from "typebox";

export const AgentStatusComponent = Type.Union([
  Type.Literal("timestamps"),
  Type.Literal("tool-counter"),
  Type.Literal("todos"),
  Type.Literal("detailed-errors"),
  Type.Literal("system"),
]);
export type AgentStatusComponent = Static<typeof AgentStatusComponent>;

export const ALL_AGENT_STATUS_COMPONENTS = [
  "timestamps",
  "tool-counter",
  "todos",
  "detailed-errors",
  "system",
] as const satisfies readonly AgentStatusComponent[];

/**
 * Agent Status 的缺省配置：不启用任何组件。
 */
export const DEFAULT_AGENT_STATUS_COMPONENTS =
  [] as const satisfies readonly AgentStatusComponent[];

export const AgentStatusSettings = Type.Object({
  components: Type.Optional(Type.Array(AgentStatusComponent)),
  simulatedTimeOffsetMs: Type.Optional(Type.Number()),
});
export type AgentStatusSettings = Static<typeof AgentStatusSettings>;

export const AgentStatusEnvironment = Type.Object({
  currentTime: Type.String(),
  workingDirectory: Type.String(),
  platform: Type.String(),
  arch: Type.String(),
  shell: Type.String(),
  pythonVersion: Type.String(),
});
export type AgentStatusEnvironment = Static<typeof AgentStatusEnvironment>;

export const AgentTodoStatus = Type.Union([
  Type.Literal("pending"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
  Type.Literal("cancelled"),
]);
export type AgentTodoStatus = Static<typeof AgentTodoStatus>;

export const AgentTodoItem = Type.Object({
  id: Type.String(),
  content: Type.String(),
  status: AgentTodoStatus,
  timestamp: Type.Number(),
});
export type AgentTodoItem = Static<typeof AgentTodoItem>;

export const AgentStatusError = Type.Object({
  type: Type.String(),
  description: Type.String(),
  argumentsJson: Type.String(),
  stack: Type.String(),
  suggestions: Type.Array(Type.String()),
});
export type AgentStatusError = Static<typeof AgentStatusError>;

export const AgentStatusEffect = Type.Union([
  Type.Object({
    type: Type.Literal("working-directory"),
    workingDirectory: Type.String(),
  }),
]);
export type AgentStatusEffect = Static<typeof AgentStatusEffect>;

export const AgentStatusMessageMetadata = Type.Object({
  timestamp: Type.Number(),
});
export type AgentStatusMessageMetadata = Static<
  typeof AgentStatusMessageMetadata
>;

export const AgentStatusToolCallMetadata = Type.Object({
  timestamp: Type.Optional(Type.Number()),
  ordinal: Type.Optional(Type.Number({ minimum: 1 })),
  todos: Type.Optional(Type.Array(AgentTodoItem)),
  error: Type.Optional(AgentStatusError),
  effects: Type.Optional(Type.Array(AgentStatusEffect)),
});
export type AgentStatusToolCallMetadata = Static<
  typeof AgentStatusToolCallMetadata
>;

export const PiAgentStatusContext = Type.Object({
  components: Type.Optional(Type.Array(AgentStatusComponent)),
  simulatedTimeOffsetMs: Type.Optional(Type.Number()),
  workingDirectory: Type.Optional(Type.String()),
  toolCallMetadata: Type.Optional(
    Type.Record(Type.String(), AgentStatusToolCallMetadata)
  ),
});
export type PiAgentStatusContext = Static<typeof PiAgentStatusContext>;

export interface AgentStatusSnapshot {
  now: number;
  components: AgentStatusComponent[];
  toolCounts: Record<string, number>;
  todos: AgentTodoItem[];
  lastError?: AgentStatusError;
  workingDirectory: string;
  environment: AgentStatusEnvironment;
}

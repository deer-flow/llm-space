import type { BuiltinTool, Tool } from "../types/tools";

export const AGENT_STATUS_TODO_TOOLS: BuiltinTool[] = [
  {
    type: "builtin",
    name: "rewrite_todo_list",
    icon: "list-todo",
    description:
      "重写完整的 Agent TODO 列表。用于把多步骤任务外置为可追踪的工作记忆；保留已有 id 可维持项目标识稳定。",
    strict: true,
    parameters: {
      type: "object",
      required: ["todos"],
      properties: {
        todos: {
          type: "array",
          description: "用于替换当前列表的全部 TODO 项。",
          items: {
            type: "object",
            required: ["content", "status"],
            properties: {
              id: {
                type: "string",
                description: "已有项目的可选唯一标识符；新项目可省略。",
              },
              content: {
                type: "string",
                description: "简短、明确的工作内容。",
              },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed", "cancelled"],
                description: "TODO 项当前状态。",
              },
            },
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "builtin",
    name: "update_todo_status",
    icon: "list-checks",
    description:
      "按唯一标识符原子更新一个已有 Agent TODO 项的状态，不重写其余项目。",
    strict: true,
    parameters: {
      type: "object",
      required: ["id", "status"],
      properties: {
        id: {
          type: "string",
          description: "需要更新的 TODO 项唯一标识符。",
        },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "cancelled"],
          description: "TODO 项的新状态。",
        },
      },
      additionalProperties: false,
    },
  },
];

const AGENT_STATUS_TODO_TOOL_NAMES = new Set(
  AGENT_STATUS_TODO_TOOLS.map((tool) => tool.name)
);

/**
 * 判断名称是否由 Agent Status 的 TODO 组件保留。
 */
export function isAgentStatusTodoToolName(name: string): boolean {
  return AGENT_STATUS_TODO_TOOL_NAMES.has(name);
}

/**
 * 判断工具是否由 Agent Status 的 TODO 组件拥有。
 */
export function isAgentStatusTodoTool(tool: Tool): tool is BuiltinTool {
  return tool.type === "builtin" && isAgentStatusTodoToolName(tool.name);
}

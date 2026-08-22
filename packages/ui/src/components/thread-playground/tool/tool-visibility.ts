import { isAgentStatusTodoTool, type Tool } from "@llm-space/core";

/**
 * Agent Status 拥有的内部工具只能通过状态组件配置，不能在普通 Tools 中编辑。
 */
export function getUserConfigurableTools<T extends Tool>(
  tools: readonly T[]
): T[] {
  return tools.filter((tool) => !isAgentStatusTodoTool(tool));
}

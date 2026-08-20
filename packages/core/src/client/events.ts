import type { AgentEvent } from "@earendil-works/pi-agent-core";

import type { AgentStatusEnvironment } from "../agent-status/types";

/** runtime 探测完成后回传给客户端的真实 Agent Status 环境快照。 */
export interface AgentStatusEnvironmentEvent {
  type: "agent_status_environment";
  environment: AgentStatusEnvironment;
}

/** 单次 Agent 流中可见的模型事件与宿主状态事件。 */
export type AgentStreamEvent = AgentEvent | AgentStatusEnvironmentEvent;

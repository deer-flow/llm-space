import type { PiThreadContext } from "@llm-space/core";
import {
  createAgentStatusRuntime,
  type AgentStatusEnvironment,
} from "@llm-space/core/agent-status";

import type { AgentEnvironmentProbe } from "./environment";

export interface PrepareAgentStatusContextOptions {
  probe: AgentEnvironmentProbe;
  workingDirectory: string;
}

export interface PreparedAgentStatusRun {
  context: PiThreadContext;
  environment: AgentStatusEnvironment;
}

/** 准备模型上下文，并保留同一次探测得到的环境快照供流事件回传。 */
export async function prepareAgentStatusRun(
  context: PiThreadContext,
  options: PrepareAgentStatusContextOptions
): Promise<PreparedAgentStatusRun> {
  const environment = await options.probe.inspect({
    workingDirectory: options.workingDirectory,
  });
  const runtime = createAgentStatusRuntime({ environment });
  return {
    context: await runtime.prepareContext(context),
    environment,
  };
}

export async function prepareAgentStatusContext(
  context: PiThreadContext,
  options: PrepareAgentStatusContextOptions
): Promise<PiThreadContext> {
  return (await prepareAgentStatusRun(context, options)).context;
}

import { describe, expect, test } from "bun:test";

import type { AgentStreamRequest } from "@llm-space/core";

import type { AgentEnvironmentProbe } from "../../src/agent-status";
import type { ModelManager } from "../../src/models";
import type { RuntimeStreamResponsePayload } from "../../src/runtime";
import { StreamThreadController } from "../../src/streaming";

const ENVIRONMENT = {
  currentTime: "2026-08-19T06:10:20.123Z",
  workingDirectory: "C:\\repo",
  platform: "win32",
  arch: "x64",
  shell: "PowerShell 7",
  pythonVersion: "Python 3.12.4",
};

const REQUEST: AgentStreamRequest = {
  model: { provider: "test", id: "test-model" },
  context: {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "检查项目" }],
        timestamp: Date.parse("2026-08-19T06:10:10.123Z"),
      },
    ],
    tools: [],
    responseApiNativeTools: [],
    agentStatus: { workingDirectory: ENVIRONMENT.workingDirectory },
  },
};

function _createModelManagerThatStopsBeforeModelStream(): ModelManager {
  return {
    resolveConnection: () =>
      Promise.resolve({ apiKey: "test-key", headers: {} }),
    getAvailableModels: () => Promise.reject(new Error("停止测试模型流")),
    isBuiltin: () => true,
    isBuiltinCatalogModel: () => true,
  } as unknown as ModelManager;
}

function _createProbe(): AgentEnvironmentProbe {
  return {
    inspect: () => Promise.resolve(ENVIRONMENT),
  };
}

describe("StreamThreadController Agent Status 环境事件", () => {
  test("探测完成后先回传真实环境快照，即使模型流随后失败", async () => {
    const responses: RuntimeStreamResponsePayload[] = [];
    const controller = new StreamThreadController(
      _createModelManagerThatStopsBeforeModelStream(),
      undefined,
      _createProbe()
    );

    await controller.run(
      { streamId: "stream-environment", request: REQUEST },
      (message) => responses.push(message)
    );

    expect(responses).toEqual([
      {
        streamId: "stream-environment",
        type: "event",
        event: {
          type: "agent_status_environment",
          environment: ENVIRONMENT,
        },
      },
      {
        streamId: "stream-environment",
        type: "error",
        message: "停止测试模型流",
      },
    ]);
  });
});

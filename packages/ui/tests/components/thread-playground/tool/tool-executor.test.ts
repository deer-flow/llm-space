import { expect, test } from "bun:test";

import type { BuiltinTool, Thread } from "@llm-space/core";

import { createToolExecutor } from "../../../../src/components/thread-playground/tool/tool-executor";

test("tool executor resolves a provider-backed tool connection once for every call path", async () => {
  const tool = {
    type: "builtin",
    name: "generate_image",
    description: "Generate an image.",
    parameters: { type: "object", properties: {} },
    connection: { providerId: "ark" },
  } as BuiltinTool;
  let receivedOptions: unknown;
  const execute = createToolExecutor({
    executeTool: (_tool, _args, options) => {
      receivedOptions = options;
      return Promise.resolve({ content: [], isError: false });
    },
    getProfileId: (providerId, selectionScope) =>
      providerId === "ark" && selectionScope === "tool:generate_image"
        ? "profile-work"
        : undefined,
    runtimeId: "remote-fixture",
  });
  const thread = { id: "thread-fixture" } as Thread;

  await execute(tool, { prompt: "A red circle" }, { thread, variables: {} });

  expect(receivedOptions).toEqual({
    runtimeId: "remote-fixture",
    thread,
    variables: {},
    connection: { providerId: "ark", profileId: "profile-work" },
  });
});

test("tool executor routes a custom image provider and keeps legacy Ark fallback", async () => {
  const calls: unknown[] = [];
  const execute = createToolExecutor({
    executeTool: (_tool, _args, options) => {
      calls.push(options.connection);
      return Promise.resolve({ content: [], isError: false });
    },
    getProfileId: (providerId) => `${providerId}-profile`,
  });
  const thread = { id: "thread-fixture" } as Thread;
  const base = {
    type: "builtin",
    name: "generate_image",
    description: "Generate an image.",
    parameters: { type: "object", properties: {} },
  } as BuiltinTool;

  await execute(
    { ...base, connection: { providerId: "agnes" } },
    {},
    { thread, variables: {} }
  );
  await execute(base, {}, { thread, variables: {} });

  expect(calls).toEqual([
    { providerId: "agnes", profileId: "agnes-profile" },
    { providerId: "ark", profileId: "ark-profile" },
  ]);
});

import { describe, expect, test } from "bun:test";

import { createWorkflowContext } from "./runtime";
import type { OneShotRequest, WorkflowEvent } from "./types";

const MODEL = { provider: "anthropic", id: "claude-sonnet-5" };

describe("createWorkflowContext", () => {
  test("agent() calls runOneShot with the default model and returns its text", async () => {
    const seen: OneShotRequest[] = [];
    const ctx = createWorkflowContext({
      defaultModel: MODEL,
      runOneShot: (request) => {
        seen.push(request);
        return Promise.resolve(`echo:${request.userPrompt}`);
      },
    });

    const text = await ctx.agent("hello");
    expect(text).toBe("echo:hello");
    expect(seen[0]?.model).toEqual(MODEL);
  });

  test("agent() throws when no model is available", () => {
    const ctx = createWorkflowContext({
      runOneShot: () => Promise.resolve(""),
    });
    expect(ctx.agent("x")).rejects.toThrow(/No model/);
  });

  test("phase/log/agent emit progress events in order", async () => {
    const events: WorkflowEvent[] = [];
    const ctx = createWorkflowContext({
      defaultModel: MODEL,
      report: (event) => events.push(event),
      runOneShot: () => Promise.resolve("ok"),
    });

    ctx.phase("Build");
    ctx.log("step");
    await ctx.agent("go", { label: "task" });

    expect(events).toEqual([
      { type: "phase", title: "Build" },
      { type: "log", message: "step" },
      { type: "agent", label: "task", status: "start" },
      { type: "agent", label: "task", status: "done" },
    ]);
  });

  test("the concurrency cap bounds simultaneous agent() calls", async () => {
    let active = 0;
    let peak = 0;
    const ctx = createWorkflowContext({
      defaultModel: MODEL,
      concurrency: 2,
      runOneShot: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return "";
      },
    });

    await ctx.parallel(
      Array.from({ length: 6 }, () => () => ctx.agent("x"))
    );
    expect(peak).toBeLessThanOrEqual(2);
  });

  test("agent() reports an error event and rethrows on failure", async () => {
    const events: WorkflowEvent[] = [];
    const ctx = createWorkflowContext({
      defaultModel: MODEL,
      report: (event) => events.push(event),
      runOneShot: () => Promise.reject(new Error("boom")),
    });

    await ctx.agent("x", { label: "t" }).catch(() => undefined);
    expect(events).toContainEqual({ type: "agent", label: "t", status: "error" });
  });
});

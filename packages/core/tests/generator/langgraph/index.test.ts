import { describe, expect, test } from "bun:test";

import { langgraphGenerator } from "../../../src/generator/langgraph/index";
import type { GeneratorCapabilities, GeneratorRunInput } from "../../../src/generator/types";
import type { WorkflowContext } from "../../../src/workflow";


describe("langgraphGenerator", () => {
  test("writes a Makefile with the development server target", async () => {
    const written = new Map<string, string>();
    const phases: string[] = [];
    const logs: string[] = [];
    const capabilities: GeneratorCapabilities = {
      checkUv() {
        return Promise.resolve({ installed: false });
      },
      runUv() {
        return Promise.resolve({
          code: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
        });
      },
      writeFile(_rootDir, relativePath, contents) {
        written.set(relativePath, contents);
        return Promise.resolve();
      },
      removeFile() {
        return Promise.resolve();
      },
    };
    const workflow: WorkflowContext = {
      phase(title) {
        phases.push(title);
      },
      log(message) {
        logs.push(message);
      },
      agent() {
        return Promise.resolve("");
      },
      parallel<T>(thunks: (() => Promise<T>)[]) {
        return Promise.all(thunks.map((thunk) => thunk()));
      },
      signal: new AbortController().signal,
    };
    const input: GeneratorRunInput = {
      targetDir: "/authorized/output",
      context: {},
      rendered: {},
      systemPromptTemplate: "You are helpful.",
      skills: [],
      renderedVariableValues: {},
      model: { provider: "openai", id: "gpt-5" },
      modelInfo: {
        name: "GPT-5",
        anthropic: false,
        deepseekThinking: false,
        supportsReasoning: true,
      },
      capabilities,
    };

    await langgraphGenerator.run(workflow, input);

    expect(written.get("Makefile")).toBe(
      ".PHONY: dev\n\ndev:\n\tuv run langgraph dev\n"
    );
    expect(phases.at(-1)).toBe("Done");
    expect(logs).toContain("uv not found — skipping dependency install");
  });

  test("rejects provider-hosted tools before writing any files", async () => {
    const written: string[] = [];
    const capabilities: GeneratorCapabilities = {
      checkUv() {
        return Promise.resolve({ installed: false });
      },
      runUv() {
        return Promise.resolve({
          code: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
        });
      },
      writeFile(_rootDir, relativePath) {
        written.push(relativePath);
        return Promise.resolve();
      },
      removeFile() {
        return Promise.resolve();
      },
    };
    const phases: string[] = [];
    const logs: string[] = [];
    const workflow: WorkflowContext = {
      phase(title) {
        phases.push(title);
      },
      log(message) {
        logs.push(message);
      },
      agent() {
        return Promise.resolve("");
      },
      parallel<T>(thunks: (() => Promise<T>)[]) {
        return Promise.all(thunks.map((thunk) => thunk()));
      },
      signal: new AbortController().signal,
    };
    const input: GeneratorRunInput = {
      targetDir: "/authorized/output",
      context: {
        tools: [
          {
            type: "provider-hosted",
            config: { type: "web_search" },
          },
        ],
      },
      rendered: {},
      systemPromptTemplate: "",
      skills: [],
      renderedVariableValues: {},
      model: { provider: "openai", id: "gpt-5" },
      modelInfo: {
        name: "GPT-5",
        anthropic: false,
        deepseekThinking: false,
        supportsReasoning: true,
      },
      capabilities,
    };

    let error: unknown;
    try {
      await langgraphGenerator.run(workflow, input);
    } catch (caught) {
      error = caught;
    }

    expect(() => {
      throw error;
    }).toThrow(
      "LangGraph export does not support provider-hosted tools"
    );
    expect(written).toEqual([]);
    expect(phases).toEqual([]);
    expect(logs).toEqual([]);
  });

  test("rejects Plugin Tools before writing any files", async () => {
    const written: string[] = [];
    const capabilities: GeneratorCapabilities = {
      checkUv: () => Promise.resolve({ installed: false }),
      runUv: () =>
        Promise.resolve({
          code: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
        }),
      writeFile: (_rootDir, relativePath) => {
        written.push(relativePath);
        return Promise.resolve();
      },
      removeFile: () => Promise.resolve(),
    };
    const workflow: WorkflowContext = {
      phase: () => undefined,
      log: () => undefined,
      agent: () => Promise.resolve(""),
      parallel: <T>(thunks: (() => Promise<T>)[]) =>
        Promise.all(thunks.map((thunk) => thunk())),
      signal: new AbortController().signal,
    };
    const input: GeneratorRunInput = {
      targetDir: "/authorized/output",
      context: {
        tools: [
          {
            type: "plugin",
            pluginId: "project-kit",
            toolId: "plugin:project-kit:tool:project-info",
            name: "project_info",
            description: "Read project information.",
            parameters: { type: "object", properties: {} },
          },
        ],
      },
      rendered: {},
      systemPromptTemplate: "",
      skills: [],
      renderedVariableValues: {},
      model: { provider: "openai", id: "gpt-5" },
      modelInfo: {
        name: "GPT-5",
        anthropic: false,
        deepseekThinking: false,
        supportsReasoning: true,
      },
      capabilities,
    };

    let error: unknown;
    try {
      await langgraphGenerator.run(workflow, input);
    } catch (caught) {
      error = caught;
    }

    expect(() => {
      throw error;
    }).toThrow("LangGraph export does not support Plugin tools");
    expect(written).toEqual([]);
  });
});

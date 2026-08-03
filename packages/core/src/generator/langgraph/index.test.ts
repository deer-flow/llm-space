import { describe, expect, test } from "bun:test";

import type { WorkflowContext } from "../../workflow";
import type { GeneratorCapabilities, GeneratorRunInput } from "../types";

import { langgraphGenerator } from "./index";

describe("langgraphGenerator", () => {
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
});

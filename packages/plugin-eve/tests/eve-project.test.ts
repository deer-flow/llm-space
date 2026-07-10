import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "bun:test";

import {
  callEveTool,
  detectEveProject,
  importEveProject,
  listEveProjectSkills,
  readEveProjectSkill,
} from "../src/eve";

const PACKAGE_ROOT = path.resolve(import.meta.dir, "..");
const MINIMAL_PROJECT = path.join(PACKAGE_ROOT, "fixtures", "minimal");
const STATIC_ZOD_PROJECT = path.join(PACKAGE_ROOT, "fixtures", "static-zod");
const BASIC_EXAMPLE_PROJECT = path.join(
  PACKAGE_ROOT,
  "examples",
  "basic-agent"
);

describe("plugin-eve project import", () => {
  test("rejects folders that are not Eve projects", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "llm-space-eve-"));
    try {
      const result = detectEveProject(dir);
      expect(result.ok).toBe(false);
      expect(result.diagnostics[0]?.code).toBe("missing_agent_dir");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("imports markdown instructions, tools, and project-scoped skills", async () => {
    const result = await importEveProject({
      projectRoot: MINIMAL_PROJECT,
      source: "manual",
    });

    expect(result.systemPrompt).toContain("minimal Eve fixture");
    expect(result.project.projectRoot).toBe(MINIMAL_PROJECT);
    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      "echo",
      "skill",
    ]);

    const skills = await listEveProjectSkills(MINIMAL_PROJECT);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "research-helper",
      enabled: true,
    });
  });

  test("reads parameters from the imported defineTool object", async () => {
    const result = await importEveProject({
      projectRoot: STATIC_ZOD_PROJECT,
    });
    const score = result.tools.find((tool) => tool.name === "score");

    expect(score?.parameters).toMatchObject({
      type: "object",
      required: ["answer"],
      properties: {
        answer: { minLength: 1 },
        strict: { type: "boolean" },
      },
    });
  });

  test("executes basic Eve tools and applies toModelOutput", async () => {
    const result = await callEveTool({
      projectRoot: BASIC_EXAMPLE_PROJECT,
      runtime: "tool",
      toolName: "get_weather",
      arguments: { city: "Tokyo" },
    });

    expect(result).toEqual({
      contentText: "Weather for Tokyo: Sunny, 72F",
      isError: false,
    });
  });

  test("imports Eve defineInstructions and defineSkill modules", async () => {
    const result = await importEveProject({
      projectRoot: BASIC_EXAMPLE_PROJECT,
    });
    const skills = await listEveProjectSkills(BASIC_EXAMPLE_PROJECT);

    expect(result.systemPrompt).toContain("basic Eve example agent");
    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      "get_weather",
      "skill",
    ]);
    expect(skills[0]).toMatchObject({
      name: "research-plan",
      description: "Plan a short research pass before answering.",
    });
  });

  test("loads only skills from the Eve project", async () => {
    const found = await readEveProjectSkill(
      BASIC_EXAMPLE_PROJECT,
      "research-plan"
    );
    const missingGlobalSkill = await readEveProjectSkill(
      BASIC_EXAMPLE_PROJECT,
      "deep-research"
    );

    expect(found?.content).toContain("Clarify the objective");
    expect(missingGlobalSkill).toBeNull();
  });

  test("rejects tool paths outside the project tools directory", async () => {
    const escapedToolPath = path.join(
      STATIC_ZOD_PROJECT,
      "agent",
      "tools",
      "score.ts"
    );

    try {
      await callEveTool({
        projectRoot: MINIMAL_PROJECT,
        runtime: "tool",
        toolName: "score",
        toolPath: escapedToolPath,
        arguments: { answer: "ok" },
      });
      throw new Error("Expected escaped Eve tool path to be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        "Path escapes Eve project boundary"
      );
    }
  });
});

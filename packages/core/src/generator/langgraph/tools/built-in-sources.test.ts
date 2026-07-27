import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  readBuiltinToolSources,
  readVariablesSource,
  renderManifest,
} from "../../../../../../scripts/gen-langgraph-tools";

import {
  BUILTIN_TOOL_SOURCES,
  VARIABLES_PY_SOURCE,
} from "./built-in-sources.generated";

describe("built-in tool sources manifest", () => {
  it("is in sync with the built-in/*.py files", async () => {
    // Rebuild from disk and compare — fails if a .py changed without rerunning
    // `bun scripts/gen-langgraph-tools.ts`.
    const fromDisk = await readBuiltinToolSources();
    expect(BUILTIN_TOOL_SOURCES).toEqual(fromDisk);
  });

  it("embeds variables.py in sync", async () => {
    expect(VARIABLES_PY_SOURCE).toBe(await readVariablesSource());
  });

  it("matches the committed generated file contents", async () => {
    const fromDisk = await readBuiltinToolSources();
    const variables = await readVariablesSource();
    const rendered = renderManifest(fromDisk, variables);
    const committed = await Bun.file(
      new URL("./built-in-sources.generated.ts", import.meta.url)
    ).text();
    expect(committed).toBe(rendered);
  });

  it("covers the expected built-in tools", () => {
    expect(BUILTIN_TOOL_SOURCES.read).toContain("def read(");
    expect(BUILTIN_TOOL_SOURCES.web_search).toContain("SEARCH_PROVIDER");
    expect(Object.keys(BUILTIN_TOOL_SOURCES).length).toBeGreaterThanOrEqual(16);
  });

  it("parses YAML literal block descriptions in generated Python", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "llm-space-python-skill-")
    );
    const skillDir = path.join(root, "pregnancy-followup");
    const variablesPath = fileURLToPath(
      new URL("../variables.py", import.meta.url)
    );
    try {
      await mkdir(skillDir);
      await writeFile(
        path.join(skillDir, "SKILL.md"),
        `---
name: pregnancy-followup
description: |
  First trigger line.
  Second trigger line.
---
`,
        "utf8"
      );
      const process = Bun.spawn(
        [
          "python3",
          "-c",
          [
            "import importlib.util, json, pathlib, sys",
            "spec = importlib.util.spec_from_file_location('variables', sys.argv[1])",
            "module = importlib.util.module_from_spec(spec)",
            "spec.loader.exec_module(module)",
            "text = pathlib.Path(sys.argv[2], 'SKILL.md').read_text(encoding='utf-8')",
            "print(json.dumps(module._parse_frontmatter(text, 'fallback')))",
          ].join("; "),
          variablesPath,
          skillDir,
        ],
        { stdout: "pipe", stderr: "pipe" }
      );
      const [exitCode, stdout, stderr] = await Promise.all([
        process.exited,
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
      ]);

      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toEqual([
        "pregnancy-followup",
        "First trigger line.\nSecond trigger line.\n",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

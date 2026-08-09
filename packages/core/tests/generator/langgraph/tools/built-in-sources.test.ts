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
} from "../../../../src/generator/langgraph/tools/built-in-sources.generated";

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
      new URL("../../../../src/generator/langgraph/tools/built-in-sources.generated.ts", import.meta.url)
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
      new URL("../../../../src/generator/langgraph/variables.py", import.meta.url)
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

  it("executes generated filesystem tools with home-relative paths", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "llm-space-python-fs-")
    );
    const toolNames = [
      "read",
      "write",
      "edit",
      "ls",
      "tree",
      "grep",
      "glob",
      "present_files",
    ];
    try {
      for (const name of toolNames) {
        await writeFile(
          path.join(root, `${name}.py`),
          BUILTIN_TOOL_SOURCES[name]!,
          "utf8"
        );
      }
      const script = `
import importlib.util
import pathlib
import sys
import types

langchain = types.ModuleType("langchain")
langchain_tools = types.ModuleType("langchain.tools")
langchain_tools.tool = lambda fn: fn
sys.modules["langchain"] = langchain
sys.modules["langchain.tools"] = langchain_tools

def load(name):
    spec = importlib.util.spec_from_file_location(name, pathlib.Path.home() / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

mods = {name: load(name) for name in ${JSON.stringify(toolNames)}}
fixture = pathlib.Path.home() / "fixture"
fixture.mkdir()
target = fixture / "example.txt"

mods["write"].write("write", "~/fixture/example.txt", "before target")
assert target.read_text(encoding="utf-8") == "before target"
mods["edit"].edit("edit", "~/fixture/example.txt", "before", "after")
assert target.read_text(encoding="utf-8") == "after target"
assert mods["read"].read("read", "~/fixture/example.txt") == "1\\tafter target"
assert mods["ls"].ls("ls", "~/fixture") == "example.txt"
assert "example.txt" in mods["tree"].tree("tree", "~/fixture")
assert str(target) in mods["grep"].grep("grep", "target", "~/fixture")
glob_result = mods["glob"].glob("glob", "*.txt", "~/fixture")
assert glob_result == str(target.resolve()), repr(glob_result)

report = fixture / "report.html"
report.write_text("<html></html>", encoding="utf-8")
opened = []
revealed = []
mods["present_files"].webbrowser.open = opened.append
mods["present_files"]._reveal_in_file_manager = revealed.append
mods["present_files"].present_files(
    "present", ["~/fixture/report.html", "~/fixture/example.txt"]
)
assert opened == [report.resolve().as_uri()]
assert revealed == [str(target)]
`;
      const child = Bun.spawn(["python3", "-c", script], {
        env: { ...process.env, HOME: root },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);

      expect(stdout).toBe("");
      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

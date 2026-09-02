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
    expect(BUILTIN_TOOL_SOURCES.calculator).toContain("def calculator(");
    expect(BUILTIN_TOOL_SOURCES.date_difference).toContain(
      "def date_difference("
    );
    expect(BUILTIN_TOOL_SOURCES.exec_code).toContain("def exec_code(");
    expect(BUILTIN_TOOL_SOURCES.read).toContain("def read(");
    expect(BUILTIN_TOOL_SOURCES.web_search).toContain("SEARCH_PROVIDER");
    expect(Object.keys(BUILTIN_TOOL_SOURCES).length).toBeGreaterThanOrEqual(16);
  });

  it("executes generated Python and Bun code through exec_code", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "llm-space-python-exec-code-")
    );
    const toolPath = path.join(root, "exec_code.py");
    try {
      await writeFile(toolPath, BUILTIN_TOOL_SOURCES.exec_code!, "utf8");
      const script = `
import importlib.util
import sys
import types

langchain = types.ModuleType("langchain")
langchain_tools = types.ModuleType("langchain.tools")
langchain_tools.tool = lambda fn: fn
sys.modules["langchain"] = langchain
sys.modules["langchain.tools"] = langchain_tools

spec = importlib.util.spec_from_file_location("exec_code", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

python_first = module.exec_code(
    "test python", "python", """values = [2, 3, 5]
sum(values)""", None,
    timeout_ms=5000,
)
assert python_first["result"] == "10"
assert python_first["execution_count"] == 1
python_second = module.exec_code(
    "continue python", "python", """values.append(7)
values""",
    python_first["session_id"], timeout_ms=5000,
)
assert python_second["result"] == "[2, 3, 5, 7]"
assert python_second["execution_count"] == 2

bun_first = module.exec_code(
    "test bun", "bun", 'let answer: number = 40; answer + 1', None,
    timeout_ms=5000,
)
assert bun_first["result"] == "41"
bun_second = module.exec_code(
    "continue bun", "bun", 'answer + 2', bun_first["session_id"],
    timeout_ms=5000,
)
assert bun_second["result"] == "42"
`;
      const child = Bun.spawn(["python3", "-c", script, toolPath], {
        cwd: root,
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

  it("executes the generated date difference tool with endpoint options", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "llm-space-python-date-difference-")
    );
    const toolPath = path.join(root, "date_difference.py");
    try {
      await writeFile(
        toolPath,
        BUILTIN_TOOL_SOURCES.date_difference!,
        "utf8"
      );
      const script = `
import importlib.util
import sys
import types

langchain = types.ModuleType("langchain")
langchain_tools = types.ModuleType("langchain.tools")
langchain_tools.tool = lambda fn: fn
sys.modules["langchain"] = langchain
sys.modules["langchain.tools"] = langchain_tools

spec = importlib.util.spec_from_file_location("date_difference", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

assert module.date_difference("2026-09-01", "2026-09-03") == "2 days"
assert module.date_difference(
    "2026-09-01", "2026-09-03", True, True
) == "3 days"
assert module.date_difference(
    "2026-09-01 10:20:30", "2026-09-03 13:24:35"
) == "2 days, 3 hours, 4 minutes, 5 seconds"

for start, end in (
    ("2025-02-29", "2025-03-01"),
    ("2026-09-03", "2026-09-01"),
    ("2026-09-01", "2026-09-03 00:00:00"),
):
    try:
        module.date_difference(start, end)
    except ValueError:
        pass
    else:
        raise AssertionError(f"expected failure for {start}, {end}")
`;
      const child = Bun.spawn(["python3", "-c", script, toolPath], {
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

  it("executes the generated calculator with TypeScript-compatible semantics", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "llm-space-python-calculator-")
    );
    const calculatorPath = path.join(root, "calculator.py");
    try {
      await writeFile(calculatorPath, BUILTIN_TOOL_SOURCES.calculator!, "utf8");
      const script = `
import importlib.util
import math
import sys
import types

langchain = types.ModuleType("langchain")
langchain_tools = types.ModuleType("langchain.tools")
langchain_tools.tool = lambda fn: fn
sys.modules["langchain"] = langchain
sys.modules["langchain.tools"] = langchain_tools

spec = importlib.util.spec_from_file_location("calculator", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

assert module.calculator("2 + 3 * 4") == 14
assert module.calculator("2 ** 3 ** 2") == 512
assert math.isclose(module.calculator("Math.sin(Math.PI / 2) + sqrt(81)"), 10)
assert module.calculator("-5 % 2") == -1

for expression in ("1 / 0", "sqrt(-1)", "process.exit()", "1e309"):
    try:
        module.calculator(expression)
    except ValueError as error:
        assert str(error).startswith("Calculator "), str(error)
    else:
        raise AssertionError(f"expected failure for {expression}")
`;
      const child = Bun.spawn(["python3", "-c", script, calculatorPath], {
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

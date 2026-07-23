import { describe, expect, test } from "bun:test";

import type { ThreadContext } from "../types";

import {
  createDefaultThreadVariables,
  DEFAULT_WORKING_DIRECTORY,
  removePromptVariableSnapshotNames,
  renderThreadPromptVariables,
  SYSTEM_PROMPT_PLACE_KEY,
} from "./prompt-variables";

function context(systemPrompt: string, extra?: Partial<ThreadContext>) {
  return {
    systemPrompt,
    variableVariants: {
      active: "default",
      variants: { default: { greeting: "Hi" } },
    },
    ...extra,
  } as ThreadContext;
}

const file = (value: string) => () => Promise.resolve(value);

describe("built-in working directory variable", () => {
  test("is the third default variable with the project directory default", () => {
    expect(createDefaultThreadVariables()).toEqual({
      current_date: {
        type: "currentDate",
        format: "readable-date",
      },
      available_skills: {
        type: "skills",
        skillNames: [],
        format: "markdown-list",
        indent: 0,
      },
      current_working_directory: {
        type: "workingDirectory",
        value: DEFAULT_WORKING_DIRECTORY,
      },
    });
    expect(DEFAULT_WORKING_DIRECTORY).toBe("~/Desktop/llm-space-project");
  });

  test("renders the stored path without checking whether it exists", async () => {
    const { context: out } = await renderThreadPromptVariables({
      context: context("Workspace: {{current_working_directory}}", {
        variables: {
          current_working_directory: {
            type: "workingDirectory",
            value: "/path/that/does/not/exist",
          },
        },
      }),
    });
    expect(out.systemPrompt).toBe("Workspace: /path/that/does/not/exist");
  });
});

describe("renderThreadPromptVariables — dispatcher", () => {
  test("simple path substitutes known vars and leaves unknown literal", async () => {
    const { context: out } = await renderThreadPromptVariables({
      context: context("{{ greeting }} {{ stray }}"),
    });
    expect(out.systemPrompt).toBe("Hi {{ stray }}");
  });

  test("template path renders logic + @include + known vars", async () => {
    const { context: out } = await renderThreadPromptVariables({
      context: context(
        '{% if true %}{{ greeting }}-{{@include("f.md")}}{% endif %}'
      ),
      loadFile: file("INC"),
    });
    expect(out.systemPrompt).toBe("Hi-INC");
  });

  test("template path supports exists(path) conditions", async () => {
    const { context: out } = await renderThreadPromptVariables({
      context: context(
        '{% if exists(root ~ "/AGENTS.md") %}{{ greeting }}{% endif %}',
        {
          variableVariants: {
            active: "default",
            variants: { default: { greeting: "Hi", root: "/workspace" } },
          },
        }
      ),
      fileExists: (path) => Promise.resolve(path === "/workspace/AGENTS.md"),
    });
    expect(out.systemPrompt).toBe("Hi");
  });

  test("malformed template falls back to the original text (silent)", async () => {
    const src = "{% for x in y %}broken";
    const { context: out } = await renderThreadPromptVariables({
      context: context(src),
    });
    expect(out.systemPrompt).toBe(src);
  });
});

describe("renderThreadPromptVariables — template output freeze", () => {
  test("legacy @include snapshots re-render after the fallback fix", async () => {
    const base = context('{{@include("f.md")}}');
    const legacySnapshot = {
      variables: {
        [SYSTEM_PROMPT_PLACE_KEY]: {
          "\0rendered": "",
        },
      },
    };
    const refreshed = await renderThreadPromptVariables({
      context: { ...base, snapshot: legacySnapshot },
      loadFile: file("NOW PRESENT"),
    });
    expect(refreshed.context.systemPrompt).toBe("NOW PRESENT");
  });

  test("frozen output survives a changed file across re-runs", async () => {
    const base = context('{{@include("f.md")}}');

    const first = await renderThreadPromptVariables({
      context: base,
      loadFile: file("V1"),
    });
    expect(first.context.systemPrompt).toBe("V1");

    // Re-run with the prior snapshot: the place is frozen even though the file
    // now reads differently.
    const second = await renderThreadPromptVariables({
      context: { ...base, snapshot: first.snapshot },
      loadFile: file("V2"),
    });
    expect(second.context.systemPrompt).toBe("V1");
  });

  test("no prior snapshot re-renders with the new file (edit path)", async () => {
    const base = context('{{@include("f.md")}}');
    const fresh = await renderThreadPromptVariables({
      context: base,
      loadFile: file("V2"),
    });
    expect(fresh.context.systemPrompt).toBe("V2");
  });
});

describe("removePromptVariableSnapshotNames — value-edit invalidation", () => {
  const withGreeting = (systemPrompt: string, value: string) =>
    context(systemPrompt, {
      variableVariants: {
        active: "default",
        variants: { default: { greeting: value } },
      },
    });

  test("re-run stays frozen without invalidation, re-renders after it", async () => {
    const first = await renderThreadPromptVariables({
      context: withGreeting("{{ greeting }}", "Hi"),
    });
    expect(first.context.systemPrompt).toBe("Hi");
    expect(first.snapshot?.variables?.[SYSTEM_PROMPT_PLACE_KEY]?.greeting).toBe(
      "Hi"
    );

    // Edit the value but keep the snapshot: the frozen value still wins.
    const frozen = await renderThreadPromptVariables({
      context: {
        ...withGreeting("{{ greeting }}", "Hello"),
        snapshot: first.snapshot,
      },
    });
    expect(frozen.context.systemPrompt).toBe("Hi");

    // Invalidate the edited variable's snapshot: the new value renders.
    const snapshot = removePromptVariableSnapshotNames(first.snapshot, [
      "greeting",
    ]);
    const refreshed = await renderThreadPromptVariables({
      context: { ...withGreeting("{{ greeting }}", "Hello"), snapshot },
    });
    expect(refreshed.context.systemPrompt).toBe("Hello");
  });

  test("empties collapse to an undefined snapshot", () => {
    const snapshot = {
      variables: { [SYSTEM_PROMPT_PLACE_KEY]: { greeting: "Hi" } },
    };
    expect(
      removePromptVariableSnapshotNames(snapshot, ["greeting"])
    ).toBeUndefined();
  });

  test("other names and places stay frozen", () => {
    const snapshot = {
      variables: {
        [SYSTEM_PROMPT_PLACE_KEY]: { greeting: "Hi", location: "SF" },
        "message:m1:text": { greeting: "Hi" },
      },
    };
    const next = removePromptVariableSnapshotNames(snapshot, ["greeting"]);
    expect(next?.variables?.[SYSTEM_PROMPT_PLACE_KEY]).toEqual({
      location: "SF",
    });
    // The message place held only greeting, so it is pruned entirely.
    expect(next?.variables?.["message:m1:text"]).toBeUndefined();
  });

  test("template frozen output is dropped so the place re-renders", async () => {
    const base = context('{{@include("f.md")}}');
    const first = await renderThreadPromptVariables({
      context: base,
      loadFile: file("V1"),
    });
    expect(first.context.systemPrompt).toBe("V1");

    // Invalidation clears the whole frozen template output (it isn't keyed by
    // variable name), so the next run picks up the changed file.
    const snapshot = removePromptVariableSnapshotNames(first.snapshot, [
      "greeting",
    ]);
    const refreshed = await renderThreadPromptVariables({
      context: { ...base, snapshot },
      loadFile: file("V2"),
    });
    expect(refreshed.context.systemPrompt).toBe("V2");
  });
});

describe("renderThreadPromptVariables — live skills", () => {
  test("re-resolves skills for a new run while preserving each run snapshot", async () => {
    const base = context("{{available_skills}}", {
      variables: {
        available_skills: {
          type: "skills",
          skillNames: [],
          format: "markdown-list",
          indent: 0,
        },
      },
    });
    const firstValue = [
      { name: "first", description: "First skill", path: "/skills/first" },
    ];
    const secondValue = [
      { name: "second", description: "Second skill", path: "/skills/second" },
    ];

    const first = await renderThreadPromptVariables({
      context: base,
      loadSkills: () => Promise.resolve(firstValue),
    });
    const second = await renderThreadPromptVariables({
      context: { ...base, snapshot: first.snapshot },
      loadSkills: () => Promise.resolve(secondValue),
    });

    expect(first.context.systemPrompt).toBe("- **first**: First skill");
    expect(second.context.systemPrompt).toBe("- **second**: Second skill");
    expect(
      first.snapshot?.variables?.[SYSTEM_PROMPT_PLACE_KEY]?.available_skills
    ).toBe("- **first**: First skill");
    expect(
      second.snapshot?.variables?.[SYSTEM_PROMPT_PLACE_KEY]?.available_skills
    ).toBe("- **second**: Second skill");
  });

  test("distinguishes an explicit empty selection from legacy all-skills mode", async () => {
    const result = await renderThreadPromptVariables({
      context: context("before{{available_skills}}after", {
        variables: {
          available_skills: {
            type: "skills",
            skillNames: [],
            includeAll: false,
            format: "markdown-list",
            indent: 0,
          },
        },
      }),
      loadSkills: () =>
        Promise.resolve([
          { name: "first", description: "First skill", path: "/skills/first" },
        ]),
    });

    expect(result.context.systemPrompt).toBe("beforeafter");
  });
});

describe("renderThreadPromptVariables — JSON variables", () => {
  const jsonContext = (systemPrompt: string, value: string) =>
    context(systemPrompt, { variables: { data: { type: "json", value } } });

  test("field access and iteration in templates", async () => {
    const { context: out } = await renderThreadPromptVariables({
      context: jsonContext(
        "{% for i in data.items %}{{ i }}{% endfor %}|{{ data.user.name }}",
        '{"user":{"name":"Ada"},"items":["a","b"]}'
      ),
    });
    expect(out.systemPrompt).toBe("ab|Ada");
  });

  test("whole object renders as pretty JSON on the simple path", async () => {
    const { context: out } = await renderThreadPromptVariables({
      context: jsonContext("{{ data }}", '{"n":1}'),
    });
    expect(out.systemPrompt).toBe('{\n  "n": 1\n}');
  });

  test("invalid JSON leaves field access empty", async () => {
    const { context: out } = await renderThreadPromptVariables({
      context: jsonContext("[{{ data.x }}]", "{bad"),
    });
    expect(out.systemPrompt).toBe("[]");
  });
});

describe("renderThreadPromptVariables — file variables", () => {
  const fileContext = (systemPrompt: string, value: string) =>
    context(systemPrompt, { variables: { doc: { type: "file", value } } });

  test("inlines the file's contents", async () => {
    const { context: out } = await renderThreadPromptVariables({
      context: fileContext("[{{ doc }}]", "notes.md"),
      loadFile: (p) => Promise.resolve(p === "notes.md" ? "HELLO" : ""),
    });
    expect(out.systemPrompt).toBe("[HELLO]");
  });

  test("missing file inlines empty", async () => {
    const { context: out } = await renderThreadPromptVariables({
      context: fileContext("[{{ doc }}]", "missing.md"),
      loadFile: () => Promise.resolve(""),
    });
    expect(out.systemPrompt).toBe("[]");
  });

  test("empty path leaves the placeholder literal", async () => {
    const { context: out } = await renderThreadPromptVariables({
      context: fileContext("[{{ doc }}]", ""),
      loadFile: () => Promise.resolve("SHOULD NOT BE READ"),
    });
    expect(out.systemPrompt).toBe("[{{ doc }}]");
  });
});

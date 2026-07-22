import { describe, expect, it } from "bun:test";

import {
  normalizeLineEndings,
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
    expect(normalizeLineEndings(committed)).toBe(rendered);
  });

  it("covers the expected built-in tools", () => {
    expect(BUILTIN_TOOL_SOURCES.read).toContain("def read(");
    expect(BUILTIN_TOOL_SOURCES.web_search).toContain("SEARCH_PROVIDER");
    expect(Object.keys(BUILTIN_TOOL_SOURCES).length).toBeGreaterThanOrEqual(16);
  });
});

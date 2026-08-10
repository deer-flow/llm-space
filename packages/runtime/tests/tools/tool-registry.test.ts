import { describe, expect, test } from "bun:test";

import { ToolRegistry } from "../../src/tools/tool-registry";

describe("ToolRegistry", () => {
  test("lists and executes a registered contribution after freeze", async () => {
    const registry = new ToolRegistry();
    const tool = {
      type: "builtin" as const,
      name: "fixture_echo",
      description: "Echo a fixture value.",
      strict: true,
      parameters: {
        type: "object" as const,
        required: ["value"],
        properties: {
          value: { type: "string" as const },
        },
        additionalProperties: false,
      },
    };

    registry.register({
      id: "fixture.echo",
      entries: [
        {
          tool,
          execute: (args) => Promise.resolve({ echoed: args.value }),
        },
      ],
    });
    registry.freeze();

    expect(registry.listTools()).toEqual([tool]);
    expect(
      await registry.call({ name: "fixture_echo", arguments: { value: "hi" } })
    ).toEqual({
      content: [{ type: "text", text: '{\n  "echoed": "hi"\n}' }],
    });
  });

  test("rejects registration after freeze", () => {
    const registry = new ToolRegistry();
    registry.freeze();

    expect(() =>
      registry.register({
        id: "fixture.late",
        entries: [],
      })
    ).toThrow('Tool contribution "fixture.late" registered after freeze.');
  });

  test("passes Thread-owned config separately from model arguments", async () => {
    const registry = new ToolRegistry();
    registry.register({
      id: "fixture.config",
      entries: [
        {
          tool: {
            type: "builtin",
            name: "fixture_config",
            description: "Read trusted config.",
            parameters: { type: "object", properties: {} },
          },
          execute: (_args, config) => Promise.resolve(config),
        },
      ],
    });

    expect(
      await registry.call({
        name: "fixture_config",
        arguments: {},
        config: { model: "fixture-model" },
      })
    ).toEqual({
      content: [
        {
          type: "text",
          text: '{\n  "model": "fixture-model"\n}',
        },
      ],
    });
  });

  test("serializes ordinary JSON with a content array as text", async () => {
    const registry = new ToolRegistry();
    registry.register({
      id: "fixture.content-json",
      entries: [
        {
          tool: {
            type: "builtin",
            name: "fixture_content_json",
            description: "Return business data with a content field.",
            parameters: { type: "object", properties: {} },
          },
          execute: () => Promise.resolve({ content: ["article"] }),
        },
      ],
    });

    expect(
      await registry.call({ name: "fixture_content_json", arguments: {} })
    ).toEqual({
      content: [
        {
          type: "text",
          text: '{\n  "content": [\n    "article"\n  ]\n}',
        },
      ],
    });
  });

  test("rejects duplicate tool names with contribution context", () => {
    const registry = new ToolRegistry();
    const tool = {
      type: "builtin" as const,
      name: "fixture_echo",
      description: "Echo a fixture value.",
      strict: true,
      parameters: {
        type: "object" as const,
        properties: {},
        additionalProperties: false,
      },
    };
    const entry = {
      tool,
      execute: () => Promise.resolve("ok"),
    };

    registry.register({
      id: "fixture.first",
      entries: [entry],
    });

    expect(() =>
      registry.register({
        id: "fixture.second",
        entries: [entry],
      })
    ).toThrow(
      'Tool contribution "fixture.second" duplicates tool "fixture_echo" from "fixture.first".'
    );
  });

  test("rejects duplicate tool names inside one contribution", () => {
    const registry = new ToolRegistry();
    const tool = {
      type: "builtin" as const,
      name: "fixture_echo",
      description: "Echo a fixture value.",
      strict: true,
      parameters: {
        type: "object" as const,
        properties: {},
        additionalProperties: false,
      },
    };
    const entry = { tool, execute: () => Promise.resolve("ok") };

    expect(() =>
      registry.register({
        id: "fixture.duplicate",
        entries: [entry, entry],
      })
    ).toThrow(
      'Tool contribution "fixture.duplicate" duplicates tool "fixture_echo" within itself.'
    );
    expect(registry.listTools()).toEqual([]);
  });

  test("rejects duplicate contribution ids", () => {
    const registry = new ToolRegistry();
    registry.register({ id: "fixture.same", entries: [] });

    expect(() =>
      registry.register({ id: "fixture.same", entries: [] })
    ).toThrow('Duplicate tool contribution id "fixture.same".');
  });

  test("snapshots contributions before freeze", async () => {
    const registry = new ToolRegistry();
    const tool = {
      type: "builtin" as const,
      name: "fixture_echo",
      description: "Original description.",
      strict: true,
      parameters: {
        type: "object" as const,
        properties: {},
        additionalProperties: false,
      },
    };
    const entry = { tool, execute: () => Promise.resolve("original") };
    const entries = [entry];
    registry.register({ id: "fixture.immutable", entries });
    registry.freeze();

    tool.name = "fixture_mutated";
    tool.description = "Mutated description.";
    entry.execute = () => Promise.resolve("mutated");
    entries.length = 0;

    expect(
      registry.listTools().map(({ name, description }) => ({
        name,
        description,
      }))
    ).toEqual([{ name: "fixture_echo", description: "Original description." }]);
    expect(
      await registry.call({ name: "fixture_echo", arguments: {} })
    ).toEqual({ content: [{ type: "text", text: "original" }] });
    expect(() =>
      registry.call({ name: "fixture_mutated", arguments: {} })
    ).toThrow("Built-in tool not found: fixture_mutated");
  });
});

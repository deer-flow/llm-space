import { describe, expect, test } from "bun:test";

import { isJSONValue, validatePluginManifest } from "../src";

const VALID_MANIFEST = {
  id: "example.fixture",
  name: "Fixture",
  version: "1.0.0",
  runtime: "./index.ts",
  apiVersion: "1.0.0",
  engines: { llmSpace: ">=0.0.1" },
  source: "local",
  capabilities: ["storage"],
  contributions: [
    { kind: "sourceImporter", id: "fixture.source", name: "Fixture source" },
  ],
} as const;

describe("plugin API contracts", () => {
  test("validates a static manifest without loading runtime code", () => {
    expect(validatePluginManifest(VALID_MANIFEST)).toMatchObject({
      valid: true,
      errors: [],
    });
  });

  test("rejects duplicate contribution ids within one kind", () => {
    const result = validatePluginManifest({
      ...VALID_MANIFEST,
      contributions: [
        ...VALID_MANIFEST.contributions,
        VALID_MANIFEST.contributions[0],
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Duplicate sourceImporter");
  });

  test("rejects malformed stable IDs and semantic versions", () => {
    expect(
      validatePluginManifest({
        ...VALID_MANIFEST,
        id: "example..fixture",
      }).valid
    ).toBe(false);
    expect(
      validatePluginManifest({
        ...VALID_MANIFEST,
        apiVersion: "1",
      }).valid
    ).toBe(false);
  });

  test("rejects non-JSON and cyclic plugin data", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(isJSONValue({ nested: [1, true, null] })).toBe(true);
    expect(isJSONValue({ callback: () => undefined })).toBe(false);
    expect(isJSONValue(cyclic)).toBe(false);
  });
});

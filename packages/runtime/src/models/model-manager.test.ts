import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ModelManager } from "./model-manager";

const TEMPORARY_DIRECTORIES: string[] = [];

afterEach(() => {
  for (const directory of TEMPORARY_DIRECTORIES.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function _settingsDir() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "llm-space-models-"));
  TEMPORARY_DIRECTORIES.push(directory);
  return directory;
}

describe("ModelManager provider profiles", () => {
  test("migrates legacy connection fields into a fixed default profile", () => {
    const settingsDir = _settingsDir();
    writeFileSync(
      path.join(settingsDir, "models.json"),
      JSON.stringify({
        providers: [
          {
            id: "legacy",
            name: "Legacy",
            apiKey: "$LEGACY_KEY",
            baseUrl: "https://legacy.example/v1",
            headers: { "X-Tenant": "one" },
          },
        ],
      })
    );

    const manager = new ModelManager({ settingsDir });
    const migratedProfiles = manager.getProfiles("legacy");
    expect(typeof migratedProfiles[0].id).toBe("string");
    expect(migratedProfiles).toMatchObject([
      {
        name: "Default",
        apiKey: "$LEGACY_KEY",
        baseUrl: "https://legacy.example/v1",
        headers: { "X-Tenant": "one" },
      },
    ]);

    const persisted = JSON.parse(
      readFileSync(path.join(settingsDir, "models.json"), "utf8")
    ) as { providers: Record<string, unknown>[] };
    expect(persisted.providers[0]).not.toHaveProperty("apiKey");
    expect(persisted.providers[0]).not.toHaveProperty("baseUrl");
    expect(persisted.providers[0]).not.toHaveProperty("headers");
    expect(persisted.providers[0].profiles).toEqual(
      manager.getProfiles("legacy")
    );
  });

  test("adds a named profile with copied endpoint settings but no API key", () => {
    const manager = new ModelManager({ settingsDir: _settingsDir() });
    manager.addBuiltInProvider({ id: "minimax", apiKey: "secret" });
    const defaultProfile = manager.getProfiles("minimax")[0];
    manager.updateProfile("minimax", defaultProfile.id, {
      baseUrl: "https://gateway.example/v1",
      headers: { "X-Tenant": "one" },
    });

    const addedId = manager.addProfile("minimax");
    expect(manager.getProfiles("minimax")[1]).toEqual({
      id: addedId,
      name: "Profile 2",
      baseUrl: "https://gateway.example/v1",
      headers: { "X-Tenant": "one" },
    });
  });

  test("enforces unique names and protects the first profile", () => {
    const manager = new ModelManager({ settingsDir: _settingsDir() });
    manager.addBuiltInProvider({ id: "minimax" });
    const defaultProfile = manager.getProfiles("minimax")[0];
    const secondId = manager.addProfile("minimax");

    expect(() =>
      manager.updateProfile("minimax", secondId, { name: "default" })
    ).toThrow("Profile name already exists");
    expect(() => manager.removeProfile("minimax", defaultProfile.id)).toThrow(
      "default provider profile cannot be removed"
    );
    expect(() => manager.removeProfile("minimax", "missing")).toThrow(
      "Provider profile not configured: minimax/missing"
    );

    manager.removeProfile("minimax", secondId);
    expect(manager.getProfiles("minimax")).toEqual([defaultProfile]);
  });

  test("uses an explicit profile and rejects an unknown explicit selection", async () => {
    const manager = new ModelManager({ settingsDir: _settingsDir() });
    manager.addBuiltInProvider({ id: "minimax", apiKey: "default-key" });
    const secondId = manager.addProfile("minimax");
    manager.updateProfile("minimax", secondId, {
      apiKey: "work-key",
      baseUrl: "https://work.example/v1",
    });

    expect(await manager.getApiKey("minimax", true, secondId)).toBe("work-key");
    expect(manager.getBaseUrl("minimax", secondId)).toBe(
      "https://work.example/v1"
    );
    expect(() => manager.getBaseUrl("minimax", "missing")).toThrow(
      "Provider profile not configured"
    );
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ModelManager } from "./model-manager";

const TEMP_DIRS: string[] = [];

afterEach(async () => {
  await Promise.all(
    TEMP_DIRS.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function _settingsDir(config: unknown): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "model-manager-"));
  TEMP_DIRS.push(root);
  const settingsDir = path.join(root, "settings");
  await mkdir(settingsDir, { recursive: true });
  await writeFile(
    path.join(settingsDir, "models.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8"
  );
  return settingsDir;
}

describe("ModelManager Ark image generation", () => {
  test("migrates legacy provider defaults to image inventory only", async () => {
    const settingsDir = await _settingsDir({
      providers: [
        {
          id: "ark",
          builtin: true,
          imageGeneration: {
            model: "doubao-seedream-4-5-251128",
            size: "4K",
            watermark: false,
          },
        },
      ],
    });

    const manager = new ModelManager({ settingsDir });

    expect(manager.getArkImageGenerationConfig()).toEqual({});
    const persisted = _parsePersistedProviders(
      await readFile(path.join(settingsDir, "models.json"), "utf8")
    );
    expect(persisted.providers[0].imageGeneration).toEqual({});
  });

  test("persists custom image models without adding them to chat models", async () => {
    const settingsDir = await _settingsDir({ providers: [] });
    const manager = new ModelManager({ settingsDir });
    manager.addBuiltInProvider({ id: "ark" });

    manager.updateProvider("ark", {
      imageGeneration: {
        models: [
          {
            id: "ep-seedream-custom",
            name: "Custom Seedream endpoint",
            supportedSizes: ["2K", "4K"],
            defaultSize: "2K",
            icon: "seedream",
          },
        ],
        disabledModels: ["doubao-seedream-4-0-250828"],
      },
    });

    const reloaded = new ModelManager({ settingsDir });
    expect(reloaded.getArkImageGenerationConfig()).toEqual({
      models: [
        {
          id: "ep-seedream-custom",
          name: "Custom Seedream endpoint",
          supportedSizes: ["2K", "4K"],
          defaultSize: "2K",
          icon: "seedream",
        },
      ],
      disabledModels: ["doubao-seedream-4-0-250828"],
    });
    const ark = (await reloaded.getAvailableModels())
      .getProviders()
      .find((provider) => provider.id === "ark");
    expect(
      ark?.getModels().some((model) => model.id === "ep-seedream-custom")
    ).toBe(false);
  });

  test("rejects duplicate image models and invalid disabled ids", async () => {
    const settingsDir = await _settingsDir({ providers: [] });
    const manager = new ModelManager({ settingsDir });
    manager.addBuiltInProvider({ id: "ark" });

    expect(() =>
      manager.updateProvider("ark", {
        imageGeneration: {
          models: [
            {
              id: "doubao-seedream-5-0-pro-260628",
              name: "Duplicate",
              supportedSizes: ["2K"],
              defaultSize: "2K",
            },
          ],
        },
      })
    ).toThrow("Duplicate Ark image model id");

    expect(() =>
      manager.updateProvider("ark", {
        imageGeneration: {
          disabledModels: ["missing-image-model"],
        },
      })
    ).toThrow("Disabled Ark image models must reference unique model ids");
  });
});

/** Parse only the persisted fragment this test owns and asserts. */
function _parsePersistedProviders(text: string): {
  providers: { imageGeneration?: unknown }[];
} {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object") {
    throw new Error("Expected a models config object.");
  }
  const providers = (value as { providers?: unknown }).providers;
  if (!Array.isArray(providers)) {
    throw new Error("Expected a providers array.");
  }
  return { providers: providers as { imageGeneration?: unknown }[] };
}

function _emptySettingsDir() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "llm-space-models-"));
  TEMP_DIRS.push(directory);
  return directory;
}

describe("ModelManager provider profiles", () => {
  test("exposes a plugin provider's legacy connection as a read-only default profile", () => {
    const manager = new ModelManager({ settingsDir: _emptySettingsDir() });
    manager.setPluginProviders([
      {
        pluginId: "image-kit",
        provider: {
          id: "plugin:image-kit:model-provider:gateway",
          name: "Plugin Gateway",
          api: "openai-completions",
          apiKey: "$PLUGIN_GATEWAY_KEY",
          baseUrl: "https://plugin.example/v1",
          headers: { "X-Plugin": "image-kit" },
          models: [],
        },
      },
    ]);

    const providerId = "plugin:image-kit:model-provider:gateway";
    expect(manager.getProfiles(providerId)).toMatchObject([
      {
        name: "Default",
        apiKey: "$PLUGIN_GATEWAY_KEY",
        baseUrl: "https://plugin.example/v1",
        headers: { "X-Plugin": "image-kit" },
      },
    ]);
    expect(manager.getBaseUrl(providerId)).toBe("https://plugin.example/v1");
    expect(() => manager.addProfile(providerId)).toThrow(
      `Provider not configured: ${providerId}`
    );
  });

  test("migrates legacy connection fields into a fixed default profile", () => {
    const settingsDir = _emptySettingsDir();
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
    const manager = new ModelManager({ settingsDir: _emptySettingsDir() });
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
    const manager = new ModelManager({ settingsDir: _emptySettingsDir() });
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
    const manager = new ModelManager({ settingsDir: _emptySettingsDir() });
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

  test("resolves one immutable provider connection snapshot", async () => {
    const manager = new ModelManager({ settingsDir: _emptySettingsDir() });
    manager.addBuiltInProvider({ id: "minimax" });
    const secondId = manager.addProfile("minimax");
    manager.updateProfile("minimax", secondId, {
      apiKey: "work-key",
      baseUrl: "https://work.example/v1",
      headers: { "X-Tenant": "work" },
    });

    const connection = await manager.resolveConnection({
      providerId: "minimax",
      profileId: secondId,
    });
    manager.updateProfile("minimax", secondId, {
      headers: { "X-Tenant": "changed" },
    });

    expect(connection).toEqual({
      apiKey: "work-key",
      baseUrl: "https://work.example/v1",
      headers: { "X-Tenant": "work" },
    });
  });

  test("uses a provider fallback only when the profile has no key setting", async () => {
    const manager = new ModelManager({ settingsDir: _emptySettingsDir() });
    manager.addBuiltInProvider({ id: "minimax" });
    const defaultProfile = manager.getProfiles("minimax")[0];

    expect(
      (
        await manager.resolveConnection(
          { providerId: "minimax" },
          { fallbackApiKey: "fallback-key" }
        )
      ).apiKey
    ).toBe("fallback-key");

    manager.updateProfile("minimax", defaultProfile.id, {
      apiKey: "$LLM_SPACE_MISSING_PROFILE_TEST_KEY",
    });
    delete process.env.LLM_SPACE_MISSING_PROFILE_TEST_KEY;
    expect(
      (
        await manager.resolveConnection(
          { providerId: "minimax" },
          { fallbackApiKey: "fallback-key" }
        )
      ).apiKey
    ).toBeUndefined();
  });
});

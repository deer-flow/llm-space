import { afterEach, describe, expect, test } from "bun:test";
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

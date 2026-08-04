import { copyFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type {
  JsonObject,
  PluginSettingsEntry,
  PluginSettingsFile,
} from "@llm-space/core";
import { atomicWriteJsonFileSync } from "@llm-space/core/server";
import { z } from "zod";

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ])
);
const SettingsFileSchema = z.object({
  schemaVersion: z.literal(1),
  plugins: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      settings: z.record(z.string(), JsonValueSchema),
    })
  ),
});

export class PluginSettingsStore {
  private _value: PluginSettingsFile = { schemaVersion: 1, plugins: {} };
  readonly loadError?: Error;

  constructor(private readonly _homePath: string) {
    try {
      this._value = this._read(this._path);
      this._saveLastKnownGood(this._value);
    } catch (error) {
      if (!existsSync(this._path)) return;
      try {
        this._value = this._read(this._backupPath);
      } catch {
        Object.defineProperty(this, "loadError", {
          value: error instanceof Error ? error : new Error(String(error)),
          enumerable: true,
        });
      }
    }
  }

  get(pluginId: string): PluginSettingsEntry {
    const entry = this._value.plugins[pluginId];
    return entry
      ? { enabled: entry.enabled, settings: structuredClone(entry.settings) }
      : { enabled: true, settings: {} };
  }

  setEnabled(pluginId: string, enabled: boolean): void {
    const current = this.get(pluginId);
    this._write({
      ...this._value,
      plugins: {
        ...this._value.plugins,
        [pluginId]: { ...current, enabled },
      },
    });
  }

  setSettings(pluginId: string, settings: JsonObject): void {
    const current = this.get(pluginId);
    this._write({
      ...this._value,
      plugins: {
        ...this._value.plugins,
        [pluginId]: { ...current, settings: structuredClone(settings) },
      },
    });
  }

  private get _path(): string {
    return path.join(this._homePath, "settings", "plugins.json");
  }

  private get _backupPath(): string {
    return `${this._path}.last-good`;
  }

  private _read(filePath: string): PluginSettingsFile {
    const raw: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    return SettingsFileSchema.parse(raw) as PluginSettingsFile;
  }

  private _write(next: PluginSettingsFile): void {
    const validated = SettingsFileSchema.parse(next) as PluginSettingsFile;
    if (existsSync(this._path)) {
      try {
        this._read(this._path);
      } catch {
        throw new Error(
          `Plugin settings are damaged. The original file was preserved at ${this._path}.`
        );
      }
    }
    atomicWriteJsonFileSync(this._path, validated, { mode: 0o600 });
    this._saveLastKnownGood(validated);
    this._value = validated;
  }

  private _saveLastKnownGood(value: PluginSettingsFile): void {
    try {
      atomicWriteJsonFileSync(this._backupPath, value, { mode: 0o600 });
    } catch {
      try {
        if (existsSync(this._path)) copyFileSync(this._path, this._backupPath);
      } catch {
        // Backup maintenance is best-effort and must never block startup.
      }
    }
  }
}

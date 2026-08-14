import path from "node:path";

import {
  atomicWriteJsonFileSync,
  getSettingsDir,
  readJsonFileSync,
} from "@llm-space/core/server";
import * as z from "zod";

const LocalStorageValuesSchema = z.record(z.string(), z.string());

export interface LocalStorageSnapshot {
  initialized: boolean;
  values: Record<string, string>;
}

/** Owns the durable desktop mirror of renderer localStorage. */
export class LocalStorageManager {
  private _initialized: boolean;
  private _values: Record<string, string>;

  constructor(
    private readonly _configPath = path.join(
      getSettingsDir(),
      "local-storage.json"
    )
  ) {
    const result = readJsonFileSync(this._configPath, {
      schema: LocalStorageValuesSchema,
      recovery: "best-effort",
      fallback: (): Record<string, string> => ({}),
      seedMissing: false,
    });
    this._initialized = result.source !== "missing";
    this._values = { ...result.value };
  }

  snapshot(): LocalStorageSnapshot {
    return {
      initialized: this._initialized,
      values: { ...this._values },
    };
  }

  /** Seed a missing file from the renderer's legacy browser storage once. */
  initialize(values: Record<string, string>): LocalStorageSnapshot {
    if (!this._initialized) this._save(values);
    return this.snapshot();
  }

  setItem(key: string, value: string): void {
    this._save({ ...this._values, [key]: value });
  }

  removeItem(key: string): void {
    if (!(key in this._values) && this._initialized) return;
    const next = { ...this._values };
    delete next[key];
    this._save(next);
  }

  private _save(values: Record<string, string>): void {
    atomicWriteJsonFileSync(this._configPath, values);
    this._values = { ...values };
    this._initialized = true;
  }
}


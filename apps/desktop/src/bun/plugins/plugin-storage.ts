import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  isJSONValue,
  type JSONValue,
  type PluginStorage,
} from "@llm-space/plugin-api";

const STORAGE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/** Filesystem-backed JSON storage confined to one plugin-owned namespace. */
export class LocalPluginStorage implements PluginStorage {
  private readonly _root: string;

  constructor(storageRoot: string, pluginId: string) {
    this._root = path.join(storageRoot, pluginId);
  }

  /** Read one JSON value; missing keys resolve to `undefined`. */
  read(key: string): Promise<JSONValue | undefined> {
    const filePath = this._path(key);
    if (!existsSync(filePath)) {
      return Promise.resolve(undefined);
    }
    const value: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (!isJSONValue(value)) {
      throw new Error(`Plugin storage value is not valid JSON: ${key}`);
    }
    return Promise.resolve(value);
  }

  /** Atomically replace one JSON value after validating the public contract. */
  write(key: string, value: JSONValue): Promise<void> {
    if (!isJSONValue(value)) {
      throw new Error(`Plugin storage value is not valid JSON: ${key}`);
    }
    const filePath = this._path(key);
    mkdirSync(this._root, { recursive: true });
    const temporary = `${filePath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    renameSync(temporary, filePath);
    return Promise.resolve();
  }

  /** Remove one key without affecting another plugin's namespace. */
  remove(key: string): Promise<void> {
    rmSync(this._path(key), { force: true });
    return Promise.resolve();
  }

  /** List persisted keys in stable lexical order. */
  list(): Promise<string[]> {
    if (!existsSync(this._root)) {
      return Promise.resolve([]);
    }
    return Promise.resolve(
      readdirSync(this._root)
        .filter((entry) => entry.endsWith(".json"))
        .map((entry) => entry.slice(0, -5))
        .sort()
    );
  }

  private _path(key: string): string {
    if (!STORAGE_KEY_PATTERN.test(key)) {
      throw new Error(`Invalid plugin storage key: ${key}`);
    }
    return path.join(this._root, `${key}.json`);
  }
}

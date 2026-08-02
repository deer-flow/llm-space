import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";

import type * as z from "zod";

import { parseJsonWithSchema, type JsonParseResult } from "../utils/json";

export type PersistedJsonFailure = "invalid-json" | "invalid-shape";

export class PersistedJsonError extends Error {
  constructor(
    readonly filePath: string,
    readonly failure: PersistedJsonFailure,
    readonly backupPath?: string,
    options?: { cause?: unknown }
  ) {
    super(
      `Unable to read ${path.basename(filePath)}: ${
        failure === "invalid-json" ? "invalid JSON" : "invalid data shape"
      }.`,
      options
    );
    this.name = "PersistedJsonError";
  }
}

export interface JsonFileReadResult<T> {
  value: T;
  source: "strict" | "recovered" | "fallback" | "missing";
  backupPath?: string;
}

export interface ReadJsonFileOptions<T> {
  schema: z.ZodType<T>;
  recoverySchema?: z.ZodType<T>;
  recovery?: "none" | "best-effort";
  fallback?: () => T;
  repair?: boolean;
  mode?: number;
  seedMissing?: boolean;
}

export async function readJsonFile<T>(
  filePath: string,
  options: ReadJsonFileOptions<T>
): Promise<JsonFileReadResult<T>> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (_errorCode(error) !== "ENOENT" || !options.fallback) throw error;
    const value = options.fallback();
    if (options.seedMissing) {
      await atomicWriteJsonFile(filePath, value, { mode: options.mode });
    }
    return { value, source: "missing" };
  }

  return _resolveReadResult(
    filePath,
    parseJsonWithSchema(text, options.schema, {
      recovery: options.recovery,
      recoverySchema: options.recoverySchema,
    }),
    options
  );
}

export function readJsonFileSync<T>(
  filePath: string,
  options: ReadJsonFileOptions<T>
): JsonFileReadResult<T> {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    if (_errorCode(error) !== "ENOENT" || !options.fallback) throw error;
    const value = options.fallback();
    if (options.seedMissing) {
      atomicWriteJsonFileSync(filePath, value, { mode: options.mode });
    }
    return { value, source: "missing" };
  }

  return _resolveReadResultSync(
    filePath,
    parseJsonWithSchema(text, options.schema, {
      recovery: options.recovery,
      recoverySchema: options.recoverySchema,
    }),
    options
  );
}

export async function atomicWriteJsonFile(
  filePath: string,
  value: unknown,
  options: { mode?: number } = {}
): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporary = _temporaryPath(filePath);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx", options.mode);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, filePath);
    if (options.mode !== undefined) await chmod(filePath, options.mode);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function atomicWriteJsonFileSync(
  filePath: string,
  value: unknown,
  options: { mode?: number } = {}
): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = _temporaryPath(filePath);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      options.mode
    );
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, filePath);
    if (options.mode !== undefined) chmodSync(filePath, options.mode);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original failure.
      }
    }
    rmSync(temporary, { force: true });
    throw error;
  }
}

export async function backupCorruptJsonFile(
  filePath: string,
  mode?: number
): Promise<string> {
  const backupPath = _backupPath(filePath);
  await copyFile(filePath, backupPath, constants.COPYFILE_EXCL);
  if (mode !== undefined) await chmod(backupPath, mode);
  return backupPath;
}

export function backupCorruptJsonFileSync(
  filePath: string,
  mode?: number
): string {
  const backupPath = _backupPath(filePath);
  copyFileSync(filePath, backupPath, constants.COPYFILE_EXCL);
  if (mode !== undefined) chmodSync(backupPath, mode);
  return backupPath;
}

async function _resolveReadResult<T>(
  filePath: string,
  result: JsonParseResult<T>,
  options: ReadJsonFileOptions<T>
): Promise<JsonFileReadResult<T>> {
  if (result.status === "strict") {
    return { value: result.value, source: "strict" };
  }
  if (result.status === "recovered") {
    const backupPath = await backupCorruptJsonFile(filePath, options.mode);
    if (options.repair !== false) {
      await atomicWriteJsonFile(filePath, result.value, { mode: options.mode });
    }
    return { value: result.value, source: "recovered", backupPath };
  }
  if (!options.fallback) {
    throw new PersistedJsonError(filePath, result.status, undefined, {
      cause: result.error,
    });
  }
  const backupPath = await backupCorruptJsonFile(filePath, options.mode);
  const value = options.fallback();
  if (options.repair !== false) {
    await atomicWriteJsonFile(filePath, value, { mode: options.mode });
  }
  return { value, source: "fallback", backupPath };
}

function _resolveReadResultSync<T>(
  filePath: string,
  result: JsonParseResult<T>,
  options: ReadJsonFileOptions<T>
): JsonFileReadResult<T> {
  if (result.status === "strict") {
    return { value: result.value, source: "strict" };
  }
  if (result.status === "recovered") {
    const backupPath = backupCorruptJsonFileSync(filePath, options.mode);
    if (options.repair !== false) {
      atomicWriteJsonFileSync(filePath, result.value, { mode: options.mode });
    }
    return { value: result.value, source: "recovered", backupPath };
  }
  if (!options.fallback) {
    throw new PersistedJsonError(filePath, result.status, undefined, {
      cause: result.error,
    });
  }
  const backupPath = backupCorruptJsonFileSync(filePath, options.mode);
  const value = options.fallback();
  if (options.repair !== false) {
    atomicWriteJsonFileSync(filePath, value, { mode: options.mode });
  }
  return { value, source: "fallback", backupPath };
}

function _temporaryPath(filePath: string): string {
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`
  );
}

function _backupPath(filePath: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${filePath}.corrupt-${timestamp}-${randomUUID()}`;
}

function _errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

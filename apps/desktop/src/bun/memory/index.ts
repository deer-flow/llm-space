/**
 * Bun-side access to the bundled Memory plugin's store, exposed to the
 * Settings → Memory page over RPC.
 *
 * The store is plain JSON lines at `<home>/data/plugins/@llm-space/memory/`.
 * This module deliberately keeps its own path resolution instead of importing
 * the plugin sources: those run inside the isolated plugin subprocess, where
 * `@llm-space/core` resolution is not guaranteed for runtime values. Both
 * sides acquire the same process-shared lock before reading and modifying
 * records, then atomically replace the JSONL file.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { getLlmSpaceHomePath } from "@llm-space/core/server";

import type {
  MemoryListParams,
  MemoryListResult,
  MemoryMutationResult,
  MemoryRecordView,
} from "../../shared/memory";

import { withMemoryStoreLock } from "./store-lock";

/** Mirrors the bundled plugin's `MAX_TOTAL_MEMORIES`. */
const MAX_TOTAL_MEMORIES = 1000;

type StoredRecord = MemoryRecordView & Record<string, unknown>;

function memoryDir(): string {
  return path.join(
    getLlmSpaceHomePath(),
    "data",
    "plugins",
    "@llm-space",
    "memory"
  );
}

function storePath(): string {
  return path.join(memoryDir(), "memories.jsonl");
}

function archivePath(): string {
  return path.join(memoryDir(), "memories.archive.jsonl");
}

function readRecords(): StoredRecord[] {
  const file = storePath();
  if (!existsSync(file)) {
    return [];
  }
  const records: StoredRecord[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as StoredRecord;
      if (
        parsed &&
        typeof parsed.id === "string" &&
        typeof parsed.content === "string"
      ) {
        records.push(parsed);
      }
    } catch {
      // Skip malformed lines instead of failing the whole store.
    }
  }
  return records;
}

/** Same contract as the plugin: atomic replace so a crash cannot truncate. */
function writeRecords(records: StoredRecord[]): void {
  const file = storePath();
  mkdirSync(path.dirname(file), { recursive: true });
  const body = records.map((record) => JSON.stringify(record)).join("\n");
  const temporary = file + ".tmp";
  writeFileSync(temporary, body ? body + "\n" : "", "utf8");
  renameSync(temporary, file);
}

function toView(record: StoredRecord): MemoryRecordView {
  return {
    id: record.id,
    content: record.content,
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    origin: typeof record.origin === "string" ? record.origin : null,
    createdAt:
      typeof record.createdAt === "string"
        ? record.createdAt
        : new Date(0).toISOString(),
    ...(typeof record.updatedAt === "string"
      ? { updatedAt: record.updatedAt }
      : {}),
  };
}

function countArchive(): number {
  const file = archivePath();
  if (!existsSync(file)) {
    return 0;
  }
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0).length;
}

/**
 * Browsing filter: a normalized substring match over content, tags and
 * project. Ranking (per-script tokenization, recency decay, project boost)
 * stays in the plugin tool — this page is for finding and cleaning up, not
 * for scoring.
 */
function normalizeForSearch(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

export function listMemories(params: MemoryListParams = {}): MemoryListResult {
  const records = readRecords();
  const query = normalizeForSearch(params.query ?? "");
  const project = typeof params.project === "string" ? params.project : "";

  const matched = records.filter((record) => {
    if (project && (record.origin ?? "") !== project) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = normalizeForSearch(
      [record.content, (record.tags ?? []).join(" "), record.origin ?? ""].join(
        " "
      )
    );
    return haystack.includes(query);
  });

  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 1000);
  const projects = Array.from(
    new Set(
      records
        .map((record) => record.origin)
        .filter((origin): origin is string => typeof origin === "string")
    )
  ).sort();

  return {
    memories: matched.slice(offset, offset + limit).map(toView),
    total: records.length,
    matched: matched.length,
    max: MAX_TOTAL_MEMORIES,
    archiveCount: countArchive(),
    projects,
  };
}

export function deleteMemory(id: string): MemoryMutationResult {
  return withMemoryStoreLock(memoryDir(), () => _deleteMemory(id));
}

function _deleteMemory(id: string): MemoryMutationResult {
  const records = readRecords();
  const next = records.filter((record) => record.id !== id);
  if (next.length === records.length) {
    return { ok: false, memories: records.map(toView), total: records.length };
  }
  writeRecords(next);
  return { ok: true, memories: next.map(toView), total: next.length };
}

export function updateMemory(params: {
  id: string;
  content: string;
  tags?: string[];
}): MemoryMutationResult {
  return withMemoryStoreLock(memoryDir(), () => _updateMemory(params));
}

function _updateMemory(params: {
  id: string;
  content: string;
  tags?: string[];
}): MemoryMutationResult {
  const content = params.content.trim();
  const records = readRecords();
  const index = records.findIndex((record) => record.id === params.id);
  if (index < 0 || !content) {
    return { ok: false, memories: records.map(toView), total: records.length };
  }
  const tags = (params.tags ?? [])
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
  records[index] = {
    ...records[index],
    content,
    tags,
    updatedAt: new Date().toISOString(),
  };
  writeRecords(records);
  return { ok: true, memories: records.map(toView), total: records.length };
}

/**
 * Write every memory to a JSON file beside the store and return its path so
 * the caller can reveal it. The file is unencrypted — the UI must say so.
 */
export function exportMemories(): { path: string; count: number } {
  const records = readRecords().map(toView);
  const target = path.join(
    memoryDir(),
    "memories-export-" +
      new Date().toISOString().replace(/[:.]/g, "-") +
      ".json"
  );
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(records, null, 2) + "\n", "utf8");
  return { path: target, count: records.length };
}

export function clearArchive(): { removed: number } {
  return withMemoryStoreLock(memoryDir(), () => {
    const removed = countArchive();
    rmSync(archivePath(), { force: true });
    return { removed };
  });
}

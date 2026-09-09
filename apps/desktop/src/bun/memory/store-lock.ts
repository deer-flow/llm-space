import { mkdirSync } from "node:fs";
import path from "node:path";

import { Database } from "bun:sqlite";

/**
 * Serialize JSONL read-modify-write operations across the desktop and plugin
 * processes. SQLite supplies an OS-backed lock released even on process death;
 * the database holds no memory records. Keep the embedded plugin helper in sync.
 * Callbacks must be synchronous and must not acquire this lock recursively.
 */
export function withMemoryStoreLock<T>(directory: string, mutate: () => T): T {
  mkdirSync(directory, { recursive: true });
  const db = new Database(path.join(directory, "memories.lock.sqlite"));
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    return db.transaction(mutate).immediate();
  } finally {
    db.close();
  }
}

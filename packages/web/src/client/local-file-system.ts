import type { FileNode, FileSystem, Thread, ThreadStorage } from "@llm-space/core";

const DEFAULT_BASE = "/api/fs/local";

/**
 * Client-side `FileSystem` + `ThreadStorage` that talks to the
 * `/api/fs/local/*` route handlers. Each method POSTs its arguments as JSON
 * and throws with the server's `{ error }` message on a non-2xx response
 * (mirrors the fetch+throw convention of `streamThread` in core).
 */
export class LocalFileSystemClient implements FileSystem, ThreadStorage {
  constructor(private readonly base: string = DEFAULT_BASE) {}

  ls(path: string): Promise<FileNode[]> {
    return this._post("ls", { path });
  }

  mkdir(path: string): Promise<void> {
    return this._post("mkdir", { path });
  }

  cp(src: string, dest: string): Promise<void> {
    return this._post("cp", { src, dest });
  }

  mv(src: string, dest: string): Promise<void> {
    return this._post("mv", { src, dest });
  }

  rm(path: string): Promise<void> {
    return this._post("rm", { path });
  }

  read(path: string): Promise<Thread> {
    return this._post("read", { path });
  }

  write(path: string, thread: Thread): Promise<void> {
    return this._post("write", { path, thread });
  }

  private async _post<T>(method: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        (data as { error?: string } | null)?.error ?? res.statusText;
      throw new Error(message);
    }
    return data as T;
  }
}

/** Shared client instance for the local storage backend. */
export const localFs = new LocalFileSystemClient();

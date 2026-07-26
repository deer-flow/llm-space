import type {
  FileNode,
  FileSystem,
  Thread,
  ThreadStorage,
} from "@llm-space/core";
import { normalizeThreadForPath } from "@llm-space/ui/lib/thread-file";

import { electrobun } from "@/lib/electrobun";
import type { RuntimeId } from "@/shared/runtime";

import { runtimeScope } from "./runtime-scope";

/**
 * Client-side `FileSystem` + `ThreadStorage` that talks to the bun side over
 * Electrobun RPC (the `fs*` requests), the desktop counterpart to the web
 * {@link LocalFileSystemClient} that POSTs to `/api/fs/local/*`. Each method
 * issues a request and rejects with the bun handler's error on failure.
 */
export class LocalFileSystemClient implements FileSystem, ThreadStorage {
  constructor(private readonly _runtimeId?: RuntimeId) {}
  ls(path: string): Promise<FileNode[]> {
    return this._rpc().request.fsLs({ ...runtimeScope(this._runtimeId), path });
  }

  async mkdir(path: string): Promise<void> {
    await this._rpc().request.fsMkdir({
      ...runtimeScope(this._runtimeId),
      path,
    });
  }

  async cp(src: string, dest: string): Promise<void> {
    await this._rpc().request.fsCp({
      ...runtimeScope(this._runtimeId),
      src,
      dest,
    });
  }

  async mv(src: string, dest: string): Promise<void> {
    await this._rpc().request.fsMv({
      ...runtimeScope(this._runtimeId),
      src,
      dest,
    });
  }

  async rm(path: string): Promise<void> {
    await this._rpc().request.fsRm({ ...runtimeScope(this._runtimeId), path });
  }

  async read(path: string): Promise<Thread> {
    const thread = await this._rpc().request.fsRead({
      ...runtimeScope(this._runtimeId),
      path,
    });
    return normalizeThreadForPath(thread, path);
  }

  async write(path: string, thread: Thread): Promise<void> {
    await this._rpc().request.fsWrite({
      ...runtimeScope(this._runtimeId),
      path,
      thread: normalizeThreadForPath(thread, path),
    });
  }

  /** Reveal a file/directory in the OS file manager (Finder/Explorer). */
  async reveal(path: string): Promise<void> {
    const { path: absolutePath } = await this._rpc().request.fsRealpath({
      ...runtimeScope(this._runtimeId),
      path,
    });
    await this._rpc().request.fsReveal({ path: absolutePath });
  }

  /** Resolve a workspace-relative path to its absolute on-disk path. */
  async realpath(path: string): Promise<string> {
    const { path: abs } = await this._rpc().request.fsRealpath({
      ...runtimeScope(this._runtimeId),
      path,
    });
    return abs;
  }

  private _rpc() {
    const rpc = electrobun.rpc;
    if (!rpc) {
      throw new Error("Electrobun RPC is not initialized");
    }
    return rpc;
  }
}

export function createFileSystemClient(
  runtimeId?: RuntimeId
): LocalFileSystemClient {
  return new LocalFileSystemClient(runtimeId);
}

/** Shared client instance using the bun-side default runtime. */
export const localFs = createFileSystemClient();

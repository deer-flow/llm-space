import path from "node:path";

import { LocalBlobStore, LocalFileSystem } from "@llm-space/core/server";

/**
 * Create the process-scoped local storage backend behind the `fs*` RPC
 * requests. Large inline images are de-duplicated into a content-addressable
 * blob store at `<home>/blobs`, kept outside `workspace/` so it never appears
 * in the file tree.
 */
export function createLocalFileSystem(homePath: string): LocalFileSystem {
  const blobs = new LocalBlobStore(path.join(homePath, "blobs"));
  return new LocalFileSystem(path.join(homePath, "workspace"), blobs);
}

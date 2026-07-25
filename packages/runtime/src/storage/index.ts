import path from "node:path";

import { LocalFileSystem } from "@llm-space/core/server";

/** Create the process-scoped local storage backend behind the `fs*` RPC requests. */
export function createLocalFileSystem(homePath: string): LocalFileSystem {
  return new LocalFileSystem(path.join(homePath, "workspace"));
}

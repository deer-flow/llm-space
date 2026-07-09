import { electrobun } from "@/lib/electrobun";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

/**
 * Resolve a directory under the llm-space root, creating it (recursively) if
 * missing, and return its absolute path. The renderer can't touch the
 * filesystem or read the root, so it asks the bun main process.
 */
export async function ensureRootDir(relativePath: string): Promise<string> {
  const { path } = await _rpc().request.ensureRootDir({ relativePath });
  return path;
}

/** Absolute path to `LLM_SPACE_HOME/workspace`, creating it if missing. */
export async function getWorkspacePath(): Promise<string> {
  return ensureRootDir("workspace");
}

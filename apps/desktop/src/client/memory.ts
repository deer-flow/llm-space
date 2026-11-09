import { electrobun } from "@/lib/electrobun";
import type {
  MemoryListParams,
  MemoryListResult,
  MemoryMutationResult,
} from "@/shared/memory";

function _rpc() {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return electrobun.rpc;
}

/** Page through the memory store (newest first is the store's natural order). */
export function listMemories(
  params: MemoryListParams = {}
): Promise<MemoryListResult> {
  return _rpc().request.memoryList(params);
}

export function deleteMemory(id: string): Promise<MemoryMutationResult> {
  return _rpc().request.memoryDelete({ id });
}

export function updateMemory(params: {
  id: string;
  content: string;
  tags?: string[];
}): Promise<MemoryMutationResult> {
  return _rpc().request.memoryUpdate(params);
}

/**
 * Writes an unencrypted JSON export beside the store. Resolves to the written
 * path; callers should reveal it (and warn that the file is plain text).
 */
export function exportMemories(): Promise<{ path: string; count: number }> {
  return _rpc().request.memoryExport({});
}

export function clearMemoryArchive(): Promise<{ removed: number }> {
  return _rpc().request.memoryClearArchive({});
}

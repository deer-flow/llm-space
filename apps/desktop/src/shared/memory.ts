/** Wire types for the Settings → Memory browser (mirrors the bundled plugin store). */

export interface MemoryRecordView {
  id: string;
  content: string;
  tags: string[];
  origin: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface MemoryListResult {
  memories: MemoryRecordView[];
  /** Records in the store, before filtering. */
  total: number;
  /** Records matching the current filters. */
  matched: number;
  /** The store's hard limit (mirrors the plugin's MAX_TOTAL_MEMORIES). */
  max: number;
  /** Lines kept in `memories.archive.jsonl`. */
  archiveCount: number;
  /** Distinct project paths present in the store, for the filter dropdown. */
  projects: string[];
}

export interface MemoryListParams {
  query?: string;
  project?: string;
  limit?: number;
  offset?: number;
}

export interface MemoryMutationResult {
  ok: boolean;
  memories: MemoryRecordView[];
  total: number;
}

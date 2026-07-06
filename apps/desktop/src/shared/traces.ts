import type { ModelUsage, Thread } from "@llm-space/core";

/**
 * Describes where a renderer-visible trace project gets its Langfuse data.
 * Manual projects hold imported JSON exports; connected projects expose only
 * redacted credential previews.
 */
export type TraceProjectSource =
  | {
      type: "langfuse";
      mode: "manual";
      langfuseProjectId?: string;
      langfuseProjectName?: string;
    }
  | {
      type: "langfuse";
      mode: "connected";
      baseUrl: string;
      publicKeyPreview: string;
      secretKeyPreview: string;
      langfuseProjectId?: string;
      langfuseProjectName?: string;
      lastSyncAt?: number;
      lastSyncStatus?: "success" | "error";
      lastSyncError?: string;
    };

/**
 * A top-level trace collection in `LLM_SPACE_ROOT/traces/projects`. One project
 * is intended to map to one Langfuse source, with `updatedAt` changing whenever
 * imports add traces or source metadata.
 */
export interface TraceProject {
  id: string;
  name: string;
  source: TraceProjectSource;
  createdAt: number;
  updatedAt: number;
}

/**
 * The lightweight summary for one imported trace. It powers the Trace Panel list
 * and points at the trace folder that stores `raw.json`, `trace.json`, and the
 * lazy `workbench.json`.
 */
export interface TraceRecord {
  id: string;
  key: string;
  projectId: string;
  title: string;
  observationCount: number;
  importedAt: number;
  updatedAt: number;
  startedAt?: string;
  endedAt?: string;
  latencyMs?: number;
  model?: string;
  status?: "ok" | "error" | "unknown";
  usage?: ModelUsage;
  source: {
    type: "langfuse";
    mode: "manual" | "connected";
    traceId: string;
    projectId?: string;
    projectName?: string;
    fileName?: string;
  };
}

/**
 * A JSON file selected by the renderer for import. The browser reads the file
 * text first because the command/RPC layer only transports serializable data.
 */
export interface TraceImportFile {
  name: string;
  text: string;
}

/**
 * Result of one Langfuse import command: created trace summaries, human-facing
 * warnings, and the number of selected files that were skipped entirely.
 */
export interface TraceImportResult {
  imported: TraceRecord[];
  warnings: string[];
  skipped: number;
}

/**
 * User-supplied settings for creating a connected Langfuse Trace Project. The
 * secret is sent only to the Bun process and persisted locally in project.json.
 * `name` is an optional local display-name override; the normal connect flow
 * derives it from the validated Langfuse project.
 */
export interface TraceConnectedProjectInput {
  name?: string;
  baseUrl: string;
  publicKey: string;
  secretKey: string;
}

/**
 * Filters supported by Langfuse's public trace list endpoint. `id` is an exact
 * trace-id filter; `query` is our convenience search box that Bun expands into
 * fuzzy searches over trace id, name, user id, and session id.
 */
export interface TraceLangfuseSearchInput {
  id?: string;
  query?: string;
  name?: string;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  version?: string;
  release?: string;
  environment?: string[];
  fromTimestamp?: string;
  toTimestamp?: string;
  orderBy?: string;
  limit?: number;
}

/**
 * A lightweight remote trace row from Langfuse used by the search/select sync
 * UI. Full observation payloads are fetched only when the user syncs a trace.
 */
export interface TraceRemoteTraceSummary {
  id: string;
  name?: string;
  timestamp?: string;
  userId?: string;
  sessionId?: string;
  version?: string;
  release?: string;
  environment?: string;
  tags?: string[];
  observationCount?: number;
  totalCost?: number;
}

/**
 * Result of syncing selected trace ids from a connected Langfuse project.
 * Individual trace failures are reported as warnings/skips so partial success is
 * observable instead of being collapsed into a thrown batch error.
 */
export interface TraceSyncResult extends TraceImportResult {}

/**
 * The data needed to open a trace in ThreadPlayground. `thread` is the editable
 * workbench copy; `trace` remains the read-only summary/context.
 */
export interface TraceWorkbenchResponse {
  trace: TraceRecord;
  thread: Thread;
}

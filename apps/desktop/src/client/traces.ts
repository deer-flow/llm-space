import type { Thread } from "@llm-space/core";

import { electrobun } from "@/lib/electrobun";
import type {
  TraceConnectedProjectInput,
  TraceImportFile,
  TraceLangfuseSearchInput,
} from "@/shared/traces";

function _rpc() {
  const rpc = electrobun.rpc;
  if (!rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  return rpc;
}

export const traceClient = {
  /** List trace projects for the sidebar; returns an empty array on a fresh root. */
  listProjects() {
    return _rpc().request.traceListProjects({});
  },
  /** Create a manual Langfuse project and return its persisted metadata. */
  createProject(name: string) {
    return _rpc().request.traceCreateProject({ name });
  },
  /** Validate and create a connected Langfuse project with local credentials. */
  createConnectedProject(input: TraceConnectedProjectInput) {
    return _rpc().request.traceCreateConnectedProject(input);
  },
  /** List trace summaries for one project, sorted by trace start time. */
  listTraces(projectId: string) {
    return _rpc().request.traceListTraces({ projectId });
  },
  /** Import already-read Langfuse JSON files into a trace project. */
  importLangfuseJson(projectId: string, files: TraceImportFile[]) {
    return _rpc().request.traceImportLangfuseJson({ projectId, files });
  },
  /** Search remote Langfuse traces for explicit user-selected sync. */
  searchLangfuseTraces(
    projectId: string,
    filters: TraceLangfuseSearchInput = {}
  ) {
    return _rpc().request.traceSearchLangfuseTraces({
      projectId,
      filters,
    });
  },
  /** Sync selected remote Langfuse trace ids into local trace storage. */
  syncLangfuseTraces(projectId: string, traceIds: string[]) {
    return _rpc().request.traceSyncLangfuseTraces({ projectId, traceIds });
  },
  /** Read one trace summary, used to validate restored trace tabs. */
  readTrace(projectId: string, traceKey: string) {
    return _rpc().request.traceReadTrace({ projectId, traceKey });
  },
  /** Read or lazily create the editable workbench thread for a trace. */
  readOrCreateWorkbench(projectId: string, traceKey: string) {
    return _rpc().request.traceReadOrCreateWorkbench({ projectId, traceKey });
  },
  /** Rename a trace and keep its editable workbench title aligned. */
  updateTraceTitle(projectId: string, traceKey: string, title: string) {
    return _rpc().request.traceUpdateTraceTitle({ projectId, traceKey, title });
  },
  /** Persist the trace workbench thread without changing the raw trace payload. */
  async writeWorkbench(
    projectId: string,
    traceKey: string,
    thread: Thread
  ): Promise<void> {
    await _rpc().request.traceWriteWorkbench({ projectId, traceKey, thread });
  },
};

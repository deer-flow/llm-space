import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import {
  uuid,
  type AssistantMessage,
  type Message,
  type ModelUsage,
  type Thread,
  type ToolCall,
} from "@llm-space/core";
import { getLlmSpaceRoot } from "@llm-space/core/server";

import type {
  TraceConnectedProjectInput,
  TraceImportFile,
  TraceImportResult,
  TraceLangfuseSearchInput,
  TraceProject,
  TraceRecord,
  TraceRemoteTraceSummary,
  TraceSyncResult,
  TraceWorkbenchResponse,
} from "../../shared/traces";

import {
  LangfuseClient,
  normalizeLangfuseBaseUrl,
  previewSecret,
} from "./langfuse-client";

interface LangfuseRawTrace {
  source: TraceRecord["source"];
  importedAt: number;
  rows: LangfuseObservation[];
}

type LangfuseObservation = Record<string, unknown>;

/**
 * Bun-only persisted source shape. Full credentials may exist only in
 * `project.json` and in Bun process memory; renderer/RPC responses use
 * `TraceProject`, whose source type has no credential fields.
 */
type TraceStoredProjectSource =
  | Extract<TraceProject["source"], { mode: "manual" }>
  | (Extract<TraceProject["source"], { mode: "connected" }> & {
      publicKey: string;
      secretKey: string;
    });

interface TraceStoredProject extends Omit<TraceProject, "source"> {
  source: TraceStoredProjectSource;
}

interface ParsedLangfuseFile {
  fileName: string;
  groups: Map<string, LangfuseObservation[]>;
  projectIds: Set<string>;
  projectNames: Set<string>;
}

const TRACE_ROOT = path.join(getLlmSpaceRoot(), "traces", "projects");
const TRACE_PROJECT_ID_PREFIX = "proj";
const TRACE_KEY_MAX_SLUG = 48;

/**
 * Owns trace-project storage under `LLM_SPACE_ROOT/traces`.
 *
 * Boundary: trace files are not workspace threads. Only `workbench.json` uses
 * the normal Thread shape so the existing ThreadPlayground can debug a trace.
 */
export class TraceManager {
  constructor() {
    mkdirSync(TRACE_ROOT, { recursive: true });
  }

  /**
   * List persisted trace projects, sorted by recent activity. Returns an empty
   * list when the trace root does not exist or contains unreadable entries.
   */
  async listProjects(): Promise<TraceProject[]> {
    const entries = await this._safeReadDir(TRACE_ROOT);
    const projects = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => this._readProject(entry.name).catch(() => null))
    );
    return projects
      .filter((project): project is TraceStoredProject => project !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name))
      .map(_projectForRenderer);
  }

  /**
   * Create a manual Langfuse trace project. `name` is trimmed and must remain
   * non-empty; the method writes `project.json` and returns the stored project.
   */
  async createProject(name: string): Promise<TraceProject> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Trace project name is required.");
    }
    const now = Date.now();
    const id = `${TRACE_PROJECT_ID_PREFIX}_${_shortHash(`${trimmed}:${now}:${uuid()}`)}`;
    const project: TraceStoredProject = {
      id,
      name: trimmed,
      source: { type: "langfuse", mode: "manual" },
      createdAt: now,
      updatedAt: now,
    };
    await fs.mkdir(this._projectDir(id), { recursive: true });
    await this._writeProject(project);
    return _projectForRenderer(project);
  }

  /**
   * Validate Langfuse credentials and create a connected trace project. V1
   * intentionally stores the full keys in local `project.json`, but only
   * redacted previews should ever be rendered or logged.
   */
  async createConnectedProject(
    input: TraceConnectedProjectInput
  ): Promise<TraceProject> {
    const baseUrl = normalizeLangfuseBaseUrl(input.baseUrl);
    const publicKey = input.publicKey.trim();
    const secretKey = input.secretKey.trim();
    if (!publicKey || !secretKey) {
      throw new Error("Langfuse public key and secret key are required.");
    }
    const client = new LangfuseClient({ baseUrl, publicKey, secretKey });
    const projectInfo = await client.getProject();
    const name = _connectedProjectName(input.name, projectInfo, baseUrl);
    const now = Date.now();
    const id = `${TRACE_PROJECT_ID_PREFIX}_${_shortHash(`${name}:${baseUrl}:${now}:${uuid()}`)}`;
    const project: TraceStoredProject = {
      id,
      name,
      source: {
        type: "langfuse",
        mode: "connected",
        baseUrl,
        publicKey,
        secretKey,
        publicKeyPreview: previewSecret(publicKey),
        secretKeyPreview: previewSecret(secretKey),
        ...(projectInfo.projectId
          ? { langfuseProjectId: projectInfo.projectId }
          : {}),
        ...(projectInfo.projectName
          ? { langfuseProjectName: projectInfo.projectName }
          : {}),
      },
      createdAt: now,
      updatedAt: now,
    };
    await fs.mkdir(this._projectDir(id), { recursive: true });
    await this._writeProject(project);
    return _projectForRenderer(project);
  }

  /**
   * List trace summaries for one project. The project must exist; unreadable
   * individual trace folders are skipped so one bad import does not hide others.
   */
  async listTraces(projectId: string): Promise<TraceRecord[]> {
    await this._requireProject(projectId);
    const tracesDir = this._tracesDir(projectId);
    const entries = await this._safeReadDir(tracesDir);
    const traces = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) =>
          this._readTrace(projectId, entry.name).catch(() => null)
        )
    );
    return traces
      .filter((trace): trace is TraceRecord => trace !== null)
      .sort((a, b) => _timeValue(b.startedAt) - _timeValue(a.startedAt));
  }

  /**
   * Import Langfuse observation JSON exports into a trace project. Supported
   * inputs are `{ data: [...] }` exports and bare observation arrays; each trace
   * group writes `raw.json` plus `trace.json`, while warnings report skipped
   * files and Langfuse project-source mismatches.
   */
  async importLangfuseJson(
    projectId: string,
    files: TraceImportFile[]
  ): Promise<TraceImportResult> {
    const project = await this._requireProject(projectId);
    if (project.source.mode !== "manual") {
      throw new Error(
        "Manual JSON import is only available for manual projects."
      );
    }
    const imported: TraceRecord[] = [];
    const warnings: string[] = [];
    const fileWarnings: string[] = [];
    const parsedFiles: ParsedLangfuseFile[] = [];
    let skipped = 0;

    for (const file of files) {
      const rows = _extractLangfuseRows(file.text);
      if (!rows) {
        skipped += 1;
        fileWarnings.push(`${file.name}: unsupported Langfuse JSON shape.`);
        continue;
      }
      const groups = _groupRowsByTraceId(rows);
      if (groups.size === 0) {
        skipped += 1;
        fileWarnings.push(`${file.name}: no traceId values found.`);
        continue;
      }
      parsedFiles.push({
        fileName: file.name,
        groups,
        projectIds: _projectIdsFromRows(rows),
        projectNames: _projectNamesFromRows(rows),
      });
    }

    const batchProjectIds = _mergeSets(
      parsedFiles.map((file) => file.projectIds)
    );
    const batchProjectNames = _mergeSets(
      parsedFiles.map((file) => file.projectNames)
    );
    const existingProjectIds = _projectIdsFromExistingTraces(
      project,
      await this.listTraces(project.id)
    );
    _assertSingleLangfuseSource(
      project.name,
      existingProjectIds,
      batchProjectIds
    );
    warnings.push(...fileWarnings);

    for (const file of parsedFiles) {
      for (const [traceId, traceRows] of file.groups) {
        const trace = await this._writeImportedTrace({
          project,
          sourceMode: "manual",
          fileName: file.fileName,
          traceId,
          rows: traceRows,
        });
        imported.push(trace);
      }
    }

    if (imported.length > 0) {
      await this._writeProject({
        ...project,
        source: _projectSourceAfterImport(
          project.source,
          existingProjectIds,
          batchProjectIds,
          batchProjectNames
        ),
        updatedAt: Date.now(),
      });
    }

    return { imported, warnings, skipped };
  }

  /**
   * Search a connected Langfuse source for a bounded list of remote trace rows.
   * This does not import data; users must explicitly sync selected trace ids.
   */
  async searchLangfuseTraces({
    projectId,
    filters,
  }: {
    projectId: string;
    filters?: TraceLangfuseSearchInput;
  }): Promise<TraceRemoteTraceSummary[]> {
    const project = await this._requireConnectedProject(projectId);
    return this._clientForProject(project).searchTraces(filters);
  }

  /**
   * Sync selected remote trace ids into local trace storage. Sync upserts by
   * remote trace id, preserves any existing `workbench.json`, and reports
   * per-trace failures without hiding successful imports from the same batch.
   */
  async syncLangfuseTraces({
    projectId,
    traceIds,
  }: {
    projectId: string;
    traceIds: string[];
  }): Promise<TraceSyncResult> {
    const project = await this._requireConnectedProject(projectId);
    const requested = [...new Set(traceIds.map((id) => id.trim()))].filter(
      Boolean
    );
    if (requested.length === 0) {
      throw new Error("At least one Langfuse trace id is required.");
    }
    const client = this._clientForProject(project);
    const imported: TraceRecord[] = [];
    const warnings: string[] = [];
    let skipped = 0;

    for (const traceId of requested) {
      try {
        const result = await client.getObservationsForTrace(traceId);
        if (result.rows.length === 0) {
          skipped += 1;
          warnings.push(`Trace ${traceId}: no observations found.`);
          continue;
        }
        if (result.truncated) {
          skipped += 1;
          warnings.push(
            `Trace ${traceId}: more than ${result.rows.length} observations found; V1 sync is capped at ${result.maxPages} pages, so no partial trace was imported.`
          );
          continue;
        }
        const trace = await this._writeImportedTrace({
          project,
          sourceMode: "connected",
          traceId,
          rows: result.rows,
          upsert: true,
        });
        imported.push(trace);
      } catch (error) {
        skipped += 1;
        warnings.push(
          `Trace ${traceId}: ${_errorMessage(error, "Langfuse sync failed.")}`
        );
      }
    }

    const now = Date.now();
    if (warnings.length > 0 || skipped > 0) {
      await this._writeProject({
        ...project,
        source: {
          ...project.source,
          lastSyncAt: now,
          lastSyncStatus: "error",
          lastSyncError: warnings[0] ?? "Some traces could not be synced.",
        },
        updatedAt: now,
      });
    } else {
      const sourceWithoutError = { ...project.source };
      delete sourceWithoutError.lastSyncError;
      await this._writeProject({
        ...project,
        source: {
          ...sourceWithoutError,
          lastSyncAt: now,
          lastSyncStatus: "success",
        },
        updatedAt: now,
      });
    }

    return { imported, warnings, skipped };
  }

  /**
   * Read one trace summary by project id and trace key. The project must exist;
   * callers get the filesystem read error when the trace key is stale.
   */
  async readTrace(projectId: string, traceKey: string): Promise<TraceRecord> {
    await this._requireProject(projectId);
    return this._readTrace(projectId, traceKey);
  }

  /**
   * Read or lazily create the ThreadPlayground workbench for a trace. The first
   * call derives `workbench.json` from `raw.json`; later calls return the saved
   * workbench so debugging edits persist with the trace.
   */
  async readOrCreateWorkbench(
    projectId: string,
    traceKey: string
  ): Promise<TraceWorkbenchResponse> {
    const trace = await this.readTrace(projectId, traceKey);
    const workbenchPath = this._workbenchPath(projectId, traceKey);
    if (!existsSync(workbenchPath)) {
      const raw = await this._readRawTrace(projectId, traceKey);
      await fs.writeFile(
        workbenchPath,
        JSON.stringify(_createWorkbench(trace, raw.rows), null, 2),
        "utf8"
      );
    }
    const thread = JSON.parse(
      await fs.readFile(workbenchPath, "utf8")
    ) as Thread;
    const normalizedThread = _normalizeExistingWorkbenchThread(thread);
    if (normalizedThread !== thread) {
      await fs.writeFile(
        workbenchPath,
        JSON.stringify(normalizedThread, null, 2),
        "utf8"
      );
    }
    return { trace, thread: normalizedThread };
  }

  /**
   * Rename a trace-facing debug workbench. The title belongs to trace metadata,
   * not the filesystem key, so renaming never moves raw trace folders.
   */
  async updateTraceTitle(
    projectId: string,
    traceKey: string,
    title: string
  ): Promise<TraceWorkbenchResponse> {
    await this._requireProject(projectId);
    const normalizedTitle = _normalizeTraceTitle(title);
    const trace = await this._readTrace(projectId, traceKey);
    const nextTrace: TraceRecord = {
      ...trace,
      title: normalizedTitle,
      updatedAt: Date.now(),
    };
    await fs.writeFile(
      this._tracePath(projectId, traceKey),
      JSON.stringify(nextTrace, null, 2),
      "utf8"
    );

    const workbenchPath = this._workbenchPath(projectId, traceKey);
    if (!existsSync(workbenchPath)) {
      const raw = await this._readRawTrace(projectId, traceKey);
      const thread = _createWorkbench(nextTrace, raw.rows);
      await fs.writeFile(workbenchPath, JSON.stringify(thread, null, 2), "utf8");
      return { trace: nextTrace, thread };
    }

    const currentThread = JSON.parse(
      await fs.readFile(workbenchPath, "utf8")
    ) as Thread;
    const thread = _threadWithTitle(currentThread, normalizedTitle);
    await fs.writeFile(workbenchPath, JSON.stringify(thread, null, 2), "utf8");
    return { trace: nextTrace, thread };
  }

  /**
   * Persist a trace workbench thread. The trace must already exist; this only
   * updates `workbench.json` and never mutates the original `raw.json`.
   */
  async writeWorkbench(
    projectId: string,
    traceKey: string,
    thread: Thread
  ): Promise<void> {
    await this.readTrace(projectId, traceKey);
    await fs.writeFile(
      this._workbenchPath(projectId, traceKey),
      JSON.stringify(thread, null, 2),
      "utf8"
    );
  }

  private async _writeImportedTrace({
    project,
    sourceMode,
    fileName,
    traceId,
    rows,
    upsert = false,
  }: {
    project: TraceStoredProject;
    sourceMode: TraceRecord["source"]["mode"];
    fileName?: string;
    traceId: string;
    rows: LangfuseObservation[];
    upsert?: boolean;
  }): Promise<TraceRecord> {
    const existing = upsert
      ? await this._findTraceByRemoteId(project.id, traceId)
      : null;
    const now = Date.now();
    const importedAt = existing?.importedAt ?? now;
    const key =
      existing?.key ?? this._uniqueTraceKey(project.id, traceId, rows);
    const trace = _createTraceRecord({
      projectId: project.id,
      key,
      sourceMode,
      traceId,
      fileName,
      importedAt,
      updatedAt: now,
      rows,
    });
    const dir = this._traceDir(project.id, key);
    await fs.mkdir(dir, { recursive: true });
    const raw: LangfuseRawTrace = {
      source: trace.source,
      importedAt,
      rows,
    };
    await fs.writeFile(
      path.join(dir, "raw.json"),
      JSON.stringify(raw, null, 2),
      "utf8"
    );
    await fs.writeFile(
      path.join(dir, "trace.json"),
      JSON.stringify(trace, null, 2),
      "utf8"
    );
    return trace;
  }

  private _uniqueTraceKey(
    projectId: string,
    traceId: string,
    rows: LangfuseObservation[]
  ): string {
    const title = _titleFromRows(traceId, rows);
    const base = `${_slug(title || traceId).slice(0, TRACE_KEY_MAX_SLUG)}-${_shortHash(traceId)}`;
    let candidate = base;
    let index = 2;
    while (existsSync(this._traceDir(projectId, candidate))) {
      candidate = `${base}-${index}`;
      index += 1;
    }
    return candidate;
  }

  private async _requireProject(projectId: string): Promise<TraceStoredProject> {
    return this._readProject(projectId);
  }

  private async _requireConnectedProject(projectId: string): Promise<
    TraceStoredProject & {
      source: Extract<TraceStoredProjectSource, { mode: "connected" }> & {
        publicKey: string;
        secretKey: string;
      };
    }
  > {
    const project = await this._requireProject(projectId);
    if (project.source.mode !== "connected") {
      throw new Error("Trace project is not connected to Langfuse.");
    }
    if (!project.source.publicKey || !project.source.secretKey) {
      throw new Error("Connected Langfuse credentials are missing.");
    }
    return project as TraceStoredProject & {
      source: Extract<TraceStoredProjectSource, { mode: "connected" }> & {
        publicKey: string;
        secretKey: string;
      };
    };
  }

  private _clientForProject(project: {
    source: Extract<TraceStoredProjectSource, { mode: "connected" }> & {
      publicKey: string;
      secretKey: string;
    };
  }): LangfuseClient {
    return new LangfuseClient({
      baseUrl: project.source.baseUrl,
      publicKey: project.source.publicKey,
      secretKey: project.source.secretKey,
    });
  }

  private async _findTraceByRemoteId(
    projectId: string,
    traceId: string
  ): Promise<TraceRecord | null> {
    const traces = await this.listTraces(projectId);
    return traces.find((trace) => trace.source.traceId === traceId) ?? null;
  }

  private async _readProject(projectId: string): Promise<TraceStoredProject> {
    return JSON.parse(
      await fs.readFile(
        path.join(this._projectDir(projectId), "project.json"),
        "utf8"
      )
    ) as TraceStoredProject;
  }

  private async _writeProject(project: TraceStoredProject): Promise<void> {
    await fs.mkdir(this._projectDir(project.id), { recursive: true });
    await fs.writeFile(
      path.join(this._projectDir(project.id), "project.json"),
      JSON.stringify(project, null, 2),
      "utf8"
    );
  }

  private async _readTrace(
    projectId: string,
    traceKey: string
  ): Promise<TraceRecord> {
    return JSON.parse(
      await fs.readFile(this._tracePath(projectId, traceKey), "utf8")
    ) as TraceRecord;
  }

  private async _readRawTrace(
    projectId: string,
    traceKey: string
  ): Promise<LangfuseRawTrace> {
    return JSON.parse(
      await fs.readFile(
        path.join(this._traceDir(projectId, traceKey), "raw.json"),
        "utf8"
      )
    ) as LangfuseRawTrace;
  }

  private _projectDir(projectId: string): string {
    return path.join(TRACE_ROOT, _safeSegment(projectId));
  }

  private _tracesDir(projectId: string): string {
    return path.join(this._projectDir(projectId), "traces");
  }

  private _traceDir(projectId: string, traceKey: string): string {
    return path.join(this._tracesDir(projectId), _safeSegment(traceKey));
  }

  private _tracePath(projectId: string, traceKey: string): string {
    return path.join(this._traceDir(projectId, traceKey), "trace.json");
  }

  private _workbenchPath(projectId: string, traceKey: string): string {
    return path.join(this._traceDir(projectId, traceKey), "workbench.json");
  }

  private async _safeReadDir(dir: string) {
    try {
      return await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
  }
}

function _extractLangfuseRows(text: string): LangfuseObservation[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : _asRecord(parsed) && Array.isArray(_asRecord(parsed)?.data)
      ? (_asRecord(parsed)?.data as unknown[])
      : null;
  if (!rows) {
    return null;
  }
  const observations = rows
    .map(_asRecord)
    .filter((row): row is LangfuseObservation => Boolean(row));
  return observations.some(_looksLikeLangfuseObservation) ? observations : null;
}

function _projectForRenderer(project: TraceStoredProject): TraceProject {
  if (project.source.mode !== "connected") {
    return project;
  }
  return {
    ...project,
    source: _connectedSourceForRenderer(project.source),
  };
}

function _connectedSourceForRenderer(
  source: Extract<TraceStoredProjectSource, { mode: "connected" }>
): Extract<TraceProject["source"], { mode: "connected" }> {
  return {
    type: source.type,
    mode: source.mode,
    baseUrl: source.baseUrl,
    publicKeyPreview: source.publicKeyPreview,
    secretKeyPreview: source.secretKeyPreview,
    ...(source.langfuseProjectId
      ? { langfuseProjectId: source.langfuseProjectId }
      : {}),
    ...(source.langfuseProjectName
      ? { langfuseProjectName: source.langfuseProjectName }
      : {}),
    ...(source.lastSyncAt ? { lastSyncAt: source.lastSyncAt } : {}),
    ...(source.lastSyncStatus ? { lastSyncStatus: source.lastSyncStatus } : {}),
    ...(source.lastSyncError ? { lastSyncError: source.lastSyncError } : {}),
  };
}

function _connectedProjectName(
  inputName: string | undefined,
  projectInfo: { projectName?: string },
  baseUrl: string
): string {
  const override = inputName?.trim();
  if (override) {
    return override;
  }
  const remoteName = projectInfo.projectName?.trim();
  if (remoteName) {
    return remoteName;
  }
  return new URL(baseUrl).host || "Langfuse";
}

function _looksLikeLangfuseObservation(row: LangfuseObservation): boolean {
  return Boolean(_firstString(row.traceId, row.trace_id)) && Boolean(row.id);
}

function _groupRowsByTraceId(
  rows: LangfuseObservation[]
): Map<string, LangfuseObservation[]> {
  const groups = new Map<string, LangfuseObservation[]>();
  for (const row of rows) {
    const traceId = _firstString(row.traceId, row.trace_id);
    if (!traceId) {
      continue;
    }
    groups.set(traceId, [...(groups.get(traceId) ?? []), row]);
  }
  return groups;
}

function _projectIdsFromRows(rows: LangfuseObservation[]): Set<string> {
  return new Set(
    rows
      .map((row) => _firstString(row.projectId, row.project_id))
      .filter((id): id is string => Boolean(id))
  );
}

function _projectNamesFromRows(rows: LangfuseObservation[]): Set<string> {
  return new Set(
    rows
      .map((row) => _firstString(row.projectName, row.project_name))
      .filter((name): name is string => Boolean(name))
  );
}

function _projectIdsFromExistingTraces(
  project: TraceStoredProject,
  traces: TraceRecord[]
): Set<string> {
  return new Set(
    [
      project.source.langfuseProjectId,
      ...traces.map((trace) => trace.source.projectId),
    ].filter((id): id is string => Boolean(id))
  );
}

function _assertSingleLangfuseSource(
  projectName: string,
  existingProjectIds: Set<string>,
  batchProjectIds: Set<string>
): void {
  if (batchProjectIds.size > 1) {
    throw new Error(
      `Selected files contain ${batchProjectIds.size} Langfuse project ids. Import one Langfuse project into "${projectName}" at a time.`
    );
  }
  if (existingProjectIds.size > 1) {
    throw new Error(
      `Trace project "${projectName}" already contains ${existingProjectIds.size} Langfuse project ids and cannot accept more imports.`
    );
  }
  if (existingProjectIds.size > 0 && batchProjectIds.size > 0) {
    const unexpected = [...batchProjectIds].filter(
      (id) => !existingProjectIds.has(id)
    );
    if (unexpected.length > 0) {
      throw new Error(
        `Trace project "${projectName}" is linked to Langfuse project ${_formatSourceIds(existingProjectIds)}, but the import includes ${_formatSourceIds(new Set(unexpected))}.`
      );
    }
  }
}

function _projectSourceAfterImport(
  source: TraceStoredProjectSource,
  existingProjectIds: Set<string>,
  batchProjectIds: Set<string>,
  batchProjectNames: Set<string>
): TraceStoredProjectSource {
  const existingProjectId = _onlySetValue(existingProjectIds);
  const batchProjectId = _onlySetValue(batchProjectIds);
  const langfuseProjectId =
    source.langfuseProjectId ??
    existingProjectId ??
    (existingProjectIds.size === 0 ? batchProjectId : undefined);
  const batchMatchesSource =
    batchProjectIds.size > 0 && batchProjectId === langfuseProjectId;
  const langfuseProjectName =
    source.langfuseProjectName ??
    (batchMatchesSource ? _onlySetValue(batchProjectNames) : undefined);
  return {
    ...source,
    ...(langfuseProjectId ? { langfuseProjectId } : {}),
    ...(langfuseProjectName ? { langfuseProjectName } : {}),
  };
}

function _mergeSets(sets: Set<string>[]): Set<string> {
  return new Set(sets.flatMap((set) => [...set]));
}

function _onlySetValue(set: Set<string>): string | undefined {
  return set.size === 1 ? [...set][0] : undefined;
}

function _formatSourceIds(ids: Set<string>): string {
  const values = [...ids];
  if (values.length <= 2) {
    return values.map((id) => `"${id}"`).join(" and ");
  }
  return `${values
    .slice(0, 2)
    .map((id) => `"${id}"`)
    .join(", ")} and ${values.length - 2} more`;
}

function _errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function _normalizeTraceTitle(value: string): string {
  const title = value.trim();
  if (!title) {
    throw new Error("Trace title is required.");
  }
  if ([...title].some((char) => char.charCodeAt(0) < 32)) {
    throw new Error("Trace title contains a control character.");
  }
  return title;
}

function _threadWithTitle(thread: Thread, title: string): Thread {
  return {
    ...thread,
    title,
    runHistory: thread.runHistory?.map((run) => ({
      ...run,
      thread: { ...run.thread, title },
    })),
  };
}

function _normalizeExistingWorkbenchThread(thread: Thread): Thread {
  const normalized = _normalizeThreadMessages(thread);
  let changed = normalized.changed;
  const nextRunHistory = normalized.thread.runHistory?.map((run) => {
    const normalizedRun = _normalizeThreadMessages(run.thread);
    if (normalizedRun.changed) {
      changed = true;
      return { ...run, thread: normalizedRun.thread };
    }
    return run;
  });
  if (!changed) {
    return thread;
  }
  return { ...normalized.thread, runHistory: nextRunHistory };
}

function _normalizeThreadMessages(thread: Thread): {
  thread: Thread;
  changed: boolean;
} {
  const messages = thread.context?.messages;
  if (!messages) {
    return { thread, changed: false };
  }
  let changed = false;
  const nextMessages = messages.map((message) => {
    const next = _normalizeMessageText(message);
    if (next !== message) {
      changed = true;
    }
    return next;
  });
  if (!changed) {
    return { thread, changed: false };
  }
  return {
    thread: {
      ...thread,
      context: { ...thread.context, messages: nextMessages },
    },
    changed: true,
  };
}

function _normalizeMessageText(message: Message): Message {
  const content = _normalizeTextContent(message.content);
  let next =
    content === message.content ? message : ({ ...message, content } as Message);
  if (next.role !== "assistant" || !next.toolCalls) {
    return next;
  }
  let toolCallsChanged = false;
  const toolCalls = next.toolCalls.map((toolCall) => {
    if (!toolCall.output) {
      return toolCall;
    }
    const outputContent = _normalizeTextContent(toolCall.output.content);
    if (outputContent === toolCall.output.content) {
      return toolCall;
    }
    toolCallsChanged = true;
    return {
      ...toolCall,
      output: { ...toolCall.output, content: outputContent },
    };
  });
  if (!toolCallsChanged) {
    return next;
  }
  next = { ...next, toolCalls };
  return next;
}

function _normalizeTextContent<T extends { type: string; text?: string }>(
  content: T[]
): T[] {
  let changed = false;
  const next = content.map((item) => {
    if (item.type !== "text" || typeof item.text !== "string") {
      return item;
    }
    const text = _textFromJsonWrapper(item.text);
    if (text === item.text) {
      return item;
    }
    changed = true;
    return { ...item, text };
  });
  return changed ? next : content;
}

function _createTraceRecord({
  projectId,
  key,
  sourceMode,
  traceId,
  fileName,
  importedAt,
  updatedAt,
  rows,
}: {
  projectId: string;
  key: string;
  sourceMode: TraceRecord["source"]["mode"];
  traceId: string;
  fileName?: string;
  importedAt: number;
  updatedAt: number;
  rows: LangfuseObservation[];
}): TraceRecord {
  const ordered = _sortRows(rows);
  const startedAt = _minDate(ordered.map(_rowStartTime));
  const endedAt = _maxDate(ordered.map(_rowEndTime));
  const usage = _aggregateRowsUsage(ordered);
  return {
    id: traceId,
    key,
    projectId,
    title: _titleFromRows(traceId, rows),
    observationCount: rows.length,
    importedAt,
    updatedAt,
    ...(startedAt ? { startedAt } : {}),
    ...(endedAt ? { endedAt } : {}),
    ...(startedAt && endedAt
      ? { latencyMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)) }
      : {}),
    ...(_firstString(
      ...rows.map((row) => row.model),
      ...rows.map((row) => row.providedModelName),
      ...rows.map((row) => row.modelId)
    )
      ? {
          model: _firstString(
            ...rows.map((row) => row.model),
            ...rows.map((row) => row.providedModelName),
            ...rows.map((row) => row.modelId)
          ),
        }
      : {}),
    status: rows.some(_rowIsError) ? "error" : "ok",
    ...(usage ? { usage } : {}),
    source: {
      type: "langfuse",
      mode: sourceMode,
      traceId,
      ...(fileName ? { fileName } : {}),
      ...(_firstString(
        ...rows.map((row) => row.projectId),
        ...rows.map((row) => row.project_id)
      )
        ? {
            projectId: _firstString(
              ...rows.map((row) => row.projectId),
              ...rows.map((row) => row.project_id)
            ),
          }
        : {}),
      ...(_firstString(
        ...rows.map((row) => row.projectName),
        ...rows.map((row) => row.project_name)
      )
        ? {
            projectName: _firstString(
              ...rows.map((row) => row.projectName),
              ...rows.map((row) => row.project_name)
            ),
          }
        : {}),
    },
  };
}

function _createWorkbench(
  trace: TraceRecord,
  rows: LangfuseObservation[]
): Thread {
  const ordered = _sortRows(rows);
  const generations = ordered.filter(_isGenerationRow);
  const messages: Message[] = [];
  const systemParts: string[] = [];
  const spansByParent = new Map<string, LangfuseObservation[]>();
  for (const row of ordered) {
    const parentId = _firstString(
      row.parentObservationId,
      row.parent_observation_id
    );
    if (parentId && !_isGenerationRow(row)) {
      spansByParent.set(parentId, [
        ...(spansByParent.get(parentId) ?? []),
        row,
      ]);
    }
  }

  for (const generation of generations.length ? generations : ordered) {
    const inputMessages = _extractInputMessages(generation.input);
    for (const inputMessage of inputMessages) {
      const role = _firstString(inputMessage.role);
      const text = _textFromValue(inputMessage.content).trim();
      if (!text) {
        continue;
      }
      if (role === "system" || role === "developer") {
        systemParts.push(text);
      } else if (role === "user") {
        _appendUserMessage(messages, text);
      }
    }
    if (inputMessages.length === 0) {
      const inputText = _textFromValue(generation.input).trim();
      if (inputText) {
        _appendUserMessage(messages, inputText);
      }
    }

    const assistant = _assistantFromGeneration(
      generation,
      spansByParent.get(String(generation.id)) ?? []
    );
    if (assistant) {
      messages.push(assistant);
    }
  }

  if (messages.length === 0) {
    messages.push({
      id: uuid(),
      role: "user",
      content: [
        {
          type: "text",
          text: "Imported Langfuse trace has no chat-shaped messages.",
        },
      ],
    });
  }

  const thread: Thread = {
    title: trace.title,
    context: {
      systemPrompt: systemParts.join("\n\n") || "",
      messages,
    },
  };
  const usage = _aggregateMessageUsage(messages);
  thread.runHistory = [
    {
      id: `imported-${_shortHash(trace.source.traceId)}`,
      thread: {
        title: thread.title,
        context: thread.context,
      },
      ...(usage ? { usage } : {}),
      timestamp: trace.startedAt
        ? Date.parse(trace.startedAt)
        : trace.importedAt,
    },
  ];
  return thread;
}

function _assistantFromGeneration(
  generation: LangfuseObservation,
  childSpans: LangfuseObservation[]
): AssistantMessage | null {
  const outputText = _assistantOutputText(generation.output).trim();
  const toolCalls = childSpans.map(_toolCallFromSpan);
  const usage = _usageFromRow(generation);
  if (!outputText && toolCalls.length === 0 && !usage) {
    return null;
  }
  return {
    id: uuid(),
    role: "assistant",
    content: [{ type: "text", text: outputText }],
    ...(toolCalls.length ? { toolCalls } : {}),
    ...(usage ? { usage } : {}),
  };
}

function _toolCallFromSpan(row: LangfuseObservation): ToolCall {
  return {
    id: _firstString(row.id) ?? uuid(),
    input: {
      name: _slug(_firstString(row.name, row.type) ?? "span").replace(
        /-/g,
        "_"
      ),
      arguments: _argumentsFromValue(row.input),
    },
    output: {
      content: [{ type: "text", text: _textFromValue(row.output) }],
      ...(_rowIsError(row) ? { isError: true } : {}),
    },
  };
}

function _extractInputMessages(value: unknown): LangfuseObservation[] {
  const decoded = _jsonDecodedValue(value);
  const root = _asRecord(decoded);
  const rawMessages = Array.isArray(decoded)
    ? decoded
    : root && Array.isArray(root.messages)
      ? root.messages
      : root && Array.isArray(root.input)
        ? root.input
        : [];
  return rawMessages
    .map(_asRecord)
    .filter((row): row is LangfuseObservation => Boolean(row));
}

function _assistantOutputText(value: unknown): string {
  const decoded = _jsonDecodedValue(value);
  const root = _asRecord(decoded);
  if (root) {
    if (_firstString(root.role) === "assistant" && root.content !== undefined) {
      return _textFromValue(root.content);
    }
    const choices = Array.isArray(root.choices) ? root.choices : [];
    const firstChoice = _asRecord(choices[0]);
    const message = _asRecord(firstChoice?.message);
    if (message?.content !== undefined) {
      return _textFromValue(message.content);
    }
  }
  return _textFromValue(decoded);
}

function _appendUserMessage(messages: Message[], text: string): void {
  const last = messages[messages.length - 1];
  if (last?.role === "user" && _messageText(last.content) === text) {
    return;
  }
  messages.push({
    id: uuid(),
    role: "user",
    content: [{ type: "text", text }],
  });
}

function _argumentsFromValue(value: unknown): Record<string, unknown> {
  const decoded = _jsonDecodedValue(value);
  const record = _asRecord(decoded);
  if (record) {
    return record;
  }
  return decoded === undefined ? {} : { value: decoded };
}

function _usageFromRow(row: LangfuseObservation): ModelUsage | null {
  const usage = _asRecord(row.usageDetails) ?? _asRecord(row.usage) ?? row;
  const cost = _asRecord(row.costDetails) ?? _asRecord(row.cost) ?? row;
  const input = _numberFromKeys(
    usage,
    "input",
    "inputTokens",
    "promptTokens",
    "inputUsage"
  );
  const output = _numberFromKeys(
    usage,
    "output",
    "outputTokens",
    "completionTokens",
    "outputUsage"
  );
  const cacheRead = _numberFromKeys(usage, "cacheRead", "cache_read");
  const cacheWrite = _numberFromKeys(usage, "cacheWrite", "cache_write");
  const totalTokens =
    _numberFromKeys(
      usage,
      "total",
      "totalTokens",
      "total_tokens",
      "totalUsage"
    ) || input + output + cacheRead + cacheWrite;
  const modelUsage: ModelUsage = {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens,
    cost: {
      input: _numberFromKeys(cost, "input", "inputCost"),
      output: _numberFromKeys(cost, "output", "outputCost"),
      cacheRead: _numberFromKeys(cost, "cacheRead", "cache_read"),
      cacheWrite: _numberFromKeys(cost, "cacheWrite", "cache_write"),
      total:
        _numberFromKeys(cost, "total", "totalCost", "total_cost") ||
        _finiteNumber(row.totalCost),
    },
  };
  const hasUsage =
    modelUsage.input > 0 ||
    modelUsage.output > 0 ||
    modelUsage.cacheRead > 0 ||
    modelUsage.cacheWrite > 0 ||
    modelUsage.totalTokens > 0 ||
    modelUsage.cost.total > 0;
  return hasUsage ? modelUsage : null;
}

function _aggregateRowsUsage(
  rows: LangfuseObservation[]
): ModelUsage | undefined {
  return _aggregateUsages(
    rows.map(_usageFromRow).filter(Boolean) as ModelUsage[]
  );
}

function _aggregateMessageUsage(messages: Message[]): ModelUsage | undefined {
  return _aggregateUsages(
    messages.flatMap((message) =>
      message.role === "assistant" && message.usage ? [message.usage] : []
    )
  );
}

function _aggregateUsages(usages: ModelUsage[]): ModelUsage | undefined {
  if (usages.length === 0) {
    return undefined;
  }
  return usages.reduce<ModelUsage>(
    (total, usage) => ({
      input: total.input + usage.input,
      output: total.output + usage.output,
      cacheRead: total.cacheRead + usage.cacheRead,
      cacheWrite: total.cacheWrite + usage.cacheWrite,
      totalTokens: total.totalTokens + usage.totalTokens,
      cost: {
        input: total.cost.input + usage.cost.input,
        output: total.cost.output + usage.cost.output,
        cacheRead: total.cost.cacheRead + usage.cost.cacheRead,
        cacheWrite: total.cost.cacheWrite + usage.cost.cacheWrite,
        total: total.cost.total + usage.cost.total,
      },
    }),
    {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    }
  );
}

function _numberFromKeys(
  record: Record<string, unknown> | undefined,
  ...keys: string[]
): number {
  if (!record) {
    return 0;
  }
  for (const key of keys) {
    const value = _finiteNumber(record[key]);
    if (value > 0) {
      return value;
    }
  }
  return 0;
}

function _finiteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
}

function _isGenerationRow(row: LangfuseObservation): boolean {
  return (
    typeof row.type === "string" && row.type.toUpperCase() === "GENERATION"
  );
}

function _rowIsError(row: LangfuseObservation): boolean {
  const level = (
    _firstString(row.level, row.statusMessage, row.status) ?? ""
  ).toLowerCase();
  return (
    level.includes("error") ||
    Boolean(row.error) ||
    Boolean(row.errorMessage) ||
    Boolean(row.statusMessage && level !== "success")
  );
}

function _sortRows(rows: LangfuseObservation[]): LangfuseObservation[] {
  return rows
    .slice()
    .sort(
      (a, b) => _timeValue(_rowStartTime(a)) - _timeValue(_rowStartTime(b))
    );
}

function _titleFromRows(traceId: string, rows: LangfuseObservation[]): string {
  return (
    _firstString(
      ...rows.map((row) => row.traceName),
      ...rows.map((row) => row.trace_name),
      ...rows.map((row) => _asRecord(row.trace)?.name),
      ...rows.map((row) => row.name)
    ) ?? `Trace ${traceId.slice(0, 8)}`
  );
}

function _rowStartTime(row: LangfuseObservation): string | undefined {
  return _firstString(
    row.startTime,
    row.start_time,
    row.timestamp,
    row.createdAt
  );
}

function _rowEndTime(row: LangfuseObservation): string | undefined {
  return _firstString(row.endTime, row.end_time, row.updatedAt);
}

function _minDate(values: (string | undefined)[]): string | undefined {
  const sorted = values
    .filter(Boolean)
    .sort((a, b) => _timeValue(a) - _timeValue(b));
  return sorted[0];
}

function _maxDate(values: (string | undefined)[]): string | undefined {
  const sorted = values
    .filter(Boolean)
    .sort((a, b) => _timeValue(b) - _timeValue(a));
  return sorted[0];
}

function _timeValue(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function _jsonDecodedValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }
  if (!/^[{["]/.exec(trimmed)) {
    return value;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function _textFromJsonWrapper(text: string): string {
  const decoded = _jsonDecodedValue(text);
  if (decoded === text) {
    return text;
  }
  if (typeof decoded === "string") {
    return decoded;
  }
  const record = _asRecord(decoded);
  if (
    record &&
    (record.content !== undefined ||
      record.text !== undefined ||
      Array.isArray(record.choices))
  ) {
    return _textFromValue(decoded);
  }
  if (Array.isArray(decoded) && decoded.some(_looksLikeTextContentRecord)) {
    return _textFromValue(decoded);
  }
  return text;
}

function _looksLikeTextContentRecord(value: unknown): boolean {
  const record = _asRecord(value);
  return Boolean(record?.text !== undefined || record?.content !== undefined);
}

function _textFromValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    const decoded = _jsonDecodedValue(value);
    return decoded === value ? value : _textFromValue(decoded);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const record = _asRecord(item);
        return record?.text !== undefined
          ? _textFromValue(record.text)
          : record?.content !== undefined
            ? _textFromValue(record.content)
            : _textFromValue(item);
      })
      .filter(Boolean)
      .join("\n");
  }
  const record = _asRecord(value);
  if (record?.text !== undefined) {
    return _textFromValue(record.text);
  }
  if (record?.content !== undefined) {
    return _textFromValue(record.content);
  }
  return JSON.stringify(value, null, 2);
}

function _messageText(content: Message["content"]): string {
  return content
    .map((item) => (item.type === "text" ? item.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function _slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "trace"
  );
}

function _safeSegment(segment: string): string {
  if (segment.includes("/") || segment.includes("\\") || segment === "..") {
    throw new Error(`Invalid trace path segment: ${segment}`);
  }
  return segment;
}

function _shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function _firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function _asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

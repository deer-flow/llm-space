import type {
  TraceLangfuseSearchInput,
  TraceRemoteTraceSummary,
} from "../../shared/traces";

export type LangfuseObservation = Record<string, unknown>;

export interface LangfuseConnectionConfig {
  baseUrl: string;
  publicKey: string;
  secretKey: string;
}

export interface LangfuseProjectInfo {
  projectId?: string;
  projectName?: string;
}

export interface LangfuseObservationFetchResult {
  rows: LangfuseObservation[];
  truncated: boolean;
  pageCount: number;
  maxPages: number;
}

interface LangfuseTraceRow {
  id?: unknown;
  name?: unknown;
  timestamp?: unknown;
  userId?: unknown;
  sessionId?: unknown;
  version?: unknown;
  release?: unknown;
  environment?: unknown;
  tags?: unknown;
  observations?: unknown;
  totalCost?: unknown;
}

type LangfuseTraceFilter =
  | {
      type: "string";
      column: "id" | "name" | "userId" | "sessionId" | "version" | "release";
      operator: "=" | "contains";
      value: string;
    }
  | {
      type: "datetime";
      column: "timestamp";
      operator: ">=" | "<";
      value: string;
    }
  | {
      type: "arrayOptions";
      column: "tags";
      operator: "all of";
      value: string[];
    }
  | {
      type: "stringOptions";
      column: "environment";
      operator: "any of";
      value: string[];
    };

const OBSERVATION_FIELDS =
  "core,basic,time,io,model,usage,trace_context,metrics";
// Langfuse v2 observations return input/output as raw strings. The old
// `parseIoAsJson=true` parameter now returns 400, so TraceManager decodes
// JSON-shaped strings locally before building the editable workbench.
const TRACE_LIST_FIELDS = "core,metrics";
const DEFAULT_REMOTE_TRACE_LIMIT = 50;
const MAX_REMOTE_TRACE_LIMIT = 100;
const MAX_OBSERVATION_PAGES = 5;
const OBSERVATION_PAGE_LIMIT = 1000;
const TRACE_SEARCH_QUERY_COLUMNS = [
  "id",
  "name",
  "userId",
  "sessionId",
] as const;
const TRACE_ORDER_FIELDS = [
  "id",
  "timestamp",
  "name",
  "userId",
  "release",
  "version",
  "public",
  "bookmarked",
  "sessionId",
] as const;
const TRACE_ORDER_DIRECTIONS = ["asc", "desc"] as const;

/**
 * Tiny Bun-side Langfuse Public API client. It owns Basic Auth and redacted
 * errors so the renderer never receives raw credentials or auth headers.
 */
export class LangfuseClient {
  private readonly _baseUrl: string;
  private readonly _authorization: string;

  constructor(config: LangfuseConnectionConfig) {
    this._baseUrl = normalizeLangfuseBaseUrl(config.baseUrl);
    this._authorization = `Basic ${Buffer.from(
      `${config.publicKey}:${config.secretKey}`
    ).toString("base64")}`;
  }

  /** Validate credentials and return the project visible to the API key. */
  async getProject(): Promise<LangfuseProjectInfo> {
    const body = await this._getJson("/api/public/projects");
    const first = _firstDataRecord(body);
    return {
      projectId: _firstString(first?.id, first?.projectId),
      projectName: _firstString(first?.name, first?.projectName),
    };
  }

  /**
   * Return a bounded remote trace list using Langfuse's trace-list filters.
   * The free-text query is expanded into separate id/name/user/session filters
   * because the public API exposes column filters rather than a global search.
   */
  async searchTraces(
    input: TraceLangfuseSearchInput = {}
  ): Promise<TraceRemoteTraceSummary[]> {
    const filters = _normalizeTraceSearchInput(input);
    const baseFilters = _traceFiltersFromSearchInput(filters);
    const query = filters.query;
    const queryFilters = query
      ? TRACE_SEARCH_QUERY_COLUMNS.map((column): LangfuseTraceFilter => ({
          type: "string",
          column,
          operator: "contains",
          value: query,
        }))
      : [null];
    const results = await Promise.all(
      queryFilters.map((queryFilter) =>
        this._listTraces({
          filters: queryFilter ? [...baseFilters, queryFilter] : baseFilters,
          limit: filters.limit ?? DEFAULT_REMOTE_TRACE_LIMIT,
          orderBy: filters.orderBy,
        })
      )
    );
    return _sortTraceSummaries(
      _dedupeTraceSummaries(results.flat()),
      filters.orderBy
    ).slice(0, filters.limit ?? DEFAULT_REMOTE_TRACE_LIMIT);
  }

  private async _listTraces({
    filters,
    limit,
    orderBy,
  }: {
    filters: LangfuseTraceFilter[];
    limit: number;
    orderBy: string;
  }): Promise<TraceRemoteTraceSummary[]> {
    const url = new URL(`${this._baseUrl}/api/public/traces`);
    url.searchParams.set("fields", TRACE_LIST_FIELDS);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("orderBy", orderBy);
    if (filters.length > 0) {
      url.searchParams.set("filter", JSON.stringify(filters));
    }
    const body = await this._getJson(url);
    const rows = Array.isArray(_asRecord(body)?.data)
      ? (_asRecord(body)?.data as unknown[])
      : [];
    return rows
      .map((row) => _traceSummaryFromRow(_asRecord(row)))
      .filter((row): row is TraceRemoteTraceSummary => row !== null);
  }

  /** Fetch all observations for a remote trace id, bounded for V1 safety. */
  async getObservationsForTrace(
    traceId: string
  ): Promise<LangfuseObservationFetchResult> {
    const rows: LangfuseObservation[] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    for (let page = 0; page < MAX_OBSERVATION_PAGES; page += 1) {
      pageCount = page + 1;
      const url = new URL(`${this._baseUrl}/api/public/v2/observations`);
      url.searchParams.set("fields", OBSERVATION_FIELDS);
      url.searchParams.set("limit", String(OBSERVATION_PAGE_LIMIT));
      url.searchParams.set("traceId", traceId);
      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }
      const body = await this._getJson(url);
      const data = _asRecord(body)?.data;
      if (Array.isArray(data)) {
        rows.push(
          ...data
            .map(_asRecord)
            .filter((row): row is LangfuseObservation => Boolean(row))
        );
      }
      cursor = _firstString(
        _asRecord(_asRecord(body)?.meta)?.nextCursor,
        _asRecord(_asRecord(body)?.meta)?.cursor,
        _asRecord(body)?.nextCursor
      );
      if (!cursor) {
        break;
      }
    }
    return {
      rows,
      truncated: Boolean(cursor),
      pageCount,
      maxPages: MAX_OBSERVATION_PAGES,
    };
  }

  private async _getJson(input: string | URL): Promise<unknown> {
    const url = typeof input === "string" ? `${this._baseUrl}${input}` : input;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          accept: "application/json",
          authorization: this._authorization,
        },
      });
    } catch (error) {
      throw new Error(_redactedFetchError(error), { cause: error });
    }
    if (!response.ok) {
      throw new Error(await _redactedHttpError(response));
    }
    try {
      return await response.json();
    } catch {
      throw new Error("Langfuse returned a non-JSON response.");
    }
  }
}

export function normalizeLangfuseBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Langfuse base URL is required.");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Langfuse base URL must be a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Langfuse base URL must start with http:// or https://.");
  }
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

export function previewSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 10) {
    return trimmed ? `${trimmed.slice(0, 2)}...` : "";
  }
  return `${trimmed.slice(0, 5)}...${trimmed.slice(-4)}`;
}

function _normalizeTraceSearchInput(
  input: TraceLangfuseSearchInput
): Required<Pick<TraceLangfuseSearchInput, "limit" | "orderBy">> &
  Omit<TraceLangfuseSearchInput, "limit" | "orderBy"> {
  return {
    ...(_cleanString(input.id) ? { id: _cleanString(input.id) } : {}),
    ...(_cleanString(input.query) ? { query: _cleanString(input.query) } : {}),
    ...(_cleanString(input.name) ? { name: _cleanString(input.name) } : {}),
    ...(_cleanString(input.userId)
      ? { userId: _cleanString(input.userId) }
      : {}),
    ...(_cleanString(input.sessionId)
      ? { sessionId: _cleanString(input.sessionId) }
      : {}),
    ...(_cleanString(input.version)
      ? { version: _cleanString(input.version) }
      : {}),
    ...(_cleanString(input.release)
      ? { release: _cleanString(input.release) }
      : {}),
    ...(_cleanStringList(input.tags).length > 0
      ? { tags: _cleanStringList(input.tags) }
      : {}),
    ...(_cleanStringList(input.environment).length > 0
      ? { environment: _cleanStringList(input.environment) }
      : {}),
    ...(_cleanTimestamp(input.fromTimestamp, "From timestamp")
      ? {
          fromTimestamp: _cleanTimestamp(input.fromTimestamp, "From timestamp"),
        }
      : {}),
    ...(_cleanTimestamp(input.toTimestamp, "To timestamp")
      ? { toTimestamp: _cleanTimestamp(input.toTimestamp, "To timestamp") }
      : {}),
    limit: _boundedTraceLimit(input.limit),
    orderBy: _cleanOrderBy(input.orderBy),
  };
}

function _traceFiltersFromSearchInput(
  input: TraceLangfuseSearchInput
): LangfuseTraceFilter[] {
  const filters: LangfuseTraceFilter[] = [];
  _pushStringFilter(filters, "id", input.id);
  _pushStringFilter(filters, "name", input.name);
  _pushStringFilter(filters, "userId", input.userId);
  _pushStringFilter(filters, "sessionId", input.sessionId);
  _pushStringFilter(filters, "version", input.version);
  _pushStringFilter(filters, "release", input.release);
  if (input.tags && input.tags.length > 0) {
    filters.push({
      type: "arrayOptions",
      column: "tags",
      operator: "all of",
      value: input.tags,
    });
  }
  if (input.environment && input.environment.length > 0) {
    filters.push({
      type: "stringOptions",
      column: "environment",
      operator: "any of",
      value: input.environment,
    });
  }
  if (input.fromTimestamp) {
    filters.push({
      type: "datetime",
      column: "timestamp",
      operator: ">=",
      value: input.fromTimestamp,
    });
  }
  if (input.toTimestamp) {
    filters.push({
      type: "datetime",
      column: "timestamp",
      operator: "<",
      value: input.toTimestamp,
    });
  }
  return filters;
}

function _pushStringFilter(
  filters: LangfuseTraceFilter[],
  column: Extract<LangfuseTraceFilter, { type: "string" }>["column"],
  value: string | undefined
): void {
  if (!value) {
    return;
  }
  filters.push({ type: "string", column, operator: "=", value });
}

function _dedupeTraceSummaries(
  traces: TraceRemoteTraceSummary[]
): TraceRemoteTraceSummary[] {
  const byId = new Map<string, TraceRemoteTraceSummary>();
  for (const trace of traces) {
    byId.set(trace.id, trace);
  }
  return [...byId.values()];
}

function _sortTraceSummaries(
  traces: TraceRemoteTraceSummary[],
  orderBy: string
): TraceRemoteTraceSummary[] {
  const [field, direction] = orderBy.split(".");
  const multiplier = direction === "asc" ? 1 : -1;
  return [...traces].sort((left, right) => {
    const result = _compareTraceSummaryField(left, right, field);
    return result === 0 ? left.id.localeCompare(right.id) : result * multiplier;
  });
}

function _compareTraceSummaryField(
  left: TraceRemoteTraceSummary,
  right: TraceRemoteTraceSummary,
  field: string
): number {
  if (field === "timestamp") {
    return (
      _timestampMs(left.timestamp) - _timestampMs(right.timestamp) ||
      left.id.localeCompare(right.id)
    );
  }
  const leftValue = _traceSummaryStringField(left, field);
  const rightValue = _traceSummaryStringField(right, field);
  return leftValue.localeCompare(rightValue);
}

function _traceSummaryStringField(
  trace: TraceRemoteTraceSummary,
  field: string
): string {
  if (field === "id") {
    return trace.id;
  }
  if (field === "name") {
    return trace.name ?? "";
  }
  if (field === "userId") {
    return trace.userId ?? "";
  }
  if (field === "sessionId") {
    return trace.sessionId ?? "";
  }
  if (field === "version") {
    return trace.version ?? "";
  }
  if (field === "release") {
    return trace.release ?? "";
  }
  return "";
}

function _timestampMs(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function _cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function _cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map(_cleanString).filter(Boolean) as string[])];
}

function _cleanTimestamp(
  value: unknown,
  label: "From timestamp" | "To timestamp"
): string | undefined {
  const trimmed = _cleanString(value);
  if (!trimmed) {
    return undefined;
  }
  if (Number.isNaN(Date.parse(trimmed))) {
    throw new Error(`${label} must be a valid ISO date/time.`);
  }
  return trimmed;
}

function _boundedTraceLimit(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : DEFAULT_REMOTE_TRACE_LIMIT;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_REMOTE_TRACE_LIMIT;
  }
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_REMOTE_TRACE_LIMIT);
}

function _cleanOrderBy(value: unknown): string {
  const trimmed = _cleanString(value) ?? "timestamp.desc";
  const [field, direction] = trimmed.split(".");
  if (
    TRACE_ORDER_FIELDS.some((candidate) => candidate === field) &&
    TRACE_ORDER_DIRECTIONS.some((candidate) => candidate === direction)
  ) {
    return trimmed;
  }
  throw new Error("Unsupported Langfuse trace sort order.");
}

function _firstDataRecord(value: unknown): Record<string, unknown> | undefined {
  const root = _asRecord(value);
  const data = root?.data;
  if (Array.isArray(data)) {
    return _asRecord(data[0]);
  }
  return _asRecord(data) ?? root;
}

function _traceSummaryFromRow(
  row: (LangfuseTraceRow & Record<string, unknown>) | undefined
): TraceRemoteTraceSummary | null {
  const id = _firstString(row?.id);
  if (!id) {
    return null;
  }
  const observations = Array.isArray(row?.observations)
    ? row.observations.length
    : _finiteNumber(row?.observationCount);
  return {
    id,
    ...(_firstString(row?.name) ? { name: _firstString(row?.name) } : {}),
    ...(_firstString(row?.timestamp) || _firstString(row?.createdAt)
      ? { timestamp: _firstString(row?.timestamp, row?.createdAt) }
      : {}),
    ...(_firstString(row?.userId) ? { userId: _firstString(row?.userId) } : {}),
    ...(_firstString(row?.sessionId)
      ? { sessionId: _firstString(row?.sessionId) }
      : {}),
    ...(_firstString(row?.version)
      ? { version: _firstString(row?.version) }
      : {}),
    ...(_firstString(row?.release)
      ? { release: _firstString(row?.release) }
      : {}),
    ...(_firstString(row?.environment)
      ? { environment: _firstString(row?.environment) }
      : {}),
    ...(_stringArray(row?.tags).length > 0
      ? { tags: _stringArray(row?.tags) }
      : {}),
    ...(observations > 0 ? { observationCount: observations } : {}),
    ...(_finiteNumber(row?.totalCost) > 0
      ? { totalCost: _finiteNumber(row?.totalCost) }
      : {}),
  };
}

async function _redactedHttpError(response: Response): Promise<string> {
  const status = response.status;
  if (status === 401) {
    return "Langfuse rejected the API keys (401 Unauthorized).";
  }
  if (status === 403) {
    return "Langfuse API keys do not have access to this project (403 Forbidden).";
  }
  if (status === 404) {
    return "Langfuse endpoint was not found. Check the base URL.";
  }
  let message = "";
  try {
    const body = (await response.json()) as unknown;
    const record = _asRecord(body);
    message = _firstString(record?.message, record?.error) ?? "";
  } catch {
    // Ignore non-JSON error bodies; status text is enough.
  }
  return `Langfuse request failed (${status})${message ? `: ${message}` : "."}`;
}

function _redactedFetchError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Network failure";
  return `Could not reach Langfuse: ${message}`;
}

function _asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function _firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function _stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
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

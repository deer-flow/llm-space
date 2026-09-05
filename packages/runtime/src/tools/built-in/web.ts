import type { BuiltinTool, SearchSettings } from "@llm-space/core";

import type { ToolEntry } from "../tool-registry";

export interface WebBuiltInToolsDependencies {
  env: Readonly<Record<string, string | undefined>>;
  getSearchSettings: () => SearchSettings;
}

const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev";
const TAVILY_BASE_URL = "https://api.tavily.com";
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const ANYSEARCH_MCP_URL = "https://api.anysearch.com/mcp";
const ZHIHU_MCP_SSE_URL =
  "https://developer.zhihu.com/api/mcp/zhihu_search/v1/sse";

/** Overall deadline for one MCP search round-trip (handshake included). */
const MCP_REQUEST_TIMEOUT_MS = 30_000;

interface WebFetchResult {
  url: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
  content?: string;
}

/**
 * A search backend for the built-in web tools. `fetch` reads one page as
 * markdown; `search` returns ranked web results.
 */
interface SearchProvider {
  fetch(url: string): Promise<WebFetchResult>;
  search(
    query: string,
    limit: number,
    includeContent: boolean
  ): Promise<WebSearchResult[]>;
}

interface FirecrawlScrapeResponse {
  success?: boolean;
  data?: {
    markdown?: string;
    html?: string;
    metadata?: Record<string, unknown>;
  };
  error?: string;
}

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: {
    web?: {
      title?: string;
      url?: string;
      description?: string;
      markdown?: string;
      html?: string;
      metadata?: Record<string, unknown>;
    }[];
  };
  error?: string;
}

interface TavilySearchResponse {
  results?: {
    title?: string;
    url?: string;
    content?: string;
    raw_content?: string;
  }[];
}

interface TavilyExtractResponse {
  results?: {
    url?: string;
    raw_content?: string;
  }[];
  failed_results?: {
    url?: string;
    error?: string;
  }[];
}

interface BraveSearchResponse {
  web?: {
    results?: {
      title?: string;
      url?: string;
      description?: string;
      extra_snippets?: string[];
    }[];
  };
  error?: {
    detail?: string;
  };
  message?: string;
  detail?: string;
}

function _truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars) + "\n\n[Content truncated]";
}

/** Resolve a `$VAR` reference from the environment; pass literals through. */
function _resolveApiKey(
  value: string,
  env: WebBuiltInToolsDependencies["env"]
): string {
  if (value.startsWith("$")) {
    return env[value.slice(1)] ?? "";
  }
  return value;
}

/**
 * Firecrawl-backed provider. Sends an `Authorization` header when a key is
 * configured; without one the free, unauthenticated tier still works (and
 * surfaces Firecrawl's daily-limit error, which the renderer turns into a
 * friendly dialog).
 */
class FirecrawlSearchProvider implements SearchProvider {
  constructor(private readonly _apiKey: string) {}

  private _headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this._apiKey) {
      headers.Authorization = `Bearer ${this._apiKey}`;
    }
    return headers;
  }

  async fetch(url: string): Promise<WebFetchResult> {
    const res = await fetch(`${FIRECRAWL_BASE_URL}/v2/scrape`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });

    const json = (await res.json()) as FirecrawlScrapeResponse;

    if (!res.ok || json.error) {
      throw new Error(json.error ?? `web_fetch failed: ${res.status}`);
    }

    const data = json.data ?? {};
    const metadata = data.metadata ?? {};

    return {
      url,
      title: typeof metadata.title === "string" ? metadata.title : undefined,
      content: _truncateText(data.markdown ?? data.html ?? "", 20_000),
      metadata,
    };
  }

  async search(
    query: string,
    limit: number,
    includeContent: boolean
  ): Promise<WebSearchResult[]> {
    const res = await fetch(`${FIRECRAWL_BASE_URL}/v2/search`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({
        query,
        limit,
        scrapeOptions: {
          formats: ["markdown"],
          onlyMainContent: true,
        },
      }),
    });

    const json = (await res.json()) as FirecrawlSearchResponse;

    if (!res.ok || json.error) {
      throw new Error(json.error ?? `web_search failed: ${res.status}`);
    }

    return (json.data?.web ?? []).map((item) => ({
      title: item.title ?? "Untitled",
      url: item.url ?? "",
      snippet: item.description,
      content:
        includeContent && item.markdown
          ? _truncateText(item.markdown, 2_000)
          : undefined,
    }));
  }
}

/** Tavily-backed provider. Requires an API key (no free unauthenticated tier). */
class TavilySearchProvider implements SearchProvider {
  constructor(private readonly _apiKey: string) {
    if (!_apiKey) {
      throw new Error(
        "Tavily API key is not configured. Add one in Settings → Search."
      );
    }
  }

  private _headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this._apiKey}`,
    };
  }

  async fetch(url: string): Promise<WebFetchResult> {
    const res = await fetch(`${TAVILY_BASE_URL}/extract`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({ urls: url, format: "markdown" }),
    });

    const json = (await res.json()) as TavilyExtractResponse;

    if (!res.ok) {
      throw new Error(`web_fetch failed: ${res.status}`);
    }

    const result = json.results?.[0];
    if (!result?.raw_content) {
      const failure = json.failed_results?.[0];
      throw new Error(
        failure?.error ?? `web_fetch failed: could not extract ${url}`
      );
    }

    return {
      url: result.url ?? url,
      content: _truncateText(result.raw_content, 20_000),
    };
  }

  async search(
    query: string,
    limit: number,
    includeContent: boolean
  ): Promise<WebSearchResult[]> {
    const res = await fetch(`${TAVILY_BASE_URL}/search`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({
        query,
        max_results: limit,
        include_raw_content: includeContent ? "markdown" : false,
      }),
    });

    const json = (await res.json()) as TavilySearchResponse;

    if (!res.ok) {
      throw new Error(`web_search failed: ${res.status}`);
    }

    return (json.results ?? []).map((item) => ({
      title: item.title ?? "Untitled",
      url: item.url ?? "",
      snippet: item.content,
      content:
        includeContent && item.raw_content
          ? _truncateText(item.raw_content, 2_000)
          : undefined,
    }));
  }
}

/**
 * Brave-backed web search. Brave does not expose a single-page extraction
 * endpoint, so `web_fetch` delegates to Firecrawl instead of fetching arbitrary
 * URLs from the trusted Bun process, which would widen the tool's SSRF surface.
 */
class BraveSearchProvider implements SearchProvider {  constructor(
    private readonly _apiKey: string,
    private readonly _fetchProvider: SearchProvider
  ) {
    if (!_apiKey) {
      throw new Error(
        "Brave Search API key is not configured. Add one in Settings → Search."
      );
    }
  }

  fetch(url: string): Promise<WebFetchResult> {
    return this._fetchProvider.fetch(url);
  }

  async search(
    query: string,
    limit: number,
    includeContent: boolean
  ): Promise<WebSearchResult[]> {
    const url = new URL(BRAVE_SEARCH_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.max(1, Math.min(20, limit))));
    url.searchParams.set("text_decorations", "false");
    if (includeContent) {
      url.searchParams.set("extra_snippets", "true");
    }

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this._apiKey,
      },
    });
    const json = (await res.json()) as BraveSearchResponse;

    if (!res.ok) {
      throw new Error(
        json.error?.detail ??
          json.message ??
          json.detail ??
          `web_search failed: ${res.status}`
      );
    }

    return (json.web?.results ?? []).map((item) => {
      const snippets = [item.description, ...(item.extra_snippets ?? [])]
        .filter((value): value is string => Boolean(value))
        .join("\n\n");
      return {
        title: item.title ?? "Untitled",
        url: item.url ?? "",
        snippet: item.description,
        content:
          includeContent && snippets
            ? _truncateText(snippets, 2_000)
            : undefined,
      };
    });
  }
}

// -- MCP-backed providers -----------------------------------------------------
//
// Exa, AnySearch, and Zhihu expose search through the Model Context Protocol
// instead of a plain REST endpoint. Exa and AnySearch speak the Streamable
// HTTP transport; Zhihu's official server speaks the older SSE transport.
// The client below is intentionally minimal: initialize handshake, one
// tools/call per search, and the session bookkeeping each transport requires.

interface McpToolResult {
  isError?: boolean;
  content?: {
    type?: string;
    text?: string;
  }[];
}

/** Join the text blocks of an MCP tools/call result. */
function _mcpResultText(result: McpToolResult): string {
  return (result.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join("\n\n");
}

/** Split an SSE byte stream into `event`/`data` frames. */
async function* _sseEvents(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const FRAME_BOUNDARY = /\r?\n\r?\n/;
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let match = FRAME_BOUNDARY.exec(buffer);
    while (match) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) {
          event = line.slice("event:".length).trim();
        } else if (line.startsWith("data:")) {
          data.push(line.slice("data:".length).trimStart());
        }
      }
      if (data.length > 0) {
        yield { event, data: data.join("\n") };
      }
      match = FRAME_BOUNDARY.exec(buffer);
    }
  }
}

interface McpSearchProviderOptions {
  /** Human-facing label for error messages, e.g. "Exa". */
  label: string;
  toolName: string;
  buildArguments: (
    query: string,
    limit: number,
    includeContent: boolean
  ) => Record<string, unknown>;
  parseResults: (text: string, includeContent: boolean) => WebSearchResult[];
  /**
   * None of the three MCP servers exposes a safe single-page extraction
   * endpoint, so `web_fetch` delegates to Firecrawl like the Brave provider.
   */
  fetchDelegate: (url: string) => Promise<WebFetchResult>;
}

/**
 * Map a clamped result count onto each server's argument convention; all three
 * MCP search tools accept 1-10 results.
 */
function _clampedLimit(limit: number): number {
  return Math.max(1, Math.min(10, Math.round(limit)));
}

/**
 * Minimal MCP client over the Streamable HTTP transport. Handles both JSON
 * and SSE-framed responses plus optional `mcp-session-id` session affinity
 * (Exa issues one; AnySearch is stateless).
 */
class McpStreamableHttpSearchProvider implements SearchProvider {
  private _sessionId: string | null = null;
  private _nextId = 1;

  constructor(
    private readonly _url: string,
    private readonly _headers: Record<string, string>,
    private readonly _options: McpSearchProviderOptions
  ) {}

  private _requestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      ...this._headers,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this._sessionId) {
      headers["mcp-session-id"] = this._sessionId;
    }
    return headers;
  }

  private async _post(body: Record<string, unknown>): Promise<Response> {
    return fetch(this._url, {
      method: "POST",
      headers: this._requestHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MCP_REQUEST_TIMEOUT_MS),
    });
  }

  /** Send a JSON-RPC request and resolve its matching response. */
  private async _rpc(
    method: string,
    params?: Record<string, unknown>
  ): Promise<McpToolResult> {
    const id = this._nextId++;
    const res = await this._post({ jsonrpc: "2.0", id, method, params });
    if (!res.ok) {
      throw new Error(
        `web_search failed: ${this._options.label} MCP returned ${res.status}`
      );
    }
    const session = res.headers.get("mcp-session-id");
    if (session) {
      this._sessionId = session;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      const json = (await res.json()) as {
        result?: McpToolResult;
        error?: { message?: string };
      };
      if (json.error) {
        throw new Error(
          json.error.message ??
            `web_search failed: ${this._options.label} MCP error`
        );
      }
      return json.result ?? {};
    }

    if (!res.body) {
      throw new Error(`web_search failed: ${this._options.label} MCP stream`);
    }
    for await (const event of _sseEvents(res.body)) {
      if (event.event !== "message") {
        continue;
      }
      const parsed = JSON.parse(event.data) as {
        id?: number;
        result?: McpToolResult;
        error?: { message?: string };
      };
      if (parsed.id !== id) {
        continue;
      }
      if (parsed.error) {
        throw new Error(
          parsed.error.message ??
            `web_search failed: ${this._options.label} MCP error`
        );
      }
      return parsed.result ?? {};
    }
    throw new Error(
      `web_search failed: ${this._options.label} MCP stream ended early`
    );
  }

  private _initialized = false;

  private async _ensureInitialized(): Promise<void> {
    if (this._initialized) {
      return;
    }
    await this._rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "llm-space", version: "1.0.0" },
    });
    // The initialized notification has no id; servers reply 202/empty.
    await this._post({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    this._initialized = true;
  }

  async fetch(url: string): Promise<WebFetchResult> {
    return this._options.fetchDelegate(url);
  }

  async search(
    query: string,
    limit: number,
    includeContent: boolean
  ): Promise<WebSearchResult[]> {
    await this._ensureInitialized();
    const result = await this._rpc("tools/call", {
      name: this._options.toolName,
      arguments: this._options.buildArguments(query, limit, includeContent),
    });
    if (result.isError) {
      throw new Error(
        _mcpResultText(result) ||
          `web_search failed: ${this._options.label} MCP error`
      );
    }
    return this._options.parseResults(_mcpResultText(result), includeContent);
  }
}

/**
 * Minimal MCP client over the legacy SSE transport (Zhihu). The client opens
 * one authenticated SSE stream, learns the per-session message endpoint from
 * the server's `endpoint` event, POSTs JSON-RPC messages there, and reads the
 * matching responses back off the stream.
 */
class McpSseSearchProvider implements SearchProvider {
  constructor(
    private readonly _sseUrl: string,
    private readonly _headers: Record<string, string>,
    private readonly _options: McpSearchProviderOptions
  ) {}

  private async _postMessage(
    messageUrl: string,
    body: Record<string, unknown>
  ): Promise<void> {
    const res = await fetch(messageUrl, {
      method: "POST",
      headers: {
        ...this._headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MCP_REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(
        `web_search failed: ${this._options.label} MCP returned ${res.status}`
      );
    }
  }

  async fetch(url: string): Promise<WebFetchResult> {
    return this._options.fetchDelegate(url);
  }

  async search(
    query: string,
    limit: number,
    includeContent: boolean
  ): Promise<WebSearchResult[]> {
    const streamRes = await fetch(this._sseUrl, {
      headers: { ...this._headers, Accept: "text/event-stream" },
      signal: AbortSignal.timeout(MCP_REQUEST_TIMEOUT_MS),
    });
    if (!streamRes.ok || !streamRes.body) {
      throw new Error(
        `web_search failed: ${this._options.label} MCP returned ${streamRes.status}`
      );
    }

    const events = _sseEvents(streamRes.body);
    let messageUrl: string | null = null;
    while (messageUrl === null) {
      const next = await events.next();
      if (next.done) {
        throw new Error(
          `web_search failed: ${this._options.label} MCP stream ended before the endpoint event`
        );
      }
      if (next.value.event === "endpoint") {
        messageUrl = new URL(next.value.data, this._sseUrl).href;
      }
    }

    // Read helper: consume stream events until the response with `id` arrives.
    const waitFor = async (id: number): Promise<McpToolResult> => {
      while (true) {
        const next = await events.next();
        if (next.done) {
          throw new Error(
            `web_search failed: ${this._options.label} MCP stream ended early`
          );
        }
        if (next.value.event !== "message") {
          continue;
        }
        const parsed = JSON.parse(next.value.data) as {
          id?: number;
          result?: McpToolResult;
          error?: { message?: string };
        };
        if (parsed.id !== id) {
          continue;
        }
        if (parsed.error) {
          throw new Error(
            parsed.error.message ??
              `web_search failed: ${this._options.label} MCP error`
          );
        }
        return parsed.result ?? {};
      }
    };

    await this._postMessage(messageUrl, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "llm-space", version: "1.0.0" },
      },
    });
    await waitFor(1);
    await this._postMessage(messageUrl, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    await this._postMessage(messageUrl, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: this._options.toolName,
        arguments: this._options.buildArguments(query, limit, includeContent),
      },
    });
    const result = await waitFor(2);
    if (result.isError) {
      throw new Error(
        _mcpResultText(result) ||
          `web_search failed: ${this._options.label} MCP error`
      );
    }
    return this._options.parseResults(_mcpResultText(result), includeContent);
  }
}

/**
 * Exa returns blocks of `Title: …\nURL: …\n…\nHighlights:\n<body>` separated
 * by `---` lines.
 */
function _parseExaResults(
  text: string,
  includeContent: boolean
): WebSearchResult[] {
  return text
    .split(/\n-{3,}\n/)
    .map((block): WebSearchResult | null => {
      const title = /^Title: (.+)$/m.exec(block)?.[1]?.trim();
      const url = /^URL: (\S+)$/m.exec(block)?.[1]?.trim();
      if (!url) {
        return null;
      }
      const highlightsIndex = block.indexOf("Highlights:");
      const highlights =
        highlightsIndex === -1 ? "" : block.slice(highlightsIndex + "Highlights:".length).trim();
      return {
        title: title || "Untitled",
        url,
        snippet: highlights ? _truncateText(highlights, 300) : undefined,
        content: includeContent && highlights ? _truncateText(highlights, 2_000) : undefined,
      };
    })
    .filter((item): item is WebSearchResult => item !== null);
}

/**
 * AnySearch returns a headed list: `### 1. Title`, a `**URL**: …` bullet, and
 * a snippet bullet.
 */
function _parseAnySearchResults(text: string): WebSearchResult[] {
  const blocks = text.split(/^### \d+\. /m).slice(1);
  return blocks
    .map((block): WebSearchResult | null => {
      const lines = block.split(/\r?\n/);
      const title = lines[0]?.trim();
      const urlLine = lines.find((line) => line.includes("**URL**:"));
      const url = /\*\*URL\*\*: (\S+)/.exec(urlLine ?? "")?.[1];
      if (!title || !url) {
        return null;
      }
      const urlIndex = lines.findIndex((line) => line.includes("**URL**:"));
      const snippet =
        lines
          .slice(urlIndex + 1)
          .find((line) => line.trim().startsWith("- "))
          ?.replace(/^- /, "")
          .trim() ?? undefined;
      return {
        title,
        url,
        snippet,
        content: undefined,
      };
    })
    .filter((item): item is WebSearchResult => item !== null);
}

/**
 * Zhihu returns an XML-ish document with `<search_item title="…" url="…">`
 * elements whose text is the model-oriented snippet.
 */
function _parseZhihuResults(
  text: string,
  includeContent: boolean
): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const itemPattern = /<search_item\s+([^>]*)>([\s\S]*?)<\/search_item>/g;
  const attributePattern = /(\w+)="([^"]*)"/g;
  for (const match of text.matchAll(itemPattern)) {
    const attributes: Record<string, string> = {};
    for (const attribute of match[1].matchAll(attributePattern)) {
      attributes[attribute[1]] = attribute[2];
    }
    if (!attributes.url) {
      continue;
    }
    const snippet = match[2].trim();
    results.push({
      title: attributes.title || "Untitled",
      url: attributes.url,
      snippet: snippet || undefined,
      content: includeContent && snippet ? _truncateText(snippet, 2_000) : undefined,
    });
  }
  return results;
}

/** Build the provider selected in `settings/search.json` with its resolved key. */
function _getSearchProvider({
  env,
  getSearchSettings,
}: WebBuiltInToolsDependencies): SearchProvider {
  const settings = getSearchSettings();
  if (settings.provider === "brave") {
    return new BraveSearchProvider(
      _resolveApiKey(settings.braveApiKey, env),
      new FirecrawlSearchProvider(_resolveApiKey(settings.firecrawlApiKey, env))
    );
  }
  if (settings.provider === "tavily") {
    return new TavilySearchProvider(_resolveApiKey(settings.tavilyApiKey, env));
  }
  // MCP-backed providers keep `web_fetch` on Firecrawl's safe extraction path.
  const fetchViaFirecrawl = (url: string) =>
    new FirecrawlSearchProvider(_resolveApiKey(settings.firecrawlApiKey, env)).fetch(url);
  if (settings.provider === "exa") {
    // Exa's hosted MCP works anonymously; a key only raises rate limits.
    const apiKey = _resolveApiKey(settings.exaApiKey, env);
    return new McpStreamableHttpSearchProvider(
      EXA_MCP_URL,
      apiKey ? { "x-api-key": apiKey } : {},
      {
        label: "Exa",
        toolName: "web_search_exa",
        buildArguments: (query, limit) => ({
          query,
          numResults: _clampedLimit(limit),
        }),
        parseResults: _parseExaResults,
        fetchDelegate: fetchViaFirecrawl,
      }
    );
  }
  if (settings.provider === "anysearch") {
    // AnySearch works anonymously with lower rate limits.
    const apiKey = _resolveApiKey(settings.anysearchApiKey, env);
    return new McpStreamableHttpSearchProvider(
      ANYSEARCH_MCP_URL,
      apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      {
        label: "AnySearch",
        toolName: "search",
        buildArguments: (query, limit) => ({
          query,
          max_results: _clampedLimit(limit),
        }),
        parseResults: (text) => _parseAnySearchResults(text),
        fetchDelegate: fetchViaFirecrawl,
      }
    );
  }
  if (settings.provider === "zhihu") {
    const accessSecret = _resolveApiKey(settings.zhihuAccessSecret, env);
    if (!accessSecret) {
      throw new Error(
        "Zhihu access secret is not configured. Add one in Settings → Search."
      );
    }
    return new McpSseSearchProvider(
      ZHIHU_MCP_SSE_URL,
      { Authorization: `Bearer ${accessSecret}` },
      {
        label: "Zhihu",
        toolName: "zhihu_search",
        buildArguments: (query, limit) => ({
          query,
          count: _clampedLimit(limit),
        }),
        parseResults: _parseZhihuResults,
        fetchDelegate: fetchViaFirecrawl,
      }
    );
  }
  return new FirecrawlSearchProvider(
    _resolveApiKey(settings.firecrawlApiKey, env)
  );
}

export const webFetchTool: BuiltinTool = {
  type: "builtin",
  name: "web_fetch",
  icon: "globe",
  description:
    "Fetch one webpage and return LLM-friendly readable markdown content.",
  strict: true,
  parameters: {
    type: "object",
    required: ["url"],
    properties: {
      url: {
        type: "string",
        description:
          "The URL to fetch. Must be a fully qualified URL starting with http:// or https://.",
      },
    },
    additionalProperties: false,
  },
};

export const webSearchTool: BuiltinTool = {
  type: "builtin",
  name: "web_search",
  icon: "search",
  description: "Search the web and return LLM-friendly results.",
  strict: true,
  parameters: {
    type: "object",
    required: ["query"],
    properties: {
      query: {
        type: "string",
        description: "The search query string to look up on the web.",
      },
      limit: {
        type: "number",
        description:
          "Maximum number of search results to return. Defaults to 5.",
      },
      includeContent: {
        type: "boolean",
        description:
          "Whether to include short markdown content snippets for each result. Defaults to false.",
      },
    },
    additionalProperties: false,
  },
};

// -- weather_report -----------------------------------------------------------

interface WeatherReport {
  city: string;
  date: string;
  weather: string;
  temperature: {
    unit: "celsius";
    max: number;
    min: number;
  };
}

interface WttrResponse {
  current_condition?: {
    weatherDesc?: { value?: string }[];
  }[];
  weather?: {
    date?: string;
    maxtempC?: string;
    mintempC?: string;
    hourly?: {
      time?: string;
      weatherDesc?: { value?: string }[];
    }[];
  }[];
}

export const weatherReportTool: BuiltinTool = {
  type: "builtin",
  name: "weather_report",
  icon: "cloud-sun",
  description: "Get today's weather report for a location.",
  strict: true,
  parameters: {
    type: "object",
    required: ["location"],
    properties: {
      location: {
        type: "string",
        description: "The location to get today's weather report for.",
      },
    },
    additionalProperties: false,
  },
};

function _encodeWttrCity(city: string): string {
  return city.trim().split(/\s+/).map(encodeURIComponent).join("+");
}

function _getWeatherDescription(data: WttrResponse): string {
  const today = data.weather?.[0];

  const noon = today?.hourly?.find((item) => item.time === "1200");
  const noonDesc = noon?.weatherDesc?.[0]?.value;
  if (noonDesc) {
    return noonDesc;
  }

  const currentDesc = data.current_condition?.[0]?.weatherDesc?.[0]?.value;
  if (currentDesc) {
    return currentDesc;
  }

  return "Unknown";
}

export async function weather_report(location: string): Promise<WeatherReport> {
  const normalizedLocation = location.trim();
  if (!normalizedLocation) {
    throw new Error("location is required.");
  }
  const encodedLocation = _encodeWttrCity(normalizedLocation);

  const res = await fetch(
    `https://wttr.in/${encodedLocation}?format=j1&lang=en`,
    {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "llm-space-weather-tool/1.0",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`weather_report failed: ${res.status}`);
  }

  const data = (await res.json()) as WttrResponse;
  const today = data.weather?.[0];

  if (!today?.date || !today.maxtempC || !today.mintempC) {
    throw new Error("weather_report failed: missing today's forecast");
  }

  return {
    city: normalizedLocation,
    date: today.date,
    weather: _getWeatherDescription(data),
    temperature: {
      unit: "celsius",
      max: Number(today.maxtempC),
      min: Number(today.mintempC),
    },
  };
}

export function createWebBuiltInTools(
  dependencies: WebBuiltInToolsDependencies
): ToolEntry[] {
  return [
    {
      tool: webFetchTool,
      async execute(args: Record<string, unknown>) {
        return _getSearchProvider(dependencies).fetch(
          _requireString(args, "url")
        );
      },
    },
    {
      tool: webSearchTool,
      async execute(args: Record<string, unknown>) {
        return _getSearchProvider(dependencies).search(
          _requireString(args, "query"),
          _optionalNumber(args, "limit") ?? 5,
          _optionalBoolean(args, "includeContent") ?? false
        );
      },
    },
    {
      tool: weatherReportTool,
      async execute(args: Record<string, unknown>) {
        return weather_report(_requireString(args, "location"));
      },
    },
  ];
}

function _requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function _optionalNumber(
  args: Record<string, unknown>,
  key: string
): number | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a number.`);
  }
  return value;
}

function _optionalBoolean(
  args: Record<string, unknown>,
  key: string
): boolean | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean.`);
  }
  return value;
}

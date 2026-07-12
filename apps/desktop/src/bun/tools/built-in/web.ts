import type { BuiltinTool } from "@llm-space/core";

import type { SearchSettings } from "../../../shared/search";
import type { ToolEntry } from "../tool-registry";

export interface WebBuiltInToolsDependencies {
  env: Readonly<Record<string, string | undefined>>;
  getSearchSettings: () => SearchSettings;
}

const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev";
const TAVILY_BASE_URL = "https://api.tavily.com";

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

/** Build the provider selected in `settings/search.json` with its resolved key. */
function _getSearchProvider({
  env,
  getSearchSettings,
}: WebBuiltInToolsDependencies): SearchProvider {
  const settings = getSearchSettings();
  if (settings.provider === "tavily") {
    return new TavilySearchProvider(_resolveApiKey(settings.tavilyApiKey, env));
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

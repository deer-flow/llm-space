# SearXNG Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SearXNG (self-hosted) as a fourth search provider for the built-in `web_search` / `web_fetch` tools, in both the desktop runtime and the generated LangGraph Python projects, per `docs/superpowers/specs/2026-08-22-searxng-design.md`.

**Architecture:** Extend the existing single-provider pattern end to end: `SearchProviderId` gains `"searxng"` and `SearchSettings` gains `searxngBaseUrl` (default `http://localhost:8080`); a new `SearxngSearchProvider` calls the SearXNG JSON API for search and delegates `fetch` to Firecrawl (Brave precedent); the generator's `.env` block and `web_search.py` mirror the same provider; the settings UI adds a select entry + a plain-text service-URL input; en/zh i18n strings are added in lockstep.

**Tech Stack:** Bun + TypeScript, zod, React (settings page), generated Python (`requests`).

## Global Constraints

- **No new npm dependencies** — the feature must work with existing deps; `bun add` is forbidden.
- **en copy verbatim** — do not edit any existing en string in `packages/ui/src/lib/i18n/messages/*.ts`; only add new keys. Add the zh mirror in `packages/ui/src/lib/i18n/zh.ts` with the identical shape (TS-enforced by `Messages = typeof en`).
- **Default SearXNG base URL:** `http://localhost:8080` (literal, editable in Settings → Search).
- **SearXNG request headers** (both runtimes): `Accept: application/json`, `X-Forwarded-For: 127.0.0.1`, `X-Real-IP: 127.0.0.1` (instance must trust the proxy — `server.trust_x_forwarded_for`).
- **SSRF rule:** `web_fetch` must never fetch target URLs from the Bun process — delegate to Firecrawl exactly like `BraveSearchProvider`.
- **Generator parity:** the TS runtime and the generated `web_search.py` must both support `searxng`. After editing `packages/core/src/generator/langgraph/tools/built-in/web_search.py`, run `bun scripts/gen-langgraph-tools.ts` from the repo root — the sync test (`built-in-sources.test.ts`) fails otherwise.
- **Before every commit:** `bun run check:changed` must report 0 errors / 0 warnings.
- **Layering:** `@llm-space/ui` must not import `@/client`, `@/commands`, or `electrobun`.
- **Backward compatibility:** default `provider` stays `firecrawl`; legacy `search.json` files (missing `searxngBaseUrl`) normalize to the default.
- **AGENTS.md:** a generator change must execute the generated Python at least once — Task 3 adds such a test (note: `python3` may be absent/stubbed on Windows; the generator-execution tests are already part of the 27 baseline Windows failures — CI (Linux) is the authority).

---

### Task 1: Data layer — `SearchProviderId` + `SearchSettings.searxngBaseUrl`

**Files:**
- Modify: `packages/core/src/types/search.ts`
- Modify: `packages/runtime/src/search/search-settings-manager.ts`
- Create: `packages/runtime/tests/search/search-settings-manager.test.ts`

**Interfaces:**
- Consumes: existing `SearchSettings`, `DEFAULT_SEARCH_SETTINGS`, `SearchSettingsManager` load/normalize pattern.
- Produces: `SearchProviderId` includes `"searxng"`; `SearchSettings.searxngBaseUrl: string`; `DEFAULT_SEARCH_SETTINGS.searxngBaseUrl === "http://localhost:8080"`. Task 2 and Task 3 consume these.

- [ ] **Step 1: Write the failing manager test**

Create `packages/runtime/tests/search/search-settings-manager.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { atomicWriteJsonFileSync, getSettingsDir } from "@llm-space/core/server";

import { SearchSettingsManager } from "../../src/search/search-settings-manager";

let tmpRoot: string;

beforeAll(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), "llm-space-search-test-"));
  process.env.LLM_SPACE_HOME = tmpRoot;
  await mkdir(getSettingsDir(), { recursive: true });
});

afterAll(async () => {
  delete process.env.LLM_SPACE_HOME;
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("SearchSettingsManager", () => {
  test("normalizes a legacy search.json missing searxngBaseUrl to the default", () => {
    atomicWriteJsonFileSync(path.join(getSettingsDir(), "search.json"), {
      provider: "tavily",
      braveApiKey: "b",
      firecrawlApiKey: "f",
      tavilyApiKey: "t",
    });
    const settings = new SearchSettingsManager().get();
    expect(settings.provider).toBe("tavily");
    expect(settings.searxngBaseUrl).toBe("http://localhost:8080");
  });

  test("set() persists the searxng provider and a custom base URL", () => {
    const manager = new SearchSettingsManager();
    const saved = manager.set({
      provider: "searxng",
      braveApiKey: "b",
      firecrawlApiKey: "f",
      tavilyApiKey: "t",
      searxngBaseUrl: "http://searxng.lan:8888",
    });
    expect(saved.provider).toBe("searxng");
    expect(saved.searxngBaseUrl).toBe("http://searxng.lan:8888");
    expect(new SearchSettingsManager().get().provider).toBe("searxng");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test packages/runtime/tests/search/search-settings-manager.test.ts`
Expected: FAIL — `searxngBaseUrl` is not a property of `SearchSettings` (type error) / normalize drops the key.

- [ ] **Step 3: Extend the types**

In `packages/core/src/types/search.ts`:

```ts
export type SearchProviderId = "brave" | "firecrawl" | "tavily" | "searxng";
```

```ts
export interface SearchSettings {
  provider: SearchProviderId;
  braveApiKey: string;
  firecrawlApiKey: string;
  tavilyApiKey: string;
  /** Base URL of the self-hosted SearXNG instance (JSON API), e.g. http://localhost:8080. */
  searxngBaseUrl: string;
}
```

```ts
export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
  provider: "firecrawl",
  braveApiKey: "$BRAVE_SEARCH_API_KEY",
  firecrawlApiKey: "$FIRECRAWL_API_KEY",
  tavilyApiKey: "$TAVILY_API_KEY",
  searxngBaseUrl: "http://localhost:8080",
};
```

- [ ] **Step 4: Extend the settings manager**

In `packages/runtime/src/search/search-settings-manager.ts`:

```ts
const VALID_PROVIDERS: readonly SearchProviderId[] = [
  "brave",
  "firecrawl",
  "tavily",
  "searxng",
];
```

```ts
const SearchSettingsFileSchema = z.object({
  provider: z.enum(VALID_PROVIDERS).optional(),
  braveApiKey: z.string().optional(),
  firecrawlApiKey: z.string().optional(),
  tavilyApiKey: z.string().optional(),
  searxngBaseUrl: z.string().optional(),
});
```

In `_normalize`, after the `tavilyApiKey` line:

```ts
      searxngBaseUrl:
        typeof input.searxngBaseUrl === "string"
          ? input.searxngBaseUrl
          : DEFAULT_SEARCH_SETTINGS.searxngBaseUrl,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test packages/runtime/tests/search/search-settings-manager.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Run check:changed and commit**

Run: `bun run check:changed` — expected 0 errors / 0 warnings.
Then:

```bash
git add packages/core/src/types/search.ts packages/runtime/src/search/search-settings-manager.ts packages/runtime/tests/search/search-settings-manager.test.ts
git commit -m "feat(search): add searxng provider and base-url setting to search settings"
```

---

### Task 2: Desktop runtime — `SearxngSearchProvider`

**Files:**
- Modify: `packages/runtime/src/tools/built-in/web.ts`
- Modify: `packages/runtime/tests/tools/built-in/web.test.ts`

**Interfaces:**
- Consumes: `SearchSettings.provider === "searxng"` + `searxngBaseUrl` (Task 1); the existing `SearchProvider` interface (`fetch`/`search`), `WebSearchResult`, `_truncateText`, `_resolveApiKey`, `FirecrawlSearchProvider`.
- Produces: `SearxngSearchProvider` + the `searxng` branch in `_getSearchProvider`.

- [ ] **Step 1: Write the failing tests**

Append a new describe block to `packages/runtime/tests/tools/built-in/web.test.ts` (after the Brave describe, before the end of file):

```ts
describe("Searxng Search provider", () => {
  test("uses the base URL, JSON API params, botdetection headers, and normalized result shape", async () => {
    let request: { url: URL; headers: Headers } | undefined;
    globalThis.fetch = ((input, init) => {
      request = {
        url:
          input instanceof URL
            ? input
            : typeof input === "string"
              ? new URL(input)
              : new URL(input.url),
        headers: new Headers(init?.headers),
      };
      return Promise.resolve(
        Response.json({
          results: [
            {
              title: "LLM Space",
              url: "https://example.com/llm-space",
              content: "A prompt and agent workbench.",
            },
          ],
        })
      );
    }) as typeof fetch;

    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "searxng",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        searxngBaseUrl: "http://localhost:8080",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    const result = await search?.execute({
      query: "LLM Space",
      limit: 5,
      includeContent: true,
    });

    expect(request).toBeDefined();
    if (!request) throw new Error("SearXNG request was not captured");
    expect(request.url.origin + request.url.pathname).toBe(
      "http://localhost:8080/search"
    );
    expect(request.url.searchParams.get("q")).toBe("LLM Space");
    expect(request.url.searchParams.get("format")).toBe("json");
    expect(request.url.searchParams.get("language")).toBe("auto");
    expect(request.url.searchParams.get("pageno")).toBe("1");
    expect(request.url.searchParams.get("limit")).toBe("5");
    expect(request.headers.get("Accept")).toBe("application/json");
    expect(request.headers.get("X-Forwarded-For")).toBe("127.0.0.1");
    expect(request.headers.get("X-Real-IP")).toBe("127.0.0.1");
    expect(result).toEqual([
      {
        title: "LLM Space",
        url: "https://example.com/llm-space",
        snippet: "A prompt and agent workbench.",
        content: "A prompt and agent workbench.",
      },
    ]);
  });

  test("omits content when includeContent is false", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        Response.json({
          results: [
            {
              title: "LLM Space",
              url: "https://example.com/llm-space",
              content: "A prompt and agent workbench.",
            },
          ],
        })
      )) as typeof fetch;

    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "searxng",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        searxngBaseUrl: "http://localhost:8080",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    const result = await search?.execute({ query: "LLM Space" });

    expect(result).toEqual([
      {
        title: "LLM Space",
        url: "https://example.com/llm-space",
        snippet: "A prompt and agent workbench.",
      },
    ]);
  });

  test("requires a configured SearXNG service URL", async () => {
    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "searxng",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        searxngBaseUrl: " ",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    let rejection: unknown;
    try {
      await Promise.resolve(search!.execute({ query: "test" }));
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toContain(
      "SearXNG service URL is not configured"
    );
  });

  test("surfaces non-OK search responses", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(Response.json({ error: "boom" }, { status: 500 }))) as typeof fetch;

    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "searxng",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        searxngBaseUrl: "http://localhost:8080",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    let rejection: unknown;
    try {
      await Promise.resolve(search!.execute({ query: "test" }));
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe("web_search failed: 500");
  });

  test("delegates web_fetch to Firecrawl", async () => {
    let request: { url: string; headers: Headers } | undefined;
    globalThis.fetch = ((input, init) => {
      request = {
        url:
          input instanceof URL
            ? input.toString()
            : typeof input === "string"
              ? input
              : input.url,
        headers: new Headers(init?.headers),
      };
      return Promise.resolve(
        Response.json({
          success: true,
          data: {
            markdown: "# Example",
            metadata: { title: "Example" },
          },
        })
      );
    }) as typeof fetch;

    const fetchTool = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "searxng",
        braveApiKey: "",
        firecrawlApiKey: "firecrawl-key",
        tavilyApiKey: "",
        searxngBaseUrl: "http://localhost:8080",
      }),
    }).find((entry) => entry.tool.name === "web_fetch");

    const result = await fetchTool?.execute({ url: "https://example.com" });

    expect(request).toBeDefined();
    if (!request) throw new Error("Firecrawl request was not captured");
    expect(request.url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(request.headers.get("Authorization")).toBe("Bearer firecrawl-key");
    expect(result).toEqual({
      url: "https://example.com",
      title: "Example",
      content: "# Example",
      metadata: { title: "Example" },
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test packages/runtime/tests/tools/built-in/web.test.ts`
Expected: FAIL — no searxng branch in `_getSearchProvider` (falls through to Firecrawl).

- [ ] **Step 3: Implement `SearxngSearchProvider`**

In `packages/runtime/src/tools/built-in/web.ts`, after the `BraveSearchProvider` class (after line 346), add:

```ts
interface SearxngSearchResponse {
  results?: {
    title?: string;
    url?: string;
    content?: string;
  }[];
}

/**
 * SearXNG-backed web search. SearXNG is a self-hosted meta search engine whose
 * JSON API returns ranked results with summaries; it has no page-extraction
 * endpoint, so `web_fetch` delegates to Firecrawl (same arrangement as Brave).
 */
class SearxngSearchProvider implements SearchProvider {
  constructor(
    private readonly _baseUrl: string,
    private readonly _fetchProvider: SearchProvider
  ) {
    if (!_baseUrl.trim()) {
      throw new Error(
        "SearXNG service URL is not configured. Add one in Settings → Search."
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
    const baseUrl = this._baseUrl.trim().replace(/\/+$/, "");
    const url = new URL(`${baseUrl}/search`);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("language", "auto");
    url.searchParams.set("pageno", "1");
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        // SearXNG botdetection rejects requests without a client IP; the
        // instance must trust this proxy (server.trust_x_forwarded_for).
        "X-Forwarded-For": "127.0.0.1",
        "X-Real-IP": "127.0.0.1",
      },
    });

    if (!res.ok) {
      throw new Error(`web_search failed: ${res.status}`);
    }

    const json = (await res.json()) as SearxngSearchResponse;
    return (json.results ?? []).map((item) => ({
      title: item.title ?? "Untitled",
      url: item.url ?? "",
      snippet: item.content,
      content:
        includeContent && item.content
          ? _truncateText(item.content, 2_000)
          : undefined,
    }));
  }
}
```

- [ ] **Step 4: Wire the dispatch branch**

In `_getSearchProvider`, after the `tavily` branch (line 362), add:

```ts
  if (settings.provider === "searxng") {
    return new SearxngSearchProvider(
      settings.searxngBaseUrl,
      new FirecrawlSearchProvider(_resolveApiKey(settings.firecrawlApiKey, env))
    );
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test packages/runtime/tests/tools/built-in/web.test.ts`
Expected: PASS (Brave describe + Searxng describe).

- [ ] **Step 6: Run check:changed and commit**

Run: `bun run check:changed` — expected 0 errors / 0 warnings.
Then:

```bash
git add packages/runtime/src/tools/built-in/web.ts packages/runtime/tests/tools/built-in/web.test.ts
git commit -m "feat(search): add SearXNG search provider to the built-in web tools"
```

---

### Task 3: Generator parity — `.env` block + generated `web_search.py`

**Files:**
- Modify: `packages/core/src/generator/langgraph/templates.ts` (`_searchEnvBlock`)
- Modify: `packages/core/src/generator/langgraph/tools/built-in/web_search.py`
- Regenerate: `packages/core/src/generator/langgraph/tools/built-in-sources.generated.ts` (via `bun scripts/gen-langgraph-tools.ts`)
- Modify: `packages/core/tests/generator/langgraph/tools/built-in-sources.test.ts`
- Modify: `packages/core/tests/generator/langgraph/templates.test.ts`

**Interfaces:**
- Consumes: `SearchSettings.searxngBaseUrl` (Task 1); the `_searchEnvBlock` template; the `BUILTIN_TOOL_SOURCES` regeneration script.
- Produces: generated projects get `SEARXNG_BASE_URL` in `.env`/`.env.example` and a working `searxng` backend in `web_search.py`.

- [ ] **Step 1: Write the failing template test**

Append to `packages/core/tests/generator/langgraph/templates.test.ts` (match its existing import style for `envFile`/`envExample` — `../../../src/generator/langgraph/templates`):

```ts
import {
  envExample,
  envFile,
} from "../../../src/generator/langgraph/templates";

// (keep the file's existing imports; add these at the top)
```

Then append the describe block at the end:

```ts
describe("web-search env blocks", () => {
  const model = { provider: "openai", id: "gpt-5" } as ModelConfig;
  const info = {
    name: "gpt-5",
    anthropic: false,
    deepseekThinking: false,
    supportsReasoning: true,
  } as GeneratorModelInfo;
  const searxngSearch: SearchSettings = {
    provider: "searxng",
    braveApiKey: "$BRAVE_SEARCH_API_KEY",
    firecrawlApiKey: "$FIRECRAWL_API_KEY",
    tavilyApiKey: "$TAVILY_API_KEY",
    searxngBaseUrl: "http://localhost:8080",
  };

  test("writes the searxng base URL literally into .env", () => {
    const env = envFile(model, info, searxngSearch);
    expect(env).toContain("SEARCH_PROVIDER=searxng");
    expect(env).toContain("SEARXNG_BASE_URL=http://localhost:8080");
  });

  test("leaves SEARXNG_BASE_URL blank in .env.example", () => {
    const example = envExample(model, info, searxngSearch);
    expect(example).toContain("SEARXNG_BASE_URL=");
    expect(example).not.toContain("SEARXNG_BASE_URL=http");
  });
});
```

Add the missing type imports at the top of `templates.test.ts` if not already present: `import type { ModelConfig } from "@llm-space/core";` / `import type { GeneratorModelInfo, SearchSettings } from "../../../src/generator/types";` — follow the file's existing import style.

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test packages/core/tests/generator/langgraph/templates.test.ts`
Expected: FAIL — no `SEARXNG_BASE_URL` line in the env block.

- [ ] **Step 3: Write the failing generated-Python test**

In `packages/core/tests/generator/langgraph/tools/built-in-sources.test.ts`, inside the `"covers the expected built-in tools"` test, add:

```ts
    expect(BUILTIN_TOOL_SOURCES.web_search).toContain("SEARXNG_BASE_URL");
    expect(BUILTIN_TOOL_SOURCES.web_search).toContain("_searxng_search");
```

Then append a new `it(...)` at the end of the describe (before the closing `});`), following the existing `Bun.spawn(["python3", ...])` + langchain-stub pattern:

```ts
  it("executes the generated searxng web_search with stubbed requests", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "llm-space-python-searxng-")
    );
    const sourcePath = path.join(root, "web_search.py");
    try {
      await writeFile(sourcePath, BUILTIN_TOOL_SOURCES.web_search!, "utf8");
      const script = `
import importlib.util, os, sys, types

langchain = types.ModuleType("langchain")
langchain_tools = types.ModuleType("langchain.tools")
langchain_tools.tool = lambda fn: fn
sys.modules["langchain"] = langchain
sys.modules["langchain.tools"] = langchain_tools

class FakeResponse:
    ok = True
    status_code = 200

    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload

captured = {}
requests = types.ModuleType("requests")

def fake_get(url, params=None, headers=None):
    captured["url"] = url
    captured["params"] = params
    captured["headers"] = headers
    return FakeResponse({"results": [{"title": "LLM Space", "url": "https://example.com", "content": "A workbench."}]})

requests.get = fake_get
sys.modules["requests"] = requests

spec = importlib.util.spec_from_file_location("web_search", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

os.environ["SEARXNG_BASE_URL"] = "http://localhost:8080"
out = module.web_search("LLM Space", limit=5, includeContent=True)
assert out == [{"title": "LLM Space", "url": "https://example.com", "snippet": "A workbench.", "content": "A workbench."}], repr(out)
assert captured["url"] == "http://localhost:8080/search", captured
assert captured["params"] == {"q": "LLM Space", "format": "json", "language": "auto", "pageno": 1, "limit": 5}, captured
assert captured["headers"]["X-Forwarded-For"] == "127.0.0.1", captured
assert captured["headers"]["X-Real-IP"] == "127.0.0.1", captured

os.environ.pop("SEARXNG_BASE_URL", None)
try:
    module.web_search("x", limit=1, includeContent=False)
    raise SystemExit("expected RuntimeError for missing SEARXNG_BASE_URL")
except RuntimeError as exc:
    assert "SEARXNG_BASE_URL" in str(exc), str(exc)

print("ok")
`;
      const child = Bun.spawn(
        ["python3", "-c", script, sourcePath],
        { stdout: "pipe", stderr: "pipe" }
      );
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);

      expect(stdout).toContain("ok");
      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
```

Note: if `python3` is unavailable on the local machine (Windows), this test fails here like the existing generated-Python execution tests — that matches the known Windows baseline; the source of truth is CI (Linux).

- [ ] **Step 4: Implement `_searxng_search` in the generated Python**

In `packages/core/src/generator/langgraph/tools/built-in/web_search.py`:

Add after `_brave_search` (after line 133):

```python
def _searxng_search(query: str, limit: int, include_content: bool) -> list[dict]:
    """SearXNG web search (self-hosted). Requires ``SEARXNG_BASE_URL``."""
    base_url = os.environ.get("SEARXNG_BASE_URL", "").strip().rstrip("/")
    if not base_url:
        raise RuntimeError(
            "SearXNG service URL is not configured. Set SEARXNG_BASE_URL."
        )

    res = requests.get(
        f"{base_url}/search",
        params={
            "q": query,
            "format": "json",
            "language": "auto",
            "pageno": 1,
            "limit": limit,
        },
        headers={
            "Accept": "application/json",
            # SearXNG botdetection rejects requests without a client IP; the
            # instance must trust this proxy (server.trust_x_forwarded_for).
            "X-Forwarded-For": "127.0.0.1",
            "X-Real-IP": "127.0.0.1",
        },
    )
    if not res.ok:
        raise RuntimeError(f"web_search failed: {res.status_code}")

    results = []
    for item in res.json().get("results") or []:
        content = item.get("content")
        results.append(
            {
                "title": item.get("title") or "Untitled",
                "url": item.get("url") or "",
                "snippet": content,
                "content": _truncate_text(content, 2_000)
                if include_content and content
                else None,
            }
        )
    return results
```

Update the dispatch in `web_search` (line 151-156):

```python
    provider = os.environ.get("SEARCH_PROVIDER", "firecrawl").strip().lower()
    if provider == "tavily":
        return _tavily_search(query, limit, includeContent)
    if provider == "brave":
        return _brave_search(query, limit, includeContent)
    if provider == "searxng":
        return _searxng_search(query, limit, includeContent)
    return _firecrawl_search(query, limit, includeContent)
```

Update the docstring line (line 143):

```python
    The backend is chosen by the ``SEARCH_PROVIDER`` environment variable
    (``firecrawl`` by default, or ``tavily``/``brave``/``searxng``).
```

- [ ] **Step 5: Regenerate the embedded sources**

Run from the repo root: `bun scripts/gen-langgraph-tools.ts`
Expected: rewrites `packages/core/src/generator/langgraph/tools/built-in-sources.generated.ts`.

- [ ] **Step 6: Implement the `.env` block**

In `packages/core/src/generator/langgraph/templates.ts` `_searchEnvBlock`, change the comment and append the new line (lines 290-300):

```ts
  return `
# Web-search backend for the built-in web_search / web_fetch tools:
# one of firecrawl, tavily, brave, or searxng.
SEARCH_PROVIDER=${search.provider}
# Optional — Firecrawl's free tier works without a key.
FIRECRAWL_API_KEY=${key(search.firecrawlApiKey)}
# Required only when SEARCH_PROVIDER=tavily.
TAVILY_API_KEY=${key(search.tavilyApiKey)}
# Required only when SEARCH_PROVIDER=brave.
BRAVE_API_KEY=${key(search.braveApiKey)}
# Required only when SEARCH_PROVIDER=searxng.
SEARXNG_BASE_URL=${key(search.searxngBaseUrl)}
`;
```

- [ ] **Step 7: Run the generator tests to verify they pass**

Run: `bun test packages/core/tests/generator/langgraph/templates.test.ts packages/core/tests/generator/langgraph/tools/built-in-sources.test.ts`
Expected: PASS (the two new template tests; the coverage assertion; the execution test — the latter only if `python3` exists locally, matching the known baseline otherwise).

- [ ] **Step 8: Run check:changed and commit**

Run: `bun run check:changed` — expected 0 errors / 0 warnings.
Then:

```bash
git add packages/core/src/generator/langgraph/templates.ts packages/core/src/generator/langgraph/tools/built-in/web_search.py packages/core/src/generator/langgraph/tools/built-in-sources.generated.ts packages/core/tests/generator/langgraph/templates.test.ts packages/core/tests/generator/langgraph/tools/built-in-sources.test.ts
git commit -m "feat(generator): add searxng backend to generated web_search projects"
```

---

### Task 4: Settings UI + i18n

**Files:**
- Modify: `packages/ui/src/lib/i18n/messages/settings.ts` (en)
- Modify: `packages/ui/src/lib/i18n/zh.ts` (zh mirror)
- Modify: `apps/desktop/src/components/settings/search-page.tsx`

**Interfaces:**
- Consumes: `SearchSettings.provider` / `searxngBaseUrl` (Task 1); `useI18n()` `t.settings.search.*`; `persist` pattern in `SearchPage`.
- Produces: a selectable `searxng` provider and an editable service-URL field, in both languages.

- [ ] **Step 1: Add the en strings**

In `packages/ui/src/lib/i18n/messages/settings.ts`, inside `search.providers` (line 348-352) add:

```ts
      searxng: "SearXNG",
```

And after `apiKeys` (line 357), add:

```ts
    searxngBaseUrlLabel: "SearXNG service URL",
    searxngBaseUrlHint: "Self-hosted SearXNG instance. No API key required.",
    searxngBaseUrlPlaceholder: "http://localhost:8080",
```

- [ ] **Step 2: Add the zh mirror**

In `packages/ui/src/lib/i18n/zh.ts`, inside `settings.search.providers` (line 388-392) add:

```ts
        searxng: "SearXNG",
```

And after `apiKeys` (line 397), add:

```ts
      searxngBaseUrlLabel: "SearXNG 服务地址",
      searxngBaseUrlHint: "自托管的 SearXNG 实例，无需 API key。",
      searxngBaseUrlPlaceholder: "http://localhost:8080",
```

- [ ] **Step 3: Extend the settings page**

In `apps/desktop/src/components/settings/search-page.tsx`:

Add the `Input` import (with the other `@llm-space/ui` imports):

```ts
import { Input } from "@llm-space/ui/ui/input";
```

Add the select item after the tavily item (line 97):

```tsx
              <SelectItem value="searxng">{t.settings.search.providers.searxng}</SelectItem>
```

Add the base-URL field after the tavily `ApiKeyField` (line 132), before the `$VAR` hint paragraph:

```tsx
        {settings.provider === "searxng" ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              {t.settings.search.searxngBaseUrlLabel}
            </span>
            <Input
              type="url"
              value={settings.searxngBaseUrl}
              placeholder={t.settings.search.searxngBaseUrlPlaceholder}
              aria-label={t.settings.search.searxngBaseUrlLabel}
              onChange={(e) =>
                setSettings({ ...settings, searxngBaseUrl: e.target.value })
              }
              onBlur={() => void persist(settings)}
            />
            <p className="text-muted-foreground text-xs">
              {t.settings.search.searxngBaseUrlHint}
            </p>
          </div>
        ) : null}
```

- [ ] **Step 4: Verify parity and lint**

Run: `bun run check:changed` — expected 0 errors / 0 warnings (this catches a missing zh mirror as a type error).
Run: `bun test packages/ui/tests/lib/i18n/messages.test.ts packages/ui/tests/lib/i18n/provider.test.tsx` — expected PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/lib/i18n/messages/settings.ts packages/ui/src/lib/i18n/zh.ts apps/desktop/src/components/settings/search-page.tsx
git commit -m "feat(ui): add SearXNG option and service URL field to search settings"
```

---

### Task 5: Full-suite verification

- [ ] **Step 1: Run the complete test suite**

Run: `bun test 2>&1 | tail -3`
Expected: `27 fail` (the known Windows-platform baseline — identical to `origin/main`; zero new failures).

- [ ] **Step 2: Run check:changed**

Run: `bun run check:changed` — expected 0 errors / 0 warnings.

- [ ] **Step 3: Report and hand off**

Summarize the diff (`git log --oneline origin/main..HEAD` style) and note the follow-up: rebuild the canary installer from the new main state (user decision).

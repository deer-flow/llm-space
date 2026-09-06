# SearXNG Search Support Design Spec

**Goal:** Add SearXNG (self-hosted meta search engine) as a fourth search provider for the built-in `web_search` / `web_fetch` tools, following the proven single-provider pattern already used for Brave / Firecrawl / Tavily — in both the desktop runtime and the generated LangGraph Python projects.

**Reference implementation:** `C:\my-harness-agent-studio\harness-agent-studio` — `SearxngClient` (`harness_agent/community/searxng/searxng_client.py`) hits `GET {base_url}/search` with `format=json` and sends `X-Forwarded-For` / `X-Real-IP: 127.0.0.1` headers to pass SearXNG's botdetection (requires the instance to trust the proxy). SearXNG needs **no API key** — only a `base_url`.

**Assumption:** an external SearXNG instance is already deployed (e.g. local Docker on `localhost:8080`, or a LAN/cloud instance). This project only consumes its JSON API; it does not ship or manage a SearXNG deployment.

## Decisions (confirmed with the user)

1. **`web_fetch` delegates to Firecrawl** when SearXNG is the selected provider — SearXNG's JSON API has no page-extraction endpoint, which is exactly the Brave situation. The Brave precedent (`BraveSearchProvider.fetch` → injected `FirecrawlSearchProvider`) is reused verbatim; the SSRF surface does not widen (target URLs for fetch still go through Firecrawl, not the trusted Bun process).
2. **Default `searxngBaseUrl` = `http://localhost:8080`** (SearXNG Docker image default port), editable in Settings → Search. The default `provider` stays `firecrawl` — existing users are unaffected.
3. Approach **A** (SearXNG as the fourth provider, full parity across desktop runtime + generator + UI + i18n) was chosen over B (desktop-only, leaves generated projects silently falling back to firecrawl on `SEARCH_PROVIDER=searxng`) and C (harness-style multi-provider chain — over-engineering for a single-provider design).

## Current state (existing infrastructure — extend, don't rebuild)

- `packages/core/src/types/search.ts` — `SearchProviderId = "brave" | "firecrawl" | "tavily"`, `SearchSettings { provider, braveApiKey, firecrawlApiKey, tavilyApiKey }` persisted to `settings/search.json`; API keys support `$VAR` env references.
- `packages/runtime/src/search/search-settings-manager.ts` — zod schema (`SearchSettingsFileSchema`) + `_normalize()` merge-against-defaults; absent files are seeded.
- `packages/runtime/src/tools/built-in/web.ts` — `SearchProvider` interface (`fetch` + `search`); `_getSearchProvider` dispatches on `settings.provider`. `BraveSearchProvider` delegates `fetch` to an injected `FirecrawlSearchProvider` (SSRF rationale documented in code).
- `apps/desktop/src/components/settings/search-page.tsx` — provider `Select` + three `ApiKeyField`s + `$VAR` hint; fully i18n'd via `useI18n()`.
- `packages/core/src/generator/langgraph/` — `templates.ts` `_searchEnvBlock()` writes `SEARCH_PROVIDER` + the three API-key vars into generated projects' `.env` / `.env.example`; `tools/built-in/web_search.py` dispatches on `SEARCH_PROVIDER` (firecrawl default, tavily/brave branches). `requests` is already a declared dependency of web tools (`tools/index.ts`).
- i18n — `packages/ui/src/lib/i18n/messages/settings.ts` (`settings.search.*`, en + zh mirrored, TS-enforced parity).

## Architecture

### 1. Data layer

- `SearchProviderId` gains `"searxng"`; `SearchSettings` gains `searxngBaseUrl: string`; `DEFAULT_SEARCH_SETTINGS.searxngBaseUrl = "http://localhost:8080"`.
- `SearchSettingsFileSchema` + `_normalize()` gain the field; legacy `search.json` files (missing the key) normalize to the default — existing tolerance logic already covers this. `$VAR` resolution applies to keys only; `searxngBaseUrl` is a literal URL, written verbatim.

### 2. Desktop runtime provider (`packages/runtime/src/tools/built-in/web.ts`)

New `SearxngSearchProvider implements SearchProvider`:

- `search(query, limit, includeContent)` — `GET {baseUrl}/search` with params `q`, `format=json`, `language=auto`, `pageno=1`, `limit`; headers `Accept: application/json`, `X-Forwarded-For: 127.0.0.1`, `X-Real-IP: 127.0.0.1` (mirrors harness). Normalizes each result to `{ title, url, snippet: content }`; `includeContent` also returns `content` truncated to 2_000 chars (SearXNG's `content` field is already a summary — no extra fetch needed). Non-OK status or parse failure → `Error` with the SearXNG error body if present (Brave's error-surfacing pattern).
- `fetch(url)` — delegates to an injected `FirecrawlSearchProvider` (Brave's exact construction pattern).
- Empty/whitespace `baseUrl` at construction → `Error` telling the user to configure the SearXNG service URL in Settings → Search (matches Tavily/Brave missing-key error style).
- `_getSearchProvider` gains a `searxng` branch.

Request behavior: the SearXNG call uses the global `fetch` from the Bun process, so `HTTP(S)_PROXY` from `NetworkSettingsManager` applies as usual — no custom dispatcher (consistent with the "GitHub calls go through the proxy" rule).

### 3. Settings UI (`apps/desktop/src/components/settings/search-page.tsx`)

- `Select` gains `<SelectItem value="searxng">` labeled via `t.settings.search.providers.searxng`.
- A new base-url field after the three API-key fields, rendered only when `provider === "searxng"`: label `t.settings.search.searxngBaseUrlLabel`, value bound to `settings.searxngBaseUrl`, saved on blur (ApiKeyField's onBlur pattern), placeholder `t.settings.search.searxngBaseUrlPlaceholder`. It is a plain-text URL input — not an `ApiKeyField` (no mask, no `getKeyUrl` link).
- A short hint under the field: SearXNG is self-hosted and needs no API key (`t.settings.search.searxngBaseUrlHint`).

### 4. i18n (`packages/ui/src/lib/i18n/messages/settings.ts`, en + zh mirrored)

New strings under `settings.search`:

| key | en | zh |
|---|---|---|
| `providers.searxng` | `SearXNG` | `SearXNG` |
| `searxngBaseUrlLabel` | `SearXNG service URL` | `SearXNG 服务地址` |
| `searxngBaseUrlHint` | `Self-hosted SearXNG instance. No API key required.` | `自托管的 SearXNG 实例，无需 API key。` |
| `searxngBaseUrlPlaceholder` | `http://localhost:8080` | `http://localhost:8080` |

Existing en strings are **not modified** (verbatim-en constraint): the "Brave … continues to use Firecrawl" phrasing in `descriptionSuffix` stays as-is; the SearXNG-specific note is a new conditionally-rendered string instead of an edit to the shared description sentence.

### 5. Generator parity (`packages/core/src/generator/langgraph/`)

- `templates.ts` `_searchEnvBlock()`: comment `# one of firecrawl, tavily, or brave.` → `# one of firecrawl, tavily, brave, or searxng.`; add `# Required only when SEARCH_PROVIDER=searxng.` + `SEARXNG_BASE_URL=${key(search.searxngBaseUrl)}`. `.env.example` (withValues=false) leaves it blank; `.env` (true) writes the literal default — `_searchKeyLiteral` passes non-`$` values through.
- `tools/built-in/web_search.py`: new `_searxng_search(query, limit, include_content)` — `requests.get(f"{base}/search", params={q, format: "json", language: "auto", pageno: 1, limit}, headers={Accept, X-Forwarded-For, X-Real-IP})`, normalize `{title, url, snippet(content)}` with the same 2_000-char truncation; missing `SEARXNG_BASE_URL` → `RuntimeError` with a setup hint. Dispatch branch `provider == "searxng"`; docstring updated to list searxng. No new dependencies (`requests` already declared).

### 6. Tests

- `packages/runtime/tests/tools/built-in/web.test.ts` — new `SearxngSearchProvider` describe (existing mock-fetch pattern): request URL + params + headers (`X-Forwarded-For`/`X-Real-IP`), result normalization, `limit`/`includeContent` passing, error surfacing on non-OK status, empty-baseUrl construction error, and fetch-delegates-to-Firecrawl (Brave delegation test pattern).
- `packages/core/tests/generator/langgraph/tools/built-in-sources.test.ts` — `BUILTIN_TOOL_SOURCES.web_search` assertions extended to cover `SEARXNG_BASE_URL` + `_searxng_search`.
- `packages/core/tests/generator/langgraph/templates.test.ts` — `envFile`/`envExample` assertions: searxng config writes the literal default into `.env`, blank into `.env.example`.
- i18n parity is compile-time (TS-enforced `zh` vs `en` shape) plus the existing `messages.test.ts` parity suite — new strings must be added in both languages.
- Per AGENTS.md, a generator change executes the generated Python at least once (syntax + behavior) via the existing generator regression mechanism.

## Out of scope

- Deploying, managing, or seeding a SearXNG instance (assumed pre-deployed).
- Advanced SearXNG parameters (`categories`, `engines`, `language` other than `auto`, pagination) — YAGNI; the JSON API default works.
- Provider chains / multi-provider fallback (harness's `multi_search` shape).
- CI workflows, release pipeline, new npm dependencies.
- Changing the default provider (stays `firecrawl`).

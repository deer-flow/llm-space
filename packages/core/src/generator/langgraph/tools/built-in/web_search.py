import os

import requests
from langchain.tools import tool

FIRECRAWL_BASE_URL = "https://api.firecrawl.dev"
TAVILY_BASE_URL = "https://api.tavily.com"
BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
SERPLY_SEARCH_URL = "https://api.serply.io/v1/search/"


def _truncate_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n[Content truncated]"


def _firecrawl_search(query: str, limit: int, include_content: bool) -> list[dict]:
    """Firecrawl web search. The free, unauthenticated tier works without a key;
    ``FIRECRAWL_API_KEY`` upgrades to the authenticated one."""
    headers = {"Content-Type": "application/json"}
    api_key = os.environ.get("FIRECRAWL_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    res = requests.post(
        f"{FIRECRAWL_BASE_URL}/v2/search",
        headers=headers,
        json={
            "query": query,
            "limit": limit,
            "scrapeOptions": {"formats": ["markdown"], "onlyMainContent": True},
        },
    )
    json_body = res.json()
    if not res.ok or json_body.get("error"):
        raise RuntimeError(json_body.get("error") or f"web_search failed: {res.status_code}")

    web_results = (json_body.get("data") or {}).get("web") or []
    results = []
    for item in web_results:
        markdown = item.get("markdown")
        results.append(
            {
                "title": item.get("title") or "Untitled",
                "url": item.get("url") or "",
                "snippet": item.get("description"),
                "content": _truncate_text(markdown, 2_000)
                if include_content and markdown
                else None,
            }
        )
    return results


def _tavily_search(query: str, limit: int, include_content: bool) -> list[dict]:
    """Tavily web search. Requires ``TAVILY_API_KEY`` (no free tier)."""
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        raise RuntimeError("Tavily API key is not configured. Set TAVILY_API_KEY.")

    res = requests.post(
        f"{TAVILY_BASE_URL}/search",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        json={
            "query": query,
            "max_results": limit,
            "include_raw_content": "markdown" if include_content else False,
        },
    )
    if not res.ok:
        raise RuntimeError(f"web_search failed: {res.status_code}")

    results = []
    for item in res.json().get("results") or []:
        raw_content = item.get("raw_content")
        results.append(
            {
                "title": item.get("title") or "Untitled",
                "url": item.get("url") or "",
                "snippet": item.get("content"),
                "content": _truncate_text(raw_content, 2_000)
                if include_content and raw_content
                else None,
            }
        )
    return results


def _brave_search(query: str, limit: int, include_content: bool) -> list[dict]:
    """Brave web search. Requires ``BRAVE_API_KEY`` (no free tier)."""
    api_key = os.environ.get("BRAVE_API_KEY")
    if not api_key:
        raise RuntimeError("Brave Search API key is not configured. Set BRAVE_API_KEY.")

    params = {
        "q": query,
        "count": str(max(1, min(20, limit))),
        "text_decorations": "false",
    }
    if include_content:
        params["extra_snippets"] = "true"

    res = requests.get(
        BRAVE_SEARCH_URL,
        headers={"Accept": "application/json", "X-Subscription-Token": api_key},
        params=params,
    )
    json_body = res.json()
    if not res.ok:
        error = json_body.get("error") or {}
        raise RuntimeError(
            error.get("detail")
            or json_body.get("message")
            or json_body.get("detail")
            or f"web_search failed: {res.status_code}"
        )

    results = []
    for item in (json_body.get("web") or {}).get("results") or []:
        snippets = "\n\n".join(
            s for s in [item.get("description"), *(item.get("extra_snippets") or [])] if s
        )
        results.append(
            {
                "title": item.get("title") or "Untitled",
                "url": item.get("url") or "",
                "snippet": item.get("description"),
                "content": _truncate_text(snippets, 2_000)
                if include_content and snippets
                else None,
            }
        )
    return results


def _serply_search(query: str, limit: int, include_content: bool) -> list[dict]:
    """Serply web search, returning Google SERP results. Requires ``SERPLY_API_KEY``."""
    api_key = os.environ.get("SERPLY_API_KEY")
    if not api_key:
        raise RuntimeError("Serply API key is not configured. Set SERPLY_API_KEY.")

    # One request reads a single result page and a page carries at most ten
    # organic results, so num is clamped rather than silently truncated by the
    # API. A page crowded with non-organic blocks can return fewer, so the
    # count is a ceiling, not a guarantee.
    count = max(1, min(10, limit))
    res = requests.get(
        SERPLY_SEARCH_URL,
        headers={"Accept": "application/json", "X-Api-Key": api_key},
        params={"q": query, "num": str(count)},
    )

    # Serply reports errors as JSON, but it sits behind a CDN that can answer
    # with an HTML page instead; parsing blind would bury the status code under
    # a decode error.
    try:
        json_body = res.json()
    except ValueError:
        json_body = None

    if not res.ok:
        detail = (json_body or {}).get("detail") or (json_body or {}).get("message")
        raise RuntimeError(detail or f"web_search failed: {res.status_code}")
    if json_body is None:
        raise RuntimeError(
            f"web_search failed: Serply returned a non-JSON response ({res.status_code})."
        )

    results = []
    # num is a request hint, so hold the response to the caller's limit too.
    for item in (json_body.get("results") or [])[:count]:
        description = item.get("description")
        results.append(
            {
                "title": item.get("title") or "Untitled",
                "url": item.get("link") or "",
                "snippet": description,
                # A SERP row carries one snippet and no page body, so
                # include_content has no longer text to offer here.
                "content": _truncate_text(description, 2_000)
                if include_content and description
                else None,
            }
        )
    return results


@tool
def web_search(query: str, limit: int = 5, includeContent: bool = False) -> list[dict]:
    """Search the web and return LLM-friendly results.

    Search the web and return LLM-friendly results.

    The backend is chosen by the ``SEARCH_PROVIDER`` environment variable
    (``firecrawl`` by default, or ``tavily``/``brave``/``serply``).

    Args:
        query: The search query string to look up on the web.
        limit: Maximum number of search results to return. Defaults to 5.
        includeContent: Whether to include short markdown content snippets for
            each result. Defaults to false.
    """
    provider = os.environ.get("SEARCH_PROVIDER", "firecrawl").strip().lower()
    if provider == "tavily":
        return _tavily_search(query, limit, includeContent)
    if provider == "brave":
        return _brave_search(query, limit, includeContent)
    if provider == "serply":
        return _serply_search(query, limit, includeContent)
    return _firecrawl_search(query, limit, includeContent)

import os

import requests
from langchain.tools import tool

FIRECRAWL_BASE_URL = "https://api.firecrawl.dev"
TAVILY_BASE_URL = "https://api.tavily.com"
BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"


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


@tool
def web_search(query: str, limit: int = 5, includeContent: bool = False) -> list[dict]:
    """Search the web and return LLM-friendly results.

    Search the web and return LLM-friendly results.

    The backend is chosen by the ``SEARCH_PROVIDER`` environment variable
    (``firecrawl`` by default, or ``tavily``/``brave``).

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
    return _firecrawl_search(query, limit, includeContent)

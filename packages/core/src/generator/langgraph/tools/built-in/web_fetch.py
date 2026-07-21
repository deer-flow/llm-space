import os

import requests
from langchain.tools import tool

FIRECRAWL_BASE_URL = "https://api.firecrawl.dev"
TAVILY_BASE_URL = "https://api.tavily.com"


def _truncate_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n[Content truncated]"


def _firecrawl_fetch(url: str) -> dict:
    """Scrape one page to markdown via Firecrawl. The free, unauthenticated tier
    works without a key; ``FIRECRAWL_API_KEY`` upgrades to the authenticated one."""
    headers = {"Content-Type": "application/json"}
    api_key = os.environ.get("FIRECRAWL_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    res = requests.post(
        f"{FIRECRAWL_BASE_URL}/v2/scrape",
        headers=headers,
        json={"url": url, "formats": ["markdown"], "onlyMainContent": True},
    )
    json_body = res.json()
    if not res.ok or json_body.get("error"):
        raise RuntimeError(json_body.get("error") or f"web_fetch failed: {res.status_code}")

    data = json_body.get("data") or {}
    metadata = data.get("metadata") or {}
    title = metadata.get("title")
    return {
        "url": url,
        "title": title if isinstance(title, str) else None,
        "content": _truncate_text(data.get("markdown") or data.get("html") or "", 20_000),
        "metadata": metadata,
    }


def _tavily_fetch(url: str) -> dict:
    """Extract one page to markdown via Tavily. Requires ``TAVILY_API_KEY``."""
    api_key = os.environ.get("TAVILY_API_KEY")
    if not api_key:
        raise RuntimeError("Tavily API key is not configured. Set TAVILY_API_KEY.")

    res = requests.post(
        f"{TAVILY_BASE_URL}/extract",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        json={"urls": url, "format": "markdown"},
    )
    if not res.ok:
        raise RuntimeError(f"web_fetch failed: {res.status_code}")

    json_body = res.json()
    result = (json_body.get("results") or [None])[0]
    if not result or not result.get("raw_content"):
        failed = (json_body.get("failed_results") or [None])[0]
        message = (failed or {}).get("error") if failed else None
        raise RuntimeError(message or f"web_fetch failed: could not extract {url}")

    return {
        "url": result.get("url") or url,
        "title": None,
        "content": _truncate_text(result["raw_content"], 20_000),
        "metadata": {},
    }


@tool
def web_fetch(url: str) -> dict:
    """Fetch one webpage and return LLM-friendly readable markdown content.

    Fetch one webpage and return LLM-friendly readable markdown content.

    The backend is chosen by the ``SEARCH_PROVIDER`` environment variable
    (``firecrawl`` by default, or ``tavily``/``brave``). Brave exposes no
    single-page extraction endpoint, so under ``brave`` the fetch falls back to
    Firecrawl.

    Args:
        url: The URL to fetch. Must be a fully qualified URL starting with
            http:// or https://.
    """
    provider = os.environ.get("SEARCH_PROVIDER", "firecrawl").strip().lower()
    if provider == "tavily":
        return _tavily_fetch(url)
    # `brave` has no extraction endpoint, so it delegates to Firecrawl (matching
    # the desktop behavior, which avoids fetching arbitrary URLs from the trusted
    # process and widening the SSRF surface).
    return _firecrawl_fetch(url)

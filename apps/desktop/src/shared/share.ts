/**
 * Builders for the public share link. A shared thread is published as a GitHub
 * Gist and viewed through the static web viewer, whose route mirrors the desktop
 * deep link (`llm-space://shared/<connectorId>/threads/<threadId>`). The web link
 * is the one we hand to users because any browser can open it, and the viewer
 * page already offers an "Open in LLM Space" affordance.
 */

/** The static site root (see `apps/web` `base` + the Pages deploy). */
export const SHARE_WEB_BASE_URL = "https://deer-flow.github.io/llm-space/";

/**
 * The browser-openable share link for a shared thread, e.g.
 * `https://deer-flow.github.io/llm-space/#/shared/gist/threads/<gistId>`. The
 * `#/shared/...` route is a `HashRouter` path, so it resolves on GitHub Pages
 * without a `404.html` fallback.
 */
export function buildWebShareUrl(connectorId: string, threadId: string): string {
  return `${SHARE_WEB_BASE_URL}#/shared/${connectorId}/threads/${threadId}`;
}

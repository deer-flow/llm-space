import Electrobun, { type ElectrobunEvent } from "electrobun/bun";

import { openLaunchUrlInbox } from "./launch-url-inbox";

/**
 * Capture `llm-space://` deep links at the earliest possible moment — process
 * entry, before the composition root loads.
 *
 * On macOS the bundle launcher owns the cold-start Apple Event before the Bun
 * child exists. Our post-build launcher writes it to a process-private inbox;
 * later URLs also arrive through Electrobun's `open-url` event. Both sources
 * feed this one queue, with duplicate delivery suppressed.
 *
 * This module is imported for its side effect at process entry and buffers URLs
 * until {@link setDeepLinkHandler} wires the importer after the renderer has
 * attached its status listener.
 */
const pending: string[] = [];
let handler: ((url: string) => void) | null = null;
const recentlySeen = new Map<string, number>();

function capture(url: string): void {
  const now = Date.now();
  const previous = recentlySeen.get(url);
  if (previous !== undefined && now - previous < 1_000) return;
  recentlySeen.set(url, now);
  for (const [candidate, timestamp] of recentlySeen) {
    if (now - timestamp >= 1_000) recentlySeen.delete(candidate);
  }
  if (handler) handler(url);
  else pending.push(url);
}

openLaunchUrlInbox(process.env.LLM_SPACE_LAUNCH_URL_FILE, capture);

Electrobun.events.on(
  "open-url",
  (event: ElectrobunEvent<{ url: string }, void>) => {
    capture(event.data.url);
  }
);

/** Wire the deep-link importer and flush any URLs buffered during launch. */
export function setDeepLinkHandler(next: (url: string) => void): void {
  handler = next;
  pending.splice(0).forEach(next);
}

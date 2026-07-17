import Electrobun, { type ElectrobunEvent } from "electrobun/bun";

/**
 * Capture `llm-space://` deep links at the earliest possible moment — process
 * entry, before the composition root loads.
 *
 * On a cold start macOS delivers the launch URL during app init, which
 * Electrobun turns into an `open-url` event. If no listener is attached yet the
 * event is dropped (Node's EventEmitter doesn't replay past emits), so the
 * import silently never happens. Registering the listener from inside
 * `startDesktopApp()` is too late: it runs after `await import("./app")`, and
 * the URL is delivered during that async gap.
 *
 * So this module attaches the listener at **import time** (imported for its side
 * effect from `bun/index.ts`, right after env hydration) and buffers URLs until
 * {@link setDeepLinkHandler} wires the real importer once the window + RPC exist.
 */
const pending: string[] = [];
let handler: ((url: string) => void) | null = null;

Electrobun.events.on(
  "open-url",
  (event: ElectrobunEvent<{ url: string }, void>) => {
    const { url } = event.data;
    if (handler) handler(url);
    else pending.push(url);
  }
);

/** Wire the deep-link importer and flush any URLs buffered during launch. */
export function setDeepLinkHandler(next: (url: string) => void): void {
  handler = next;
  pending.splice(0).forEach(next);
}

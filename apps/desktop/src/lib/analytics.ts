import type { AnalyticsEvent } from "@/shared/analytics";

import { electrobun } from "./electrobun";

/**
 * Record an anonymous, behaviour-only analytics event from the renderer.
 *
 * This does not send anything itself — it forwards the event to the bun main
 * process (the single, auditable telemetry egress) over a fire-and-forget RPC
 * message. Safe to call before RPC is ready and can never throw into UI code.
 * See `shared/analytics.ts` for the privacy contract.
 */
export function track(event: AnalyticsEvent): void {
  try {
    electrobun.rpc?.send.captureAnalyticsEvent(event);
  } catch {
    // Telemetry must never break the UI.
  }
}

import type * as pi from "@earendil-works/pi-ai";

import type { ModelConfigParams } from "./models";
import type { ProviderHostedToolConfig } from "./tools";

/**
 * A thread context already lowered to the `@earendil-works/pi-*` formats —
 * the shape produced by `convertToPiContext` and consumed by the agent loop.
 */
export interface PiThreadContext {
  systemPrompt?: string;
  messages: pi.Message[];
  tools: pi.Tool[];
  responseApiNativeTools: ProviderHostedToolConfig[];
}

/**
 * The wire request for a single agent stream: a model selector, optional
 * runtime params, and a pi-format context. Built once (transport-agnostic) by
 * `streamThread`, then carried by an `AgentTransport` (HTTP or RPC) to the
 * server side, where `streamAgent` runs the loop.
 */
export interface AgentStreamRequest {
  model: { provider: string; id: string };
  config?: { model?: ModelConfigParams };
  context: PiThreadContext;
}

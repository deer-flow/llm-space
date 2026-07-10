import { uuid } from "@llm-space/core";

import type { EveToolContext } from "./types";

export interface CreateEveToolContextOptions {
  abortSignal?: AbortSignal;
}

/**
 * Build the smallest Eve ToolContext needed for deliberate local tool calls.
 * Runtime-only Eve services throw with clear errors so unsupported auth,
 * sandbox, or in-process skill access cannot silently behave like production.
 */
export function createEveToolContext(
  options: CreateEveToolContextOptions = {}
): EveToolContext {
  return {
    abortSignal: options.abortSignal ?? new AbortController().signal,
    callId: uuid(),
    session: {
      id: uuid(),
      auth: {
        current: null,
        initiator: null,
      },
      turn: {
        id: uuid(),
        sequence: 0,
      },
    },
    getSandbox() {
      throw new Error(
        "LLM Space Eve tool calls do not provide an Eve sandbox context yet."
      );
    },
    getSkill() {
      throw new Error(
        "Use LLM Space's scoped Eve skill tool to load agent/skills entries."
      );
    },
    getToken() {
      return Promise.reject(
        new Error(
          "LLM Space Eve tool calls do not provide Eve auth tokens yet."
        )
      );
    },
    requireAuth() {
      throw new Error(
        "LLM Space Eve tool calls do not support Eve auth flows yet."
      );
    },
  };
}

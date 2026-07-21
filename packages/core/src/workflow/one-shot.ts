import { reduceMessages, streamThread } from "../client";
import type { AgentTransport, ReducedMessageContent } from "../client";
import type { AssistantMessage } from "../types";
import { uuid } from "../utils";

import type { OneShotRunner } from "./types";

export interface CreateOneShotRunnerOptions {
  /** The same {@link AgentTransport} the host uses for thread runs. */
  transport: AgentTransport;
}

/**
 * Build a {@link OneShotRunner} over an {@link AgentTransport}: it streams a
 * single-turn thread (system prompt + one user message), folds the events with
 * {@link reduceMessages}, and returns the last text block of the assistant
 * message. This is the non-hook counterpart to the playground's `useStreamText`.
 */
export function createOneShotRunner({
  transport,
}: CreateOneShotRunnerOptions): OneShotRunner {
  return async ({ systemPrompt, userPrompt, model, signal }) => {
    const context = {
      systemPrompt,
      messages: [
        {
          id: uuid(),
          role: "user" as const,
          content: [{ type: "text" as const, text: userPrompt }],
        },
      ],
    };

    let streamingMessage: AssistantMessage | null = null;
    let content: ReducedMessageContent[] = [];

    const response = streamThread(
      { context, model },
      { signal, transport }
    );
    for await (const event of response) {
      const reduced = reduceMessages(event, { streamingMessage, content });
      if (!reduced) {
        continue;
      }
      streamingMessage = reduced.message;
      content = reduced.content;
    }

    const parts = streamingMessage?.content;
    return parts?.[parts.length - 1]?.text ?? "";
  };
}

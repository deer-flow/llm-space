import {
  reduceMessages,
  streamThread,
  uuid,
  type AssistantMessage,
  type Message,
  type ModelConfig,
  type ReasoningLevel,
  type ReducedMessageContent,
} from "@llm-space/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { createRpcTransport } from "@/client/rpc-transport";
import { createFrameThrottle } from "@/lib/frame-throttle";

import { useDefaultTextGenerationModel } from "../model-provider";

import { PREVIEW_THROTTLE_MS } from "./streaming-preview";

// One transport for the app: stream agent runs over Electrobun RPC to the bun
// process. It multiplexes concurrent runs by internal `streamId`, so a single
// module-level instance is safe (mirrors thread-tab-pane.tsx).
const transport = createRpcTransport();

const MAX_TOKENS = 10240;

export interface UseStreamTextArgs {
  systemPrompt: string;
  /** Base conversation. Defaults to an empty array. */
  messages?: Message[];
  /** When set, a user message with this text is appended to `messages`. */
  userPrompt?: string;
  /** Reasoning effort for the model. Omitted from params when undefined. */
  reasoning?: ReasoningLevel;
  /**
   * Model to run with. Overrides `useDefaultTextGenerationModel()` when set.
   * Its `params` are ignored — `temperature`/`maxTokens`/`reasoning` are applied
   * on top regardless.
   */
  model?: ModelConfig;
}

export interface UseStreamTextResult {
  /** Latest full generated text (the last text block of the assistant message). */
  text: string;
  /** Error message from the last run, or `null`. */
  error: string | null;
  /** `true` while a run is in flight. */
  streaming: boolean;
  /**
   * Start streaming. By default uses the hook's current
   * `systemPrompt`/`userPrompt`; pass `overrides` to run with different values
   * without waiting for a re-render (e.g. a prompt captured at click time).
   */
  run: (overrides?: Partial<UseStreamTextArgs>) => Promise<void>;
}

/**
 * Run a single LLM text generation (system prompt + one user message) outside
 * the thread/Zustand machinery. `run()` triggers the stream imperatively using
 * the current args; it does not auto-run on input change.
 */
export function useStreamText({
  systemPrompt,
  messages,
  userPrompt,
  reasoning,
  model,
}: UseStreamTextArgs): UseStreamTextResult {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);

  const defaultModel = useDefaultTextGenerationModel();

  // Keep the latest inputs/model in refs so `run` has a stable identity but
  // always reads current values.
  const argsRef = useRef({
    systemPrompt,
    messages,
    userPrompt,
    reasoning,
    model,
  });
  const defaultModelRef = useRef(defaultModel);
  // Sync the latest inputs/model into the refs after commit — they're read only
  // inside `run` (a post-commit callback), so mutating them during render would
  // leak from a render React might replay or discard.
  useEffect(() => {
    argsRef.current = { systemPrompt, messages, userPrompt, reasoning, model };
    defaultModelRef.current = defaultModel;
  });

  const controllerRef = useRef<AbortController | null>(null);

  // Abort any in-flight run on unmount.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const run = useCallback(async (overrides?: Partial<UseStreamTextArgs>) => {
    const { systemPrompt, messages, userPrompt, reasoning, model } = {
      ...argsRef.current,
      ...overrides,
    };
    // An explicit `model` overrides the default text-generation model.
    const base = model ?? defaultModelRef.current;
    if (!base) {
      setError("No model available");
      return;
    }

    // Supersede any in-flight run.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setText("");
    setError(null);
    setStreaming(true);

    let streamingMessage: AssistantMessage | null = null;
    let content: ReducedMessageContent[] = [];
    const lastText = () => {
      const parts = streamingMessage?.content;
      return parts?.[parts.length - 1]?.text ?? "";
    };

    // Throttle text updates (frame-aligned, at most one per
    // PREVIEW_THROTTLE_MS) — see createFrameThrottle.
    const preview = createFrameThrottle(() => {
      if (controllerRef.current === controller) {
        setText(lastText());
      }
    }, PREVIEW_THROTTLE_MS);

    const context = {
      systemPrompt,
      messages: [
        ...(messages ?? []),
        ...(userPrompt === undefined
          ? []
          : [
              {
                id: uuid(),
                role: "user" as const,
                content: [{ type: "text" as const, text: userPrompt }],
              },
            ]),
      ],
    };
    const runModel = {
      ...base,
      params: {
        ...base.params,
        maxTokens: MAX_TOKENS,
        ...(reasoning === undefined ? {} : { reasoning }),
      },
    };

    try {
      const response = streamThread(
        { context, model: runModel },
        { signal: controller.signal, transport }
      );
      for await (const chunk of response) {
        const reduced = reduceMessages(chunk, { streamingMessage, content });
        if (!reduced) {
          continue;
        }
        streamingMessage = reduced.message;
        content = reduced.content;
        preview.schedule();
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        preview.cancel();
        if (controllerRef.current === controller) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    } finally {
      preview.cancel();
      if (controllerRef.current === controller) {
        // Emit the final text directly so a dropped frame can't leave it stale.
        setText(lastText());
        setStreaming(false);
        controllerRef.current = null;
      }
    }
  }, []);

  return { text, error, streaming, run };
}

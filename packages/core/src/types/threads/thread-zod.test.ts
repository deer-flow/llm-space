import { expect, test } from "bun:test";

import type { Thread } from "./thread";
import { ThreadZodSchema } from "./thread-zod";

test("validates deeply nested provider-hosted tool JSON data", () => {
  const thread: Thread = {
    context: {
      messages: [
        {
          id: "assistant-native",
          role: "assistant",
          content: [],
          providerHostedToolActivities: [
            {
              type: "web_search_call",
              raw: {
                nested: [{ result: [null, true, 42, "text"] }],
              },
            },
          ],
        },
      ],
    },
  };

  expect(ThreadZodSchema.parse(thread)).toEqual(thread);
  expect(
    ThreadZodSchema.safeParse({
      context: {
        messages: [
          {
            id: "assistant-native",
            role: "assistant",
            content: [],
            providerHostedToolActivities: [
              {
                type: "web_search_call",
                raw: { nested: [{ callback: () => undefined }] },
              },
            ],
          },
        ],
      },
    }).success
  ).toBe(false);
});

test("normalizes legacy provider-hosted fields before validation", () => {
  const parsed = ThreadZodSchema.parse({
    context: {
      tools: [
        {
          type: "response-api-native",
          config: { type: "web_search", search_context_size: "high" },
        },
      ],
      messages: [
        {
          id: "assistant-legacy",
          role: "assistant",
          content: [],
          nativeToolActivities: [
            {
              type: "web_search_call",
              raw: { type: "web_search_call" },
            },
          ],
        },
      ],
    },
    runHistory: [
      {
        timestamp: 1,
        thread: {
          context: {
            messages: [
              {
                id: "assistant-run",
                role: "assistant",
                content: [],
                nativeToolActivities: [
                  {
                    type: "web_search_call",
                    raw: { type: "web_search_call" },
                  },
                ],
              },
            ],
          },
        },
      },
    ],
  });

  expect(parsed.context?.tools?.[0]?.type).toBe("provider-hosted");
  expect(parsed.context?.messages?.[0]).toHaveProperty(
    "providerHostedToolActivities"
  );
  expect(
    parsed.runHistory?.[0]?.thread.context?.messages?.[0]
  ).toHaveProperty("providerHostedToolActivities");
});

test("keeps canonical provider-hosted activities when legacy keys also exist", () => {
  const currentActivity = {
    type: "current_web_search_call",
    raw: { type: "current_web_search_call" },
  };
  const legacyActivity = {
    type: "legacy_web_search_call",
    raw: { type: "legacy_web_search_call" },
  };
  const message = {
    id: "assistant-mixed",
    role: "assistant",
    content: [],
    providerHostedToolActivities: [currentActivity],
    nativeToolActivities: [legacyActivity],
  };

  const parsed = ThreadZodSchema.parse({
    context: { messages: [message] },
    runHistory: [
      {
        timestamp: 1,
        thread: { context: { messages: [message] } },
      },
    ],
  });

  expect(
    parsed.context?.messages?.[0]?.role === "assistant"
      ? parsed.context.messages[0].providerHostedToolActivities
      : undefined
  ).toEqual([currentActivity]);
  expect(
    parsed.runHistory?.[0]?.thread.context?.messages?.[0]?.role === "assistant"
      ? parsed.runHistory[0].thread.context.messages[0]
          .providerHostedToolActivities
      : undefined
  ).toEqual([currentActivity]);
  expect(JSON.stringify(parsed)).not.toContain("nativeToolActivities");
});

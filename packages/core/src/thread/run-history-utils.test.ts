import { describe, expect, test } from "bun:test";

import type { ThreadSnapshot } from "../types";

import { runResultText, summarizeRun } from "./run-history-utils";

describe("provider-hosted activity run summaries", () => {
  test("does not classify an activity-only assistant response as empty", () => {
    const thread = {
      context: {
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            content: [],
            providerHostedToolActivities: [
              {
                type: "web_search_call",
                status: "completed",
                raw: { type: "web_search_call" },
              },
            ],
          },
        ],
      },
    } as ThreadSnapshot;

    expect(summarizeRun(thread)).toBe("web_search_call");
    expect(runResultText(thread)).toBe("web_search_call (completed)");
  });
});

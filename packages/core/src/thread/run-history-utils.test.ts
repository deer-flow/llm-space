import { describe, expect, test } from "bun:test";

import type { ThreadSnapshot } from "../types";

import {
  createRunPreview,
  runEntryMessageCountLabel,
  runEntryModelLabel,
  runEntrySummary,
  runResultText,
  summarizeRun,
} from "./run-history-utils";

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

describe("run reference previews", () => {
  test("creates and reads display metadata without a loaded snapshot", () => {
    const thread: ThreadSnapshot = {
      model: { provider: "test", id: "model" },
      context: {
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "Question" }],
          },
        ],
      },
    };
    const preview = createRunPreview(thread);
    const reference = {
      id: "run-1",
      timestamp: 1,
      snapshotRef: `${"a".repeat(64)}.json`,
      preview,
    };

    expect(preview).toEqual({
      summary: "Question",
      modelLabel: "test/model",
      messageCountLabel: "1 message",
    });
    expect(runEntrySummary(reference)).toBe("Question");
    expect(runEntryModelLabel(reference)).toBe("test/model");
    expect(runEntryMessageCountLabel(reference)).toBe("1 message");
  });
});

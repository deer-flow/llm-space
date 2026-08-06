import { describe, expect, test } from "bun:test";

import type { ProviderHostedToolActivity, TextContent } from "@llm-space/core";

import {
  collectCitations,
  summarizeProviderHostedActivity,
} from "./provider-hosted-tool-activity-utils";

describe("provider-hosted tool activity presentation", () => {
  test("deduplicates safe URL citations in first-seen order", () => {
    const contents: TextContent[] = [
      {
        type: "text",
        text: "AB",
        annotations: [
          {
            type: "url_citation",
            url: "https://example.com/a",
            title: "A",
            raw: {},
          },
          {
            type: "url_citation",
            url: "javascript:alert(1)",
            raw: {},
          },
          {
            type: "url_citation",
            url: "https://example.com/a",
            title: "Duplicate",
            raw: {},
          },
          {
            type: "url_citation",
            url: "https://example.com/b",
            title: "B",
            raw: {},
          },
        ],
      },
    ];

    expect(collectCitations(contents)).toEqual([
      { url: "https://example.com/a", title: "A" },
      { url: "https://example.com/b", title: "B" },
    ]);
  });

  test("summarizes unknown provider output without inventing sources", () => {
    const activity: ProviderHostedToolActivity = {
      type: "image_generation_call",
      status: "completed",
      raw: { type: "image_generation_call", status: "completed" },
    };
    expect(summarizeProviderHostedActivity(activity)).toEqual({
      label: "image_generation_call",
      status: "completed",
      sources: [],
    });
  });

  test("uses normalized activity sources before raw web-search sources", () => {
    const activity: ProviderHostedToolActivity = {
      type: "web_search_call",
      status: "completed",
      action: { type: "search", query: "LLM Space" },
      sources: [{ url: "https://example.com/a", title: "A" }],
      raw: {
        type: "web_search_call",
        action: {
          sources: [{ url: "https://example.com/raw", title: "Raw" }],
        },
      },
    };
    expect(summarizeProviderHostedActivity(activity)).toEqual({
      label: "web_search_call",
      status: "completed",
      query: "LLM Space",
      sources: [{ url: "https://example.com/a", title: "A" }],
    });
  });
});

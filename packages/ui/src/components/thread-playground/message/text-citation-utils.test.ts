import { describe, expect, test } from "bun:test";

import type { TextContent } from "@llm-space/core";

import { normalizeCitationRanges } from "./text-citation-utils";

function _content(
  annotations: NonNullable<TextContent["annotations"]>,
  text = "LLM Space"
): TextContent[] {
  return [{ type: "text", text, annotations }];
}

describe("normalizeCitationRanges", () => {
  test("maps valid block-local ranges into joined editor text", () => {
    expect(
      normalizeCitationRanges(
        _content([
          {
            type: "url_citation",
            url: "https://example.com/a",
            title: "A",
            startIndex: 0,
            endIndex: 9,
            raw: {},
          },
        ])
      )
    ).toEqual([
      { from: 0, to: 9, url: "https://example.com/a", title: "A" },
    ]);
  });

  test.each([
    [{ startIndex: -1, endIndex: 3 }, "out-of-bounds"],
    [{ startIndex: 5, endIndex: 2 }, "reversed"],
    [{ startIndex: 0, endIndex: 3, url: "javascript:alert(1)" }, "unsafe URL"],
  ])("drops %s ranges", (range) => {
    expect(
      normalizeCitationRanges(
        _content([
          {
            type: "url_citation",
            url: "url" in range ? range.url : "https://example.com/a",
            startIndex: range.startIndex,
            endIndex: range.endIndex,
            raw: {},
          },
        ])
      )
    ).toEqual([]);
  });

  test("keeps the first sorted range and rejects a later overlap", () => {
    expect(
      normalizeCitationRanges(
        _content([
          {
            type: "url_citation",
            url: "https://example.com/a",
            title: "A",
            startIndex: 0,
            endIndex: 6,
            raw: {},
          },
          {
            type: "url_citation",
            url: "https://example.com/b",
            title: "B",
            startIndex: 4,
            endIndex: 9,
            raw: {},
          },
        ])
      )
    ).toEqual([
      { from: 0, to: 6, url: "https://example.com/a", title: "A" },
    ]);
  });

  test("accounts for newlines between text blocks", () => {
    expect(
      normalizeCitationRanges([
        { type: "text", text: "First" },
        {
          type: "text",
          text: "Second",
          annotations: [
            {
              type: "url_citation",
              url: "https://example.com/b",
              startIndex: 0,
              endIndex: 6,
              raw: {},
            },
          ],
        },
      ])
    ).toEqual([{ from: 6, to: 12, url: "https://example.com/b" }]);
  });
});

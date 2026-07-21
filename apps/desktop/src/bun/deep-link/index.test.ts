import { describe, expect, test } from "bun:test";

import { parseSharedImportUrl } from "./index";

describe("parseSharedImportUrl", () => {
  test.each([
    "llm-space://shared/gist/threads/abc123",
    "https://deer-flow.github.io/llm-space/#/shared/gist/threads/abc123",
  ])("accepts supported shared-thread URL %s", (url) => {
    expect(parseSharedImportUrl(url)).toEqual({
      connectorId: "gist",
      threadId: "abc123",
    });
  });

  test.each([
    "https://example.com/llm-space/#/shared/gist/threads/abc123",
    "https://deer-flow.github.io/llm-space/#/not-shared/gist/threads/abc123",
    "not a URL",
    "",
  ])("rejects unrelated URL %s", (url) => {
    expect(parseSharedImportUrl(url)).toBeNull();
  });
});

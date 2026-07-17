import { describe, expect, test } from "bun:test";

import { parseExternalUrl } from "./parse-external-url";

describe("parseExternalUrl", () => {
  test.each(["http://example.com/path", "https://example.com/path"])(
    "allows %s",
    (value) => {
      expect(parseExternalUrl(value).href).toBe(value);
    }
  );

  test.each([
    "not a URL",
    "file:///tmp/private.txt",
    "javascript:alert(1)",
    "custom-app://open/secret",
    "//example.com/path",
  ])("rejects %s without echoing it", (value) => {
    expect(() => parseExternalUrl(value)).toThrow(
      "External URL is not allowed."
    );

    try {
      parseExternalUrl(value);
    } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });
});

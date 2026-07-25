import { describe, expect, test } from "bun:test";

import { shellQuote } from "./ssh-command";

// The real uploader spawns OpenSSH. Keep unit coverage focused on the shell
// quoting primitive it relies on for remote paths with spaces and apostrophes.
describe("remote file transfer", () => {
  test("shell quoting supports upload paths with spaces and apostrophes", () => {
    expect(shellQuote("/tmp/llm space/it's/server.tar.gz")).toBe(
      "'/tmp/llm space/it'\\''s/server.tar.gz'"
    );
  });
});

# Safe External Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent renderer-supplied `openLink` commands from passing malformed or non-HTTP(S) URLs to the operating system.

**Architecture:** Add a small Bun-only URL parser that uses the platform `URL` parser and an explicit `http:`/`https:` protocol allowlist. Route the Bun command handler through that parser and inject the native external opener from the production composition root so the handler can be tested without invoking the OS.

**Tech Stack:** TypeScript, Bun test runner, Electrobun Bun process APIs

## Global Constraints

- Validation is authoritative in the Bun process.
- Only `http:` and `https:` schemes are allowed.
- Malformed, `file:`, `javascript:`, custom-scheme, and protocol-relative inputs must never reach `Utils.openExternal`.
- Rejection errors and logs must not include the untrusted URL.
- Do not change renderer behavior or add support for additional schemes.
- Use `bun` and `mise`; do not use npm, pnpm, or yarn.

---

### Task 1: Validate and open external HTTP(S) URLs in the Bun command handler

**Files:**
- Create: `apps/desktop/src/bun/external-url.ts`
- Create: `apps/desktop/src/bun/external-url.test.ts`
- Create: `apps/desktop/src/bun/commands.test.ts`
- Modify: `apps/desktop/src/bun/commands.ts`
- Modify: `apps/desktop/src/bun/app/start-desktop-app.ts`

**Interfaces:**
- Consumes: the standard `URL` parser, `Command`, `BrowserWindow`, and Electrobun `Utils.openExternal(url: string)`.
- Produces: `parseExternalUrl(value: string): URL` and `BunCommandDependencies.openExternal(url: string): void`.

- [x] **Step 1: Write the failing Bun-side validator tests**

```ts
import { describe, expect, test } from "bun:test";

import { parseExternalUrl } from "./external-url";

describe("parseExternalUrl", () => {
  test.each(["http://example.com/path", "https://example.com/path"])(
    "allows %s",
    (value) => expect(parseExternalUrl(value).href).toBe(value)
  );

  test.each([
    "not a URL",
    "file:///tmp/private.txt",
    "javascript:alert(1)",
    "custom-app://open/secret",
    "//example.com/path",
  ])("rejects %s without echoing it", (value) => {
    expect(() => parseExternalUrl(value)).toThrow("External URL is not allowed.");
    try {
      parseExternalUrl(value);
    } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });
});
```

- [x] **Step 2: Run the validator test to verify RED**

Run: `PATH="$HOME/.bun/bin:$PATH" bun test apps/desktop/src/bun/external-url.test.ts`

Expected: FAIL because `./external-url` does not exist.

- [x] **Step 3: Implement the minimal authoritative allowlist**

```ts
const ALLOWED_EXTERNAL_URL_PROTOCOLS = new Set(["http:", "https:"]);
const EXTERNAL_URL_REJECTION_MESSAGE = "External URL is not allowed.";

export function parseExternalUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(EXTERNAL_URL_REJECTION_MESSAGE);
  }
  if (!ALLOWED_EXTERNAL_URL_PROTOCOLS.has(url.protocol)) {
    throw new Error(EXTERNAL_URL_REJECTION_MESSAGE);
  }
  return url;
}
```

- [x] **Step 4: Run the validator test to verify GREEN**

Run: `PATH="$HOME/.bun/bin:$PATH" bun test apps/desktop/src/bun/external-url.test.ts`

Expected: all HTTP/HTTPS and rejected-input cases pass.

- [x] **Step 5: Write failing command-handler tests**

```ts
test.each(["http://example.com/path", "https://example.com/path"])(
  "opens allowed URL %s",
  (url) => {
    executeCommandInBun(
      { type: "openLink", args: { url } },
      window,
      createDependencies(openedUrls)
    );
    expect(openedUrls).toEqual([url]);
  }
);

test.each([
  "not a URL",
  "file:///tmp/private.txt",
  "javascript:alert(1)",
  "custom-app://open/secret",
  "//example.com/path",
])("does not open rejected URL %s", (url) => {
  executeCommandInBun(
    { type: "openLink", args: { url } },
    window,
    createDependencies(openedUrls)
  );
  expect(openedUrls).toEqual([]);
});
```

- [x] **Step 6: Run the command-handler test to verify RED**

Run: `PATH="$HOME/.bun/bin:$PATH" bun test apps/desktop/src/bun/commands.test.ts`

Expected: FAIL because `openLink` still invokes Electrobun directly and the dependency seam does not exist.

- [x] **Step 7: Route the handler through validation and the production native opener**

Add `openExternal: (url: string) => void` to `BunCommandDependencies`, call `parseExternalUrl(command.args.url)` inside the `openLink` case, catch rejection with a constant generic `console.error("Blocked unsafe external URL.")`, and return without calling `openExternal`. In `start-desktop-app.ts`, set `openExternal: Utils.openExternal` on `commandDependencies`.

- [x] **Step 8: Run focused tests to verify GREEN**

Run: `PATH="$HOME/.bun/bin:$PATH" bun test apps/desktop/src/bun/external-url.test.ts apps/desktop/src/bun/commands.test.ts`

Expected: all validator and command-handler tests pass, with rejected inputs never recorded by the opener stub.

- [x] **Step 9: Run repository verification**

Run: `PATH="$HOME/.bun/bin:$PATH" bun test`

Expected: all tests pass.

Run: `PATH="$HOME/.bun/bin:$PATH" bun run lint`

Expected: exit 0 with no lint errors.

Run: `PATH="$HOME/.bun/bin:$PATH" bun run typecheck`

Expected: exit 0 with no TypeScript errors.

- [x] **Step 10: Review and commit**

Run: `git diff --check && git diff --stat && git status --short`

Expected: no whitespace errors and only the issue #73 plan, validator, tests, command handler, and composition-root wiring are changed.

```bash
git add docs/superpowers/plans/2026-07-17-issue-73-safe-external-links.md \
  apps/desktop/src/bun/external-url.ts \
  apps/desktop/src/bun/external-url.test.ts \
  apps/desktop/src/bun/commands.test.ts \
  apps/desktop/src/bun/commands.ts \
  apps/desktop/src/bun/app/start-desktop-app.ts
git commit -m "fix: restrict external link schemes (#73)"
```

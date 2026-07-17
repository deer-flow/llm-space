# Confine ensureRootDir to LLM_SPACE_HOME Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent renderer-provided paths from making `ensureRootDir` create or return a directory outside `LLM_SPACE_HOME`, while preserving valid nested paths.

**Architecture:** Add a small Bun-side path resolver that treats the input as a portable relative path, rejects POSIX and Windows absolute paths plus parent traversal, resolves the target from the canonical home root, and performs a final native containment check. Keep filesystem mutation in the existing RPC handler, which will call the resolver before `mkdirSync`.

**Tech Stack:** TypeScript, Bun runtime, `node:path`, `bun:test`, Electrobun typed RPC.

## Global Constraints

- Work only in `/Users/minimax/workspace/llm-space/.worktrees/issue-70` on branch `issue-70-confine-root`.
- Use Bun, with `$HOME/.bun/bin` on `PATH`; do not use npm, pnpm, or yarn.
- Reject `../outside`, deeper traversal, POSIX absolute paths, Windows drive paths, UNC paths, and backslash traversal before filesystem mutation.
- Preserve valid nested paths including `workspace` and `tmp/deep-research`.
- Every path returned by `ensureRootDir` must resolve to `LLM_SPACE_HOME` itself or one of its descendants.
- Follow strict RED-GREEN TDD: run the focused test and observe the expected confinement failure before changing production code.

---

### Task 1: Add and wire a confined root-directory resolver

**Files:**
- Create: `apps/desktop/src/bun/rpc/root-path.ts`
- Create: `apps/desktop/src/bun/rpc/root-path.test.ts`
- Modify: `apps/desktop/src/bun/rpc/index.ts:1-4,177-181`

**Interfaces:**
- Consumes: `node:path` portable (`posix`, `win32`) and native path resolution APIs.
- Produces: `resolveRootDir(homePath: string, relativePath: string): string`, which returns the canonical home root or a contained descendant and throws `Error("Path escapes LLM_SPACE_HOME: <input>")` for escape attempts.

- [x] **Step 1: Write focused failing tests for valid and escaping paths**

```typescript
import path from "node:path";

import { describe, expect, test } from "bun:test";

import { resolveRootDir } from "./root-path";

const HOME_PATH = path.resolve("/tmp/llm-space-home");

describe("resolveRootDir", () => {
  test.each(["workspace", "tmp/deep-research"])(
    "keeps valid nested path %s inside LLM_SPACE_HOME",
    (relativePath) => {
      const resolved = resolveRootDir(HOME_PATH, relativePath);

      expect(resolved).toBe(path.join(HOME_PATH, relativePath));
      expect(
        resolved === HOME_PATH || resolved.startsWith(HOME_PATH + path.sep)
      ).toBe(true);
    }
  );

  test.each([
    "../outside",
    "tmp/../../outside",
    "/tmp/outside",
    String.raw`..\\outside`,
    String.raw`C:\\outside`,
    String.raw`\\\\server\\share`,
  ])("rejects escape attempt %s", (relativePath) => {
    expect(() => resolveRootDir(HOME_PATH, relativePath)).toThrow(
      `Path escapes LLM_SPACE_HOME: ${relativePath}`
    );
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun test apps/desktop/src/bun/rpc/root-path.test.ts`

Expected: after adding a resolver with the handler's current `path.join` behavior, FAIL because each escape attempt returns a path instead of throwing, proving confinement behavior is not implemented.

- [x] **Step 3: Implement the minimal portable confinement resolver**

```typescript
import path from "node:path";

export function resolveRootDir(
  homePath: string,
  relativePath: string
): string {
  const root = path.resolve(homePath);
  const portablePath = relativePath.replaceAll("\\", "/");
  const hasParentTraversal = portablePath.split("/").includes("..");

  if (
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    hasParentTraversal
  ) {
    throw new Error(`Path escapes LLM_SPACE_HOME: ${relativePath}`);
  }

  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Path escapes LLM_SPACE_HOME: ${relativePath}`);
  }
  return target;
}
```

- [x] **Step 4: Wire the RPC handler through the resolver before mkdir**

```typescript
import { resolveRootDir } from "./root-path";

// In ensureRootDir:
const dir = resolveRootDir(homePath, relativePath);
mkdirSync(dir, { recursive: true });
return Promise.resolve({ path: dir });
```

- [x] **Step 5: Run focused and repository verification**

Run:

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun test apps/desktop/src/bun/rpc/root-path.test.ts
bun test
bun run lint
bun run typecheck
git diff --check
```

Expected: focused tests, the full suite, lint, and `git diff --check` pass. In this worktree, typecheck is known to remain blocked by the unrelated baseline error at `apps/desktop/src/bun/models/model-manager.ts:655`, where `model` is not part of the installed `pi-ai` authentication input type; do not expand #70 to modify that file.

- [x] **Step 6: Review and commit the complete issue change**

Run:

```bash
git diff -- apps/desktop/src/bun/rpc/root-path.ts apps/desktop/src/bun/rpc/root-path.test.ts apps/desktop/src/bun/rpc/index.ts docs/superpowers/plans/2026-07-17-issue-70-confine-root.md
git add apps/desktop/src/bun/rpc/root-path.ts apps/desktop/src/bun/rpc/root-path.test.ts apps/desktop/src/bun/rpc/index.ts docs/superpowers/plans/2026-07-17-issue-70-confine-root.md
git commit -m "fix: confine root directory creation (#70)"
```

Expected: one commit referencing `#70`, with only the four issue files staged.

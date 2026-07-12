## Introduction

A workbench for prompt and agent development — build, trace, debug, evaluate, and manage, all in one place. It ships as a native **desktop app** (Electrobun), not a website.

## Tooling

Use **bun** for everything (fuzzy-pinned in `mise.toml`, exact version + checksums locked in `mise.lock` — regenerate with `mise lock` when bumping). Do not use npm/pnpm/yarn.

| Task                                   | Command                                                                     | Notes                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Set up a fresh clone                   | `mise setup`                                                                | installs the locked toolchain (`mise install`) + JS deps (`bun install`)                                               |
| Install deps                           | `bun install`                                                               | from repo root                                                                                                         |
| Run desktop app                        | `bun dev`                                                                   | root script → `cd apps/desktop && bun run dev:hmr` (Vite HMR on :5173 + `electrobun dev --watch`)                      |
| Run desktop app with CEF/CDP debugging | `bun run dev:cef`                                                           | root script → `cd apps/desktop && bun run dev:cef`; exposes CDP on `127.0.0.1:9333` by default                         |
| Build (canary)                         | `bun run build:canary`                                                      | in `apps/desktop` → `vite build && electrobun build --env=canary`                                                      |
| Build (stable)                         | `bun run build:stable`                                                      | in `apps/desktop` → `vite build && electrobun build --env=stable`                                                      |
| Local packaging / update test          | `mise run pack` · `pack:adhoc` · `pack:signed` · `pack:feed` + `feed:serve` | env combinations over `build:canary` (skip signing / ad-hoc sign / local update feed on :8321); defined in `mise.toml` |
| Cut a release                          | `bun run release` / `bun run release:canary`                                | root script → `bun scripts/release.ts`; see "Releases & auto-update"                                                   |
| Lint                                   | `bun lint` / `bun run lint:check`                                           | `lint` = `eslint --fix`, `lint:check` / `check` = `eslint .`; flat config at repo root                                 |
| Add a dependency                       | `bun add <pkg>`                                                             | run inside the target package (`apps/desktop` or `packages/core`)                                                      |
| Add a shadcn/ui component              | `bunx --bun shadcn@latest add <component>`                                  | run inside `apps/desktop`                                                                                              |
| Run a script from root                 | `bun --filter <pkg> <script>`                                               | e.g. `bun --filter @llm-space/desktop start`                                                                           |

There is **no test framework** and **no root typecheck script**; each package uses `tsc` via `tsconfig.json`.

Shared dependency versions live in the root `package.json` `catalog` (referenced as `"catalog:"`) — bump them there, not per-package. The catalog currently pins `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `react`, `react-dom`, and `typebox`.

### Electrobun page debugging

When you need to inspect or debug the real desktop renderer, use the project
skill at `./.agents/skills/electrobun-cdp-debug/SKILL.md`. Do **not** mock
`electrobun.rpc` in a browser.

Start with `bun run dev:cef`; normal `bun dev` keeps the native WebView renderer
and does not expose CDP.

When CEF/CDP verification needs an isolated app data root, put runtime sandbox
data in the system temporary directory by default, not under `.agents/` or the
repo:

```sh
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/llm-space-XXXXXX")"
LLM_SPACE_HOME="$TMP_ROOT" bun run dev:cef
```

Only keep durable evidence in the repo, such as audit screenshots, notes, logs,
and small redacted JSON snippets. Do not commit or leave routine `workspace/`,
`settings/`, caches, or generated app data under `.agents/kaizen-loop/` unless a
fixture is intentionally preserved for review and the reason is documented.

## Architecture

Bun-workspace monorepo. Workspaces are `packages/*` and `apps/*`.

- **`@llm-space/core`** (`packages/core`) — domain library, **no build step**; its TypeScript is consumed directly via the `exports` map. Entrypoints:
  - `.` → re-exports `./client`, `./types`, `./utils`.
  - `./client` — browser-safe pieces: the `streamThread()` client (`client/api`), the `reduceMessages()` streaming reducer (`client/reducer`), and the `AgentTransport` interface (`client/transport`).
  - `./server` — Node/Bun-only implementations: `streamAgent()` (`server/agent/stream`), filesystem paths (`server/paths` — `getLlmSpaceHomePath()`, `getSettingsDir()`), `LocalFileSystem` thread storage (`server/storage`), and window-state persistence (`server/window-state`).
  - `./types` — `Thread`/`Message`/`ModelConfig`/`Tool`/`FileNode`/`ModelProviderGroup` and the converters to/from the `@earendil-works/pi-*` formats.
- **`@llm-space/desktop`** (`apps/desktop`) — the Electrobun app. Built with Vite (React 19) for the renderer and `electrobun` for the shell. Two runtime contexts bridged by a single typed RPC channel:
  - **bun main process** (`src/bun/`) — owns the native window, menu, filesystem, model config, and agent streaming.
  - **webview renderer** (`src/app`, `src/components`, `src/mainview`) — the React UI.

### The RPC bridge

The typed contract lives in `src/shared/rpc.ts` (`DesktopRPCType`). The bun side creates handlers in `src/bun/rpc/index.ts` (`createMainWindowRPC()`); the renderer holds the client in `src/lib/electrobun.ts` (`electrobun.rpc`). Two directions:

- **requests** (webview → bun, request/response): `availableModels`, `addProvider`/`updateProvider`/`removeProvider`/`setModelEnabled`/…, and the filesystem ops `fsLs`/`fsRead`/`fsWrite`/`fsMkdir`/`fsCp`/`fsMv`/`fsRm`/`fsReveal` (mirroring what were HTTP routes).
- **messages** (fire-and-forget, both ways): agent streaming (`sendStreamThreadRequest` / `receiveStreamThreadResponse` / `abortStreamThread`), fullscreen sync, update status (`updateStatusChanged`), and `executeCommand` (see the command layer).

Electrobun RPC has no native streaming, so agent runs **simulate a stream over fire-and-forget messages**, correlated by a per-run `streamId` (uuid):

1. Renderer `createRpcTransport()` (`src/client/rpc-transport.ts`) sends `sendStreamThreadRequest { streamId, request }`.
2. Bun `StreamThreadController.run()` (`bun/streaming/stream-thread.ts`) iterates `streamAgent()` and sends back `receiveStreamThreadResponse` messages keyed by `streamId`: one `{ type: "event" }` per event, then a terminal `{ type: "done" }` or `{ type: "error", message }`.
3. The transport keeps a per-`streamId` listener that buffers events and drives an async iterator via a wake/notify promise — turning the message stream back into `for await`. `done` ends it, `error` throws, and abort (signal or early break) sends `abortStreamThread`, which calls `StreamThreadController.abort()` for the bun-side `AbortController`.

Downstream, `reduceMessages()` folds the events into messages.

### Bun composition and bundled modules

The Bun process object graph is assembled in one production composition root,
`src/bun/app/start-desktop-app.ts`. Process-scoped managers are constructed
there and passed explicitly to RPC, streaming, commands, updates, and tool
factories; Bun feature modules must not export import-time manager instances or
reach through a service locator.

`DesktopHost` (`src/bun/host/desktop-host.ts`) is the lifecycle boundary for
trusted, bundled modules. Modules register synchronously before RPC/window
creation, the contribution registry then freezes for the process lifetime, and
cleanup runs in reverse order on a best-effort basis. Startup errors include
the module id. Electrobun quit uses a two-phase handshake so asynchronous host,
MCP, and analytics cleanup finishes before the process exits.

V1 exposes one internal extension seam: `ToolContribution` through
`ToolRegistry` (`src/bun/tools/tool-registry.ts`). Contributions have stable
unique ids and tool names; registration snapshots and freezes tool definitions.
The bundled built-in-tools module is the reference implementation. This is not
a public plugin SDK: dynamic loading, manifests, permissions, runtime
enable/disable, renderer contributions, and third-party compatibility remain
out of scope.

### Data flow (the core loop)

UI action → Zustand `run()` (`components/thread-playground/stores/thread-store.ts`) → `streamThread()` (core) with an injected `AgentTransport`. The desktop transport is `createRpcTransport()`, wired in once at `components/thread-tabs/thread-tab-pane.tsx`; it runs the RPC streaming dance above. On the bun side `StreamThreadController.run()` calls `streamAgent()` (`@llm-space/core/server`), which drives `agentLoopContinue()` from `@earendil-works/pi-agent-core`. The resulting event iterator → `reduceMessages()` → Zustand → UI re-renders.

### Thread store

Each open thread owns its own Zustand store (`stores/thread-store.ts`), created per-tab via `createThreadStore()` and supplied through `ThreadStoreContext` — there is **no global store**. Read it with `useThreadStore(selector)` and `useThreadStoreActions()`. State holds the `thread`, `streamingMessage`, `status`, `runHistory`, and `changeHistory`; `run()` drives a streaming turn. Undo/redo lives in `stores/thread-history.ts`: snapshots are thread _references_ (copy-on-write shares unchanged substructure, so undo is an O(1) pointer move), capped by count and a retained-image-bytes budget.

### Persistence

State is **persisted to disk** under the llm-space root (`~/.llm-space` by default; override with `LLM_SPACE_HOME`):

- `workspace/` — thread files as JSON, served through `LocalFileSystem` behind the `fs*` RPC requests. On a fresh install `bun/workspace/seed.ts` creates the empty directory so the welcome screen can offer blank-thread and example-start choices.
- `settings/` — `models.json` (configured providers, owned by `ModelManager`) and `window.json` (frame/zoom/maximized).

### Releases & auto-update

The app version has a **single source of truth: `apps/desktop/package.json`** — `electrobun.config.ts` imports it, and release CI fails if the pushed tag doesn't match. Cut releases with `bun run release` (stable) or `bun run release:canary`; the script (`scripts/release.ts`) runs `commit-and-tag-version` (conventional-commits-driven version bump + commit + `v*` tag, config in `.versionrc.json`) and pushes atomically. Changelog generation is off (`skip.changelog`), and CI publishes versioned releases with static notes (not `--generate-notes`), keeping release notes minimal. The tag triggers `.github/workflows/release.yml`: build → codesign/notarize (canary/stable only; needs the `ELECTROBUN_*` secrets) → smoke test → upload. Artifacts land in two GitHub releases: the rolling `updates` release is the machine-readable update feed (`release.baseUrl` points at it; **never delete its `.patch` files** — old installs chain through them), and a versioned release carries the DMG for humans. In-app auto-update lives in `bun/updates/` (background check → silent download → "restart to update" toast via the `updateStatusChanged` message); the dev channel never updates.

Releases ship for **macOS arm64 + x64**. Intel builds need `apps/desktop/scripts/fix-x64-headerpad.ts` (wired as the `postBuild`/`postWrap` hooks): electrobun's darwin-x64 core binaries have no Mach-O headerpad, so signing them corrupts `__text` and the app segfaults on launch (electrobun#485). The hook frees 16 bytes of load-command room before signing and no-ops everywhere else; delete it when upstream fixes #485.

### The command layer

Every cross-boundary user action (menus, context menus, toolbar buttons, shortcuts) is a `Command` — a `type` discriminant + typed `args` — defined in `src/shared/commands.ts`. `COMMAND_META` tags each with a `target` of `"webview"` or `"bun"`. A single `executeCommand` on each side routes it: the bun side (`bun/commands.ts` `executeCommandInBun`) runs `bun`-target commands locally (window zoom/reload, open external links) and forwards `webview`-target ones over RPC; the renderer (`commands/index.tsx` `CommandProvider`) does the reverse. The native menu (`bun/app/menu.ts`) maps its string actions into commands.

### App layout (`apps/desktop/src`)

- `mainview/` — the Vite entry: `index.html` + `main.tsx` mounting `<App>`.
- `app/` — `index.tsx` (App), `layout.tsx` (providers: React Query, `ModelProvider`, tooltips, sonner toaster), `page.tsx` (resizable sidebar + tabs, settings/command-palette/onboard dialogs).
- `bun/` — main-process code: `app/` (window, menu, window-state), `rpc/`, `streaming/`, `storage/`, `models/` (`ModelManager` + builtin/custom providers), `fs/` (trash/reveal), `env/hydrate` (loads login-shell env — API keys/PATH — before anything reads `process.env`), `workspace/seed`.
- `client/` — renderer-side RPC callers: `rpc-transport.ts` (streaming) and `local-file-system.ts` (the `fs*` requests).
- `shared/` — code used by both contexts: `rpc.ts`, `commands.ts`.
- `components/` — the UI: `thread-playground/` (main editor: messages, model config, system prompt, tools, run history; Zustand store + change history under `stores/`), `thread-tabs/`, `file-system-tree-view/`, `settings/`, `command-palette.tsx`, `onboard-dialog.tsx`, `model-provider.tsx`, `code-editor/` (CodeMirror wrapper), and `ui/` (generated shadcn/ui — **don't hand-edit**, also ESLint-ignored).
- `styles/globals.css` — Tailwind v4 + OKLch design tokens. The app is dark-themed.

### Static assets (images, etc.)

There are two kinds of assets, and they land in different places:

- **Imported assets** — `import logo from "./logo.svg"`. Vite hashes these into `dist/assets`, which `electrobun.config.ts` already copies to `views/mainview/assets`. No config change needed.
- **Public assets referenced by absolute path** — e.g. `<img src="/images/onboard.png">`. These live under **`src/mainview/public/`** (Vite's `root` is `src/mainview`, so `public/images/onboard.png` is served at `/images/onboard.png`). Vite copies `public/` verbatim into `dist/`, but a **packaged build only copies what `electrobun.config.ts` `build.copy` lists** — so any new top-level public folder must be added there, or it 404s in the built app. Today `build.copy` maps `dist/images` → `views/mainview/images`; if you add, say, `public/fonts/`, add a `"dist/fonts": "views/mainview/fonts"` entry too.

Prefer dropping new images into the existing `src/mainview/public/images/` folder so no config edit is required.

## Conventions

- **TypeScript**: strict, ESNext, `moduleResolution: bundler`. In `apps/desktop`, `@/*` maps to `./src/*`.
- **Layering**: `@llm-space/core` splits browser-safe code (`./client`, `./types`, `./utils`, root `.`) from Node/Bun-only server implementations (`./server`). The desktop **bun process** consumes `@llm-space/core/server`; the **renderer** consumes the client/types entrypoints and reaches the bun process over RPC (never imports `./server`).

### Naming

- **File names** are **kebab-case** for every `.ts`/`.tsx` file, including component files (e.g. `tool-call-list-item.tsx`, `model-provider.tsx`). No PascalCase or camelCase filenames. One primary component/export per file, named after the file.
- **Identifiers**:
  - React components, classes, types, and interfaces are **PascalCase** (`ThreadPlayground`, `ModelManager`, `Command`, `FileNode`).
  - Functions, variables, hooks, and command `type` discriminants are **camelCase** (`createMainWindowRPC`, `useThreadTabs`, `newFile`, `closeTab`).
  - Module-level constants are **UPPER_SNAKE_CASE** (`DOCS_URL`, `ZOOM_STEP`, `COMMAND_META`, `BUILTIN_PROVIDERS`).
- **Leading underscore for what's private**:
  - Module-private (non-exported) functions: `_foo()`.
  - Private class members: `_config`, `_models`, `_loadConfig()` (see `ModelManager`).
  - When a wrapper re-exports a primitive under the same name, alias the primitive with a leading underscore to avoid the collision (`import { Tooltip as _Tooltip } from "./ui/tooltip"` in `components/tooltip.tsx`).

### UI elements

- **`ui/`** is generated shadcn/ui — **don't hand-edit** (also ESLint-ignored). Add components with `bunx --bun shadcn@latest add <component>`.
- Prefer the **app-level wrappers** in `components/` over the raw shadcn primitives. In particular, **Tooltips must use `@/components/tooltip`** (`<Tooltip content={...}>…</Tooltip>`) — do **not** import `Tooltip`/`TooltipTrigger`/`TooltipContent` from `ui/tooltip` directly. The only direct use of the primitive is `TooltipProvider`, wired once in `app/layout.tsx`.
- **Confirmations**: gate destructive or irreversible actions (delete a file, remove a provider) behind `ConfirmDialog` from `@/components/confirm-dialog` — don't fire them straight from a click.
- **Menus and commands**: every cross-boundary action is a `Command` (`shared/commands.ts`); its `type` is camelCase. Labels in `COMMAND_META`, native menus (`bun/app/menu.ts`), context menus, dropdown menus, and similar menu-like surfaces are **Title Case** ("Add New Method", "New File", "Close Tab"). Route everything through `executeCommand` rather than calling handlers directly.
- **General UI copy**: ordinary buttons, headings, helper text, empty states, dialogs, and other non-menu labels use sentence case ("Add new method", "Start from example", "No tools yet").

### Performance

**Weigh render performance on every change.** This UI streams events and re-renders hot lists (messages, tool calls), so:

- Wrap components that re-render often or sit in a list in `memo()`. The house pattern is `export const Foo = memo(_Foo)` — the underscore-prefixed inner holds the implementation (see `MessageListItem`, `ThinkingView`, `CodeEditor`).
- Keep memo effective: stabilize props with `useMemo`/`useCallback` and read the store through narrow `useThreadStore(selector)` slices so a component only re-renders on the state it uses.
- Don't reach for `memo()` reflexively on cheap, rarely-rendered components — add it where a profile or the render path shows it pays off.

### Formatting

- **Prettier**: 2-space indent, double quotes, semicolons, es5 trailing commas, tailwind class sorting (`prettier-plugin-tailwindcss`). Import ordering is enforced by `eslint-plugin-import-x`.

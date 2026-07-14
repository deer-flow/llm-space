---
name: electrobun-cdp-debug
description: Debug the LLM Space desktop Electrobun renderer through CEF Chrome DevTools Protocol. Use the bundled raw CDP probe for the actual Electrobun CEF renderer, and use chrome-devtools-axi for ordinary Chrome/browser automation.
---

# Electrobun CDP Debug

Use this skill to inspect the actual desktop renderer. Do not mock
`electrobun.rpc` in a browser when the user asks to debug the Electrobun page.

This skill uses a hybrid path:

- Use `bunx --bun chrome-devtools-axi ...` for ordinary Chrome sessions,
  public websites, and browser automation that does not depend on Electrobun.
- Use the bundled `electrobun-cdp-axi.mjs` raw CDP wrapper for the LLM Space
  Electrobun CEF renderer.
- Use the lower-level `cdp-probe.mjs` when JSON output or a custom one-off CDP
  probe is simpler.
  Current `chrome-devtools-axi` releases do not directly drive this CEF target.

## Use chrome-devtools-axi For Ordinary Chrome

Invoke the CLI through Bun instead of adding a dependency:

```sh
bunx --bun chrome-devtools-axi open https://example.com
bunx --bun chrome-devtools-axi snapshot
bunx --bun chrome-devtools-axi eval 'document.title'
bunx --bun chrome-devtools-axi screenshot /tmp/page.png
```

If `chrome-devtools-axi` suggests a follow-up command beginning with
`chrome-devtools-axi`, run it as `bunx --bun chrome-devtools-axi ...`.

Do not add `chrome-devtools-axi` to `package.json` or `bun.lock` for this skill;
the project uses one-off `bunx --bun` invocations.

## Start The Desktop App

From the repo root:

```sh
mise run dev:cef
```

This runs the desktop app with CEF and opens CDP on `127.0.0.1:9333`.
If the port is busy:

```sh
LLM_SPACE_DESKTOP_CDP_PORT=9334 mise run dev:cef
```

Normal `mise run dev` keeps the native WebView renderer and does not expose CDP.

When verification needs an isolated app data root, keep runtime data outside the
repo:

```sh
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/llm-space-XXXXXX")"
LLM_SPACE_HOME="$TMP_ROOT" mise run dev:cef
```

## Inspect Electrobun With The Raw CDP AXI Wrapper

Use the bundled AXI-style wrapper from the repo root:

```sh
bun run .agents/skills/electrobun-cdp-debug/scripts/electrobun-cdp-axi.mjs snapshot
```

Common variants:

```sh
bun run .agents/skills/electrobun-cdp-debug/scripts/electrobun-cdp-axi.mjs pages
bun run .agents/skills/electrobun-cdp-debug/scripts/electrobun-cdp-axi.mjs eval 'document.title'
bun run .agents/skills/electrobun-cdp-debug/scripts/electrobun-cdp-axi.mjs screenshot /tmp/llm-space-cef.png
bun run .agents/skills/electrobun-cdp-debug/scripts/electrobun-cdp-axi.mjs click @r1
bun run .agents/skills/electrobun-cdp-debug/scripts/electrobun-cdp-axi.mjs fill @r2 'hello'
bun run .agents/skills/electrobun-cdp-debug/scripts/electrobun-cdp-axi.mjs console --ms 3000
bun run .agents/skills/electrobun-cdp-debug/scripts/electrobun-cdp-axi.mjs snapshot --port 9334
```

The wrapper connects directly to the page target websocket from `/json/list`, so
it avoids the `chrome-devtools-axi` → `chrome-devtools-mcp` → Puppeteer path that
currently fails against Electrobun CEF. Snapshot refs such as `@r1` are resolved
against the current live DOM order on each command; re-run `snapshot` after page
changes before using a ref.

## Low-Level JSON Probe

Use the bundled JSON probe from the repo root when raw JSON is more useful:

```sh
bun run .agents/skills/electrobun-cdp-debug/scripts/cdp-probe.mjs
```

Common variants:

```sh
bun run .agents/skills/electrobun-cdp-debug/scripts/cdp-probe.mjs --screenshot /tmp/llm-space-cef.png
bun run .agents/skills/electrobun-cdp-debug/scripts/cdp-probe.mjs --eval 'document.body.innerText.slice(0, 2000)'
bun run .agents/skills/electrobun-cdp-debug/scripts/cdp-probe.mjs --console-ms 3000
bun run .agents/skills/electrobun-cdp-debug/scripts/cdp-probe.mjs --port 9334
```

The script connects to `/json/list`, picks the `LLM Space` page target when
present, evaluates in the page context, and prints JSON.

## Current chrome-devtools-axi Compatibility Limit

`chrome-devtools-axi` supports existing DevTools endpoints through
`CHROME_DEVTOOLS_AXI_BROWSER_URL`, but the current CLI and its underlying
`chrome-devtools-mcp` transport do not yet operate correctly against the
Electrobun CEF endpoint exposed by `mise run dev:cef`.

The observed smoke test shape is:

```sh
curl -fsS http://127.0.0.1:9333/json/list
CHROME_DEVTOOLS_AXI_BROWSER_URL=http://127.0.0.1:9333 \
  CHROME_DEVTOOLS_AXI_SESSION=llm-space-electrobun \
  bunx --bun chrome-devtools-axi snapshot --full
```

`/json/list` can show the `LLM Space` page target, and `cdp-probe.mjs` can read
the page successfully, but `chrome-devtools-axi` has been observed to return
`Unexpected server response: 101` or `pages: 0 pages open` for this CEF target.

Keep the raw CDP probe as the Electrobun renderer path until a future
`chrome-devtools-axi`/`chrome-devtools-mcp` release can list, select, snapshot,
evaluate, and screenshot the `LLM Space` page target through
`CHROME_DEVTOOLS_AXI_BROWSER_URL=http://127.0.0.1:9333`.

## Interaction Guidance

Prefer semantic DOM operations through `Runtime.evaluate`, for example clicking a
button found by text, role, icon class, or nearby content. Use
`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` only when native coordinate
behavior matters.

For screenshots, use the probe's `--screenshot` option or CDP
`Page.captureScreenshot`. Show the saved image to the user when visual layout is
part of the task.

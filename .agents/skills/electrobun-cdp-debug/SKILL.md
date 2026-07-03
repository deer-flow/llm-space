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
- Use the bundled `cdp-probe.mjs` for the LLM Space Electrobun CEF renderer.
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
bun run dev:cef
```

This runs the desktop app with CEF and opens CDP on `127.0.0.1:9333`.
If the port is busy:

```sh
LLM_SPACE_DESKTOP_CDP_PORT=9334 bun run dev:cef
```

Normal `bun dev` keeps the native WebView renderer and does not expose CDP.

When verification needs an isolated app data root, keep runtime data outside the
repo:

```sh
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/llm-space-XXXXXX")"
LLM_SPACE_ROOT="$TMP_ROOT" bun run dev:cef
```

## Inspect Electrobun Page State

Use the bundled probe from the repo root:

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
Electrobun CEF endpoint exposed by `bun run dev:cef`.

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

#!/usr/bin/env bun
/* global Bun */

const DEFAULT_PORT = Bun.env.LLM_SPACE_DESKTOP_CDP_PORT ?? "9333";
const DEFAULT_TARGET = "LLM Space";
const DEFAULT_SNAPSHOT_TEXT_LIMIT = 4000;
const FULL_SNAPSHOT_TEXT_LIMIT = 50000;
const DEFAULT_REF_LIMIT = 60;
const FULL_REF_LIMIT = 300;

const HELP = `Usage:
  bun run .agents/skills/electrobun-cdp-debug/scripts/electrobun-cdp-axi.mjs <command> [args] [flags]

Commands:
  pages                         List page targets from /json/list.
  snapshot [--full]             Print an AXI-style page snapshot with live refs.
  eval <js>                     Evaluate JavaScript in the page. Bare expressions are wrapped.
  screenshot <path>             Save a PNG screenshot.
  click <@ref|selector>         Click a live ref from snapshot, or a CSS selector.
  fill <@ref|selector> <text>   Fill an input, textarea, select, or contenteditable element.
  console [--ms <n>]            Collect console events after connecting.

Flags:
  --port <port>                 CDP port. Defaults to LLM_SPACE_DESKTOP_CDP_PORT or 9333.
  --target <text>               Target title or URL substring. Defaults to "LLM Space".
  --full                        Show a longer snapshot.
  --ms <n>                      Console collection time in milliseconds.
  --help                        Show this help.

Refs:
  Snapshot refs such as @r1 are resolved against the current live DOM order on
  each command. Re-run snapshot after page changes before using a ref.
`;

const { command, positional, flags } = parseArgs(Bun.argv.slice(2));

if (!command || flags.help) {
  console.info(HELP.trimEnd());
  process.exit(0);
}

try {
  switch (command) {
    case "pages":
      console.info(await handlePages(flags));
      break;
    case "snapshot":
      console.info(
        await withPage(flags, (client, target) =>
          handleSnapshot(client, target, flags)
        )
      );
      break;
    case "eval":
      console.info(
        await withPage(flags, (client, target) =>
          handleEval(client, target, positional)
        )
      );
      break;
    case "screenshot":
      console.info(
        await withPage(flags, (client, target) =>
          handleScreenshot(client, target, positional)
        )
      );
      break;
    case "click":
      console.info(
        await withPage(flags, (client, target) =>
          handleClick(client, target, positional, flags)
        )
      );
      break;
    case "fill":
      console.info(
        await withPage(flags, (client, target) =>
          handleFill(client, target, positional, flags)
        )
      );
      break;
    case "console":
      console.info(
        await withPage(flags, (client, target) =>
          handleConsole(client, target, flags)
        )
      );
      break;
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP.trimEnd()}`);
  }
} catch (error) {
  console.error(`error: ${getErrorMessage(error)}`);
  process.exit(1);
}

async function handlePages(flags) {
  const port = flags.port ?? DEFAULT_PORT;
  const targets = await listTargets(port);
  const pages = targets.filter((target) => target.type === "page");
  if (pages.length === 0) {
    return "pages: 0 pages open";
  }

  return [
    `pages[${pages.length}]:`,
    ...pages.map((page, index) => {
      const selected = isTargetMatch(page, flags.target ?? DEFAULT_TARGET)
        ? " [target]"
        : "";
      return `  ${index + 1} ${quote(page.title || "(untitled)")} ${page.url}${selected}`;
    }),
  ].join("\n");
}

async function handleSnapshot(client, target, flags) {
  await enablePageDomains(client);
  const data = await evaluate(
    client,
    buildSnapshotExpression(flags.full === true)
  );
  return formatSnapshot(target, data, flags.full === true);
}

async function handleEval(client, target, positional) {
  const source = positional.join(" ").trim();
  if (!source) {
    throw new Error("eval requires JavaScript source");
  }

  await enablePageDomains(client);
  const value = await evaluate(client, normalizeEvalSource(source));

  return renderOutput([
    formatPageHeader(target, 0),
    "value:",
    indent(formatValue(value)),
  ]);
}

async function handleScreenshot(client, target, positional) {
  const filePath = positional[0];
  if (!filePath) {
    throw new Error("screenshot requires a path");
  }

  await client.send("Page.enable");
  const captured = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await Bun.write(filePath, Buffer.from(captured.result.data, "base64"));

  return renderOutput([formatPageHeader(target, 0), `screenshot: ${filePath}`]);
}

async function handleClick(client, target, positional, flags) {
  const locator = positional[0];
  if (!locator) {
    throw new Error("click requires @ref or CSS selector");
  }

  await enablePageDomains(client);
  const clicked = await evaluate(client, buildClickExpression(locator));
  await sleep(150);
  const snapshot = await evaluate(
    client,
    buildSnapshotExpression(flags.full === true)
  );

  return renderOutput([
    formatPageHeader(target, snapshot.refs.length),
    `clicked: ${formatRefLine(clicked)}`,
    "snapshot:",
    indent(formatSnapshotBody(snapshot, flags.full === true)),
  ]);
}

async function handleFill(client, target, positional, flags) {
  const locator = positional[0];
  if (!locator) {
    throw new Error("fill requires @ref or CSS selector");
  }
  if (positional.length < 2) {
    throw new Error("fill requires text");
  }

  const text = positional.slice(1).join(" ");

  await enablePageDomains(client);
  const filled = await evaluate(client, buildFillExpression(locator, text));
  await sleep(100);
  const snapshot = await evaluate(
    client,
    buildSnapshotExpression(flags.full === true)
  );

  return renderOutput([
    formatPageHeader(target, snapshot.refs.length),
    `filled: ${formatRefLine(filled)}`,
    "snapshot:",
    indent(formatSnapshotBody(snapshot, flags.full === true)),
  ]);
}

async function handleConsole(client, target, flags) {
  await enablePageDomains(client);
  const ms = Number(flags.ms ?? "0");
  if (Number.isNaN(ms) || ms < 0) {
    throw new Error("--ms must be a non-negative number");
  }
  if (ms > 0) {
    await sleep(ms);
  }

  const lines = client.consoleEvents.map((event, index) => {
    return `  ${index + 1} ${event.type}: ${event.args.map(formatConsoleArg).join(" ")}`;
  });

  return renderOutput([
    formatPageHeader(target, 0),
    `console[${client.consoleEvents.length}]:`,
    ...(lines.length > 0 ? lines : ["  (no console events observed)"]),
  ]);
}

async function withPage(flags, callback) {
  const target = await findPageTarget({
    port: flags.port ?? DEFAULT_PORT,
    targetText: flags.target ?? DEFAULT_TARGET,
  });
  const client = await connectCdp(target.webSocketDebuggerUrl);
  try {
    return await callback(client, target);
  } finally {
    client.close();
  }
}

async function listTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) {
    throw new Error(
      `CDP target list failed on port ${port}: ${response.status}`
    );
  }
  return response.json();
}

async function findPageTarget({ port, targetText }) {
  const targets = await listTargets(port);
  const target =
    targets.find(
      (candidate) =>
        candidate.type === "page" && isTargetMatch(candidate, targetText)
    ) ?? targets.find((candidate) => candidate.type === "page");

  if (!target?.webSocketDebuggerUrl) {
    throw new Error(`No CDP page target found on port ${port}`);
  }

  return target;
}

function isTargetMatch(target, text) {
  return target.title?.includes(text) || target.url?.includes(text);
}

async function connectCdp(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  const consoleEvents = [];
  let nextId = 1;

  ws.onmessage = (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === "Runtime.consoleAPICalled") {
      consoleEvents.push({
        type: message.params.type,
        args: message.params.args.map(
          (arg) => arg.value ?? arg.description ?? arg.type
        ),
        timestamp: message.params.timestamp,
      });
    }

    if (!message.id) return;
    const deferred = pending.get(message.id);
    if (!deferred) return;
    pending.delete(message.id);
    if (message.error) {
      deferred.reject(new Error(JSON.stringify(message.error)));
      return;
    }
    deferred.resolve(message);
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  return {
    consoleEvents,
    close() {
      ws.close();
    },
    send(method, params = {}) {
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
  };
}

async function enablePageDomains(client) {
  await client.send("Runtime.enable");
  await client.send("Page.enable");
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });

  if (response.error) {
    throw new Error(JSON.stringify(response.error));
  }
  if (response.result.exceptionDetails) {
    throw new Error(
      response.result.exceptionDetails.exception?.description ??
        JSON.stringify(response.result.exceptionDetails)
    );
  }

  const result = response.result.result;
  if (Object.hasOwn(result, "value")) {
    return result.value;
  }
  return result.description ?? null;
}

function normalizeEvalSource(source) {
  const trimmed = source.trim();
  if (looksLikeCalledExpression(trimmed)) {
    return trimmed;
  }
  if (looksLikeFunction(trimmed)) {
    return `(${trimmed})()`;
  }
  return `(() => (${trimmed}))()`;
}

function looksLikeCalledExpression(source) {
  return /^\s*\(/.test(source) && /\)\s*\([^)]*\)\s*$/.test(source);
}

function looksLikeFunction(source) {
  return (
    /^(?:async\s+)?function\b/.test(source) ||
    /^(?:async\s+)?\(?[\w\s,{}[\]]*\)?\s*=>/.test(source)
  );
}

function buildSnapshotExpression(full) {
  return `(${pageHelpersSource()})({ maxText: ${
    full ? FULL_SNAPSHOT_TEXT_LIMIT : DEFAULT_SNAPSHOT_TEXT_LIMIT
  }, maxRefs: ${full ? FULL_REF_LIMIT : DEFAULT_REF_LIMIT} })`;
}

function buildClickExpression(locator) {
  return `(${pageHelpersSource()})({ action: "click", locator: ${JSON.stringify(locator)} })`;
}

function buildFillExpression(locator, text) {
  return `(${pageHelpersSource()})({ action: "fill", locator: ${JSON.stringify(locator)}, text: ${JSON.stringify(text)} })`;
}

function pageHelpersSource() {
  return String.raw`(options) => {
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const isVisible = (element) => {
    if (!(element instanceof Element)) return false;
    if (element.closest("[aria-hidden='true']")) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const roleOf = (element) => {
    const explicit = element.getAttribute("role");
    if (explicit) return explicit;
    const tag = element.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "textarea") return "textbox";
    if (tag === "select") return "combobox";
    if (tag === "input") return element.getAttribute("type") || "input";
    if (element.isContentEditable) return "textbox";
    return tag;
  };
  const labelOf = (element) => {
    const id = element.getAttribute("id");
    const labelledBy = element.getAttribute("aria-labelledby");
    const labelledByText = labelledBy
      ? labelledBy
          .split(/\s+/)
          .map((part) => document.getElementById(part)?.innerText)
          .filter(Boolean)
          .join(" ")
      : "";
    const labelText = id
      ? [...document.querySelectorAll("label")]
          .filter((label) => label.getAttribute("for") === id)
          .map((label) => label.innerText)
          .join(" ")
      : "";
    return normalize(
      labelledByText ||
        element.getAttribute("aria-label") ||
        labelText ||
        element.getAttribute("title") ||
        element.getAttribute("placeholder") ||
        element.value ||
        element.innerText ||
        element.textContent
    );
  };
  const rectOf = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };
  const interactiveElements = () => {
    const selector = [
      "button",
      "[role='button']",
      "a[href]",
      "input",
      "textarea",
      "select",
      "[contenteditable='true']",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    return [...document.querySelectorAll(selector)].filter(isVisible);
  };
  const describe = (element, index) => ({
    ref: index === undefined ? null : "@r" + (index + 1),
    role: roleOf(element),
    label: labelOf(element),
    tag: element.tagName.toLowerCase(),
    rect: rectOf(element),
  });
  const resolveElement = (locator) => {
    if (locator.startsWith("@r")) {
      const index = Number(locator.slice(2)) - 1;
      if (!Number.isInteger(index) || index < 0) {
        throw new Error("Invalid ref " + locator);
      }
      return { element: interactiveElements()[index], index };
    }
    const element = document.querySelector(locator);
    return { element, index: undefined };
  };
  if (options.action === "click") {
    const { element, index } = resolveElement(options.locator);
    if (!element) throw new Error("No element found for " + options.locator);
    element.scrollIntoView({ block: "center", inline: "center" });
    element.focus?.({ preventScroll: true });
    element.click();
    return describe(element, index);
  }
  if (options.action === "fill") {
    const { element, index } = resolveElement(options.locator);
    if (!element) throw new Error("No element found for " + options.locator);
    element.scrollIntoView({ block: "center", inline: "center" });
    element.focus?.({ preventScroll: true });
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = options.text;
    } else if (element instanceof HTMLSelectElement) {
      element.value = options.text;
    } else if (element.isContentEditable) {
      element.textContent = options.text;
    } else {
      throw new Error("Element is not fillable: " + options.locator);
    }
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: options.text }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return describe(element, index);
  }
  const refs = interactiveElements()
    .slice(0, options.maxRefs)
    .map((element, index) => describe(element, index));
  return {
    title: document.title,
    href: location.href,
    text: normalize(document.body?.innerText ?? "").slice(0, options.maxText),
    hasElectrobun:
      typeof globalThis.__electrobun !== "undefined" ||
      typeof globalThis.electrobun !== "undefined",
    refs,
  };
}`;
}

function formatSnapshot(target, data, full) {
  return renderOutput([
    formatPageHeader(target, data.refs.length, data.hasElectrobun),
    "snapshot:",
    indent(formatSnapshotBody(data, full)),
    renderHelp([
      "Run `bun run .agents/skills/electrobun-cdp-debug/scripts/electrobun-cdp-axi.mjs click @r1` to click a ref",
      "Run `bun run .agents/skills/electrobun-cdp-debug/scripts/electrobun-cdp-axi.mjs eval 'document.title'` for JS",
    ]),
  ]);
}

function formatSnapshotBody(data, full) {
  const lines = [`RootWebArea ${quote(data.title || "(untitled)")}`];
  if (data.text) {
    lines.push(
      `text ${quote(full ? data.text : truncate(data.text, DEFAULT_SNAPSHOT_TEXT_LIMIT))}`
    );
  }
  for (const ref of data.refs) {
    lines.push(formatRefLine(ref));
  }
  return lines.join("\n");
}

function formatRefLine(ref) {
  const label = ref.label ? ` ${quote(ref.label)}` : "";
  const rect = ref.rect
    ? ` [${ref.rect.x},${ref.rect.y},${ref.rect.width}x${ref.rect.height}]`
    : "";
  return `${ref.ref ?? "(selector)"} ${ref.role}${label}${rect}`;
}

function formatPageHeader(target, refs, hasElectrobun = undefined) {
  const electrobunPart =
    hasElectrobun === undefined ? "" : `, hasElectrobun: ${hasElectrobun}`;
  return `page: {title: ${quote(target.title || "")}, url: ${quote(target.url || "")}, refs: ${refs}${electrobunPart}}`;
}

function renderHelp(lines) {
  return [`help[${lines.length}]:`, ...lines.map((line) => `  ${line}`)].join(
    "\n"
  );
}

function renderOutput(blocks) {
  return blocks.filter(Boolean).join("\n");
}

function formatValue(value) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return JSON.stringify(value, null, 2);
}

function formatConsoleArg(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function indent(text) {
  return String(text)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function quote(value) {
  return JSON.stringify(String(value));
}

function truncate(value, limit) {
  const text = String(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  let command = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
      continue;
    }
    if (arg === "--full") {
      flags.full = true;
      continue;
    }
    if (arg === "--port" || arg === "--target" || arg === "--ms") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      flags[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    if (!command) {
      command = arg;
      continue;
    }
    positional.push(arg);
  }

  return { command, positional, flags };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

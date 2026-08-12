#!/usr/bin/env bun
/* global Bun */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = Bun.argv.slice(2);
const label = readFlag("--label", "benchmark");
const outputPath = readFlag(
  "--output",
  join(tmpdir(), `llm-space-thread-view-${label}.json`)
);
const smoke = readFlag("--smoke", null);
const samples = Number(readFlag("--samples", smoke ? "1" : "5"));
const port = 9400 + (process.pid % 200);
const root = await mkdtemp(join(tmpdir(), "llm-space-thread-view-"));
const workspace = join(root, "workspace");
let child;

try {
  await mkdir(workspace, { recursive: true });
  for (let index = 1; index <= 10; index += 1) {
    await writeFile(
      join(workspace, `benchmark-${String(index).padStart(2, "0")}.json`),
      JSON.stringify(createThread(index), null, 2)
    );
  }

  child = Bun.spawn(["mise", "run", "dev:cef"], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      LLM_SPACE_HOME: root,
      LLM_SPACE_DESKTOP_CDP_PORT: String(port),
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const logs = collectLogs(child);
  await waitForCdp(port, child, logs);
  const cdp = await CdpClient.connect(port);
  try {
    await prepareApp(cdp);
    await openFixtureThreads(cdp);

    if (smoke === "dropdowns") {
      const dropdowns = await smokeDropdowns(cdp);
      const result = { label, smoke, dropdowns };
      await Bun.write(outputPath, JSON.stringify(result, null, 2));
      if (!dropdownPasses(dropdowns.toolsAdd) || !dropdownPasses(dropdowns.examples)) {
        throw new Error(
          `Dropdown smoke expected non-modal menus: ${JSON.stringify(result)}`
        );
      }
      console.info(JSON.stringify({ outputPath, ...result }, null, 2));
      process.exitCode = 0;
    } else if (smoke === "on-demand") {
      const onDemand = await measureMode(cdp, "on-demand", 0);
      const result = { label, smoke, onDemand };
      await Bun.write(outputPath, JSON.stringify(result, null, 2));
      if (!onDemand.activation?.restoresStaticPreview) {
        throw new Error(`On Demand lifecycle smoke failed: ${JSON.stringify(result)}`);
      }
      console.info(JSON.stringify({ outputPath, ...result }, null, 2));
    } else {
      const full = await measureMode(cdp, "rich", samples);
      const fast = await measureMode(cdp, "lite", samples);
      const onDemand = await measureMode(cdp, "on-demand", samples);
      const tabSwitches = await measureTabSwitches(cdp, samples);
      const result = {
        label,
        baseCommit: await git("rev-parse", "main"),
        benchmarkCommit: await git("rev-parse", "HEAD"),
        renderer: "cef",
        fixture: { threads: 10, messagesPerThread: 54 },
        samples,
        full,
        fast,
        onDemand,
        tabSwitches,
      };
      await Bun.write(outputPath, JSON.stringify(result, null, 2));
      console.info(JSON.stringify({ outputPath, ...result }, null, 2));
    }
  } finally {
    cdp.close();
  }
} finally {
  if (child) await stopChild(child);
  await rm(root, { recursive: true, force: true });
}

function createThread(threadIndex) {
  const messages = Array.from({ length: 54 }, (_, index) => ({
    id: `benchmark-${threadIndex}-message-${index + 1}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: [
      {
        type: "text",
        text: [
          `## Benchmark message ${index + 1}`,
          "",
          "A deterministic paragraph with **Markdown**, `inline code`, and a template variable {{current_date}}.",
          "",
          "```json",
          JSON.stringify({ thread: threadIndex, message: index + 1 }),
          "```",
        ].join("\n"),
      },
    ],
  }));
  return {
    title: `benchmark-${String(threadIndex).padStart(2, "0")}`,
    context: {
      systemPrompt: "You are a deterministic performance fixture.",
      messages,
    },
  };
}

async function prepareApp(cdp) {
  await cdp.evaluate(`(() => {
    localStorage.setItem("llm-space-rendering-fidelity", "lite");
    localStorage.setItem("llm-space:thread-view-cache-size", "3");
    localStorage.removeItem("llm-space:open-app-tabs");
    localStorage.removeItem("llm-space:active-tab");
    location.reload();
    return true;
  })()`);
  await waitFor(cdp, `document.readyState === "complete"`, 10_000);
  await sleep(500);
  await dismissDialogs(cdp);
}

async function dismissDialogs(cdp) {
  await cdp.evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        const close = dialog.querySelector('[data-slot="dialog-close"]') ??
          dialog.querySelector('[aria-label="Close onboarding"]') ??
          [...dialog.querySelectorAll("button")]
            .find((button) => button.textContent?.trim() === "Close");
        close?.click();
      }
      await sleep(200);
    }
    return !document.querySelector('[role="dialog"]');
  })()`);
}

async function openFixtureThreads(cdp) {
  for (let index = 1; index <= 10; index += 1) {
    const title = `benchmark-${String(index).padStart(2, "0")}`;
    await waitFor(
      cdp,
      `document.querySelector('[aria-label="${title}"]') !== null`,
      15_000
    );
    await cdp.evaluate(
      `document.querySelector('[aria-label="${title}"]')?.click()`
    );
    await waitFor(
      cdp,
      `document.querySelector('[aria-label="Close ${title}"]') !== null`,
      15_000
    );
  }
  await waitFor(
    cdp,
    `document.querySelector('[data-thread-view-pane-id]:not(.hidden)')?.querySelectorAll('[data-message-id]').length >= 54`,
    20_000
  );
}

async function measureMode(cdp, mode, sampleCount) {
  await cdp.evaluate(`(() => {
    localStorage.setItem("llm-space-rendering-fidelity", ${JSON.stringify(mode)});
    location.reload();
    return true;
  })()`);
  await waitFor(cdp, `document.readyState === "complete"`, 10_000);
  await dismissDialogs(cdp);
  await waitFor(
    cdp,
    `document.querySelector('[data-thread-view-pane-id]:not(.hidden)')?.querySelectorAll('[data-message-id]').length >= 54`,
    30_000
  );
  if (mode === "rich") {
    await waitFor(cdp, `document.querySelectorAll('.cm-editor').length > 0`, 30_000);
  } else if (mode === "on-demand") {
    await waitFor(cdp, `document.querySelectorAll('[data-on-demand-preview]').length > 0`, 30_000);
  } else {
    await waitFor(cdp, `document.querySelectorAll('textarea').length > 0`, 30_000);
  }
  await warmThreadViewCache(cdp);
  await sleep(500);
  const counts = await cdp.evaluate(`(() => ({
    dom: document.querySelectorAll("*").length,
    codeMirror: document.querySelectorAll(".cm-editor").length,
    textareas: document.querySelectorAll("textarea").length,
    onDemandPreviews: document.querySelectorAll("[data-on-demand-preview]").length,
    messages: document.querySelectorAll("[data-message-id]").length,
    mountedThreadViews: document.querySelectorAll("[data-thread-view-pane-id]").length,
  }))()`);
  const metrics = {};
  for (const target of ["settings", "toolsAdd", "examples", "variables"]) {
    const values = [];
    for (let index = 0; index < sampleCount; index += 1) {
      values.push(await measureOverlay(cdp, target));
      await sleep(120);
    }
    metrics[target] = summarize(values);
  }
  await dismissDialogs(cdp);
  const activation =
    mode === "on-demand" ? await measureOnDemandActivation(cdp) : null;
  return { counts, metrics, activation };
}

async function measureOnDemandActivation(cdp) {
  return cdp.evaluate(`(async () => {
    const activeView = document.querySelector('[data-thread-view-pane-id]:not(.hidden)');
    const preview = activeView?.querySelector('[data-on-demand-preview]');
    if (!preview) return null;
    const editorsBefore = new Set(activeView.querySelectorAll('.cm-editor'));
    const previewCountBefore = document.querySelectorAll(
      '[data-on-demand-preview]'
    ).length;
    const started = performance.now();
    preview.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerType: "mouse",
    }));
    let activatedEditor;
    while (!(activatedEditor = [...activeView.querySelectorAll('.cm-editor')]
      .find((editor) => !editorsBefore.has(editor)))) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const result = {
      clickToEditor: performance.now() - started,
      codeMirrorWhileEditing: document.querySelectorAll('.cm-editor').length,
    };
    const editorContent = activatedEditor.querySelector('.cm-content');
    editorContent?.focus();
    result.focused = document.activeElement === editorContent;
    editorContent?.blur();
    await new Promise((resolve) => setTimeout(resolve, 150));
    result.codeMirrorAfterBlur = document.querySelectorAll('.cm-editor').length;
    result.previewsAfterBlur = document.querySelectorAll('[data-on-demand-preview]').length;
    result.restoresStaticPreview =
      result.focused &&
      result.codeMirrorAfterBlur === result.codeMirrorWhileEditing - 1 &&
      result.previewsAfterBlur === previewCountBefore;
    return result;
  })()`);
}

async function warmThreadViewCache(cdp) {
  for (const threadIndex of [8, 9, 10]) {
    await measureTabSwitch(cdp, threadIndex);
  }
}

async function measureTabSwitches(cdp, sampleCount) {
  const cached = [];
  for (let index = 0; index < sampleCount; index += 1) {
    cached.push(await measureTabSwitch(cdp, index % 2 === 0 ? 9 : 10));
  }
  const evicted = [];
  for (let index = 0; index < sampleCount; index += 1) {
    evicted.push(await measureTabSwitch(cdp, index + 1));
  }
  return {
    cached: summarize(cached),
    evicted: summarize(evicted),
    mountedViewsAfter: await cdp.evaluate(
      `document.querySelectorAll('[data-thread-view-pane-id]').length`
    ),
  };
}

async function measureTabSwitch(cdp, threadIndex) {
  return cdp.evaluate(`(async () => {
    const threadIndex = ${JSON.stringify(threadIndex)};
    const title = "benchmark-" + String(threadIndex).padStart(2, "0");
    const trigger = document.querySelector('[aria-label="' + title + '"]');
    if (!trigger) return -1;
    const started = performance.now();
    trigger.click();
    while (!document
      .querySelector('[data-thread-view-pane-id]:not(.hidden)')
      ?.querySelector('[data-message-id^="benchmark-' + threadIndex + '-message-"]')) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return performance.now() - started;
  })()`);
}

async function measureOverlay(cdp, target) {
  return cdp.evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const fire = (element) => {
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        const EventType = type.startsWith("pointer") ? PointerEvent : MouseEvent;
        element.dispatchEvent(new EventType(type, {
          bubbles: true,
          button: 0,
          buttons: type.endsWith("down") ? 1 : 0,
          pointerType: "mouse",
        }));
      }
    };
    const closeOpen = () => {
      const dialog = document.querySelector('[role="dialog"]');
      const close = dialog && [...dialog.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Close");
      const closeSlot = dialog?.querySelector('[data-slot="dialog-close"]');
      (closeSlot ?? close)?.click();
      const openMenu = document.querySelector('[data-slot="dropdown-menu-content"]');
      if (openMenu) {
        const target = document.activeElement ?? document;
        target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        target.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
      }
    };
    closeOpen();
    await sleep(100);
    const target = ${JSON.stringify(target)};
    const activeView = document.querySelector('[data-thread-view-pane-id]:not(.hidden)');
    let trigger;
    let selector;
    if (target === "settings") {
      trigger = document.querySelector('[aria-label="Settings"]');
      selector = '[role="dialog"]';
    } else if (target === "toolsAdd") {
      trigger = [...activeView.querySelectorAll('button[data-slot="dropdown-menu-trigger"]')]
        .find((button) => button.textContent?.trim() === "Add");
      selector = '[data-slot="dropdown-menu-content"]';
    } else if (target === "examples") {
      trigger = [...activeView.querySelectorAll('button[data-slot="dropdown-menu-trigger"]')]
        .find((button) => button.textContent?.trim() === "Examples");
      selector = '[data-slot="dropdown-menu-content"]';
    } else {
      trigger = [...activeView.querySelectorAll("button")]
        .find((button) => button.textContent?.trim() === "Add" && button.dataset.slot === "button");
      selector = '[role="dialog"]';
    }
    if (!trigger) return -1;
    const started = performance.now();
    const mounted = new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled || !document.querySelector(selector)) return;
        settled = true;
        observer.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          resolve(performance.now() - started);
        }));
      };
      const observer = new MutationObserver(finish);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true });
      setTimeout(() => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        resolve(-1);
      }, 3000);
    });
    if (target === "settings" || target === "variables") trigger.click();
    else fire(trigger);
    return mounted;
  })()`);
}

async function smokeDropdowns(cdp) {
  return cdp.evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const fire = (element) => {
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        const EventType = type.startsWith("pointer") ? PointerEvent : MouseEvent;
        element.dispatchEvent(new EventType(type, { bubbles: true, button: 0, pointerType: "mouse" }));
      }
    };
    const inspect = async (label) => {
      const activeView = document.querySelector('[data-thread-view-pane-id]:not(.hidden)');
      const trigger = [...activeView.querySelectorAll('button[data-slot="dropdown-menu-trigger"]')]
        .find((button) => button.textContent?.trim() === label);
      const appRoot = document.querySelector("#root") ?? document.body.firstElementChild;
      const before = {
        rootAriaHidden: appRoot?.getAttribute("aria-hidden"),
        bodyOverflow: getComputedStyle(document.body).overflow,
        bodyInlineOverflow: document.body.style.overflow,
        bodyScrollLocked: document.body.hasAttribute("data-scroll-locked"),
      };
      trigger.focus();
      const triggerFocusedBeforeOpen = document.activeElement === trigger;
      fire(trigger);
      await sleep(100);
      const menu = document.querySelector('[data-slot="dropdown-menu-content"]');
      const activeAfterOpen = document.activeElement?.textContent?.trim() ?? null;
      const after = {
        rootAriaHidden: appRoot?.getAttribute("aria-hidden"),
        bodyOverflow: getComputedStyle(document.body).overflow,
        bodyInlineOverflow: document.body.style.overflow,
        bodyScrollLocked: document.body.hasAttribute("data-scroll-locked"),
      };
      const result = {
        opens: Boolean(menu),
        nonModal:
          after.rootAriaHidden !== "true" &&
          !after.bodyScrollLocked &&
          after.bodyInlineOverflow === before.bodyInlineOverflow,
        before,
        after,
        documentFocused: document.hasFocus(),
        triggerFocusedBeforeOpen,
        activeAfterOpen,
      };
      const escapeTarget = document.activeElement ?? menu ?? document;
      escapeTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      escapeTarget.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
      await sleep(150);
      result.escapeRestoresTrigger = document.activeElement === trigger;
      result.activeAfterEscape = document.activeElement?.textContent?.trim() ?? null;
      result.escapeCloses = !document.querySelector('[data-slot="dropdown-menu-content"]');

      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      await sleep(100);
      const keyboardMenu = document.querySelector('[data-slot="dropdown-menu-content"]');
      const initialKeyboardFocus = document.activeElement;
      initialKeyboardFocus?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
      await sleep(50);
      const firstItemFocus = document.activeElement;
      firstItemFocus?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
      );
      await sleep(50);
      const secondItemFocus = document.activeElement;
      result.keyboardOpens = Boolean(keyboardMenu);
      result.keyboardFocusesMenu = Boolean(
        keyboardMenu?.contains(firstItemFocus)
      );
      result.arrowNavigation =
        firstItemFocus !== secondItemFocus &&
        Boolean(keyboardMenu?.contains(secondItemFocus));
      secondItemFocus?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      await sleep(150);
      result.keyboardEscapeRestoresTrigger = document.activeElement === trigger;

      trigger.focus();
      fire(trigger);
      await sleep(100);
      activeView.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })
      );
      await sleep(100);
      result.outsideDismisses = !document.querySelector(
        '[data-slot="dropdown-menu-content"]'
      );

      trigger.focus();
      fire(trigger);
      await sleep(100);
      const selectionMenu = document.querySelector('[data-slot="dropdown-menu-content"]');
      const selection = label === "Add"
        ? [...selectionMenu.querySelectorAll('[data-slot="dropdown-menu-item"]')]
            .find((item) => item.textContent?.trim() === "Add Custom Function Tool")
        : selectionMenu.querySelector('[data-slot="dropdown-menu-item"]');
      selection?.click();
      await sleep(150);
      if (label === "Add") {
        const dialog = document.querySelector('[role="dialog"]');
        result.selectionWorks = Boolean(dialog);
        result.dialogOwnsFocus = Boolean(dialog?.contains(document.activeElement));
        dialog?.querySelector('[data-slot="dialog-close"]')?.click();
        await sleep(100);
      } else {
        result.selectionWorks = !document.querySelector(
          '[data-slot="dropdown-menu-content"]'
        );
        result.dialogOwnsFocus = true;
      }
      return result;
    };
    return { toolsAdd: await inspect("Add"), examples: await inspect("Examples") };
  })()`);
}

function dropdownPasses(result) {
  return (
    result.opens &&
    result.nonModal &&
    result.escapeCloses &&
    result.escapeRestoresTrigger &&
    result.keyboardOpens &&
    result.keyboardFocusesMenu &&
    result.arrowNavigation &&
    result.keyboardEscapeRestoresTrigger &&
    result.outsideDismisses &&
    result.selectionWorks &&
    result.dialogOwnsFocus
  );
}

function summarize(values) {
  const valid = values.filter((value) => Number.isFinite(value) && value >= 0);
  valid.sort((left, right) => left - right);
  if (valid.length === 0) return { samples: values, median: null, max: null };
  return {
    samples: values,
    median: valid[Math.floor(valid.length / 2)],
    max: valid.at(-1),
  };
}

async function waitFor(cdp, expression, timeout) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await cdp.evaluate(`Boolean(${expression})`)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function waitForCdp(cdpPort, processHandle, logs) {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Desktop exited before CDP was ready:\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        if (targets.some(isAppTarget)) return;
      }
    } catch {
      // App is still starting.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for CDP on ${cdpPort}:\n${logs.join("")}`);
}

function collectLogs(processHandle) {
  const chunks = [];
  for (const stream of [processHandle.stdout, processHandle.stderr]) {
    void (async () => {
      for await (const chunk of stream) {
        chunks.push(new TextDecoder().decode(chunk));
        if (chunks.length > 200) chunks.shift();
      }
    })();
  }
  return chunks;
}

async function stopChild(processHandle) {
  try {
    process.kill(-processHandle.pid, "SIGINT");
  } catch {
    if (processHandle.exitCode === null) processHandle.kill("SIGINT");
  }
  await Promise.race([processHandle.exited, sleep(5_000)]);
  try {
    process.kill(-processHandle.pid, "SIGTERM");
  } catch {
    if (processHandle.exitCode === null) processHandle.kill("SIGTERM");
  }
  await Promise.race([processHandle.exited, sleep(2_000)]);
}

async function git(...gitArgs) {
  const processHandle = Bun.spawn(["git", ...gitArgs], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(processHandle.stdout).text();
  const error = await new Response(processHandle.stderr).text();
  if ((await processHandle.exited) !== 0) throw new Error(error);
  return output.trim();
}

function readFlag(name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpClient {
  static async connect(cdpPort) {
    const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
      (response) => response.json()
    );
    const candidates = targets.filter(isAppTarget).reverse();
    for (const target of candidates) {
      if (!target.webSocketDebuggerUrl) continue;
      const client = new CdpClient(target.webSocketDebuggerUrl);
      await client.ready;
      await client.send("Runtime.enable");
      await client.send("Page.enable");
      await client.send("Page.bringToFront");
      const accessible = await client.evaluate(`(() => {
        try { void localStorage.length; return location.href; }
        catch { return null; }
      })()`);
      if (accessible) return client;
      client.close();
    }
    throw new Error(`No accessible CDP app target: ${JSON.stringify(candidates)}`);
  }

  constructor(url) {
    this.socket = new WebSocket(url);
    this.pending = new Map();
    this.nextId = 1;
    this.ready = new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = reject;
    });
    this.socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      const resolve = this.pending.get(message.id);
      if (!resolve) return;
      this.pending.delete(message.id);
      resolve(message);
    };
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  async evaluate(expression) {
    const message = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (message.error || message.result?.exceptionDetails) {
      throw new Error(JSON.stringify(message.error ?? message.result.exceptionDetails));
    }
    return message.result.result.value;
  }

  close() {
    this.socket.close();
  }
}

function isAppTarget(target) {
  return (
    target.type === "page" &&
    target.url?.startsWith("http://localhost:5173") &&
    target.title?.includes("LLM Space")
  );
}

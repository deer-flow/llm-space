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
const messageCount = Number(readFlag("--messages", "54"));
const threadCount = Number(readFlag("--threads", "10"));
const rendering = readFlag("--rendering", null);
const virtualization = readFlag("--virtualization", "off");
const selectedRendering =
  rendering ?? (smoke === "on-demand" ? "on-demand" : "rich");
if (!Number.isSafeInteger(samples) || samples < 0) {
  throw new Error("--samples must be a non-negative integer");
}
if (!Number.isSafeInteger(messageCount) || messageCount < 1) {
  throw new Error("--messages must be a positive integer");
}
if (!Number.isSafeInteger(threadCount) || threadCount < 4) {
  throw new Error("--threads must be an integer of at least 4");
}
if (rendering && !["rich", "on-demand", "lite"].includes(rendering)) {
  throw new Error("--rendering must be rich, on-demand, or lite");
}
if (!["off", "auto", "custom", "on"].includes(virtualization)) {
  throw new Error("--virtualization must be off, auto, custom, or on");
}
const port = 9400 + (process.pid % 200);
const root = await mkdtemp(join(tmpdir(), "llm-space-thread-view-"));
const workspace = join(root, "workspace");
const settings = join(root, "settings");
let child;
let fixtureMounts;

try {
  await mkdir(workspace, { recursive: true });
  await mkdir(settings, { recursive: true });
  await writeFile(
    join(settings, "local-storage.json"),
    JSON.stringify({
      "llm-space-rendering-fidelity": selectedRendering,
      "llm-space:message-virtualization-mode": virtualization,
      "llm-space:view-cache-size": "3",
    })
  );
  for (let index = 1; index <= threadCount; index += 1) {
    await writeFile(
      join(workspace, `benchmark-${String(index).padStart(2, "0")}.json`),
      JSON.stringify(createThread(index, messageCount), null, 2)
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
    fixtureMounts = await openFixtureThreads(cdp);

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
    } else if (smoke === "virtualization-toggle") {
      const virtualizationToggle = await smokeVirtualizationToggle(cdp);
      const result = { label, smoke, virtualizationToggle };
      await Bun.write(outputPath, JSON.stringify(result, null, 2));
      if (!virtualizationToggle.passes) {
        throw new Error(
          `Virtualization On -> Off smoke failed: ${JSON.stringify(result)}`
        );
      }
      console.info(JSON.stringify({ outputPath, ...result }, null, 2));
    } else if (smoke === "navigator-tracking") {
      const navigatorTracking = await smokeNavigatorTracking(cdp);
      const result = { label, smoke, navigatorTracking };
      await Bun.write(outputPath, JSON.stringify(result, null, 2));
      if (!navigatorTracking.passes) {
        throw new Error(
          `Navigator tracking smoke failed: ${JSON.stringify(result)}`
        );
      }
      console.info(JSON.stringify({ outputPath, ...result }, null, 2));
    } else if (smoke === "scroll-restore") {
      const scrollRestore = await smokeScrollRestore(cdp);
      const result = { label, smoke, scrollRestore };
      await Bun.write(outputPath, JSON.stringify(result, null, 2));
      if (!scrollRestore.passes) {
        throw new Error(
          `Scroll restore smoke failed: ${JSON.stringify(result)}`
        );
      }
      console.info(JSON.stringify({ outputPath, ...result }, null, 2));
    } else if (smoke === "on-demand") {
      const onDemand = await measureMode(cdp, "on-demand", 0);
      const result = { label, smoke, onDemand };
      await Bun.write(outputPath, JSON.stringify(result, null, 2));
      if (!onDemand.activation?.restoresStaticPreview) {
        throw new Error(`On Demand lifecycle smoke failed: ${JSON.stringify(result)}`);
      }
      console.info(JSON.stringify({ outputPath, ...result }, null, 2));
    } else {
      const measurements = {};
      measurements[selectedRendering] = await measureMode(
        cdp,
        selectedRendering,
        samples
      );
      const tabSwitches = await measureTabSwitches(cdp, samples);
      const result = {
        label,
        baseCommit: await git("rev-parse", "main"),
        benchmarkCommit: await git("rev-parse", "HEAD"),
        renderer: "cef",
        fixture: { threads: threadCount, messagesPerThread: messageCount },
        samples,
        virtualization,
        fixtureMounts,
        measurements,
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

async function smokeVirtualizationToggle(cdp) {
  await cdp.send("Page.bringToFront");
  return cdp.evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const fire = (element) => {
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        const EventType = type.startsWith("pointer") ? PointerEvent : MouseEvent;
        element.dispatchEvent(new EventType(type, {
          bubbles: true,
          button: 0,
          buttons: type.endsWith("down") ? 1 : 0,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }));
      }
    };
    const activeView = () => document.querySelector(
      '[data-thread-view-pane-id]:not(.hidden)'
    );
    const firstRow = () => activeView()?.querySelector(
      '[data-message-row-index]'
    );
    const beforeRow = firstRow();
    const beforeList = beforeRow?.parentElement;
    const before = {
      listHeight: beforeList?.style.height ?? null,
      rowTransform: beforeRow?.style.transform ?? null,
    };

    document.querySelector('[aria-label="Settings"]')?.click();
    for (let attempt = 0; attempt < 30 && !document.querySelector('[role="dialog"]'); attempt += 1) {
      await sleep(50);
    }
    const select = document.querySelector('[aria-label="Virtualization"]');
    if (select) fire(select);
    for (let attempt = 0; attempt < 30 && !document.querySelector('[data-slot="select-content"]'); attempt += 1) {
      await sleep(50);
    }
    const off = [...document.querySelectorAll('[data-slot="select-item"]')]
      .find((item) => item.textContent?.trim() === "Off");
    if (off) fire(off);
    await sleep(250);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const afterRow = firstRow();
    const afterList = afterRow?.parentElement;
    const after = {
      listHeight: afterList?.style.height ?? null,
      rowLeft: afterRow?.style.left ?? null,
      rowTop: afterRow?.style.top ?? null,
      rowTransform: afterRow?.style.transform ?? null,
      rowCount: activeView()?.querySelectorAll('[data-message-row-index]').length ?? 0,
    };
    document.querySelector('[role="dialog"] [data-slot="dialog-close"]')?.click();
    return {
      before,
      after,
      passes:
        before.listHeight !== "auto" &&
        typeof before.rowTransform === "string" &&
        before.rowTransform.startsWith("translate") &&
        after.listHeight === "auto" &&
        after.rowTransform === "none" &&
        after.rowTop === "auto" &&
        after.rowLeft === "auto" &&
        after.rowCount === ${messageCount},
    };
  })()`);
}

async function smokeNavigatorTracking(cdp) {
  await cdp.send("Page.bringToFront");
  return cdp.evaluate(`(async () => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const activeView = document.querySelector(
      '[data-thread-view-pane-id]:not(.hidden)'
    );
    const firstRow = activeView?.querySelector('[data-message-row-index]');
    const viewport = firstRow?.closest('[data-slot="scroll-area-viewport"]');
    if (!activeView || !firstRow || !viewport) {
      return { passes: false, reason: "message viewport not found" };
    }

    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    let rowGeometryReads = 0;
    Element.prototype.getBoundingClientRect = function () {
      if (this.matches?.('[data-message-row-index]')) rowGeometryReads += 1;
      return originalGetBoundingClientRect.call(this);
    };
    try {
      viewport.scrollTop = 0;
      await nextFrame();
      await nextFrame();
      rowGeometryReads = 0;
      const maximum = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      for (let frame = 1; frame <= 20; frame += 1) {
        viewport.scrollTop = maximum * (frame / 20);
        viewport.dispatchEvent(new Event("scroll"));
        await nextFrame();
      }
      const rowGeometryReadsDuringScroll = rowGeometryReads;
      for (let frame = 0; frame < 6; frame += 1) await nextFrame();
      const rowGeometryReadsAfterSettle = rowGeometryReads;

      const viewportRect = viewport.getBoundingClientRect();
      const centerX = viewportRect.left + viewport.clientWidth / 2;
      const centerY = viewportRect.top + viewport.clientHeight / 2;
      const centerRow = document.elementsFromPoint(centerX, centerY)
        .map((element) => element.closest?.('[data-message-row-index]'))
        .find((element) => element && activeView.contains(element));
      const expectedIndex = centerRow
        ? Number(centerRow.dataset.messageRowIndex)
        : null;
      const activeAnchor = activeView.querySelector(
        'nav[aria-label="Message navigation"] [aria-current="location"]'
      );
      const navigator = activeView.querySelector(
        'nav[aria-label="Message navigation"]'
      );
      const activeMatch = activeAnchor?.getAttribute("aria-label")?.match(
        /message ([0-9]+) of/
      );
      const activeIndex = activeMatch ? Number(activeMatch[1]) - 1 : null;
      const rowCount = activeView.querySelectorAll(
        '[data-message-row-index]'
      ).length;
      const virtualized =
        firstRow.parentElement?.style.height !== "auto" &&
        firstRow.style.transform.startsWith("translate");
      return {
        virtualized,
        rowCount,
        rowGeometryReadsDuringScroll,
        rowGeometryReadsAfterSettle,
        exactSettleReads: rowGeometryReadsAfterSettle - rowGeometryReadsDuringScroll,
        expectedIndex,
        activeIndex,
        navigatorMounted: Boolean(navigator),
        passes:
          (virtualized
            ? rowCount < ${messageCount} &&
              rowGeometryReadsAfterSettle === rowGeometryReadsDuringScroll
            : rowCount === ${messageCount} &&
              rowGeometryReadsDuringScroll === 0 &&
              rowGeometryReadsAfterSettle >= rowCount) &&
          expectedIndex !== null &&
          activeIndex === expectedIndex,
      };
    } finally {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  })()`);
}

async function smokeScrollRestore(cdp) {
  await cdp.send("Page.bringToFront");
  await measureTabSwitch(cdp, 1);
  const before = await cdp.evaluate(`(async () => {
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const activeView = document.querySelector(
      '[data-thread-view-pane-id]:not(.hidden)'
    );
    const firstMessage = activeView?.querySelector('[data-message-id]');
    const viewport = firstMessage?.closest('[data-slot="scroll-area-viewport"]');
    if (!activeView || !viewport) return null;
    viewport.scrollTop = Math.max(
      0,
      (viewport.scrollHeight - viewport.clientHeight) * 0.5
    );
    viewport.dispatchEvent(new Event("scroll"));
    for (let frame = 0; frame < 8; frame += 1) await nextFrame();
    const viewportRect = viewport.getBoundingClientRect();
    const visibleMessages = [...activeView.querySelectorAll('[data-message-id]')]
      .map((message) => ({ message, rect: message.getBoundingClientRect() }))
      .filter(({ rect }) =>
        rect.top < viewportRect.bottom && rect.bottom > viewportRect.top
      );
    const savedMessage = visibleMessages.at(-1)?.message;
    const savedRow = savedMessage?.closest('[data-message-row-index]');
    if (!savedMessage || !savedRow) return null;
    const virtualized =
      savedRow.parentElement?.style.height !== "auto" &&
      savedRow.style.transform.startsWith("translate");
    const alignmentRect = (
      virtualized ? savedRow : savedMessage
    ).getBoundingClientRect();
    return {
      paneId: activeView.dataset.threadViewPaneId,
      messageId: savedMessage.dataset.messageId,
      messageIndex: Number(savedRow.dataset.messageRowIndex),
      virtualized,
      alignmentDelta: alignmentRect.bottom - viewportRect.bottom,
      scrollTop: viewport.scrollTop,
    };
  })()`);
  if (!before?.paneId || !before.messageId) {
    return { passes: false, reason: "could not capture the target scroll anchor" };
  }

  for (const threadIndex of [2, 3, 4]) {
    await measureTabSwitch(cdp, threadIndex);
  }
  const evicted = await cdp.evaluate(`(() => ({
    targetViewMounted: [...document.querySelectorAll('[data-thread-view-pane-id]')]
      .some((view) => view.dataset.threadViewPaneId === ${JSON.stringify(before.paneId)}),
    mountedViews: document.querySelectorAll('[data-thread-view-pane-id]').length,
  }))()`);

  await measureTabSwitch(cdp, 1);
  const after = await cdp.evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let measurement = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const activeView = document.querySelector(
        '[data-thread-view-pane-id]:not(.hidden)'
      );
      const anyMessage = activeView?.querySelector('[data-message-id]');
      const viewport = anyMessage?.closest('[data-slot="scroll-area-viewport"]');
      const message = [...(activeView?.querySelectorAll('[data-message-id]') ?? [])]
        .find((candidate) => candidate.dataset.messageId === ${JSON.stringify(before.messageId)});
      const row = message?.closest('[data-message-row-index]');
      if (!activeView || !viewport) return null;
      if (!message || !row) {
        measurement = {
          paneId: activeView.dataset.threadViewPaneId,
          messageId: null,
          messageIndex: null,
          virtualized: true,
          alignmentDelta: null,
          scrollTop: viewport.scrollTop,
          mountedMessageIds: [...activeView.querySelectorAll('[data-message-id]')]
            .map((candidate) => candidate.dataset.messageId),
          mountedViews: document.querySelectorAll(
            '[data-thread-view-pane-id]'
          ).length,
        };
        await sleep(50);
        continue;
      }
      const viewportRect = viewport.getBoundingClientRect();
      const virtualized =
        row.parentElement?.style.height !== "auto" &&
        row.style.transform.startsWith("translate");
      const alignmentRect = (
        virtualized ? row : message
      ).getBoundingClientRect();
      measurement = {
        paneId: activeView.dataset.threadViewPaneId,
        messageId: message.dataset.messageId,
        messageIndex: Number(row.dataset.messageRowIndex),
        virtualized,
        alignmentDelta: alignmentRect.bottom - viewportRect.bottom,
        scrollTop: viewport.scrollTop,
        mountedViews: document.querySelectorAll(
          '[data-thread-view-pane-id]'
        ).length,
      };
      if (Math.abs(measurement.alignmentDelta) <= 2) break;
      await sleep(50);
    }
    return measurement;
  })()`);

  return {
    before,
    evicted,
    after,
    passes:
      evicted.targetViewMounted === false &&
      evicted.mountedViews === 3 &&
      after?.paneId === before.paneId &&
      after?.messageId === before.messageId &&
      after?.messageIndex === before.messageIndex &&
      after?.virtualized === before.virtualized &&
      Math.abs(after?.alignmentDelta ?? Number.POSITIVE_INFINITY) <= 2 &&
      after?.mountedViews === 3,
  };
}

function createThread(threadIndex, messagesPerThread) {
  const messages = Array.from({ length: messagesPerThread }, (_, index) => ({
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
  const mounts = [];
  for (let index = 1; index <= threadCount; index += 1) {
    const title = `benchmark-${String(index).padStart(2, "0")}`;
    await waitFor(
      cdp,
      `document.querySelector('[aria-label="${title}"]') !== null`,
      15_000
    );
    mounts.push(await measureTabSwitch(cdp, index));
    await waitFor(
      cdp,
      `document.querySelector('[aria-label="Close ${title}"]') !== null`,
      15_000
    );
  }
  await waitFor(
    cdp,
    messageReadyExpression(),
    20_000
  );
  return summarize(mounts);
}

async function measureMode(cdp, mode, sampleCount) {
  await dismissDialogs(cdp);
  await waitFor(
    cdp,
    messageReadyExpression(),
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
  const scroll = await measureScroll(cdp, sampleCount);
  return { counts, metrics, activation, scroll };
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
  for (const threadIndex of [threadCount - 2, threadCount - 1, threadCount]) {
    await measureTabSwitch(cdp, threadIndex);
  }
}

async function measureTabSwitches(cdp, sampleCount) {
  const cached = [];
  for (let index = 0; index < sampleCount; index += 1) {
    cached.push(
      await measureTabSwitch(
        cdp,
        index % 2 === 0 ? threadCount - 1 : threadCount
      )
    );
  }
  const evicted = [];
  for (let index = 0; index < sampleCount; index += 1) {
    evicted.push(await measureTabSwitch(cdp, (index % (threadCount - 3)) + 1));
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
  const title = `benchmark-${String(threadIndex).padStart(2, "0")}`;
  const started = await cdp.evaluate("performance.now()");
  const clicked = await cdp.evaluate(`(() => {
    const trigger = document.querySelector(
      '[aria-label=${JSON.stringify(title)}]'
    );
    trigger?.click();
    return Boolean(trigger);
  })()`);
  if (!clicked) return -1;
  await waitFor(
    cdp,
    `document.querySelector(
      '[role="tab"][aria-selected="true"][aria-label=${JSON.stringify(`Open ${title}`)}]'
    ) !== null && ${messageReadyExpression()}`,
    30_000
  );
  await cdp.evaluate(
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))"
  );
  const finished = await cdp.evaluate("performance.now()");
  return finished - started;
}

async function measureScroll(cdp, sampleCount) {
  const samples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    samples.push(
      await cdp.evaluate(`(async () => {
        const activeView = document.querySelector(
          '[data-thread-view-pane-id]:not(.hidden)'
        );
        const viewport = activeView?.querySelector(
          '[data-slot="scroll-area-viewport"]'
        );
        if (!viewport) return null;
        const longTasks = [];
        const observer = typeof PerformanceObserver === "function" &&
          PerformanceObserver.supportedEntryTypes?.includes("longtask")
          ? new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                longTasks.push(entry.duration);
              }
            })
          : null;
        observer?.observe({ type: "longtask", buffered: false });
        viewport.scrollTop = 0;
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
        const maximum = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
        const frameDurations = [];
        let previous = performance.now();
        for (let frame = 1; frame <= 60; frame += 1) {
          viewport.scrollTop = maximum * (frame / 60);
          const timestamp = await new Promise((resolve) =>
            requestAnimationFrame(resolve)
          );
          frameDurations.push(timestamp - previous);
          previous = timestamp;
        }
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
        observer?.disconnect();
        return {
          frameDurations,
          longTasks,
          scrollHeight: viewport.scrollHeight,
          clientHeight: viewport.clientHeight,
        };
      })()`)
    );
  }
  const valid = samples.filter(Boolean);
  const frameDurations = valid.flatMap((sample) => sample.frameDurations);
  const longTasks = valid.flatMap((sample) => sample.longTasks);
  return {
    samples,
    frameDuration: summarizePercentiles(frameDurations),
    longTasks: {
      count: longTasks.length,
      duration: summarizePercentiles(longTasks),
    },
  };
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
  await cdp.send("Page.bringToFront");
  return cdp.evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const fire = (element) => {
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        const EventType = type.startsWith("pointer") ? PointerEvent : MouseEvent;
        element.dispatchEvent(new EventType(type, {
          bubbles: true,
          button: 0,
          buttons: type.endsWith("down") ? 1 : 0,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }));
      }
    };
    const inspect = async (label) => {
      window.focus();
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
      const escapeTarget = menu ?? document.activeElement ?? document;
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
      keyboardMenu?.dispatchEvent(
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
      keyboardMenu?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      await sleep(150);
      result.keyboardEscapeRestoresTrigger = document.activeElement === trigger;

      trigger.focus();
      fire(trigger);
      await sleep(100);
      fire(activeView);
      await sleep(100);
      result.outsideDismisses = !document.querySelector(
        '[data-slot="dropdown-menu-content"]'
      );
      if (!result.outsideDismisses) {
        const openMenu = document.querySelector('[data-slot="dropdown-menu-content"]');
        openMenu?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        );
        await sleep(100);
      }

      trigger.focus();
      fire(trigger);
      await sleep(100);
      const selectionMenu = document.querySelector('[data-slot="dropdown-menu-content"]');
      const selection = label === "Add"
        ? [...(selectionMenu?.querySelectorAll('[data-slot="dropdown-menu-item"]') ?? [])]
            .find((item) => item.textContent?.trim() === "Add Custom Function Tool")
        : selectionMenu?.querySelector('[data-slot="dropdown-menu-item"]');
      if (selection) fire(selection);
      await sleep(300);
      if (label === "Add") {
        const dialog = document.querySelector('[role="dialog"]');
        result.selectionWorks = Boolean(dialog);
        result.dialogOwnsFocus = Boolean(dialog?.contains(document.activeElement));
        dialog?.querySelector('[data-slot="dialog-close"]')?.click();
        for (let attempt = 0; attempt < 10 && document.querySelector('[role="dialog"]'); attempt += 1) {
          await sleep(100);
        }
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

function summarizePercentiles(values) {
  const valid = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  if (valid.length === 0) {
    return { count: 0, p50: null, p95: null, max: null };
  }
  return {
    count: valid.length,
    p50: valid[Math.floor((valid.length - 1) * 0.5)],
    p95: valid[Math.floor((valid.length - 1) * 0.95)],
    max: valid.at(-1),
  };
}

function messageReadyExpression() {
  const suffix = `of ${messageCount}`;
  return `(() => {
    const view = document.querySelector('[data-thread-view-pane-id]:not(.hidden)');
    if (!view) return false;
    if (view.querySelectorAll('[data-message-id]').length >= ${messageCount}) return true;
    return [...view.querySelectorAll('nav[aria-label="Message navigation"] button')]
      .some((button) => button.getAttribute('aria-label')?.endsWith(${JSON.stringify(suffix)}));
  })()`;
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
  while (Date.now() - started < 240_000) {
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
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeoutId);
      pending.resolve(message);
    };
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after 30000ms`));
      }, 30_000);
      this.pending.set(id, { resolve, timeoutId });
    });
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

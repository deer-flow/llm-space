import { afterAll, describe, expect, mock, test } from "bun:test";

import { I18nProvider } from "@llm-space/ui/lib/i18n";
import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";


import { createDesktopShareThreadAction } from "@/host/share-thread-action";
import type { Command } from "@/shared/commands";
import type { RuntimeId } from "@/shared/runtime";
import { buildShareThreadCommand } from "@/shared/share";
import { installReactTestDom } from "@/test/react-test-dom";

import { ShareThreadMenuItem as FileTreeShareThreadMenuItem } from "./file-system-tree-view/share-thread-menu-item";
import { createShareThreadCommandHandler } from "./share-thread-command-handler";
import {
  ShareThreadDialogFlow,
  type ShareThreadTarget,
  type ShareThreadTransaction,
} from "./share-thread-dialog-flow";
import { ShareThreadMenuItem as ThreadTabShareThreadMenuItem } from "./thread-tabs/share-thread-menu-item";

const TEST_DOM = installReactTestDom();

// The share menu items render shadcn dropdown/context primitives, which need a
// real DOM; map them to plain buttons so this wiring test can click them.
function _MenuItem({
  children,
  onSelect,
}: {
  children?: ReactNode;
  onSelect?: () => void;
}) {
  return (
    <button type="button" role="menuitem" onClick={() => onSelect?.()}>
      {children}
    </button>
  );
}
await mock.module("@llm-space/ui/ui/dropdown-menu", () => ({
  DropdownMenuItem: _MenuItem,
}));
await mock.module("@llm-space/ui/ui/context-menu", () => ({
  ContextMenuItem: _MenuItem,
}));

function _wiringHarness(input?: {
  workspaceRuntimeId?: RuntimeId;
  activeThread?: ShareThreadTarget | null;
}) {
  const flow = new ShareThreadDialogFlow();
  const opened: ShareThreadTarget[] = [];
  const transactions: ShareThreadTransaction[] = [];
  const pageHandler = createShareThreadCommandHandler({
    getWorkspaceRuntimeId: () => input?.workspaceRuntimeId ?? "local",
    getActiveThread: () => input?.activeThread ?? null,
    openDialog: (target) => {
      opened.push(target);
      flow.sync(true, target);
      const transaction = flow.createTransaction({
        title: "Snapshot title",
        description: "Snapshot description",
      });
      if (!transaction) throw new Error("Expected a dialog transaction");
      transactions.push(transaction);
    },
  });
  const executeCommand = (command: Command) => {
    if (command.type !== "shareThread") {
      throw new Error(`Unexpected command: ${command.type}`);
    }
    pageHandler(command.args);
  };
  return { flow, opened, transactions, pageHandler, executeCommand };
}

async function _clickShareItem(
  render: (executeCommand: (command: Command) => void) => ReactNode,
  executeCommand: (command: Command) => void
): Promise<void> {
  const container = TEST_DOM.document.createElement("div");
  TEST_DOM.document.body.appendChild(container);
  const root: Root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(
      <I18nProvider initialLang="en">{render(executeCommand)}</I18nProvider>
    );
  });
  const item = TEST_DOM.document.body
    .querySelectorAll("[role=menuitem]")
    .find((candidate) => candidate.textContent?.includes("Share"));
  if (!item) throw new Error("Expected a share menu item element");
  await act(async () => item.click());
  root.unmount();
  container.remove();
}

describe("real share consumer wiring", () => {
  test("DesktopHost action reaches Page and snapshots the same Dialog target", () => {
    const harness = _wiringHarness({
      workspaceRuntimeId: "local",
      activeThread: { runtimeId: "local", path: "threads/same.json" },
    });
    const hostAction = createDesktopShareThreadAction(harness.executeCommand);

    hostAction({
      path: "threads/same.json",
      runtimeId: "remote:desktop-host",
    });

    expect(harness.opened).toEqual([
      {
        path: "threads/same.json",
        runtimeId: "remote:desktop-host",
      },
    ]);
    expect(harness.transactions).toHaveLength(1);
    expect(harness.transactions[0]).toMatchObject({
      path: "threads/same.json",
      runtimeId: "remote:desktop-host",
      title: "Snapshot title",
      description: "Snapshot description",
    });
  });

  test("file-tree and tab specific consumers preserve their remote owners", async () => {
    const treeHarness = _wiringHarness();
    await _clickShareItem(
      (executeCommand) => (
        <FileTreeShareThreadMenuItem
          path="threads/tree.json"
          runtimeId="remote:tree"
          executeCommand={executeCommand}
        />
      ),
      treeHarness.executeCommand
    );

    const tabHarness = _wiringHarness();
    await _clickShareItem(
      (executeCommand) => (
        <ThreadTabShareThreadMenuItem
          path="threads/tab.json"
          runtimeId="remote:tab"
          onShare={(path, runtimeId) =>
            executeCommand(buildShareThreadCommand(path, runtimeId))
          }
        />
      ),
      tabHarness.executeCommand
    );

    expect(treeHarness.transactions[0]).toMatchObject({
      path: "threads/tree.json",
      runtimeId: "remote:tree",
    });
    expect(tabHarness.transactions[0]).toMatchObject({
      path: "threads/tab.json",
      runtimeId: "remote:tab",
    });
  });

  test("native menu and palette commands resolve only the active runtime target", () => {
    const active = {
      path: "threads/active.json",
      runtimeId: "remote:active" as const,
    };
    const menuHarness = _wiringHarness({
      workspaceRuntimeId: "remote:active",
      activeThread: active,
    });
    const paletteHarness = _wiringHarness({
      workspaceRuntimeId: "remote:active",
      activeThread: active,
    });

    menuHarness.pageHandler({});
    paletteHarness.pageHandler({});

    expect(menuHarness.transactions[0]).toMatchObject(active);
    expect(paletteHarness.transactions[0]).toMatchObject(active);
  });

  test("path-only Page commands use the workspace runtime", () => {
    const harness = _wiringHarness({
      workspaceRuntimeId: "remote:workspace",
      activeThread: {
        path: "threads/active.json",
        runtimeId: "remote:active",
      },
    });

    harness.pageHandler({ path: "threads/path-only.json" });

    expect(harness.transactions[0]).toMatchObject({
      path: "threads/path-only.json",
      runtimeId: "remote:workspace",
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  TEST_DOM.restore();
  mock.restore();
});

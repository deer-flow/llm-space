import { describe, expect, test } from "bun:test";

import { isValidElement } from "react";

import { createDesktopShareThreadAction } from "@/host/share-thread-action";
import type { Command } from "@/shared/commands";
import type { RuntimeId } from "@/shared/runtime";
import { buildShareThreadCommand } from "@/shared/share";

import { ShareThreadMenuItem as FileTreeShareThreadMenuItem } from "./file-system-tree-view/share-thread-menu-item";
import { createShareThreadCommandHandler } from "./share-thread-command-handler";
import {
  ShareThreadDialogFlow,
  type ShareThreadTarget,
  type ShareThreadTransaction,
} from "./share-thread-dialog-flow";
import { ShareThreadMenuItem as ThreadTabShareThreadMenuItem } from "./thread-tabs/share-thread-menu-item";

function _select(element: unknown): void {
  if (!isValidElement<{ onSelect: () => void }>(element)) {
    throw new Error("Expected a share menu item element");
  }
  element.props.onSelect();
}

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

  test("file-tree and tab specific consumers preserve their remote owners", () => {
    const treeHarness = _wiringHarness();
    _select(
      FileTreeShareThreadMenuItem({
        path: "threads/tree.json",
        runtimeId: "remote:tree",
        executeCommand: treeHarness.executeCommand,
      })
    );

    const tabHarness = _wiringHarness();
    _select(
      ThreadTabShareThreadMenuItem({
        path: "threads/tab.json",
        runtimeId: "remote:tab",
        onShare: (path, runtimeId) =>
          tabHarness.executeCommand(buildShareThreadCommand(path, runtimeId)),
      })
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
});

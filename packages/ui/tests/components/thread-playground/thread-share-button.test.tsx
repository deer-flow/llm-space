import { describe, expect, test } from "bun:test";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  installReactTestDom,
  TestElement,
} from "../../../../../apps/desktop/src/test/react-test-dom";
import { ThreadShareButton } from "../../../src/components/thread-playground/thread-share-button";
import type { ShareThreadActionInput } from "../../../src/host";
import { I18nProvider } from "../../../src/lib/i18n";

const TEST_DOM = installReactTestDom();

interface MountedTree {
  container: TestElement;
  root: Root;
}

async function _unmount(tree: MountedTree): Promise<void> {
  await act(async () => tree.root.unmount());
  tree.container.remove();
}

async function _clickShareButton(
  path: string,
  runtimeId: string | undefined,
  onShare: (input: ShareThreadActionInput) => void
): Promise<MountedTree> {
  const container = TEST_DOM.document.createElement("div");
  TEST_DOM.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(
      <I18nProvider initialLang="en">
        <ThreadShareButton
          path={path}
          runtimeId={runtimeId}
          disabled={false}
          onShare={onShare}
        />
      </I18nProvider>
    );
  });
  const button = TEST_DOM.document.querySelector("button");
  if (!button) throw new Error("Expected the Playground share button");
  await act(async () => button.click());
  return { container, root };
}

describe("ThreadShareButton", () => {
  test("the real Playground header click emits its owning remote runtime", async () => {
    const actions: ShareThreadActionInput[] = [];
    const tree = await _clickShareButton("threads/same.json", "remote:header", (input) =>
      actions.push(input)
    );
    try {
      expect(actions).toEqual([
        { path: "threads/same.json", runtimeId: "remote:header" },
      ]);
    } finally {
      await _unmount(tree);
    }
  });

  test("an unscoped legacy Playground still shares locally", async () => {
    const actions: ShareThreadActionInput[] = [];
    const tree = await _clickShareButton("threads/local.json", undefined, (input) =>
      actions.push(input)
    );
    try {
      expect(actions).toEqual([
        { path: "threads/local.json", runtimeId: "local" },
      ]);
    } finally {
      await _unmount(tree);
    }
  });
});

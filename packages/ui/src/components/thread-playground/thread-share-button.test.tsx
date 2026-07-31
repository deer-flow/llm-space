import { describe, expect, test } from "bun:test";
import { isValidElement } from "react";

import type { ShareThreadActionInput } from "../../host";

import { ThreadShareButton } from "./thread-share-button";

describe("ThreadShareButton", () => {
  test("the real Playground header click emits its owning remote runtime", () => {
    const actions: ShareThreadActionInput[] = [];
    const element = ThreadShareButton({
      path: "threads/same.json",
      runtimeId: "remote:header",
      disabled: false,
      onShare: (input) => actions.push(input),
    });
    if (!isValidElement<{ onClick: () => void }>(element)) {
      throw new Error("Expected the Playground share button element");
    }

    element.props.onClick();

    expect(actions).toEqual([
      { path: "threads/same.json", runtimeId: "remote:header" },
    ]);
  });

  test("an unscoped legacy Playground still shares locally", () => {
    const actions: ShareThreadActionInput[] = [];
    const element = ThreadShareButton({
      path: "threads/local.json",
      disabled: false,
      onShare: (input) => actions.push(input),
    });
    if (!isValidElement<{ onClick: () => void }>(element)) {
      throw new Error("Expected the Playground share button element");
    }

    element.props.onClick();

    expect(actions).toEqual([
      { path: "threads/local.json", runtimeId: "local" },
    ]);
  });
});

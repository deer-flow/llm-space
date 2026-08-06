import { describe, expect, test } from "bun:test";

import {
  DEVELOPMENT_DEEP_LINK_SCHEME,
  PRODUCTION_DEEP_LINK_SCHEME,
} from "../../shared/deep-link-scheme";

import { activateWindowForDeepLink } from "./activate-window";

describe("activateWindowForDeepLink", () => {
  test("restores and activates a minimized window", () => {
    const actions: string[] = [];
    const activated = activateWindowForDeepLink(
      {
        isMinimized: () => true,
        unminimize: () => actions.push("unminimize"),
        show: () => actions.push("show"),
        activate: () => actions.push("activate"),
      },
      "llm-space://threads/aurora/task-id",
      PRODUCTION_DEEP_LINK_SCHEME
    );

    expect(activated).toBe(true);
    expect(actions).toEqual(["unminimize", "show", "activate"]);
  });

  test("activates an already visible window without restoring it", () => {
    const actions: string[] = [];
    activateWindowForDeepLink(
      {
        isMinimized: () => false,
        unminimize: () => actions.push("unminimize"),
        show: () => actions.push("show"),
        activate: () => actions.push("activate"),
      },
      "llm-space-dev://threads/aurora/task-id",
      DEVELOPMENT_DEEP_LINK_SCHEME
    );

    expect(actions).toEqual(["show", "activate"]);
  });

  test("ignores URLs owned by another build", () => {
    const actions: string[] = [];
    const activated = activateWindowForDeepLink(
      {
        isMinimized: () => false,
        unminimize: () => actions.push("unminimize"),
        show: () => actions.push("show"),
        activate: () => actions.push("activate"),
      },
      "llm-space://threads/aurora/task-id",
      DEVELOPMENT_DEEP_LINK_SCHEME
    );

    expect(activated).toBe(false);
    expect(actions).toEqual([]);
  });
});

import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

const NATIVE_OPENED_URLS: string[] = [];

/** Menus rebuilt by `setMenuLanguage` (via `ApplicationMenu.setApplicationMenu`). */
const MENU_REBUILD_COUNT = { count: 0 };

await mock.module("electrobun/bun", () => ({
  app: { on: () => undefined },
  ApplicationMenu: {
    setApplicationMenu: () => {
      MENU_REBUILD_COUNT.count += 1;
    },
  },
  Utils: {
    clipboardReadText: () => "",
    openExternal: (url: string) => NATIVE_OPENED_URLS.push(url),
    openFileDialog: () => Promise.resolve([]),
    openPath: () => undefined,
    paths: { documents: "" },
  },
}));

const { executeCommandInBun } = await import("./commands");
const { isChineseLocale, setAppLocale } = await import("./app/locales");
const { preselectMenuLanguage } = await import("./app/menu");

function _createDependencies(openedUrls: string[]) {
  return {
    githubAuth: {
      signIn: () => Promise.resolve(),
      signOut: () => undefined,
    },
    openExternal: (url: string) => openedUrls.push(url),
    sendToWebview: () => undefined,
    updater: {
      applyUpdateAndRestart: () => Promise.resolve(),
      checkForUpdates: () => Promise.resolve(),
    },
    workspacePath: "/tmp/llm-space-test-workspace",
  };
}

describe("executeCommandInBun openLink", () => {
  test.each(["http://example.com/path", "https://example.com/path"])(
    "opens allowed URL %s",
    (url) => {
      const openedUrls: string[] = [];
      NATIVE_OPENED_URLS.length = 0;

      executeCommandInBun(
        { type: "openLink", args: { url } },
        {} as never,
        _createDependencies(openedUrls)
      );

      expect([...NATIVE_OPENED_URLS, ...openedUrls]).toEqual([url]);
    }
  );

  test.each([
    "not a URL",
    "file:///tmp/private.txt",
    "javascript:alert(1)",
    "custom-app://open/secret",
    "//example.com/path",
  ])("does not open or disclose rejected URL %s", (url) => {
    const openedUrls: string[] = [];
    NATIVE_OPENED_URLS.length = 0;
    const error = spyOn(console, "error").mockImplementation(() => undefined);

    try {
      executeCommandInBun(
        { type: "openLink", args: { url } },
        {} as never,
        _createDependencies(openedUrls)
      );

      expect([...NATIVE_OPENED_URLS, ...openedUrls]).toEqual([]);
      expect(error).toHaveBeenCalledWith("Blocked unsafe external URL.");
      expect(error.mock.calls.flat().join(" ")).not.toContain(url);
    } finally {
      error.mockRestore();
    }
  });
});

describe("executeCommandInBun setLanguage", () => {
  beforeEach(() => {
    // The menu module seeds `_menuLang` from the OS locale at load time, so on
    // a zh_CN machine it starts as "zh" and `setMenuLanguage("zh")` would
    // early-return without rebuilding. Reset both pieces of module state so
    // these tests behave the same on any machine.
    setAppLocale("en");
    preselectMenuLanguage("en");
    MENU_REBUILD_COUNT.count = 0;
  });

  test("applies the locale and rebuilds the native menu", () => {
    // `setLanguage` mirrors the renderer's persisted choice to bun-side
    // surfaces: the effective locale and the native menu.
    executeCommandInBun(
      { type: "setLanguage", args: { lang: "zh" } },
      {} as never,
      _createDependencies([])
    );

    expect(isChineseLocale()).toBe(true);
    expect(MENU_REBUILD_COUNT.count).toBe(1);
  });

  test("switching back to en clears the Chinese locale", () => {
    executeCommandInBun(
      { type: "setLanguage", args: { lang: "zh" } },
      {} as never,
      _createDependencies([])
    );
    expect(isChineseLocale()).toBe(true);
    expect(MENU_REBUILD_COUNT.count).toBe(1);

    executeCommandInBun(
      { type: "setLanguage", args: { lang: "en" } },
      {} as never,
      _createDependencies([])
    );
    expect(isChineseLocale()).toBe(false);
    expect(MENU_REBUILD_COUNT.count).toBe(2);
  });
});

import { describe, expect, mock, spyOn, test } from "bun:test";

const NATIVE_OPENED_URLS: string[] = [];

await mock.module("electrobun/bun", () => ({
  app: { on: () => undefined },
  Utils: {
    clipboardReadText: () => "",
    openExternal: (url: string) => NATIVE_OPENED_URLS.push(url),
    openFileDialog: () => Promise.resolve([]),
    openPath: () => undefined,
    paths: { documents: "" },
  },
}));

const { executeCommandInBun } = await import("./commands");

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

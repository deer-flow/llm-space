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
const { attachWindowStates } = await import("./app/window-state");

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

describe("executeCommandInBun page zoom", () => {
  test("uses a compensated root transform for the CEF Performance edition", () => {
    const scripts: string[] = [];
    const windowListeners = new Map<string, (() => void)[]>();
    const webviewListeners = new Map<string, (() => void)[]>();
    const window = {
      getFrame: () => ({ x: 0, y: 0, width: 1200, height: 800 }),
      getPageZoom: () => {
        throw new Error("CEF must not use Electrobun's WebKit-only zoom API");
      },
      isFullScreen: () => false,
      isMaximized: () => false,
      on: (name: string, listener: () => void) => {
        const listeners = windowListeners.get(name) ?? [];
        listeners.push(listener);
        windowListeners.set(name, listeners);
      },
      setPageZoom: () => {
        throw new Error("CEF must not use Electrobun's WebKit-only zoom API");
      },
      webview: {
        renderer: "cef",
        executeJavascript: (script: string) => scripts.push(script),
        on: (name: string, listener: () => void) => {
          const listeners = webviewListeners.get(name) ?? [];
          listeners.push(listener);
          webviewListeners.set(name, listeners);
        },
      },
    };
    const store = {
      state: {
        frame: { x: 0, y: 0, width: 1200, height: 800 },
        isMaximized: false,
        isFullScreen: false,
      },
      update: () => Promise.resolve(),
    };

    attachWindowStates(window as never, {
      store: store as never,
      onFullScreenChange: () => undefined,
    });
    for (const listener of webviewListeners.get("dom-ready") ?? []) listener();
    scripts.length = 0;

    executeCommandInBun(
      { type: "resetZoom", args: {} },
      window as never,
      _createDependencies([])
    );
    executeCommandInBun(
      { type: "zoomIn", args: {} },
      window as never,
      _createDependencies([])
    );

    expect(scripts).toHaveLength(2);
    expect(scripts[1]).toContain("const zoom = 1.1");
    expect(scripts[1]).toContain(
      'style.setProperty("transform", `scale(${zoom})`)'
    );
    expect(scripts[1]).toContain(
      'style.setProperty("width", `${100 / zoom}vw`)'
    );
    expect(scripts[1]).toContain(
      'style.setProperty("height", `${100 / zoom}vh`)'
    );
  });

  test("keeps using native page zoom for the WebKit edition", () => {
    const zooms: number[] = [];
    const window = {
      setPageZoom: (zoom: number) => zooms.push(zoom),
      webview: { renderer: "native" },
    };

    executeCommandInBun(
      { type: "resetZoom", args: {} },
      window as never,
      _createDependencies([])
    );
    executeCommandInBun(
      { type: "zoomOut", args: {} },
      window as never,
      _createDependencies([])
    );

    expect(zooms).toEqual([1, 0.9]);
  });
});

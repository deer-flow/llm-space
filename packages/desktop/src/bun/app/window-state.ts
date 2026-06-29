import {
  saveWindowFrame,
  saveWindowMaximized,
  saveWindowZoom,
} from "@llm-space/core/server";
import { app, type BrowserWindow } from "electrobun/bun";

const SAVE_DEBOUNCE_MS = 300;

function persistWindowState(win: BrowserWindow) {
  if (win.isMaximized()) {
    void saveWindowMaximized(true);
  } else {
    void saveWindowFrame(win.getFrame());
  }
}

function attachWindowStatePersistence(
  win: BrowserWindow,
  options?: { isMaximized?: boolean },
) {
  if (options?.isMaximized) {
    win.maximize();
  }

  win.on("close", () => {
    persistWindowState(win);
  });

  app.on("before-quit", () => {
    persistWindowState(win);
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleSave = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      persistWindowState(win);
    }, SAVE_DEBOUNCE_MS);
  };

  win.on("move", scheduleSave);
  win.on("resize", scheduleSave);
}

/**
 * Watch for OS-level fullscreen transitions and report each change. There is no
 * dedicated fullscreen event, but entering/exiting fullscreen resizes the
 * window, so we re-check `isFullScreen()` on resize and fire on change. The
 * initial state is reported immediately.
 */
function attachFullScreenSync(
  win: BrowserWindow,
  onChange: (fullScreen: boolean) => void,
) {
  let last = win.isFullScreen();
  onChange(last);
  win.on("resize", () => {
    const next = win.isFullScreen();
    if (next !== last) {
      last = next;
      onChange(next);
    }
  });
}

// --- page zoom -------------------------------------------------------------

/** The zoom level we want applied; kept in sync by {@link saveZoom}. */
let desiredZoom = 1;
let zoomTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Restore a saved zoom level onto the window and keep re-applying it: WebKit
 * page zoom can reset on (re)load, so we re-set it once the DOM is ready.
 */
function attachZoomPersistence(win: BrowserWindow, initialZoom: number) {
  desiredZoom = initialZoom;
  if (initialZoom !== 1) {
    win.setPageZoom(initialZoom);
  }
  win.webview?.on("dom-ready", () => {
    if (win.getPageZoom() !== desiredZoom) {
      win.setPageZoom(desiredZoom);
    }
  });
}

export function attachWindowStates(
  win: BrowserWindow,
  options: {
    isMaximized?: boolean;
    zoom?: number;
    onFullScreenChange: (fullScreen: boolean) => void;
  },
) {
  attachWindowStatePersistence(win, { isMaximized: options.isMaximized });
  attachZoomPersistence(win, options.zoom ?? 1);
  attachFullScreenSync(win, options.onFullScreenChange);
}

/** Record a new zoom level (e.g. from the View menu) and persist it. */
export function saveZoom(zoom: number) {
  desiredZoom = zoom;
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => {
    void saveWindowZoom(desiredZoom);
  }, SAVE_DEBOUNCE_MS);
}

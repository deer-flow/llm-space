import {
  saveWindowFrame,
  saveWindowMaximized,
  saveWindowZoom,
} from "@llm-space/core/server";
import { app, Screen, type BrowserWindow } from "electrobun/bun";

const SAVE_DEBOUNCE_MS = 300;

/**
 * The display scale factor frames are captured under, recorded so a later
 * launch can rescale them (`resolveInitialWindowFrame`). Only win32 reports a
 * real factor: it is the one platform where `getFrame()` speaks physical
 * pixels. macOS/Linux frames are DIPs that never need rescaling — and on a
 * Retina display `Screen.scaleFactor` would wrongly claim 2.
 */
function currentFrameScaleFactor(): number {
  if (process.platform !== "win32") return 1;
  const { scaleFactor } = Screen.getPrimaryDisplay();
  return Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
}

function persistWindowState(win: BrowserWindow) {
  if (win.isMaximized()) {
    void saveWindowMaximized(true);
  } else {
    void saveWindowFrame(win.getFrame(), currentFrameScaleFactor());
  }
}

/**
 * Restore a saved maximized state. On win32 electrobun creates the WebView2
 * controller asynchronously, drops webview resizes that arrive while the
 * controller doesn't exist yet, and then applies the webview's creation-time
 * bounds once it does — so maximizing right after window creation reliably
 * loses that race and leaves the webview at its pre-maximize size (a white
 * band along the right/bottom edges until the next real resize). The
 * `did-navigate` event (WebView2's NavigationCompleted) can only fire once
 * the controller is live, so deferring the maximize until then guarantees
 * its WM_SIZE reaches the webview. Elsewhere webview frames apply
 * synchronously and the immediate maximize is fine.
 */
function restoreMaximized(win: BrowserWindow) {
  if (process.platform !== "win32") {
    win.maximize();
    return;
  }
  let maximized = false;
  win.webview?.on("did-navigate", () => {
    if (maximized) return;
    maximized = true;
    win.maximize();
  });
}

function attachWindowStatePersistence(
  win: BrowserWindow,
  options?: { isMaximized?: boolean },
) {
  if (options?.isMaximized) {
    restoreMaximized(win);
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
 *
 * On Windows Electrobun's native page zoom is a no-op, so restore is
 * renderer-driven instead: `lib/use-css-zoom.ts` pulls `getZoomState` on every
 * mount (including reloads) and applies CSS zoom itself.
 */
function attachZoomPersistence(win: BrowserWindow, initialZoom: number) {
  desiredZoom = initialZoom;
  if (process.platform === "win32") return;
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

/**
 * The zoom level we want applied. On Windows this is the source of truth for
 * the zoom commands and the renderer's CSS-zoom restore — `getPageZoom()`
 * always reports 1.0 there.
 */
export function getDesiredZoom(): number {
  return desiredZoom;
}

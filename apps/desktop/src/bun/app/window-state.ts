import { type WindowStateStore } from "@llm-space/core/server";
import { type BrowserWindow } from "electrobun/bun";

const SAVE_DEBOUNCE_MS = 300;

let activeStore: WindowStateStore | undefined;
let activeWindow: BrowserWindow | undefined;
let activePersistence: WindowStatePersistence | undefined;

type WindowFrame = ReturnType<BrowserWindow["getFrame"]>;
type PersistencePhase = "normal" | "fullScreen" | "exiting" | "restoring";

class WindowStatePersistence {
  private _frameTimer: ReturnType<typeof setTimeout> | undefined;
  private _lastNormalFrame: WindowFrame | undefined;
  private _phase: PersistencePhase;
  private _wasMaximized: boolean;

  constructor(
    private readonly _win: BrowserWindow,
    private readonly _store: WindowStateStore,
    private readonly _saveDebounceMs = SAVE_DEBOUNCE_MS,
    initial: { isMaximized?: boolean; isFullScreen?: boolean } = {}
  ) {
    const isFullScreen = initial.isFullScreen ?? _win.isFullScreen();
    this._phase = isFullScreen ? "fullScreen" : "normal";
    this._wasMaximized = initial.isMaximized ?? _win.isMaximized();
    this._lastNormalFrame = _store.state.frame;

    if (!this._lastNormalFrame && !isFullScreen && !this._wasMaximized) {
      this._lastNormalFrame = _win.getFrame();
    }
  }

  attach(): void {
    this._win.on("move", this._scheduleSave);
    this._win.on("resize", this._scheduleSave);
  }

  cancelPending(): void {
    clearTimeout(this._frameTimer);
  }

  persistNow(): Promise<void> {
    const isFullScreen = this._win.isFullScreen();

    // A fullscreen transition can report `isFullScreen() === false` before the
    // native window has restored its ordinary frame. Never let close/flush
    // persist those transitional bounds.
    if (isFullScreen || this._phase !== "normal") {
      return this._store.update({
        isMaximized: this._wasMaximized,
        isFullScreen,
      });
    }

    if (this._win.isMaximized()) {
      this._wasMaximized = true;
      return this._store.update({
        isMaximized: true,
        isFullScreen: false,
      });
    }

    const frame = this._win.getFrame();
    this._lastNormalFrame = frame;
    this._wasMaximized = false;
    return this._store.update({
      frame,
      isMaximized: false,
      isFullScreen: false,
    });
  }

  private readonly _scheduleSave = () => {
    const isFullScreen = this._win.isFullScreen();

    if (isFullScreen) {
      clearTimeout(this._frameTimer);
      this._phase = "fullScreen";
      void this._store
        .update({
          isMaximized: this._wasMaximized,
          isFullScreen: true,
        })
        .catch(reportWindowStateError);
      return;
    }

    if (this._phase === "fullScreen" || this._phase === "exiting") {
      this._phase = "exiting";
      this._setTimer(this._restoreAfterFullScreen);
      return;
    }

    if (this._phase === "restoring") {
      this._setTimer(() => {
        this._phase = "normal";
      });
      return;
    }

    this._setTimer(() => {
      void this.persistNow().catch(reportWindowStateError);
    });
  };

  private readonly _restoreAfterFullScreen = () => {
    // Set the guard before changing the native window: setFrame/maximize may
    // synchronously emit another resize event.
    this._phase = "restoring";

    if (this._wasMaximized) {
      this._win.maximize();
    } else if (this._lastNormalFrame) {
      const { x, y, width, height } = this._lastNormalFrame;
      this._win.setFrame(x, y, width, height);
    }

    void this._store
      .update({
        ...(this._lastNormalFrame ? { frame: this._lastNormalFrame } : {}),
        isMaximized: this._wasMaximized,
        isFullScreen: false,
      })
      .catch(reportWindowStateError);

    this._setTimer(() => {
      this._phase = "normal";
    });
  };

  private _setTimer(callback: () => void): void {
    clearTimeout(this._frameTimer);
    this._frameTimer = setTimeout(callback, this._saveDebounceMs);
  }
}

function reportWindowStateError(error: unknown) {
  console.error("Failed to persist window state:", error);
}

export function attachWindowStatePersistence(
  win: BrowserWindow,
  options: {
    store: WindowStateStore;
    isMaximized?: boolean;
    isFullScreen?: boolean;
    saveDebounceMs?: number;
  }
) {
  activeStore = options.store;
  activeWindow = win;
  activePersistence = new WindowStatePersistence(
    win,
    options.store,
    options.saveDebounceMs,
    options
  );
  if (options?.isFullScreen) {
    win.setFullScreen(true);
  } else if (options?.isMaximized) {
    win.maximize();
  }

  win.on("close", () => {
    activePersistence?.cancelPending();
    void activePersistence?.persistNow().catch(reportWindowStateError);
  });
  activePersistence.attach();
}

/**
 * Watch for OS-level fullscreen transitions and report each change. There is no
 * dedicated fullscreen event, but entering/exiting fullscreen resizes the
 * window, so we re-check `isFullScreen()` on resize and fire on change. The
 * initial state is reported immediately.
 */
function attachFullScreenSync(
  win: BrowserWindow,
  onChange: (fullScreen: boolean) => void
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
    store: WindowStateStore;
    isMaximized?: boolean;
    isFullScreen?: boolean;
    zoom?: number;
    onFullScreenChange: (fullScreen: boolean) => void;
  }
) {
  attachWindowStatePersistence(win, {
    store: options.store,
    isMaximized: options.isMaximized,
    isFullScreen: options.isFullScreen,
  });
  attachZoomPersistence(win, options.zoom ?? 1);
  attachFullScreenSync(win, options.onFullScreenChange);
}

/** Record a new zoom level (e.g. from the View menu) and persist it. */
export function saveZoom(zoom: number) {
  desiredZoom = zoom;
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => {
    const store = activeStore;
    if (store) {
      void store.update({ zoom: desiredZoom }).catch(reportWindowStateError);
    }
  }, SAVE_DEBOUNCE_MS);
}

/** Capture the final window state and wait until every queued write settles. */
export async function flushWindowState(): Promise<void> {
  activePersistence?.cancelPending();
  clearTimeout(zoomTimer);
  if (activeWindow && activeStore && activePersistence) {
    await activePersistence.persistNow();
    await activeStore.update({ zoom: desiredZoom });
    await activeStore.flush();
  }
}

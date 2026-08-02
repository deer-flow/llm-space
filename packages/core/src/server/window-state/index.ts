import * as z from "zod";

import { atomicWriteJsonFile, readJsonFile } from "../json-file";
import { getWindowStatePath } from "../paths";

export interface WindowFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Persisted desktop window state (`settings/window.json`). */
export interface WindowState {
  frame?: WindowFrame;
  isMaximized?: boolean;
  isFullScreen?: boolean;
  zoom?: number;
}

const WindowFrameSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

export const WindowStateSchema: z.ZodType<WindowState> = z.object({
  frame: WindowFrameSchema.optional(),
  isMaximized: z.boolean().optional(),
  isFullScreen: z.boolean().optional(),
  zoom: z.number().finite().positive().optional(),
});

export const DEFAULT_WINDOW_FRAME: WindowFrame = {
  x: 80,
  y: 80,
  width: 1280,
  height: 800,
};

export function getWindowFrame(state: WindowState): WindowFrame | undefined {
  return state.frame;
}

export function getWindowMaximized(state: WindowState): boolean {
  return state.isMaximized === true;
}

export function getWindowFullScreen(state: WindowState): boolean {
  return state.isFullScreen === true;
}

export function getWindowZoom(state: WindowState): number | undefined {
  return state.zoom;
}

/**
 * Process-local source of truth for window state. Updates merge synchronously
 * in memory and publish serially so closely spaced frame and zoom events cannot
 * overwrite one another through competing read-modify-write cycles.
 */
export class WindowStateStore {
  private _state: WindowState;
  private _writeQueue: Promise<void> = Promise.resolve();

  private constructor(initial: WindowState) {
    this._state = initial;
  }

  static async load(): Promise<WindowStateStore> {
    const result = await readJsonFile(getWindowStatePath(), {
      schema: WindowStateSchema,
      recovery: "best-effort",
      fallback: () => ({}),
      repair: true,
      seedMissing: false,
    });
    if (result.source !== "strict" && result.source !== "missing") {
      console.warn(
        `Recovered window state from ${result.source}; backup: ${result.backupPath}`
      );
    }
    return new WindowStateStore(result.value);
  }

  get state(): WindowState {
    return this._state;
  }

  update(patch: Partial<WindowState>): Promise<void> {
    this._state = WindowStateSchema.parse({ ...this._state, ...patch });
    const snapshot = this._state;
    const write = this._writeQueue
      .catch(() => undefined)
      .then(() => atomicWriteJsonFile(getWindowStatePath(), snapshot));
    this._writeQueue = write;
    return write;
  }

  flush(): Promise<void> {
    return this._writeQueue;
  }
}

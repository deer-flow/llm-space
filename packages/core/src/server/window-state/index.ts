import * as fs from "node:fs/promises";

import { getSettingsDir, getWindowStatePath } from "../paths";

export interface WindowFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Persisted desktop window state (`settings/window.json`). */
export interface WindowState {
  frame?: WindowFrame;
  /**
   * Display scale factor `frame` was captured under. Meaningful on win32,
   * where frames are physical pixels; 1.0 on platforms whose frames are DIPs.
   * Absent in files written before scale tracking existed.
   */
  scaleFactor?: number;
  /** Whether the main window was maximized when last closed. */
  isMaximized?: boolean;
  /** WebKit page zoom level (1.0 = 100%). */
  zoom?: number;
}

export const DEFAULT_WINDOW_FRAME: WindowFrame = {
  x: 80,
  y: 80,
  width: 1280,
  height: 800,
};

function isWindowFrame(value: unknown): value is WindowFrame {
  if (typeof value !== "object" || value === null) return false;
  const frame = value as WindowFrame;
  return (
    typeof frame.x === "number" &&
    typeof frame.y === "number" &&
    typeof frame.width === "number" &&
    typeof frame.height === "number" &&
    Number.isFinite(frame.x) &&
    Number.isFinite(frame.y) &&
    frame.width > 0 &&
    frame.height > 0
  );
}

export function getWindowFrame(state: WindowState): WindowFrame | undefined {
  return isWindowFrame(state.frame) ? state.frame : undefined;
}

export function getWindowScaleFactor(state: WindowState): number | undefined {
  const factor = state.scaleFactor;
  return typeof factor === "number" && Number.isFinite(factor) && factor > 0
    ? factor
    : undefined;
}

function normalizeScaleFactor(factor: number | undefined): number {
  return typeof factor === "number" && Number.isFinite(factor) && factor > 0
    ? factor
    : 1;
}

/**
 * Fit `frame` inside `workArea`: shrink it to the work area's size if needed,
 * then move it so it lies fully inside.
 */
export function clampWindowFrameToWorkArea(
  frame: WindowFrame,
  workArea: WindowFrame
): WindowFrame {
  const width = Math.min(frame.width, workArea.width);
  const height = Math.min(frame.height, workArea.height);
  const x = Math.min(
    Math.max(frame.x, workArea.x),
    workArea.x + workArea.width - width
  );
  const y = Math.min(
    Math.max(frame.y, workArea.y),
    workArea.y + workArea.height - height
  );
  return { x, y, width, height };
}

/**
 * Compute the frame to open the main window with, in the units the native
 * layer expects (physical pixels on win32, DIPs elsewhere).
 *
 * `savedFrame` was recorded under `savedScaleFactor`; rescaling by
 * `currentScaleFactor / savedScaleFactor` keeps the same visual size when the
 * display scale changed between runs. A saved frame with no recorded factor
 * predates scale tracking — those builds were DPI-unaware, so their numbers
 * were virtualized (DIP-sized) values, and treating them as recorded at 1.0
 * upgrades them to the size the user actually saw. With no saved frame, the
 * DIP `DEFAULT_WINDOW_FRAME` is scaled up by `currentScaleFactor`.
 *
 * The result is clamped into `workArea` when a usable one is given. With a
 * current scale of 1 and no recorded factor (every non-win32 platform) the
 * frame passes through unchanged.
 */
export function resolveInitialWindowFrame(options: {
  savedFrame?: WindowFrame;
  savedScaleFactor?: number;
  currentScaleFactor: number;
  workArea?: WindowFrame;
}): WindowFrame {
  const base = options.savedFrame ?? DEFAULT_WINDOW_FRAME;
  const savedScale = options.savedFrame
    ? normalizeScaleFactor(options.savedScaleFactor)
    : 1;
  const ratio = normalizeScaleFactor(options.currentScaleFactor) / savedScale;
  const scaled =
    ratio === 1
      ? base
      : {
          x: Math.round(base.x * ratio),
          y: Math.round(base.y * ratio),
          width: Math.round(base.width * ratio),
          height: Math.round(base.height * ratio),
        };
  const workArea = options.workArea;
  // An all-zero work area is electrobun's "display info unavailable" fallback.
  return workArea && workArea.width > 0 && workArea.height > 0
    ? clampWindowFrameToWorkArea(scaled, workArea)
    : scaled;
}

export function getWindowMaximized(state: WindowState): boolean {
  return state.isMaximized === true;
}

export function getWindowZoom(state: WindowState): number | undefined {
  const zoom = state.zoom;
  return typeof zoom === "number" && Number.isFinite(zoom) && zoom > 0
    ? zoom
    : undefined;
}

export async function loadWindowState(): Promise<WindowState> {
  try {
    const text = await fs.readFile(getWindowStatePath(), "utf8");
    return JSON.parse(text) as WindowState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeWindowState(next: WindowState): Promise<void> {
  await fs.mkdir(getSettingsDir(), { recursive: true });
  await fs.writeFile(
    getWindowStatePath(),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8"
  );
}

export async function saveWindowFrame(
  frame: WindowFrame,
  scaleFactor = 1
): Promise<void> {
  const state = await loadWindowState();
  await writeWindowState({ ...state, frame, scaleFactor, isMaximized: false });
}

export async function saveWindowMaximized(isMaximized: boolean): Promise<void> {
  const state = await loadWindowState();
  await writeWindowState({ ...state, isMaximized });
}

export async function saveWindowZoom(zoom: number): Promise<void> {
  const state = await loadWindowState();
  await writeWindowState({ ...state, zoom });
}

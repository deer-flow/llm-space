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
  /** Whether the main window was maximized when last closed. */
  isMaximized?: boolean;
  /** Whether the main window was in OS fullscreen when last closed. */
  isFullScreen?: boolean;
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

export function getWindowMaximized(state: WindowState): boolean {
  return state.isMaximized === true;
}

export function getWindowFullScreen(state: WindowState): boolean {
  return state.isFullScreen === true;
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

export async function saveWindowFrame(frame: WindowFrame): Promise<void> {
  const state = await loadWindowState();
  await writeWindowState({
    ...state,
    frame,
    isMaximized: false,
    isFullScreen: false,
  });
}

export async function saveWindowMaximized(isMaximized: boolean): Promise<void> {
  const state = await loadWindowState();
  await writeWindowState({ ...state, isMaximized, isFullScreen: false });
}

export async function saveWindowFullScreen(
  isFullScreen: boolean
): Promise<void> {
  const state = await loadWindowState();
  await writeWindowState({ ...state, isFullScreen });
}

export async function saveWindowZoom(zoom: number): Promise<void> {
  const state = await loadWindowState();
  await writeWindowState({ ...state, zoom });
}

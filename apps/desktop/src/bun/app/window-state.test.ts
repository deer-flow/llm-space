import { describe, expect, test } from "bun:test";

import type { WindowState } from "@llm-space/core/server";

import { attachWindowStatePersistence } from "./window-state";

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

class FakeWindow {
  frame: Frame;
  fullScreen = false;
  maximized = false;
  maximizeCalls = 0;
  restoredFrames: Frame[] = [];

  private readonly _listeners = new Map<string, (() => void)[]>();

  constructor(frame: Frame) {
    this.frame = frame;
  }

  on(name: string, listener: () => void): void {
    const listeners = this._listeners.get(name) ?? [];
    listeners.push(listener);
    this._listeners.set(name, listeners);
  }

  emit(name: string): void {
    for (const listener of this._listeners.get(name) ?? []) listener();
  }

  getFrame(): Frame {
    return { ...this.frame };
  }

  setFrame(x: number, y: number, width: number, height: number): void {
    this.frame = { x, y, width, height };
    this.restoredFrames.push({ ...this.frame });
  }

  isFullScreen(): boolean {
    return this.fullScreen;
  }

  setFullScreen(fullScreen: boolean): void {
    this.fullScreen = fullScreen;
  }

  isMaximized(): boolean {
    return this.maximized;
  }

  maximize(): void {
    this.maximized = true;
    this.maximizeCalls += 1;
  }
}

class FakeStore {
  state: WindowState;
  updates: Partial<WindowState>[] = [];

  constructor(initial: WindowState) {
    this.state = initial;
  }

  update(patch: Partial<WindowState>): Promise<void> {
    this.updates.push(patch);
    this.state = { ...this.state, ...patch };
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}

const waitForTimers = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("window state persistence", () => {
  test("restores the last normal frame instead of saving fullscreen exit bounds", async () => {
    const normalFrame = { x: 100, y: 80, width: 1280, height: 800 };
    const transitionalFrame = { x: 0, y: 500, width: 1512, height: 320 };
    const win = new FakeWindow(normalFrame);
    const store = new FakeStore({
      frame: normalFrame,
      isMaximized: false,
      isFullScreen: false,
    });

    attachWindowStatePersistence(win as never, {
      store: store as never,
      saveDebounceMs: 1,
    });

    win.fullScreen = true;
    win.frame = { x: 0, y: 0, width: 1512, height: 982 };
    win.emit("resize");

    win.fullScreen = false;
    win.frame = transitionalFrame;
    win.emit("resize");
    await waitForTimers();

    expect(win.restoredFrames).toEqual([normalFrame]);
    expect(store.state).toEqual({
      frame: normalFrame,
      isMaximized: false,
      isFullScreen: false,
    });
    expect(store.updates).not.toContainEqual({
      frame: transitionalFrame,
      isMaximized: false,
      isFullScreen: false,
    });

    await waitForTimers();
    const resizedFrame = { x: 120, y: 90, width: 1100, height: 720 };
    win.frame = resizedFrame;
    win.emit("resize");
    await waitForTimers();
    expect(store.state.frame).toEqual(resizedFrame);
  });

  test("returns to maximized when fullscreen was entered from maximized", async () => {
    const normalFrame = { x: 100, y: 80, width: 1280, height: 800 };
    const win = new FakeWindow(normalFrame);
    win.maximized = true;
    const store = new FakeStore({
      frame: normalFrame,
      isMaximized: true,
      isFullScreen: false,
    });

    attachWindowStatePersistence(win as never, {
      store: store as never,
      isMaximized: true,
      saveDebounceMs: 1,
    });
    expect(win.maximizeCalls).toBe(1);

    win.fullScreen = true;
    win.maximized = false;
    win.emit("resize");
    win.fullScreen = false;
    win.frame = { x: 0, y: 500, width: 1512, height: 320 };
    win.emit("resize");
    await waitForTimers();

    expect(win.maximizeCalls).toBe(2);
    expect(win.restoredFrames).toEqual([]);
    expect(store.state).toEqual({
      frame: normalFrame,
      isMaximized: true,
      isFullScreen: false,
    });
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { LOCAL_STORAGE_KEYS } from "@llm-space/ui/lib/local-storage";

import {
  DEFAULT_VIEW_CACHE_SIZE,
  MAX_VIEW_CACHE_SIZE,
  getViewCacheSize,
  setViewCacheSize,
  subscribeViewCacheSize,
} from "./view-cache-size";

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();
  get length() {
    return this.#values.size;
  }
  clear() {
    this.#values.clear();
  }
  getItem(key: string) {
    return this.#values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.#values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#values.delete(key);
  }
  setItem(key: string, value: string) {
    this.#values.set(key, value);
  }
}

describe("view cache size", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: new MemoryStorage(),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  test("defaults to three cached views", () => {
    expect(DEFAULT_VIEW_CACHE_SIZE).toBe(3);
    expect(getViewCacheSize()).toBe(3);
  });

  test("prefers the generic key and falls back to the legacy Thread key", () => {
    window.localStorage.setItem(LOCAL_STORAGE_KEYS.threadViewCacheSize, "7");
    expect(getViewCacheSize()).toBe(7);

    window.localStorage.setItem(LOCAL_STORAGE_KEYS.viewCacheSize, "4");
    expect(getViewCacheSize()).toBe(4);
  });

  test("falls back for malformed or out-of-range persisted values", () => {
    for (const value of ["0", "11", "3.5", "bad", ""]) {
      window.localStorage.setItem(LOCAL_STORAGE_KEYS.viewCacheSize, value);
      expect(getViewCacheSize()).toBe(DEFAULT_VIEW_CACHE_SIZE);
    }
    expect(MAX_VIEW_CACHE_SIZE).toBe(10);
  });

  test("writes the generic key, removes the legacy key, and notifies once", () => {
    window.localStorage.setItem(LOCAL_STORAGE_KEYS.threadViewCacheSize, "6");
    const snapshots: number[] = [];
    const unsubscribe = subscribeViewCacheSize(() => {
      snapshots.push(getViewCacheSize());
    });

    setViewCacheSize(6);
    setViewCacheSize(9);
    unsubscribe();

    expect(window.localStorage.getItem(LOCAL_STORAGE_KEYS.viewCacheSize)).toBe(
      "9"
    );
    expect(
      window.localStorage.getItem(LOCAL_STORAGE_KEYS.threadViewCacheSize)
    ).toBeNull();
    expect(snapshots).toEqual([9]);
  });

  test("clamps caller values", () => {
    setViewCacheSize(0);
    expect(getViewCacheSize()).toBe(1);
    setViewCacheSize(99);
    expect(getViewCacheSize()).toBe(10);
    setViewCacheSize(4.8);
    expect(getViewCacheSize()).toBe(5);
  });
});

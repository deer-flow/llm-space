import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { LOCAL_STORAGE_KEYS } from "@llm-space/ui/lib/local-storage";

import {
  DEFAULT_THREAD_VIEW_CACHE_SIZE,
  MAX_THREAD_VIEW_CACHE_SIZE,
  getThreadViewCacheSize,
  setThreadViewCacheSize,
  subscribeThreadViewCacheSize,
} from "./thread-view-cache-size";

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

describe("thread view cache size", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: new MemoryStorage(),
        addEventListener() {
          return undefined;
        },
        removeEventListener() {
          return undefined;
        },
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
    expect(DEFAULT_THREAD_VIEW_CACHE_SIZE).toBe(3);
    expect(getThreadViewCacheSize()).toBe(3);
  });

  test("accepts persisted integers from one through ten", () => {
    for (const value of [1, 2, 3, 7, 10]) {
      window.localStorage.setItem(
        LOCAL_STORAGE_KEYS.threadViewCacheSize,
        String(value)
      );
      expect(getThreadViewCacheSize()).toBe(value);
    }
    expect(MAX_THREAD_VIEW_CACHE_SIZE).toBe(10);
  });

  test("falls back for malformed or out-of-range persisted values", () => {
    for (const value of ["0", "11", "3.5", "bad", ""]) {
      window.localStorage.setItem(
        LOCAL_STORAGE_KEYS.threadViewCacheSize,
        value
      );
      expect(getThreadViewCacheSize()).toBe(DEFAULT_THREAD_VIEW_CACHE_SIZE);
    }
  });

  test("persists changes and notifies same-window subscribers", () => {
    const snapshots: number[] = [];
    const unsubscribe = subscribeThreadViewCacheSize(() => {
      snapshots.push(getThreadViewCacheSize());
    });

    setThreadViewCacheSize(6);
    setThreadViewCacheSize(6);
    setThreadViewCacheSize(9);
    unsubscribe();
    setThreadViewCacheSize(4);

    expect(window.localStorage.getItem(LOCAL_STORAGE_KEYS.threadViewCacheSize)).toBe(
      "4"
    );
    expect(snapshots).toEqual([6, 9]);
  });

  test("normalizes invalid values passed by callers", () => {
    setThreadViewCacheSize(0);
    expect(getThreadViewCacheSize()).toBe(1);

    setThreadViewCacheSize(99);
    expect(getThreadViewCacheSize()).toBe(10);

    setThreadViewCacheSize(4.8);
    expect(getThreadViewCacheSize()).toBe(5);
  });
});

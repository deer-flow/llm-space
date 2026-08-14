import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import {
  getMessageStatsSummaryMode,
  setMessageStatsSummaryMode,
} from "../../src/components/thread-playground/message/message-stats-summary-mode";
import {
  configureLocalStoragePersistence,
  hydrateLocalStorage,
  LOCAL_STORAGE_KEYS,
  readLocalStorageValues,
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "../../src/lib/local-storage";

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "window"
);

let values = new Map<string, string>();

const storage: Storage = {
  get length() {
    return values.size;
  },
  clear() {
    values.clear();
  },
  getItem(key) {
    return values.get(key) ?? null;
  },
  key(index) {
    return [...values.keys()][index] ?? null;
  },
  removeItem(key) {
    values.delete(key);
  },
  setItem(key, value) {
    values.set(key, value);
  },
};

beforeEach(() => {
  values = new Map();
  configureLocalStoragePersistence(null);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
});

afterAll(() => {
  configureLocalStoragePersistence(null);
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("shared localStorage access", () => {
  test("reads, writes, and removes registered keys", () => {
    const key = LOCAL_STORAGE_KEYS.messageStatsSummaryMode;

    expect(readLocalStorage(key)).toBeNull();
    expect(writeLocalStorage(key, "tokens")).toBe(true);
    expect(readLocalStorage(key)).toBe("tokens");
    expect(removeLocalStorage(key)).toBe(true);
    expect(readLocalStorage(key)).toBeNull();
  });

  test("persists the global message stats summary mode", () => {
    expect(getMessageStatsSummaryMode()).toBe("timing");

    setMessageStatsSummaryMode("tokens");

    expect(getMessageStatsSummaryMode()).toBe("tokens");
  });

  test("mirrors writes and removals through a configured host adapter", () => {
    const changes: string[] = [];
    const key = LOCAL_STORAGE_KEYS.theme;
    configureLocalStoragePersistence({
      setItem: (changedKey, value) =>
        changes.push(`set:${changedKey}:${value}`),
      removeItem: (changedKey) => changes.push(`remove:${changedKey}`),
    });

    writeLocalStorage(key, "light");
    removeLocalStorage(key);

    expect(changes).toEqual([
      `set:${key}:light`,
      `remove:${key}`,
    ]);
  });

  test("hydrates managed keys while preserving unrelated origin storage", () => {
    storage.setItem(LOCAL_STORAGE_KEYS.theme, "dark");
    storage.setItem(LOCAL_STORAGE_KEYS.activeTab, "stale");
    storage.setItem("unrelated", "keep");

    expect(
      hydrateLocalStorage({
        [LOCAL_STORAGE_KEYS.theme]: "light",
        [`${LOCAL_STORAGE_KEYS.fileTreeExpanded}:local`]: '["prompts"]',
      })
    ).toBe(true);

    expect(readLocalStorageValues()).toEqual({
      [LOCAL_STORAGE_KEYS.theme]: "light",
      [`${LOCAL_STORAGE_KEYS.fileTreeExpanded}:local`]: '["prompts"]',
    });
    expect(storage.getItem(LOCAL_STORAGE_KEYS.activeTab)).toBeNull();
    expect(storage.getItem("unrelated")).toBe("keep");
  });
});

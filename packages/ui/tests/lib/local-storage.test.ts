import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import {
  getMessageStatsSummaryMode,
  setMessageStatsSummaryMode,
} from "../../src/components/thread-playground/message/message-stats-summary-mode";
import {
  LOCAL_STORAGE_KEYS,
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
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
});

afterAll(() => {
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
});

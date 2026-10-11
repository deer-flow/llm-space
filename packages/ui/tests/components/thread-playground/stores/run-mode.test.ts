import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  getFullAccessAcknowledged,
  getFullAccessMode,
  setFullAccessAcknowledged,
  setFullAccessMode,
} from "../../../../src/components/thread-playground/stores/run-mode";

const originalWindow = Reflect.get(globalThis, "window");
const storageEntries = new Map<string, string>();

/**
 * The UI's storage helper reads `window.localStorage`, which the Bun test
 * runtime does not provide, so install the smallest in-memory stand-in.
 */
function _installWindowStorage(): void {
  Reflect.set(globalThis, "window", {
    localStorage: {
      getItem: (key: string) => storageEntries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storageEntries.set(key, value);
      },
      removeItem: (key: string) => {
        storageEntries.delete(key);
      },
      clear: () => {
        storageEntries.clear();
      },
      key: (index: number) => [...storageEntries.keys()][index] ?? null,
      get length() {
        return storageEntries.size;
      },
    },
  });
}

beforeAll(() => {
  _installWindowStorage();
});

afterAll(() => {
  Reflect.set(globalThis, "window", originalWindow);
});

describe("full access mode storage", () => {
  test("is off and unacknowledged before anything is stored", () => {
    // A reinstall or cleared storage must ask for the risk acknowledgement
    // again, so both flags have to default to false.
    expect(getFullAccessMode()).toBe(false);
    expect(getFullAccessAcknowledged()).toBe(false);
  });

  test("keeps the acknowledgement and the enabled mode on separate keys", () => {
    setFullAccessAcknowledged(true);
    expect(getFullAccessAcknowledged()).toBe(true);
    // Acknowledging the risk never turns the mode on by itself.
    expect(getFullAccessMode()).toBe(false);

    setFullAccessMode(true);
    expect(getFullAccessMode()).toBe(true);
    setFullAccessMode(false);
    expect(getFullAccessMode()).toBe(false);
    expect(getFullAccessAcknowledged()).toBe(true);
  });

  test("clearing storage drops the acknowledgement and the mode together", () => {
    setFullAccessAcknowledged(true);
    setFullAccessMode(true);

    storageEntries.clear();

    expect(getFullAccessAcknowledged()).toBe(false);
    expect(getFullAccessMode()).toBe(false);
  });
});

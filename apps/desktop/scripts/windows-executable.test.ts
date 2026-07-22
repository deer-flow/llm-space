import { describe, expect, test } from "bun:test";

import {
  getWindowsExecutableSubsystem,
  patchWindowsExecutableToConsole,
  patchWindowsExecutableToGui,
} from "./windows-executable";

const PE_OFFSET = 0x80;
const OPTIONAL_HEADER_SIZE = 0xf0;
const SUBSYSTEM_OFFSET = PE_OFFSET + 4 + 20 + 68;

function _makePeImage(subsystem: number): Uint8Array {
  const image = new Uint8Array(PE_OFFSET + 4 + 20 + OPTIONAL_HEADER_SIZE);
  image[0] = 0x4d;
  image[1] = 0x5a;
  new DataView(image.buffer).setUint32(0x3c, PE_OFFSET, true);
  image.set([0x50, 0x45, 0, 0], PE_OFFSET);

  const coffOffset = PE_OFFSET + 4;
  new DataView(image.buffer).setUint16(coffOffset, 0x8664, true);
  new DataView(image.buffer).setUint16(
    coffOffset + 16,
    OPTIONAL_HEADER_SIZE,
    true
  );

  const optionalOffset = coffOffset + 20;
  new DataView(image.buffer).setUint16(optionalOffset, 0x20b, true);
  new DataView(image.buffer).setUint16(SUBSYSTEM_OFFSET, subsystem, true);
  return image;
}

describe("Windows PE subsystem helper", () => {
  test("reads and converts a console PE image to GUI", () => {
    const image = _makePeImage(3);

    expect(getWindowsExecutableSubsystem(image)).toBe(3);
    const patched = patchWindowsExecutableToGui(image);

    expect(getWindowsExecutableSubsystem(patched)).toBe(2);
    expect(getWindowsExecutableSubsystem(image)).toBe(3);
  });

  test("restores a GUI PE image to the console subsystem", () => {
    const image = _makePeImage(2);

    const patched = patchWindowsExecutableToConsole(image);

    expect(getWindowsExecutableSubsystem(patched)).toBe(3);
    expect(getWindowsExecutableSubsystem(image)).toBe(2);
  });

  test("is idempotent for an existing GUI image", () => {
    const image = _makePeImage(2);

    expect(
      getWindowsExecutableSubsystem(patchWindowsExecutableToGui(image))
    ).toBe(2);
  });

  test("rejects an unsupported subsystem", () => {
    expect(() => patchWindowsExecutableToGui(_makePeImage(9))).toThrow(
      "Unsupported Windows PE subsystem 9"
    );
  });

  test("rejects a non-PE file", () => {
    expect(() => getWindowsExecutableSubsystem(new Uint8Array(128))).toThrow(
      "missing DOS header"
    );
  });
});

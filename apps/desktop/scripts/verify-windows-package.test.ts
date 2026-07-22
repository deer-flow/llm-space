import { describe, expect, test } from "bun:test";

import {
  verifyWindowsTar,
  verifyWindowsUpdateJson,
} from "./verify-windows-package";

interface FixtureEntry {
  name: string;
  type?: string;
  content?: string;
}

const REQUIRED_ENTRIES: FixtureEntry[] = [
  { name: "LLMSpace-canary/bin/launcher.exe" },
  { name: "LLMSpace-canary/bin/launcher-core.exe" },
  { name: "LLMSpace-canary/bin/bun.exe" },
  { name: "LLMSpace-canary/Resources/main.js" },
  { name: "LLMSpace-canary/Resources/app/views/mainview/index.html" },
];

function _tar(entries: FixtureEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const content = new TextEncoder().encode(entry.content ?? "fixture");
    const header = new Uint8Array(512);
    _writeString(header, 0, 100, entry.name);
    _writeString(header, 100, 8, "0000644\0");
    _writeString(header, 108, 8, "0000000\0");
    _writeString(header, 116, 8, "0000000\0");
    _writeString(
      header,
      124,
      12,
      `${content.length.toString(8).padStart(11, "0")}\0`
    );
    _writeString(header, 136, 12, "00000000000\0");
    header.fill(0x20, 148, 156);
    header[156] = (entry.type ?? "0").charCodeAt(0);
    _writeString(header, 257, 6, "ustar\0");
    _writeString(header, 263, 2, "00");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    _writeString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
    chunks.push(header, content);
    const padding = (512 - (content.length % 512)) % 512;
    if (padding) chunks.push(new Uint8Array(padding));
  }
  chunks.push(new Uint8Array(1024));
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const tar = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    tar.set(chunk, offset);
    offset += chunk.length;
  }
  return tar;
}

function _writeString(
  target: Uint8Array,
  offset: number,
  length: number,
  value: string
): void {
  const encoded = new TextEncoder().encode(value);
  if (encoded.length > length) throw new Error("fixture field is too long");
  target.set(encoded, offset);
}

describe("verifyWindowsTar", () => {
  test("accepts a portable archive with the required Windows payload", () => {
    expect(verifyWindowsTar(_tar(REQUIRED_ENTRIES))).toHaveLength(5);
  });

  test.each(["../outside.txt", "/absolute.txt", "C:/absolute.txt"])(
    "rejects unsafe archive path %s",
    (name) => {
      expect(() =>
        verifyWindowsTar(_tar([...REQUIRED_ENTRIES, { name }]))
      ).toThrow("unsafe path");
    }
  );

  test("rejects GNU LongLink records with an actionable error", () => {
    expect(() =>
      verifyWindowsTar(
        _tar([
          ...REQUIRED_ENTRIES,
          { name: "././@LongLink", type: "L", content: "very-long-name" },
        ])
      )
    ).toThrow("GNU LongLink");
  });

  test("rejects an archive missing a required runtime entry", () => {
    expect(() => verifyWindowsTar(_tar(REQUIRED_ENTRIES.slice(1)))).toThrow(
      "bin/launcher.exe"
    );
  });
});

describe("verifyWindowsUpdateJson", () => {
  test("accepts the Windows x64 update identity", () => {
    expect(
      verifyWindowsUpdateJson(
        JSON.stringify({ version: "4.3.0", platform: "win", arch: "x64" })
      )
    ).toMatchObject({ platform: "win", arch: "x64" });
  });

  test.each([
    { platform: "macos", arch: "x64" },
    { platform: "win", arch: "arm64" },
  ])("rejects update identity $platform/$arch", (identity) => {
    expect(() => verifyWindowsUpdateJson(JSON.stringify(identity))).toThrow(
      "Windows x64"
    );
  });
});

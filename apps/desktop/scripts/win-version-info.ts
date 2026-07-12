/**
 * Builds a complete VS_VERSIONINFO resource and injects it with the Win32
 * resource-update API (via bun:ffi — win32-only, callers guard).
 *
 * Why not rcedit: rescle's SetVersionString appends strings "to all existing
 * string tables", and a PE that ships without any RT_VERSION resource has
 * zero tables — the call silently no-ops while still reporting success
 * (confirmed against rescle.cc; launcher.exe/bspatch.exe/zig-zstd.exe all
 * ship resource-less). Icons and manifests go through a different rescle path
 * that does work, so rcedit stays in use for those.
 *
 * Blob layout per the VS_VERSIONINFO documentation: nested blocks of
 * { wLength, wValueLength, wType, szKey, padding, value, children }, all
 * UTF-16LE, 4-byte aligned. One en-US string table ("040904b0") plus the
 * matching VarFileInfo\Translation entry.
 */
import { dlopen, FFIType, ptr } from "bun:ffi";

const LANG_EN_US = 0x0409;
const CODEPAGE_UNICODE = 0x04b0;
const RT_VERSION = 16;

function _block(
  key: string,
  wType: 0 | 1,
  value: Buffer | null,
  children: Buffer[]
): Buffer {
  const keyBytes = Buffer.from(`${key}\0`, "utf16le");
  const headerLen = 6 + keyBytes.length;
  const padAfterKey = (4 - (headerLen % 4)) % 4;
  const valueLen = value?.length ?? 0;

  const head = Buffer.alloc(headerLen + padAfterKey + valueLen);
  // wValueLength counts WCHARs for text values (wType 1), bytes for binary.
  head.writeUInt16LE(value ? (wType === 1 ? valueLen / 2 : valueLen) : 0, 2);
  head.writeUInt16LE(wType, 4);
  keyBytes.copy(head, 6);
  value?.copy(head, headerLen + padAfterKey);

  const parts = [head];
  let total = head.length;
  for (const child of children) {
    const pad = (4 - (total % 4)) % 4;
    parts.push(Buffer.alloc(pad), child);
    total += pad + child.length;
  }
  const blob = Buffer.concat(parts);
  blob.writeUInt16LE(blob.length, 0);
  return blob;
}

function _fixedFileInfo(numericVersion: string): Buffer {
  const [major = 0, minor = 0, patch = 0, build = 0] = numericVersion
    .split(".")
    .map((part) => Number(part) & 0xffff);
  const info = Buffer.alloc(52);
  info.writeUInt32LE(0xfeef04bd, 0); // dwSignature
  info.writeUInt32LE(0x00010000, 4); // dwStrucVersion
  info.writeUInt32LE((major << 16) | minor, 8); // dwFileVersionMS
  info.writeUInt32LE((patch << 16) | build, 12); // dwFileVersionLS
  info.writeUInt32LE((major << 16) | minor, 16); // dwProductVersionMS
  info.writeUInt32LE((patch << 16) | build, 20); // dwProductVersionLS
  info.writeUInt32LE(0x3f, 24); // dwFileFlagsMask (VS_FFI_FILEFLAGSMASK)
  info.writeUInt32LE(0x00040004, 32); // dwFileOS (VOS_NT_WINDOWS32)
  info.writeUInt32LE(0x00000001, 36); // dwFileType (VFT_APP)
  return info;
}

export function buildVersionResource(
  numericVersion: string,
  strings: Record<string, string>
): Buffer {
  const stringEntries = Object.entries(strings).map(([name, value]) =>
    _block(name, 1, Buffer.from(`${value}\0`, "utf16le"), [])
  );
  const table = _block(
    `${LANG_EN_US.toString(16).padStart(4, "0")}${CODEPAGE_UNICODE.toString(16).padStart(4, "0")}`,
    1,
    null,
    stringEntries
  );
  const stringFileInfo = _block("StringFileInfo", 1, null, [table]);

  const translation = Buffer.alloc(4);
  translation.writeUInt16LE(LANG_EN_US, 0);
  translation.writeUInt16LE(CODEPAGE_UNICODE, 2);
  const varFileInfo = _block("VarFileInfo", 1, null, [
    _block("Translation", 0, translation, []),
  ]);

  return _block("VS_VERSION_INFO", 0, _fixedFileInfo(numericVersion), [
    stringFileInfo,
    varFileInfo,
  ]);
}

export function writeVersionResource(exePath: string, blob: Buffer): void {
  const kernel32 = dlopen("kernel32.dll", {
    BeginUpdateResourceW: {
      args: [FFIType.ptr, FFIType.i32],
      returns: FFIType.ptr,
    },
    // lpType/lpName take MAKEINTRESOURCE integers on x64 (pointer-sized).
    UpdateResourceW: {
      args: [
        FFIType.ptr,
        FFIType.u64,
        FFIType.u64,
        FFIType.u16,
        FFIType.ptr,
        FFIType.u32,
      ],
      returns: FFIType.i32,
    },
    EndUpdateResourceW: {
      args: [FFIType.ptr, FFIType.i32],
      returns: FFIType.i32,
    },
    GetLastError: { args: [], returns: FFIType.u32 },
  });
  try {
    const pathW = Buffer.from(`${exePath}\0`, "utf16le");
    const handle = kernel32.symbols.BeginUpdateResourceW(ptr(pathW), 0);
    if (!handle) {
      throw new Error(
        `BeginUpdateResourceW failed (${kernel32.symbols.GetLastError()})`
      );
    }
    if (
      !kernel32.symbols.UpdateResourceW(
        handle,
        BigInt(RT_VERSION),
        1n,
        LANG_EN_US,
        ptr(blob),
        blob.length
      )
    ) {
      const code = kernel32.symbols.GetLastError();
      kernel32.symbols.EndUpdateResourceW(handle, 1);
      throw new Error(`UpdateResourceW failed (${code})`);
    }
    if (!kernel32.symbols.EndUpdateResourceW(handle, 0)) {
      throw new Error(
        `EndUpdateResourceW failed (${kernel32.symbols.GetLastError()})`
      );
    }
  } finally {
    kernel32.close();
  }
}

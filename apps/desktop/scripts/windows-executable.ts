import { readFileSync, writeFileSync } from "node:fs";

const DOS_HEADER_SIZE = 0x40;
const PE_SIGNATURE_SIZE = 4;
const COFF_HEADER_SIZE = 20;
const OPTIONAL_HEADER_SUBSYSTEM_OFFSET = 68;
const PE32_MAGIC = 0x10b;
const PE32_PLUS_MAGIC = 0x20b;
const WINDOWS_GUI_SUBSYSTEM = 2;
const WINDOWS_CONSOLE_SUBSYSTEM = 3;

/**
 * Return the PE subsystem value from a Windows executable image.
 *
 * This intentionally handles only PE32/PE32+ images and validates the header
 * boundaries before touching the subsystem field. The Windows build currently
 * targets x64, but accepting PE32 here keeps the helper useful for the setup
 * extractor if Electrobun changes its architecture in the future.
 */
export function getWindowsExecutableSubsystem(data: Uint8Array): number {
  const subsystemOffset = _getSubsystemOffset(data);
  return _readUInt16(data, subsystemOffset);
}

/**
 * Make a Windows executable a GUI-subsystem image so Explorer does not create
 * a console window when it is double-clicked. The image entry point and code
 * are unchanged; only the PE subsystem metadata is updated.
 */
export function patchWindowsExecutableToGui(data: Uint8Array): Uint8Array {
  return _patchWindowsExecutableSubsystem(data, WINDOWS_GUI_SUBSYSTEM);
}

/** Restore a Windows executable to the console subsystem. */
export function patchWindowsExecutableToConsole(data: Uint8Array): Uint8Array {
  return _patchWindowsExecutableSubsystem(data, WINDOWS_CONSOLE_SUBSYSTEM);
}

/** Patch a Windows executable file in place and return its previous subsystem. */
export function patchWindowsExecutableFileToGui(filePath: string): number {
  return _patchWindowsExecutableFile(filePath, WINDOWS_GUI_SUBSYSTEM);
}

/** Restore a Windows executable file to the console subsystem in place. */
export function patchWindowsExecutableFileToConsole(filePath: string): number {
  return _patchWindowsExecutableFile(filePath, WINDOWS_CONSOLE_SUBSYSTEM);
}

function _patchWindowsExecutableFile(
  filePath: string,
  subsystem: number
): number {
  const original = readFileSync(filePath);
  const previous = getWindowsExecutableSubsystem(original);
  const patched = _patchWindowsExecutableSubsystem(original, subsystem);
  writeFileSync(filePath, patched);
  return previous;
}

function _patchWindowsExecutableSubsystem(
  data: Uint8Array,
  subsystem: number
): Uint8Array {
  const patched = new Uint8Array(data);
  const subsystemOffset = _getSubsystemOffset(patched);
  const current = _readUInt16(patched, subsystemOffset);
  if (
    current !== WINDOWS_CONSOLE_SUBSYSTEM &&
    current !== WINDOWS_GUI_SUBSYSTEM
  ) {
    throw new Error(
      `Unsupported Windows PE subsystem ${current}; expected console (${WINDOWS_CONSOLE_SUBSYSTEM}) or GUI (${WINDOWS_GUI_SUBSYSTEM}).`
    );
  }
  _writeUInt16(patched, subsystemOffset, subsystem);
  return patched;
}

function _getSubsystemOffset(data: Uint8Array): number {
  if (data.length < DOS_HEADER_SIZE || _readUInt16(data, 0) !== 0x5a4d) {
    throw new Error("Not a Windows PE image: missing DOS header.");
  }

  const peOffset = _readUInt32(data, 0x3c);
  const peHeaderOffset = peOffset + PE_SIGNATURE_SIZE;
  if (
    peHeaderOffset + COFF_HEADER_SIZE > data.length ||
    !_hasPeSignature(data, peOffset)
  ) {
    throw new Error("Not a Windows PE image: missing PE signature.");
  }

  const optionalHeaderSize = _readUInt16(data, peOffset + 4 + 16);
  const optionalHeaderOffset = peOffset + PE_SIGNATURE_SIZE + COFF_HEADER_SIZE;
  if (
    optionalHeaderSize < OPTIONAL_HEADER_SUBSYSTEM_OFFSET + 2 ||
    optionalHeaderOffset + optionalHeaderSize > data.length
  ) {
    throw new Error("Windows PE optional header is truncated.");
  }

  const magic = _readUInt16(data, optionalHeaderOffset);
  if (magic !== PE32_MAGIC && magic !== PE32_PLUS_MAGIC) {
    throw new Error(
      `Unsupported Windows PE optional-header magic: 0x${magic.toString(16)}.`
    );
  }
  return optionalHeaderOffset + OPTIONAL_HEADER_SUBSYSTEM_OFFSET;
}

function _hasPeSignature(data: Uint8Array, offset: number): boolean {
  return (
    offset + PE_SIGNATURE_SIZE <= data.length &&
    data[offset] === 0x50 &&
    data[offset + 1] === 0x45 &&
    data[offset + 2] === 0 &&
    data[offset + 3] === 0
  );
}

function _readUInt16(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function _readUInt32(data: Uint8Array, offset: number): number {
  return (
    (data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)) >>>
    0
  );
}

function _writeUInt16(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = value >>> 8;
}

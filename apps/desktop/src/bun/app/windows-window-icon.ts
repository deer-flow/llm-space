import { existsSync } from "node:fs";
import path from "node:path";

import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";

const IMAGE_ICON = 1;
const LR_LOADFROMFILE = 0x10;
const WM_SETICON = 0x80;
const ICON_SMALL = 0;
const ICON_BIG = 1;

export function setWindowsWindowIcon(windowPtr: Pointer): void {
  if (process.platform !== "win32") return;

  const iconPath = _resolveWindowsWindowIconPath();
  if (!iconPath) return;

  try {
    const user32 = dlopen("user32.dll", {
      LoadImageW: {
        args: [
          FFIType.ptr,
          FFIType.ptr,
          FFIType.u32,
          FFIType.i32,
          FFIType.i32,
          FFIType.u32,
        ],
        returns: FFIType.ptr,
      },
      SendMessageW: {
        args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.ptr],
        returns: FFIType.ptr,
      },
    });
    const wideIconPath = Buffer.from(`${iconPath}\0`, "utf16le");
    const smallIcon = user32.symbols.LoadImageW(
      null,
      ptr(wideIconPath),
      IMAGE_ICON,
      16,
      16,
      LR_LOADFROMFILE
    );
    const largeIcon = user32.symbols.LoadImageW(
      null,
      ptr(wideIconPath),
      IMAGE_ICON,
      32,
      32,
      LR_LOADFROMFILE
    );

    if (smallIcon) {
      user32.symbols.SendMessageW(windowPtr, WM_SETICON, ICON_SMALL, smallIcon);
    }
    if (largeIcon) {
      user32.symbols.SendMessageW(windowPtr, WM_SETICON, ICON_BIG, largeIcon);
    }
  } catch (error) {
    console.warn("Unable to set the Windows window icon:", error);
  }
}

function _resolveWindowsWindowIconPath(): string | null {
  const mainScript = process.argv[1];
  const candidates = [
    ...(mainScript
      ? [path.join(path.dirname(path.resolve(mainScript)), "app.ico")]
      : []),
    path.join(path.dirname(process.execPath), "..", "Resources", "app.ico"),
    path.join(process.cwd(), "..", "Resources", "app.ico"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

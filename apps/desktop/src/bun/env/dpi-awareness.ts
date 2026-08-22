import { dlopen } from "bun:ffi";

/**
 * Declare per-monitor V2 DPI awareness on Windows. Without it, this process
 * is DPI-unaware: at system DPI != 96 Windows renders the whole window at
 * 96 DPI and bitmap-scales it to the physical size, blurring every glyph.
 * Must run before any window or WebView is created (first line of the bun
 * entry). macOS needs nothing — AppKit/WebKit handle Retina on their own.
 */
export function enableDpiAwareness(): void {
  if (process.platform !== "win32") return;
  try {
    const user32 = dlopen("user32.dll", {
      SetProcessDpiAwarenessContext: { args: ["i64"], returns: "bool" },
    });
    // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 is the HANDLE -4; the i64
    // declaration sign-extends it to the correct pointer-sized bit pattern.
    user32.symbols.SetProcessDpiAwarenessContext(-4n);
  } catch {
    // Non-fatal: falls back to Windows' default bitmap-scaled rendering.
  }
}

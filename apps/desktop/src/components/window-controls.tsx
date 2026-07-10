"use client";

import { memo } from "react";

import { useCommands } from "@/commands";
import { cn } from "@/lib/utils";

/**
 * Windows caption buttons (minimize / maximize-restore / close) for the
 * frameless window. macOS draws its own traffic lights, so render this only
 * when `isWindows` (and hide it in fullscreen, where Windows hides caption
 * buttons too). Follows the Windows 11 conventions: buttons on the right,
 * ~46px wide, and the close button turns red (#C42B1C) on hover.
 *
 * The glyphs are hand-drawn 10×10 strokes (Segoe-style) rather than lucide
 * icons so they read crisply at caption-button size.
 */
function _WindowControls({ className }: { className?: string }) {
  const { executeCommand } = useCommands();

  return (
    <div
      className={cn(
        "electrobun-webkit-app-region-no-drag flex h-full items-stretch",
        className
      )}
    >
      <button
        type="button"
        aria-label="Minimize window"
        className={_buttonClass()}
        onClick={() => executeCommand({ type: "windowMinimize", args: {} })}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Maximize or restore window"
        className={_buttonClass()}
        onClick={() =>
          executeCommand({ type: "windowToggleMaximize", args: {} })
        }
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect
            x="0.5"
            y="0.5"
            width="9"
            height="9"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Close window"
        className={_buttonClass("hover:bg-[#C42B1C] hover:text-white")}
        onClick={() => executeCommand({ type: "windowClose", args: {} })}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M0 0l10 10M10 0L0 10"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
          />
        </svg>
      </button>
    </div>
  );
}

function _buttonClass(hover = "hover:bg-accent hover:text-foreground") {
  return cn(
    "text-muted-foreground flex w-11.5 items-center justify-center outline-none transition-colors",
    hover
  );
}

export const WindowControls = memo(_WindowControls);

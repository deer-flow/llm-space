"use client";

import { useEffect } from "react";

import { useCommands } from "@/commands";
import type { Command } from "@/shared/commands";
import { isMac } from "@/shared/platform";

/**
 * Global keyboard shortcuts for platforms WITHOUT a native application menu
 * (Windows / Linux). On macOS the native menu's accelerators own these chords,
 * so this hook is inert there — a renderer duplicate would double-fire.
 *
 * Mirrors the accelerators declared in `bun/app/menu.ts`, with the Windows
 * conventions applied: Ctrl instead of ⌘, Alt instead of Option, and F11 for
 * fullscreen. Listens in the capture phase so the chords win over focused
 * editors, matching how native menu accelerators behave on macOS.
 */
export function useAppKeymap() {
  const { executeCommand } = useCommands();

  useEffect(() => {
    if (isMac) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;

      const dispatch = (command: Command) => {
        event.preventDefault();
        event.stopPropagation();
        executeCommand(command);
      };

      if (
        event.key === "F11" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        dispatch({ type: "toggleFullScreen", args: {} });
        return;
      }

      if (!event.ctrlKey || event.metaKey) return;

      if (event.altKey) {
        if (event.shiftKey) return;
        if (event.key === "ArrowLeft") {
          dispatch({ type: "selectPreviousTab", args: {} });
        } else if (event.key === "ArrowRight") {
          dispatch({ type: "selectNextTab", args: {} });
        }
        return;
      }

      const key = event.key.toLowerCase();

      // Zoom chords accept both shifted and unshifted forms: "+" usually
      // requires Shift, and Ctrl+Shift+"=" should zoom in too.
      if (key === "=" || key === "+") {
        dispatch({ type: "zoomIn", args: {} });
        return;
      }
      if (key === "-") {
        dispatch({ type: "zoomOut", args: {} });
        return;
      }
      if (key === "0") {
        dispatch({ type: "resetZoom", args: {} });
        return;
      }

      if (event.shiftKey) {
        switch (key) {
          case "n":
            return dispatch({ type: "newFolder", args: {} });
          case "t":
            return dispatch({ type: "reopenClosedTab", args: {} });
          case "p":
            return dispatch({ type: "openCommandPalette", args: {} });
          case "r":
            return dispatch({ type: "reload", args: {} });
        }
        return;
      }

      switch (key) {
        case ",":
          return dispatch({ type: "openSettings", args: {} });
        case "n":
          return dispatch({ type: "newFile", args: {} });
        case "w":
          return dispatch({ type: "closeTab", args: {} });
        case "b":
          return dispatch({ type: "toggleSidebar", args: {} });
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [executeCommand]);
}

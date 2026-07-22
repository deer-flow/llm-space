"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import { electrobun } from "@/lib/electrobun";
import {
  COMMAND_META,
  type Command,
  type CommandArgs,
  type CommandType,
} from "@/shared/commands";

/**
 * A per-command handler, receiving that command's typed `args`. Used both as the
 * shape callers register and (internally, type-erased) as the stored dispatch
 * target.
 */
export type CommandHandlers = {
  [T in CommandType]?: (args: CommandArgs<T>) => void | Promise<void>;
};

type StoredHandler = (args: unknown) => void | Promise<void>;

interface CommandContextValue {
  /**
   * Run a command. `webview`-target commands invoke the registered handler here;
   * `bun`-target commands (window zoom / reload) are forwarded to the main
   * process over RPC.
   */
  executeCommand: (command: Command) => void;
  /**
   * Register handlers for some commands; returns a teardown that removes exactly
   * the handlers it added. Prefer {@link useRegisterCommands}.
   */
  registerCommandHandlers: (handlers: CommandHandlers) => () => void;
}

const CommandContext = createContext<CommandContextValue | null>(null);

/**
 * Resolve app-level Windows shortcuts after Electrobun's broken native menu
 * accelerators have been disabled. Editing shortcuts are deliberately omitted
 * so inputs and CodeMirror retain the WebView's standard behavior.
 */
function _getWindowsShortcutCommand(event: KeyboardEvent): Command | null {
  if (!event.ctrlKey || event.metaKey || event.isComposing) return null;

  if (event.altKey) {
    if (event.shiftKey) return null;
    if (event.code === "ArrowLeft") {
      return { type: "selectPreviousTab", args: {} };
    }
    if (event.code === "ArrowRight") {
      return { type: "selectNextTab", args: {} };
    }
    return null;
  }

  switch (event.code) {
    case "KeyN":
      return event.shiftKey
        ? { type: "newFolder", args: {} }
        : { type: "newFile", args: {} };
    case "KeyW":
      return event.shiftKey ? null : { type: "closeTab", args: {} };
    case "KeyT":
      return event.shiftKey ? { type: "reopenClosedTab", args: {} } : null;
    case "Comma":
      return event.shiftKey ? null : { type: "openSettings", args: {} };
    case "KeyP":
      return event.shiftKey ? { type: "openCommandPalette", args: {} } : null;
    case "KeyB":
      return event.shiftKey ? null : { type: "toggleSidebar", args: {} };
    case "KeyR":
      return event.shiftKey ? { type: "reload", args: {} } : null;
    case "Equal":
    case "NumpadAdd":
      return { type: "zoomIn", args: {} };
    case "Minus":
    case "NumpadSubtract":
      return event.shiftKey ? null : { type: "zoomOut", args: {} };
    case "Digit0":
    case "Numpad0":
      return event.shiftKey ? null : { type: "resetZoom", args: {} };
    case "KeyF":
      return event.shiftKey ? { type: "toggleFullScreen", args: {} } : null;
    default:
      return null;
  }
}

/**
 * Holds the renderer command registry. Handlers live in a ref-based map keyed by
 * command type, so components that own the relevant state (tabs, file tree,
 * sidebar) register their handlers where that state lives.
 */
export function CommandProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef<Map<CommandType, StoredHandler>>(new Map());

  const executeCommand = useCallback((command: Command) => {
    if (COMMAND_META[command.type].target === "bun") {
      electrobun.rpc?.send.executeCommand(command);
      return;
    }
    const handler = handlersRef.current.get(command.type);
    if (!handler) {
      console.warn(`No handler registered for command: ${command.type}`);
      return;
    }
    void handler(command.args);
  }, []);

  const registerCommandHandlers = useCallback((handlers: CommandHandlers) => {
    const map = handlersRef.current;
    const entries = Object.entries(handlers) as [CommandType, StoredHandler][];
    for (const [type, handler] of entries) map.set(type, handler);
    return () => {
      for (const [type, handler] of entries) {
        // Only remove our own handler (a later registrant may have replaced it).
        if (map.get(type) === handler) map.delete(type);
      }
    };
  }, []);

  useEffect(() => {
    if (!navigator.userAgent.includes("Windows")) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const command = _getWindowsShortcutCommand(event);
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      executeCommand(command);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [executeCommand]);

  const value = useMemo(
    () => ({ executeCommand, registerCommandHandlers }),
    [executeCommand, registerCommandHandlers]
  );

  return (
    <CommandContext.Provider value={value}>{children}</CommandContext.Provider>
  );
}

export function useCommands(): CommandContextValue {
  const ctx = useContext(CommandContext);
  if (!ctx) {
    throw new Error("useCommands must be used within a CommandProvider");
  }
  return ctx;
}

/**
 * Register the given command handlers for this component's lifetime. Stable
 * trampolines are registered once (keyed off the initial render's command set,
 * which is static per component) and always dispatch to the latest `handlers`,
 * so passing fresh closures every render is fine and never goes stale.
 *
 * Pass `enabled: false` to skip registration while some condition doesn't hold
 * (e.g. an inactive tab whose handler must not win the single-slot registry);
 * toggling it re-registers / unregisters cleanly.
 */
export function useRegisterCommands(handlers: CommandHandlers, enabled = true) {
  const { registerCommandHandlers } = useCommands();
  const latest = useRef(handlers);
  // Keep the latest handlers in a ref without mutating during render. The ref is
  // read only post-commit (the registration effect below and the trampoline
  // closures it installs), so syncing after every commit is behavior-preserving.
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const keys = Object.keys(latest.current) as CommandType[];
    const trampolines: CommandHandlers = {};
    for (const key of keys) {
      // `key` and the registry are both type-erased here; the public
      // `CommandHandlers` shape keeps callers honest at the registration site.
      (trampolines as Record<CommandType, StoredHandler>)[key] = (args) =>
        (latest.current as Record<CommandType, StoredHandler | undefined>)[
          key
        ]?.(args);
    }
    return registerCommandHandlers(trampolines);
  }, [registerCommandHandlers, enabled]);
}

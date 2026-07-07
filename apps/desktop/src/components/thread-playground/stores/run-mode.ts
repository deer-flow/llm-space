import { useSyncExternalStore } from "react";

/**
 * Persisted run-mode preferences. App-level and shared across every thread tab
 * (not persisted into a thread), so a single source of truth lives here rather
 * than in any per-tab store. Both default to `false`.
 *
 * Two independent concepts:
 * - `autoRunTools` — after a model turn, automatically execute its pending tool
 *   calls (instead of the user clicking "Call tools"), but stop there. The run
 *   stays step-by-step: the user drives the next turn.
 * - `reactLoop` — the full ReAct loop: keep alternating model turn ⇄ tool
 *   execution until the model stops calling tools. A ReAct loop can only run
 *   when tools are auto-run, so enabling it forces `autoRunTools` on (see
 *   {@link getEffectiveAutoRunTools}).
 */
export const AUTO_RUN_TOOLS_STORAGE_KEY = "llm-space-auto-run-tools";
export const REACT_LOOP_STORAGE_KEY = "llm-space-react-loop";

const listeners = new Set<() => void>();

function _read(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function _write(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // Ignored — the preference is best-effort.
  }
  for (const listener of listeners) {
    listener();
  }
}

/** Whether pending tool calls should be auto-executed, as stored by the user. */
export function getAutoRunTools(): boolean {
  return _read(AUTO_RUN_TOOLS_STORAGE_KEY);
}

export function setAutoRunTools(value: boolean): void {
  _write(AUTO_RUN_TOOLS_STORAGE_KEY, value);
}

/** Whether the ReAct loop is enabled. */
export function getReactLoop(): boolean {
  return _read(REACT_LOOP_STORAGE_KEY);
}

export function setReactLoop(value: boolean): void {
  _write(REACT_LOOP_STORAGE_KEY, value);
}

/**
 * The effective auto-run-tools state, read fresh at run time. Enabling the
 * ReAct loop forces tools to auto-run regardless of the stored `autoRunTools`
 * flag, so the two are combined here rather than by mutating storage.
 */
export function getEffectiveAutoRunTools(): boolean {
  return getReactLoop() || getAutoRunTools();
}

function _subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface RunMode {
  /** The user's stored auto-run-tools flag (independent of the ReAct loop). */
  autoRunTools: boolean;
  /** The effective flag: `true` whenever the ReAct loop is on. */
  effectiveAutoRunTools: boolean;
  reactLoop: boolean;
  setAutoRunTools: (value: boolean) => void;
  setReactLoop: (value: boolean) => void;
}

/**
 * React binding for the run-mode preferences. Every tab's Run menu stays in
 * sync because they all subscribe to the same module-level store.
 */
export function useRunMode(): RunMode {
  const autoRunTools = useSyncExternalStore(
    _subscribe,
    getAutoRunTools,
    () => false
  );
  const reactLoop = useSyncExternalStore(_subscribe, getReactLoop, () => false);
  return {
    autoRunTools,
    effectiveAutoRunTools: reactLoop || autoRunTools,
    reactLoop,
    setAutoRunTools,
    setReactLoop,
  };
}

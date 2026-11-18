import { useSyncExternalStore } from "react";

import {
  LOCAL_STORAGE_KEYS,
  readLocalStorage,
  writeLocalStorage,
  type LocalStorageKey,
} from "@llm-space/ui/lib/local-storage";

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
const listeners = new Set<() => void>();

function _read(key: LocalStorageKey): boolean {
  return readLocalStorage(key) === "true";
}

function _write(key: LocalStorageKey, value: boolean): void {
  writeLocalStorage(key, value ? "true" : "false");
  for (const listener of listeners) {
    listener();
  }
}

/** Whether pending tool calls should be auto-executed, as stored by the user. */
export function getAutoRunTools(): boolean {
  return _read(LOCAL_STORAGE_KEYS.autoRunTools);
}

export function setAutoRunTools(value: boolean): void {
  _write(LOCAL_STORAGE_KEYS.autoRunTools, value);
}

/** Whether the ReAct loop is enabled. */
export function getReactLoop(): boolean {
  return _read(LOCAL_STORAGE_KEYS.reactLoop);
}

export function setReactLoop(value: boolean): void {
  _write(LOCAL_STORAGE_KEYS.reactLoop, value);
}

/**
 * The effective auto-run-tools state, read fresh at run time. Enabling the
 * ReAct loop forces tools to auto-run regardless of the stored `autoRunTools`
 * flag, so the two are combined here rather than by mutating storage.
 */
export function getEffectiveAutoRunTools(): boolean {
  return getReactLoop() || getAutoRunTools();
}

/**
 * Whether full access mode is enabled. Opt-in and off by default: when on,
 * tools auto-run without pausing for commands flagged as destructive (see
 * `isDangerousBashCommand`). Requires a one-time risk acknowledgement before
 * it can be switched on (see `getFullAccessAcknowledged`).
 */
export function getFullAccessMode(): boolean {
  return _read(LOCAL_STORAGE_KEYS.fullAccessMode);
}

export function setFullAccessMode(value: boolean): void {
  _write(LOCAL_STORAGE_KEYS.fullAccessMode, value);
}

/**
 * Whether the user has confirmed the full-access-mode risk disclaimer. The
 * switch only turns the mode on after this is set, so a reinstall or cleared
 * storage asks for acknowledgement again.
 */
export function getFullAccessAcknowledged(): boolean {
  return _read(LOCAL_STORAGE_KEYS.fullAccessAcknowledged);
}

export function setFullAccessAcknowledged(value: boolean): void {
  _write(LOCAL_STORAGE_KEYS.fullAccessAcknowledged, value);
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
  /**
   * Full access mode: auto-run never pauses for commands flagged destructive.
   * Off by default; enabling it in settings requires a one-time acknowledgement.
   */
  fullAccessMode: boolean;
  setAutoRunTools: (value: boolean) => void;
  setReactLoop: (value: boolean) => void;
  setFullAccessMode: (value: boolean) => void;
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
  const fullAccessMode = useSyncExternalStore(
    _subscribe,
    getFullAccessMode,
    () => false
  );
  return {
    autoRunTools,
    effectiveAutoRunTools: reactLoop || autoRunTools,
    reactLoop,
    fullAccessMode,
    setAutoRunTools,
    setReactLoop,
    setFullAccessMode,
  };
}

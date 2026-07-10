"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * localStorage key for the opt-in tracing (beta) experiment. Kept flat and
 * client-only — these are UI experiments, not synced settings.
 */
export const TRACING_ENABLED_STORAGE_KEY = "llm-space-experimental-tracing";

/**
 * localStorage key for the react-scan render overlay. Read once at startup in
 * `mainview/main.tsx` (react-scan must patch the reconciler before React
 * renders), so toggling it only takes effect after a reload. Dev-only: the
 * overlay is tree-shaken out of production builds.
 */
export const REACT_SCAN_ENABLED_STORAGE_KEY =
  "llm-space-experimental-react-scan";

interface ExperimentalContextValue {
  /** Whether the tracing (beta) experiment is enabled. */
  tracingEnabled: boolean;
  setTracingEnabled: (enabled: boolean) => void;
  /** Whether the react-scan render overlay is enabled (applies on reload). */
  reactScanEnabled: boolean;
  setReactScanEnabled: (enabled: boolean) => void;
}

const ExperimentalContext = createContext<ExperimentalContextValue | null>(
  null
);

function _readStoredTracingEnabled(): boolean {
  return localStorage.getItem(TRACING_ENABLED_STORAGE_KEY) === "true";
}

function _readStoredReactScanEnabled(): boolean {
  return localStorage.getItem(REACT_SCAN_ENABLED_STORAGE_KEY) === "true";
}

export function ExperimentalProvider({ children }: { children: ReactNode }) {
  const [tracingEnabled, setTracingEnabledState] = useState<boolean>(
    _readStoredTracingEnabled
  );
  const [reactScanEnabled, setReactScanEnabledState] = useState<boolean>(
    _readStoredReactScanEnabled
  );

  const setTracingEnabled = useCallback((next: boolean) => {
    localStorage.setItem(TRACING_ENABLED_STORAGE_KEY, String(next));
    setTracingEnabledState(next);
  }, []);

  const setReactScanEnabled = useCallback((next: boolean) => {
    localStorage.setItem(REACT_SCAN_ENABLED_STORAGE_KEY, String(next));
    setReactScanEnabledState(next);
  }, []);

  const value = useMemo(
    (): ExperimentalContextValue => ({
      tracingEnabled,
      setTracingEnabled,
      reactScanEnabled,
      setReactScanEnabled,
    }),
    [tracingEnabled, setTracingEnabled, reactScanEnabled, setReactScanEnabled]
  );

  return (
    <ExperimentalContext.Provider value={value}>
      {children}
    </ExperimentalContext.Provider>
  );
}

export function useExperimental(): ExperimentalContextValue {
  const ctx = useContext(ExperimentalContext);
  if (!ctx) {
    throw new Error(
      "useExperimental must be used within <ExperimentalProvider>"
    );
  }
  return ctx;
}

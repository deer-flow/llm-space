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

interface ExperimentalContextValue {
  /** Whether the tracing (beta) experiment is enabled. */
  tracingEnabled: boolean;
  setTracingEnabled: (enabled: boolean) => void;
}

const ExperimentalContext = createContext<ExperimentalContextValue | null>(
  null
);

function _readStoredTracingEnabled(): boolean {
  return localStorage.getItem(TRACING_ENABLED_STORAGE_KEY) === "true";
}

export function ExperimentalProvider({ children }: { children: ReactNode }) {
  const [tracingEnabled, setTracingEnabledState] = useState<boolean>(
    _readStoredTracingEnabled
  );

  const setTracingEnabled = useCallback((next: boolean) => {
    localStorage.setItem(TRACING_ENABLED_STORAGE_KEY, String(next));
    setTracingEnabledState(next);
  }, []);

  const value = useMemo(
    (): ExperimentalContextValue => ({ tracingEnabled, setTracingEnabled }),
    [tracingEnabled, setTracingEnabled]
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

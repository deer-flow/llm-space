"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  LOCAL_STORAGE_KEYS,
  readLocalStorage,
  writeLocalStorage,
} from "../lib/local-storage";

import { useRenderingFidelity } from "./theme-provider";
import {
  applyRenderingThreshold,
  DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD,
  parseCustomVirtualizationThreshold,
  parseMessageVirtualizationMode,
  RENDERING_THRESHOLD_MULTIPLIER,
  resolveFullVirtualizationThreshold,
  shouldVirtualizeMessages,
  type MessageVirtualizationMode,
} from "./thread-playground/message/message-virtualization-policy";

export type { MessageVirtualizationMode } from "./thread-playground/message/message-virtualization-policy";

interface MessageVirtualizationContextValue {
  mode: MessageVirtualizationMode;
  setMode: (next: MessageVirtualizationMode) => void;
  customThreshold: number;
  setCustomThreshold: (next: number) => void;
  autoThreshold: number;
  fullBaseThreshold: number;
  renderingMultiplier: number;
  shouldVirtualize: (rowCount: number) => boolean;
}

const DEFAULT_CONTEXT_VALUE: MessageVirtualizationContextValue = {
  mode: "auto",
  setMode: () => undefined,
  customThreshold: DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD,
  setCustomThreshold: () => undefined,
  autoThreshold: DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD,
  fullBaseThreshold: DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD,
  renderingMultiplier: 1,
  shouldVirtualize: (rowCount) =>
    rowCount > DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD,
};

const MessageVirtualizationContext =
  createContext<MessageVirtualizationContextValue>(DEFAULT_CONTEXT_VALUE);

function _readMode(): MessageVirtualizationMode {
  return parseMessageVirtualizationMode(
    readLocalStorage(LOCAL_STORAGE_KEYS.messageVirtualizationMode)
  );
}

function _readCustomThreshold(): number {
  return parseCustomVirtualizationThreshold(
    readLocalStorage(LOCAL_STORAGE_KEYS.customVirtualizationThreshold)
  );
}

function _normalizeCustomThreshold(next: number): number {
  return Number.isSafeInteger(next) && next > 0
    ? next
    : DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD;
}

export function MessageVirtualizationProvider({
  children,
  totalMemoryBytes,
}: {
  children: ReactNode;
  totalMemoryBytes: number | null;
}) {
  const { fidelity } = useRenderingFidelity();
  const [mode, setModeState] = useState<MessageVirtualizationMode>(_readMode);
  const [customThreshold, setCustomThresholdState] =
    useState(_readCustomThreshold);
  const [fullBaseThreshold, setFullBaseThreshold] = useState(() =>
    resolveFullVirtualizationThreshold(totalMemoryBytes)
  );

  const setMode = useCallback(
    (next: MessageVirtualizationMode) => {
      writeLocalStorage(LOCAL_STORAGE_KEYS.messageVirtualizationMode, next);
      if (next === "auto") {
        setFullBaseThreshold(
          resolveFullVirtualizationThreshold(totalMemoryBytes)
        );
      }
      setModeState(next);
    },
    [totalMemoryBytes]
  );

  const setCustomThreshold = useCallback((next: number) => {
    const normalized = _normalizeCustomThreshold(next);
    writeLocalStorage(
      LOCAL_STORAGE_KEYS.customVirtualizationThreshold,
      String(normalized)
    );
    setCustomThresholdState(normalized);
  }, []);

  const autoThreshold = applyRenderingThreshold({
    fullBaseThreshold,
    rendering: fidelity,
  });
  const renderingMultiplier = RENDERING_THRESHOLD_MULTIPLIER[fidelity];
  const shouldVirtualize = useCallback(
    (rowCount: number) =>
      shouldVirtualizeMessages({
        mode,
        rowCount,
        autoThreshold,
        customThreshold,
      }),
    [autoThreshold, customThreshold, mode]
  );

  const value = useMemo<MessageVirtualizationContextValue>(
    () => ({
      mode,
      setMode,
      customThreshold,
      setCustomThreshold,
      autoThreshold,
      fullBaseThreshold,
      renderingMultiplier,
      shouldVirtualize,
    }),
    [
      autoThreshold,
      customThreshold,
      fullBaseThreshold,
      mode,
      renderingMultiplier,
      setCustomThreshold,
      setMode,
      shouldVirtualize,
    ]
  );

  return (
    <MessageVirtualizationContext.Provider value={value}>
      {children}
    </MessageVirtualizationContext.Provider>
  );
}

export function useMessageVirtualization(): MessageVirtualizationContextValue {
  return useContext(MessageVirtualizationContext);
}

import {
  LOCAL_STORAGE_KEYS,
  readLocalStorage,
  writeLocalStorage,
} from "@llm-space/ui/lib/local-storage";
import { useSyncExternalStore } from "react";

export const DEFAULT_THREAD_VIEW_CACHE_SIZE = 3;
export const MIN_THREAD_VIEW_CACHE_SIZE = 1;
export const MAX_THREAD_VIEW_CACHE_SIZE = 10;

const listeners = new Set<() => void>();
let listeningForStorage = false;

export function parseThreadViewCacheSize(raw: string | null): number {
  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_THREAD_VIEW_CACHE_SIZE;
  }
  const value = Number(raw);
  return value >= MIN_THREAD_VIEW_CACHE_SIZE &&
    value <= MAX_THREAD_VIEW_CACHE_SIZE
    ? value
    : DEFAULT_THREAD_VIEW_CACHE_SIZE;
}

function _normalizeThreadViewCacheSize(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_THREAD_VIEW_CACHE_SIZE;
  }
  return Math.min(
    MAX_THREAD_VIEW_CACHE_SIZE,
    Math.max(MIN_THREAD_VIEW_CACHE_SIZE, Math.round(value))
  );
}

function _notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function _handleStorage(event: StorageEvent) {
  if (event.key === LOCAL_STORAGE_KEYS.threadViewCacheSize) {
    _notifyListeners();
  }
}

export function getThreadViewCacheSize(): number {
  return parseThreadViewCacheSize(
    readLocalStorage(LOCAL_STORAGE_KEYS.threadViewCacheSize)
  );
}

export function setThreadViewCacheSize(value: number): void {
  const previous = getThreadViewCacheSize();
  const next = _normalizeThreadViewCacheSize(value);
  writeLocalStorage(LOCAL_STORAGE_KEYS.threadViewCacheSize, String(next));
  if (previous !== next) {
    _notifyListeners();
  }
}

export function subscribeThreadViewCacheSize(listener: () => void): () => void {
  listeners.add(listener);
  if (!listeningForStorage && typeof window !== "undefined") {
    window.addEventListener("storage", _handleStorage);
    listeningForStorage = true;
  }
  return () => {
    listeners.delete(listener);
    if (
      listeners.size === 0 &&
      listeningForStorage &&
      typeof window !== "undefined"
    ) {
      window.removeEventListener("storage", _handleStorage);
      listeningForStorage = false;
    }
  };
}

export function useThreadViewCacheSize(): [number, (next: number) => void] {
  const size = useSyncExternalStore(
    subscribeThreadViewCacheSize,
    getThreadViewCacheSize,
    () => DEFAULT_THREAD_VIEW_CACHE_SIZE
  );
  return [size, setThreadViewCacheSize];
}

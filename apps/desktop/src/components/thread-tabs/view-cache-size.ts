import {
  LOCAL_STORAGE_KEYS,
  readLocalStorage,
  removeLocalStorage,
  writeLocalStorage,
} from "@llm-space/ui/lib/local-storage";
import { useSyncExternalStore } from "react";

export const DEFAULT_VIEW_CACHE_SIZE = 3;
export const MIN_VIEW_CACHE_SIZE = 1;
export const MAX_VIEW_CACHE_SIZE = 10;

const listeners = new Set<() => void>();
let listeningForStorage = false;

export function parseViewCacheSize(raw: string | null): number {
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_VIEW_CACHE_SIZE;
  const value = Number(raw);
  return value >= MIN_VIEW_CACHE_SIZE && value <= MAX_VIEW_CACHE_SIZE
    ? value
    : DEFAULT_VIEW_CACHE_SIZE;
}

function _normalizeViewCacheSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VIEW_CACHE_SIZE;
  return Math.min(
    MAX_VIEW_CACHE_SIZE,
    Math.max(MIN_VIEW_CACHE_SIZE, Math.round(value))
  );
}

function _notifyListeners() {
  for (const listener of listeners) listener();
}

function _handleStorage(event: StorageEvent) {
  if (
    event.key === LOCAL_STORAGE_KEYS.viewCacheSize ||
    event.key === LOCAL_STORAGE_KEYS.threadViewCacheSize
  ) {
    _notifyListeners();
  }
}

export function getViewCacheSize(): number {
  const current = readLocalStorage(LOCAL_STORAGE_KEYS.viewCacheSize);
  return parseViewCacheSize(
    current ?? readLocalStorage(LOCAL_STORAGE_KEYS.threadViewCacheSize)
  );
}

export function setViewCacheSize(value: number): void {
  const previous = getViewCacheSize();
  const next = _normalizeViewCacheSize(value);
  writeLocalStorage(LOCAL_STORAGE_KEYS.viewCacheSize, String(next));
  removeLocalStorage(LOCAL_STORAGE_KEYS.threadViewCacheSize);
  if (previous !== next) _notifyListeners();
}

export function subscribeViewCacheSize(listener: () => void): () => void {
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

export function useViewCacheSize(): [number, (next: number) => void] {
  const size = useSyncExternalStore(
    subscribeViewCacheSize,
    getViewCacheSize,
    () => DEFAULT_VIEW_CACHE_SIZE
  );
  return [size, setViewCacheSize];
}

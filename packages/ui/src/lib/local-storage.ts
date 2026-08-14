/**
 * Registry for every localStorage key used by the shared UI, desktop renderer,
 * and static web app. Keep persisted UI preferences flat and discoverable here.
 *
 * The desktop's pre-React appearance bootstrap duplicates three literal values
 * in `apps/desktop/src/mainview/index.html` because it must run before module
 * loading to prevent a flash of the wrong theme.
 */
export const LOCAL_STORAGE_KEYS = {
  theme: "llm-space-theme",
  primaryColor: "llm-space-primary",
  renderingFidelity: "llm-space-rendering-fidelity",
  autoRunTools: "llm-space-auto-run-tools",
  reactLoop: "llm-space-react-loop",
  messageStatsSummaryMode: "llm-space-message-stats-summary-mode",
  landingLanguage: "llm-space-lang",
  experimentalTracing: "llm-space-experimental-tracing",
  experimentalReactScan: "llm-space-experimental-react-scan",
  sidebarSize: "llm-space:sidebar-size",
  openAppTabs: "llm-space:open-app-tabs",
  legacyOpenTabs: "llm-space:open-tabs",
  activeTab: "llm-space:active-tab",
  fileTreeExpanded: "llm-space:fs-tree:expanded",
} as const;

type RegisteredLocalStorageKey =
  (typeof LOCAL_STORAGE_KEYS)[keyof typeof LOCAL_STORAGE_KEYS];

/** File-tree expansion state is namespaced once per runtime. */
export type LocalStorageKey =
  | RegisteredLocalStorageKey
  | `${typeof LOCAL_STORAGE_KEYS.fileTreeExpanded}:${string}`;

export type LocalStorageValues = Record<string, string>;

export interface LocalStoragePersistence {
  setItem(key: LocalStorageKey, value: string): void;
  removeItem(key: LocalStorageKey): void;
}

let persistence: LocalStoragePersistence | null = null;

/**
 * Attach an optional host persistence mirror. Browser-only consumers leave this
 * unset and continue to use native localStorage alone.
 */
export function configureLocalStoragePersistence(
  next: LocalStoragePersistence | null
): void {
  persistence = next;
}

export function isManagedLocalStorageKey(
  key: string
): key is LocalStorageKey {
  return (
    (Object.values(LOCAL_STORAGE_KEYS) as string[]).includes(key) ||
    key.startsWith(`${LOCAL_STORAGE_KEYS.fileTreeExpanded}:`)
  );
}

function _getLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLocalStorage(key: LocalStorageKey): string | null {
  try {
    return _getLocalStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeLocalStorage(
  key: LocalStorageKey,
  value: string
): boolean {
  try {
    const storage = _getLocalStorage();
    if (!storage) {
      return false;
    }
    storage.setItem(key, value);
    persistence?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeLocalStorage(key: LocalStorageKey): boolean {
  try {
    const storage = _getLocalStorage();
    if (!storage) {
      return false;
    }
    storage.removeItem(key);
    persistence?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Snapshot only keys owned by this API, excluding unrelated origin storage. */
export function readLocalStorageValues(): LocalStorageValues {
  const storage = _getLocalStorage();
  if (!storage) return {};
  const values: LocalStorageValues = {};
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key || !isManagedLocalStorageKey(key)) continue;
      const value = storage.getItem(key);
      if (value !== null) values[key] = value;
    }
  } catch {
    return {};
  }
  return values;
}

/** Replace the browser copy without notifying the configured host mirror. */
export function hydrateLocalStorage(values: LocalStorageValues): boolean {
  const storage = _getLocalStorage();
  if (!storage) return false;
  try {
    const existingKeys = Object.keys(readLocalStorageValues());
    for (const key of existingKeys) {
      if (!(key in values)) storage.removeItem(key);
    }
    for (const [key, value] of Object.entries(values)) {
      if (isManagedLocalStorageKey(key)) storage.setItem(key, value);
    }
    return true;
  } catch {
    return false;
  }
}

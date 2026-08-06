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

type StaticLocalStorageKey =
  (typeof LOCAL_STORAGE_KEYS)[keyof typeof LOCAL_STORAGE_KEYS];

export type FileTreeExpandedLocalStorageKey =
  `${typeof LOCAL_STORAGE_KEYS.fileTreeExpanded}:${string}`;

export type LocalStorageKey =
  | StaticLocalStorageKey
  | FileTreeExpandedLocalStorageKey;

export function fileTreeExpandedLocalStorageKey(
  runtimeId: string
): FileTreeExpandedLocalStorageKey {
  return `${LOCAL_STORAGE_KEYS.fileTreeExpanded}:${runtimeId}`;
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
    return true;
  } catch {
    return false;
  }
}

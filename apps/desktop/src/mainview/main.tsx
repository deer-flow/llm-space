// react-scan must initialize before React so it can patch the reconciler.
// Dev-only: `import.meta.env.DEV` is statically false in production builds, so
// the toolbar is tree-shaken out of shipped bundles.

import {
  configureLocalStoragePersistence,
  hydrateLocalStorage,
  LOCAL_STORAGE_KEYS,
  readLocalStorageValues,
  readLocalStorage,
} from "@llm-space/ui/lib/local-storage";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { scan } from "react-scan";

import { electrobun } from "@/lib/electrobun";

import { applyAppearancePreferences } from "./apply-appearance-preferences";

// Opt-in via the Experimental settings; the toggle only takes effect on the
// next reload since react-scan must patch the reconciler before React renders.
// Gated on `import.meta.env.DEV` (statically false in production), so the whole
// block — and the `react-scan` import — is tree-shaken out of shipped bundles.
async function startRenderer(): Promise<void> {
  const rpc = electrobun.rpc;
  let totalMemoryBytes: number | null = null;
  if (rpc) {
    try {
      let snapshot = await rpc.request.localStorageGet({});
      if (!snapshot.initialized) {
        snapshot = await rpc.request.localStorageInitialize({
          values: readLocalStorageValues(),
        });
      }
      hydrateLocalStorage(snapshot.values);
      applyAppearancePreferences(snapshot.values);

      let persistenceQueue: Promise<unknown> = Promise.resolve();
      const persist = (operation: () => Promise<unknown>) => {
        persistenceQueue = persistenceQueue
          .then(operation)
          .catch((error: unknown) =>
            console.error("Failed to persist localStorage:", error)
          );
      };
      configureLocalStoragePersistence({
        setItem: (key, value) =>
          persist(() => rpc.request.localStorageSet({ key, value })),
        removeItem: (key) =>
          persist(() => rpc.request.localStorageRemove({ key })),
      });
    } catch (error) {
      console.error("Failed to hydrate localStorage:", error);
    }
    try {
      const systemInfo = await rpc.request.systemInfo({});
      totalMemoryBytes = systemInfo.totalMemoryBytes;
    } catch (error) {
      console.error("Failed to read system information:", error);
    }
  }

  if (
    import.meta.env.DEV &&
    readLocalStorage(LOCAL_STORAGE_KEYS.experimentalReactScan) === "true"
  ) {
    scan({ enabled: true });
  }

  const { App } = await import("../app");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App totalMemoryBytes={totalMemoryBytes} />
    </StrictMode>
  );
}

void startRenderer();

// react-scan must initialize before React so it can patch the reconciler.
// Dev-only: `import.meta.env.DEV` is statically false in production builds, so
// the toolbar is tree-shaken out of shipped bundles.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { scan } from "react-scan";

import { REACT_SCAN_ENABLED_STORAGE_KEY } from "@/components/experimental-provider";
import "@/lib/electrobun";

import { App } from "../app";

// Opt-in via the Experimental settings; the toggle only takes effect on the
// next reload since react-scan must patch the reconciler before React renders.
// Gated on `import.meta.env.DEV` (statically false in production), so the whole
// block — and the `react-scan` import — is tree-shaken out of shipped bundles.
if (
  import.meta.env.DEV &&
  localStorage.getItem(REACT_SCAN_ENABLED_STORAGE_KEY) === "true"
) {
  scan({ enabled: true });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

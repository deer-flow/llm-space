// react-scan must initialize before React so it can patch the reconciler.
// Dev-only: `import.meta.env.DEV` is statically false in production builds, so
// the toolbar is tree-shaken out of shipped bundles.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { scan } from "react-scan";

import "@/lib/electrobun";

import { App } from "../app";

scan({
  enabled: import.meta.env.DEV,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import "@llm-space/ui/styles/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app";
// Landing-page-only styles; imported after globals so its additive tokens/helpers
// layer on top without redefining the shared theme.
import "@/landing/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Served under the repo subpath at deer-flow.github.io/llm-space/. Absolute
// asset references in JSX must go through `import.meta.env.BASE_URL`.
export default defineConfig({
  base: "/llm-space/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    // Share one React copy with the `@llm-space/ui` package (else hooks throw).
    // CodeMirror is intentionally NOT deduped: the web app has no direct
    // CodeMirror dep, so every import already resolves to the single copy under
    // the package's node_modules — deduping would force resolution from web's
    // own (empty) context and fail.
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5175,
    strictPort: true,
  },
});

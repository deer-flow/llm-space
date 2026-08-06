import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CODEMIRROR_SINGLETON_DEPS = [
  "@codemirror/language",
  "@codemirror/state",
  "@codemirror/view",
];

export default defineConfig({
  plugins: [react()],
  root: "src/mainview",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    // CodeMirror extensions carry identity-sensitive values from these packages.
    // Bun may keep older nested copies in transitive package folders, so force
    // Vite to resolve every editor package against the desktop app's copy.
    // react/react-dom are deduped so the shared `@llm-space/ui` package and the
    // app resolve the same React copy (else hooks throw "invalid hook call").
    dedupe: [...CODEMIRROR_SINGLETON_DEPS, "react", "react-dom"],
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    // Vite 7 and 8 raised their default browser baselines. Keep the Vite 6
    // range explicitly so the system-WebView edition does not silently drop
    // support for older macOS releases; the CEF edition also satisfies it.
    target: ["chrome87", "edge88", "firefox78", "safari14"],
    // The remaining chunks above the default 500 kB threshold are all
    // intentionally-sized leaves — the curated brand-icon vendor, the on-demand
    // CodeMirror chunk (off the first-paint path), and the app chunk — which
    // gzip to well under 200 kB each. Raise the limit so the warning flags only
    // genuinely new bloat rather than these known, already-split chunks.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Split the stable, heavy vendor libraries out of the app chunk. They
        // change far less often than app code, so isolating them means an
        // app-code update ships a small delta for the auto-updating desktop
        // shell, and the browser can parse the chunks in parallel on startup.
        // CodeMirror is intentionally absent: it's loaded on demand via the
        // lazy `CodeEditor`, so Rolldown already splits it (and its language
        // grammars) into their own lazily-loaded chunks off the first-paint path.
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /[\\/]node_modules[\\/](\.bun[\\/])?(react|react-dom|scheduler)[@\\/]/,
              priority: 30,
            },
            {
              name: "icons-vendor",
              test: /[\\/]@lobehub[\\/]/,
              priority: 20,
            },
            {
              name: "ui-vendor",
              test: /[\\/](radix-ui|@radix-ui|@base-ui|@floating-ui)[\\/]/,
              priority: 10,
            },
          ],
          // Deliberately no catch-all `node_modules → vendor` group. A blanket
          // group would force CodeMirror (and its grammars) back into an eager
          // chunk, undoing the lazy split above.
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

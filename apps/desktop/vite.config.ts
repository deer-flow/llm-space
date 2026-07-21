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
    // The remaining chunks above the default 500 kB threshold are all
    // intentionally-sized leaves — the curated brand-icon vendor, the on-demand
    // CodeMirror chunk (off the first-paint path), and the app chunk — which
    // gzip to well under 200 kB each. Raise the limit so the warning flags only
    // genuinely new bloat rather than these known, already-split chunks.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Electrobun's Windows extractor cannot read GNU LongLink records. Keep
        // every imported asset name short so the packaged tar stays within the
        // portable tar header path limit regardless of the source file name.
        assetFileNames: "assets/[hash][extname]",
        // Split the stable, heavy vendor libraries out of the app chunk. They
        // change far less often than app code, so isolating them means an
        // app-code update ships a small delta for the auto-updating desktop
        // shell, and the browser can parse the chunks in parallel on startup.
        // CodeMirror is intentionally absent: it's loaded on demand via the
        // lazy `CodeEditor`, so Rollup already splits it (and its language
        // grammars) into their own lazily-loaded chunks off the first-paint path.
        manualChunks(id) {
          if (
            /[\\/]node_modules[\\/](\.bun[\\/])?(react|react-dom|scheduler)[@\\/]/.test(
              id
            )
          ) {
            return "react-vendor";
          }
          if (/[\\/]@lobehub[\\/]/.test(id)) return "icons-vendor";
          if (/[\\/](radix-ui|@radix-ui|@base-ui|@floating-ui)[\\/]/.test(id)) {
            return "ui-vendor";
          }
          // Deliberately no catch-all `node_modules → vendor` rule: manualChunks
          // can't tell a statically-imported dep from a dynamically-imported one,
          // so a blanket rule would force CodeMirror (and its grammars) back into
          // an eager chunk, undoing the lazy split above.
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

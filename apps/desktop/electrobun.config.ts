import type { ElectrobunConfig } from "electrobun";

import packageJson from "./package.json";

const desktopRenderer = Bun.env.LLM_SPACE_DESKTOP_RENDERER;
const useCefRenderer = desktopRenderer === "cef";
const cdpPort = Bun.env.LLM_SPACE_DESKTOP_CDP_PORT ?? "9333";

export default {
  app: {
    name: "LLM Space",
    identifier: "tech.deerflow.llm-space",
    // Single source of truth for the app version; release tags must match
    // (CI validates `v{version}` against the pushed tag).
    version: packageJson.version,
  },
  build: {
    // Vite builds to dist/, we copy from there. `assets/` holds hashed,
    // import-ed assets; `images/` (and anything else under Vite's `public/`)
    // is referenced by absolute path (e.g. `/images/onboard.png`) and must be
    // copied too, or it 404s in a packaged build.
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
      "dist/images": "views/mainview/images",
    },
    // Ignore Vite output in watch mode — HMR handles view rebuilds separately
    watchIgnore: ["dist/**"],
    mac: {
      // Signing/notarization run only on canary/stable builds and require the
      // ELECTROBUN_DEVELOPER_ID + App Store Connect API key env vars (CI).
      codesign: true,
      notarize: true,
      bundleCEF: useCefRenderer,
      ...(useCefRenderer
        ? {
            defaultRenderer: "cef" as const,
            chromiumFlags: {
              "remote-debugging-port": cdpPort,
            },
          }
        : {}),
      icons: "icon.iconset",
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
    },
  },
  release: {
    // Burned into every shipped bundle — the updater fetches
    // `{baseUrl}/{channel}-{os}-{arch}-update.json` from here. Both channels
    // share the rolling `updates` GitHub release (artifacts are channel-prefixed).
    baseUrl: "https://github.com/llm-space/llm-space/releases/download/updates",
  },
} satisfies ElectrobunConfig;

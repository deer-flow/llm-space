import type { ElectrobunConfig } from "electrobun";

import packageJson from "./package.json";

const desktopRenderer = Bun.env.LLM_SPACE_DESKTOP_RENDERER;
const useCefRenderer = desktopRenderer === "cef";
const cdpPort = Bun.env.LLM_SPACE_DESKTOP_CDP_PORT ?? "9333";

// Local-testing escape hatches — CI leaves all of these unset:
//   LLM_SPACE_SKIP_SIGNING=1  → unsigned canary/stable build (no Apple creds
//                               needed; locally-built apps have no quarantine
//                               flag, so Gatekeeper doesn't mind)
//   LLM_SPACE_SKIP_NOTARIZE=1 → sign but skip notarization; pair with
//                               ELECTROBUN_DEVELOPER_ID="-" for a zero-cost
//                               ad-hoc signed build that still exercises the
//                               full signing path (entitlements, hardened
//                               runtime, the x64 headerpad hook)
//   LLM_SPACE_UPDATE_BASE_URL → point the update feed at a local static
//                               server to exercise the auto-update loop
const skipSigning = Boolean(Bun.env.LLM_SPACE_SKIP_SIGNING);
const skipNotarize =
  skipSigning || Boolean(Bun.env.LLM_SPACE_SKIP_NOTARIZE);
const updateBaseUrl =
  Bun.env.LLM_SPACE_UPDATE_BASE_URL ??
  "https://github.com/deer-flow/llm-space/releases/download/updates";

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
      codesign: !skipSigning,
      notarize: !skipNotarize,
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
  scripts: {
    // Both run right before their respective codesign step. Workaround for
    // electrobun#485 (x64-only, no-op elsewhere); see the script header.
    postBuild: "scripts/fix-x64-headerpad.ts",
    postWrap: "scripts/fix-x64-headerpad.ts",
  },
  release: {
    // Burned into every shipped bundle — the updater fetches
    // `{baseUrl}/{channel}-{os}-{arch}-update.json` from here. Both channels
    // share the rolling `updates` GitHub release (artifacts are channel-prefixed).
    baseUrl: updateBaseUrl,
  },
} satisfies ElectrobunConfig;

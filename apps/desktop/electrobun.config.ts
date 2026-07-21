import type { ElectrobunConfig } from "electrobun";

import packageJson from "./package.json";

// LLM_SPACE_DESKTOP_RENDERER=cef selects the Performance edition: it embeds
// Chromium (CEF) instead of driving the system WebView. It ships as a separate
// app — own name, own identifier, own update feed — so it installs alongside
// the regular edition. Both read the same ~/.llm-space data directory
// (getLlmSpaceHomePath() is name-independent), so switching editions keeps
// threads, model config and API keys.
const isPerformanceEdition = Bun.env.LLM_SPACE_DESKTOP_RENDERER === "cef";

// Opt-in only. A CDP port left open in a shipped build lets any local process
// drive the renderer and read whatever is on screen — `dev:cef` passes the
// port explicitly, release builds never do.
const cdpPort = Bun.env.LLM_SPACE_DESKTOP_CDP_PORT;

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

// Each edition needs its own feed. update.json is named `{channel}-{os}-{arch}`
// and carries no app name, so both editions would otherwise fight over
// `stable-macos-arm64-update.json` inside the same GitHub release.
const RELEASE_DOWNLOADS =
  "https://github.com/deer-flow/llm-space/releases/download";
const updateBaseUrl =
  Bun.env.LLM_SPACE_UPDATE_BASE_URL ??
  `${RELEASE_DOWNLOADS}/${isPerformanceEdition ? "updates-performance" : "updates"}`;

export default {
  app: {
    // Name and identifier both fork per edition: the name keeps the artifact
    // file names apart (tarball/DMG are named after it), the identifier keeps
    // macOS from treating the two apps as the same install.
    name: isPerformanceEdition ? "LLM Space Performance" : "LLM Space",
    identifier: isPerformanceEdition
      ? "tech.deerflow.llm-space.performance"
      : "tech.deerflow.llm-space",
    // Single source of truth for the app version; release tags must match
    // (CI validates `v{version}` against the pushed tag).
    version: packageJson.version,
    // Deep-link scheme for shared-thread imports
    // (llm-space://shared/<connectorId>/threads/<threadId>). The CLI turns this
    // into Info.plist CFBundleURLTypes. macOS only, and only registers once the
    // app is in /Applications — so deep links don't resolve under `electrobun
    // dev`. Both editions declare the same scheme; Launch Services arbitrates
    // when both are installed.
    urlSchemes: ["llm-space"],
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
      bundleCEF: isPerformanceEdition,
      ...(isPerformanceEdition ? { defaultRenderer: "cef" as const } : {}),
      ...(isPerformanceEdition && cdpPort
        ? { chromiumFlags: { "remote-debugging-port": cdpPort } }
        : {}),
      icons: "icon.iconset",
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      // Windows ships only the regular WebView2 edition for now.
      bundleCEF: false,
      icon: "icon.ico",
    },
  },
  scripts: {
    // The inner-app hook preserves the macOS x64 headerpad workaround and also
    // embeds the Windows icon before the updater tarball is compressed. The
    // wrapper hook remains macOS-only; Windows Setup.exe is finalized after
    // packaging because Electrobun 1.18.1's compiled rcedit lookup is broken.
    postBuild: "scripts/post-build.ts",
    postWrap: "scripts/fix-x64-headerpad.ts",
    postPackage: "scripts/post-package.ts",
  },
  release: {
    // Burned into every shipped bundle — the updater fetches
    // `{baseUrl}/{channel}-{os}-{arch}-update.json` from here. Within an
    // edition both channels share one rolling GitHub release (artifacts are
    // channel-prefixed); the two editions get one rolling release each.
    baseUrl: updateBaseUrl,
  },
} satisfies ElectrobunConfig;

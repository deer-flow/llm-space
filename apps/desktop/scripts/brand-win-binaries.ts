/**
 * electrobun postBuild step (Windows only): brand the bundled binaries before
 * they are tarred, so the edits land identically in the installer payload,
 * the update feed tarball, and the delta-patch chain (postBuild runs before
 * electrobun's createTar/hash — nothing downstream ever sees unbranded bytes).
 *
 * This is the systematic "identity leak" sweep: every user-visible surface on
 * Windows that derives identity from an exe's resources gets branded here.
 * - bun.exe is the app's real face: it owns the window (libNativeWrapper via
 *   FFI), so the taskbar/alt-tab icon falls back to ITS icon resource, and it
 *   listens on electrobun's RPC socket, so the first-run firewall prompt
 *   shows ITS FileDescription (the prompt appearing at all is upstream,
 *   electrobun#362-adjacent). Stock bun.exe says "Bun"/"Oven" and carries the
 *   Bun icon — replace icon + VERSIONINFO, and embed the DPI manifest
 *   (installer/win-app.manifest; system-aware — see its header for why not
 *   PerMonitorV2).
 * - launcher.exe (shortcut target, Explorer/file-properties surface) ships
 *   with no resources at all — same icon/VERSIONINFO/manifest treatment.
 * - bspatch.exe / zig-zstd.exe appear in Task Manager during self-updates —
 *   VERSIONINFO so they read as LLM Space helpers, not anonymous tools.
 *
 * Surfaces that CANNOT be branded from here (for the upstream report):
 * SmartScreen's "Unknown publisher" (needs Authenticode signing); taskbar
 * pin identity across processes (shortcuts target launcher.exe but the
 * window lives in bun.exe — proper AppUserModelID needs an in-process
 * SetCurrentProcessExplicitAppUserModelID call paired with .lnk property
 * writes; both-or-neither, else taskbar matching regresses); WebView2's
 * msedgewebview2.exe children (Microsoft's runtime, expected).
 *
 * Invoked by scripts/post-build.ts with electrobun's hook env; a bun.exe
 * branding failure fails the build; the smoke test asserts every statically
 * checkable surface.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { rcedit } from "rcedit";

const APP_DISPLAY_NAME = "LLM Space";
const PUBLISHER = "DeerFlow";

if (process.env.ELECTROBUN_OS !== "win") {
  process.exit(0);
}

const buildDir = process.env.ELECTROBUN_BUILD_DIR;
const bundleName = process.env.ELECTROBUN_APP_NAME;
const version = process.env.ELECTROBUN_APP_VERSION ?? "0.0.0";
if (!buildDir || !bundleName) {
  console.error("brand-win-binaries: missing ELECTROBUN_BUILD_DIR/APP_NAME");
  process.exit(1);
}

const binDir = join(buildDir, bundleName, "bin");
const desktopDir = resolve(import.meta.dir, "..");
const manifest = join(desktopDir, "installer", "win-app.manifest");
const icon = join(desktopDir, "icon.ico");
// VS_FIXEDFILEINFO versions must be numeric x.y.z.w; strip any prerelease tag.
const numeric = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
const productVersion = numeric
  ? `${numeric[1]}.${numeric[2]}.${numeric[3]}.0`
  : "0.0.0.0";

for (const path of [binDir, manifest, icon]) {
  if (!existsSync(path)) {
    console.error(`brand-win-binaries: missing ${path}`);
    process.exit(1);
  }
}

const brandedStrings = {
  ProductName: APP_DISPLAY_NAME,
  FileDescription: APP_DISPLAY_NAME,
  CompanyName: PUBLISHER,
};

// The window-owning, socket-listening process: branding it is the point.
// Its icon is what the taskbar and alt-tab show (no window-class icon is set
// by the native layer, so Windows falls back to the exe resource).
try {
  await rcedit(join(binDir, "bun.exe"), {
    "version-string": brandedStrings,
    "product-version": productVersion,
    icon,
    "application-manifest": manifest,
  });
  console.info("brand-win-binaries: bun.exe — branded (icon + VERSIONINFO + DPI manifest)");
} catch (error) {
  console.error(`brand-win-binaries: bun.exe branding failed: ${String(error)}`);
  process.exit(1);
}

// The remaining exes are cosmetic surfaces (Explorer, file properties, Task
// Manager during updates) — best-effort, never fail the build over them.
const cosmetic: [string, Parameters<typeof rcedit>[1]][] = [
  [
    "launcher.exe",
    {
      "version-string": brandedStrings,
      "product-version": productVersion,
      icon,
      "application-manifest": manifest,
    },
  ],
  [
    "bspatch.exe",
    {
      "version-string": { ...brandedStrings, FileDescription: `${APP_DISPLAY_NAME} update helper` },
      "product-version": productVersion,
    },
  ],
  [
    "zig-zstd.exe",
    {
      "version-string": { ...brandedStrings, FileDescription: `${APP_DISPLAY_NAME} update helper` },
      "product-version": productVersion,
    },
  ],
];
for (const [name, options] of cosmetic) {
  try {
    await rcedit(join(binDir, name), options);
    console.info(`brand-win-binaries: ${name} — branded`);
  } catch (error) {
    console.warn(
      `brand-win-binaries: ${name} branding skipped (non-fatal): ${String(error)}`
    );
  }
}

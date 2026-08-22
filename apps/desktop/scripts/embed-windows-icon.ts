import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// electrobun 1.18.1's own rcedit resolution is broken on Windows: its Bun
// bundle records a build-machine path for `require.resolve("rcedit/package.json")`
// (`D:\a\electrobun\...`), so the `build.win.icon` config converts the PNG to
// ICO but never embeds it into the exes. Embed it ourselves with the rcedit +
// png-to-ico we ship as devDependencies. Remove this script when upstream
// fixes the resolution.
if (process.platform !== "win32") process.exit(0);

const desktopRoot = path.resolve(import.meta.dir, "..");
const iconSource = path.join(
  desktopRoot,
  "icon.iconset",
  "icon_256x256.png"
);
if (!existsSync(iconSource)) {
  console.warn("[embed-windows-icon] icon source missing, skipping:", iconSource);
  process.exit(0);
}

const rceditPkgPath = require.resolve("rcedit/package.json", {
  paths: [desktopRoot],
});
const rceditDir = path.dirname(rceditPkgPath);
const rceditX64 = path.join(rceditDir, "bin", "rcedit-x64.exe");
const rceditExe = existsSync(rceditX64)
  ? rceditX64
  : path.join(rceditDir, "bin", "rcedit.exe");

const { default: pngToIco } = await import("png-to-ico");
const icoPath = path.join(desktopRoot, "build", "temp-app-icon.ico");
writeFileSync(icoPath, new Uint8Array(await pngToIco(iconSource)));

// The Windows bundle is `build/<channel>-win-x64/<AppName>-<channel>/`; its
// `bin/` holds launcher.exe, bun.exe and the update/compress helpers. This
// hook runs before electrobun compresses the bundle into the installer
// archive, so icons embedded here end up in the installed app. Recursive scan
// so layout changes keep working; the `-Setup-` guard is only reachable if a
// future electrobun version creates the installer before postBuild.
const buildDir = path.join(desktopRoot, "build");
const exes: string[] = [];
const collectExes = (dir: string) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectExes(full);
    } else if (
      entry.name.toLowerCase().endsWith(".exe") &&
      !entry.name.includes("-Setup-")
    ) {
      exes.push(full);
    }
  }
};
for (const channelDir of readdirSync(buildDir)) {
  if (channelDir.endsWith("-win-x64")) {
    collectExes(path.join(buildDir, channelDir));
  }
}

for (const exe of exes) {
  execFileSync(rceditExe, [exe, "--set-icon", icoPath]);
  console.info(`[embed-windows-icon] embedded icon into ${exe}`);
}
if (exes.length === 0) {
  console.warn("[embed-windows-icon] no exes found under build/*-win-x64");
}

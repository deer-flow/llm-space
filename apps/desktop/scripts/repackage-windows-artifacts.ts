import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

// electrobun's own rcedit resolution is broken on Windows (see
// embed-windows-icon.ts), so the Setup exe it creates at the end of the build
// ships without an icon. This hook (postPackage, after build-wizard-installer)
// embeds the icon into that Setup exe, re-creates the distribution zip with
// the same layout electrobun used, and refreshes the artifact copy. Remove
// together with embed-windows-icon.ts when upstream fixes the resolution.
if (process.platform !== "win32") process.exit(0);

const desktopRoot = path.resolve(import.meta.dir, "..");
const iconSource = path.join(
  desktopRoot,
  "icon.iconset",
  "icon_256x256.png"
);
if (!existsSync(iconSource)) {
  console.warn("[repackage-windows-artifacts] icon source missing, skipping:", iconSource);
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

const buildDir = path.join(desktopRoot, "build");
for (const channelDir of readdirSync(buildDir)) {
  if (!channelDir.endsWith("-win-x64")) continue;
  const channelPath = path.join(buildDir, channelDir);

  // Electrobun's Setup exe has a space in the name ("LLM Space-Setup-…");
  // our wizard installer ("LLMSpace-Setup-…") must NOT match this pattern.
  const setupName = readdirSync(channelPath).find(
    (name) => name.includes("LLM Space-Setup-") && name.endsWith(".exe")
  );
  if (!setupName) continue;
  const setupPath = path.join(channelPath, setupName);

  execFileSync(rceditExe, [setupPath, "--set-icon", icoPath]);
  console.info(`[repackage-windows-artifacts] embedded icon into ${setupPath}`);

  // Re-create the distribution zip with electrobun's layout: the Setup exe at
  // the root, metadata + archive under `.installer/` to discourage manual
  // extraction. The original zip (inside the artifact folder) still carries
  // the icon-less exe, so it is replaced below.
  const stem = setupName.replace(".exe", "");
  const zipName = `${stem.replace(/ /g, "")}.zip`;
  const metadataPath = path.join(channelPath, `${stem}.metadata.json`);
  const archivePath = path.join(channelPath, `${stem}.tar.zst`);
  const stagingDir = path.join(buildDir, `.installer-zip-repack-${channelDir}`);
  if (existsSync(stagingDir)) {
    rmSync(stagingDir, { recursive: true, force: true });
  }
  mkdirSync(path.join(stagingDir, ".installer"), { recursive: true });
  copyFileSync(setupPath, path.join(stagingDir, setupName));
  copyFileSync(
    metadataPath,
    path.join(stagingDir, ".installer", `${stem}.metadata.json`)
  );
  copyFileSync(
    archivePath,
    path.join(stagingDir, ".installer", `${stem}.tar.zst`)
  );
  const zipPath = path.join(channelPath, zipName);
  execFileSync("powershell", [
    "-command",
    `Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${zipPath}' -Force`,
  ]);
  rmSync(stagingDir, { recursive: true, force: true });
  console.info(`[repackage-windows-artifacts] re-zipped ${zipPath}`);

  // Refresh the artifact copy (named `<channel>-<os>-<arch>-<zipName>`).
  const prefix = [
    Bun.env.ELECTROBUN_BUILD_ENV,
    Bun.env.ELECTROBUN_OS,
    Bun.env.ELECTROBUN_ARCH,
  ]
    .filter(Boolean)
    .join("-");
  const artifactDir = Bun.env.ELECTROBUN_ARTIFACT_DIR;
  if (artifactDir && prefix) {
    const dest = path.join(artifactDir, `${prefix}-${zipName}`);
    copyFileSync(zipPath, dest);
    console.info(`[repackage-windows-artifacts] refreshed artifact ${dest}`);
  }
}

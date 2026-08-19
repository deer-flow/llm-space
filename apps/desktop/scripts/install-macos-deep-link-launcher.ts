import { chmodSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";

if (process.env.ELECTROBUN_OS !== "macos") process.exit(0);

const buildDir = process.env.ELECTROBUN_BUILD_DIR;
const architecture = process.env.ELECTROBUN_ARCH;
if (!buildDir || (architecture !== "arm64" && architecture !== "x64")) {
  console.error(
    "install-macos-deep-link-launcher: missing or invalid Electrobun build environment"
  );
  process.exit(1);
}

const appName = readdirSync(buildDir).find((name) => name.endsWith(".app"));
if (!appName) {
  console.error(
    `install-macos-deep-link-launcher: no .app bundle in ${buildDir}`
  );
  process.exit(1);
}

const source = path.join(import.meta.dir, "macos-deep-link-launcher.mm");
const launcher = path.join(
  buildDir,
  appName,
  "Contents",
  "MacOS",
  "launcher"
);
const replacement = `${launcher}.deep-link`;
const targetArchitecture = architecture === "x64" ? "x86_64" : "arm64";
const result = Bun.spawnSync([
  "xcrun",
  "--sdk",
  "macosx",
  "clang++",
  "-std=c++17",
  "-fobjc-arc",
  "-mmacosx-version-min=11.7",
  "-arch",
  targetArchitecture,
  source,
  "-framework",
  "Cocoa",
  "-o",
  replacement,
]);
if (result.exitCode !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}

chmodSync(replacement, 0o755);
renameSync(replacement, launcher);
console.info(
  `install-macos-deep-link-launcher: installed ${targetArchitecture} launcher`
);

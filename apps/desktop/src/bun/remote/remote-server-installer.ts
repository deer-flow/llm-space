import type { ServerPackageManifest } from "@llm-space/runtime/remote-package";

import { execRemoteCommand } from "./remote-exec";
import { parseRemotePlatform } from "./remote-platform";
import {
  currentDesktopVersion,
  expectedProtocolVersion,
  serverPackageAssetName,
  serverPackageAssetUrl,
  serverPackageChecksumUrl,
} from "./server-package";
import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import { buildSshTarget, joinRemotePath, shellPath, shellQuote } from "./ssh-command";

export interface RemoteServerInstallResult {
  entrypoint: string;
  version: string;
  platform: { os: "linux"; arch: "x64" | "arm64" };
}

export type RemoteCommandRunner = (
  config: SshRemoteRuntimeConfig,
  command: string,
  timeoutMs?: number
) => Promise<{ stdout: string; stderr: string }>;

export interface RemotePackageUploader {
  upload(input: {
    config: SshRemoteRuntimeConfig;
    assetName: string;
    assetUrl: string;
    checksumUrl: string;
    remoteArchivePath: string;
  }): Promise<void>;
}

export interface RemoteServerInstallOptions {
  onProgress?: (progress: {
    stage: "platform-detect" | "server-install";
    message: string;
  }) => void;
  packageUploader?: RemotePackageUploader;
}

export class RemoteServerInstallError extends Error {
  constructor(
    readonly stage: "platform-detect" | "server-install",
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "RemoteServerInstallError";
  }
}

const REMOTE_DOWNLOAD_TIMEOUT_WITH_FALLBACK_MS = 120_000;
const REMOTE_DOWNLOAD_TIMEOUT_MS = 300_000;
const FALLBACK_INSTALL_TIMEOUT_MS = 300_000;
const PACKAGE_DOWNLOAD_MAX_TIME_WITH_FALLBACK_SECONDS = 120;
const PACKAGE_DOWNLOAD_MAX_TIME_SECONDS = 240;

export async function installRemoteServerPackage(
  config: SshRemoteRuntimeConfig,
  run: RemoteCommandRunner = execRemoteCommand,
  options: RemoteServerInstallOptions = {}
): Promise<RemoteServerInstallResult> {
  options.onProgress?.({
    stage: "platform-detect",
    message: "Detecting remote platform",
  });
  let platform;
  try {
    platform = await detectRemoteServerPlatform(config, run);
  } catch (error) {
    throw new RemoteServerInstallError(
      "platform-detect",
      error instanceof Error ? error.message : String(error),
      { cause: error }
    );
  }
  const version = currentDesktopVersion();
  const installDir = config.remoteInstallDir;
  const packageDir = joinRemotePath(installDir, "versions", version);
  const manifestPath = joinRemotePath(packageDir, "server-manifest.json");
  const assetName = serverPackageAssetName({ version, ...platform });
  const assetUrl = serverPackageAssetUrl({
    baseUrl: process.env.LLM_SPACE_SERVER_PACKAGE_BASE_URL,
    target: { version, ...platform },
  });
  const checksumUrl = serverPackageChecksumUrl(assetUrl);
  const remoteArchivePath = joinRemotePath(installDir, "downloads", assetName);
  const entrypoint = joinRemotePath(packageDir, "bin", "llm-space-server");

  if (
    await _hasInstalledPackage(
      config,
      run,
      manifestPath,
      entrypoint,
      version,
      platform
    )
  ) {
    options.onProgress?.({
      stage: "server-install",
      message: "Remote runtime is already installed",
    });
    await _pointCurrentAtVersion(config, run, installDir, version);
    return { entrypoint, version, platform };
  }

  options.onProgress?.({
    stage: "server-install",
    message: "Downloading remote runtime package on server",
  });
  try {
    await run(
      config,
      buildDownloadAndInstallCommand({
        installDir,
        version,
        assetName,
        assetUrl,
        packageDir,
        packageDownloadMaxTimeSeconds: options.packageUploader
          ? PACKAGE_DOWNLOAD_MAX_TIME_WITH_FALLBACK_SECONDS
          : PACKAGE_DOWNLOAD_MAX_TIME_SECONDS,
      }),
      options.packageUploader
        ? REMOTE_DOWNLOAD_TIMEOUT_WITH_FALLBACK_MS
        : REMOTE_DOWNLOAD_TIMEOUT_MS
    );
  } catch (error) {
    await _installWithFallbackUpload(config, run, options, {
      error,
      installDir,
      version,
      assetName,
      assetUrl,
      checksumUrl,
      packageDir,
      remoteArchivePath,
    });
  }

  if (
    !(await _hasInstalledPackage(
      config,
      run,
      manifestPath,
      entrypoint,
      version,
      platform
    ))
  ) {
    throw new Error(`Remote server package install verification failed: ${assetName}`);
  }
  await _pointCurrentAtVersion(config, run, installDir, version);
  return { entrypoint, version, platform };
}

export async function detectRemoteServerPlatform(
  config: SshRemoteRuntimeConfig,
  run: RemoteCommandRunner = execRemoteCommand
) {
  const result = await run(config, "printf '%s\n%s\n' \"$(uname -s)\" \"$(uname -m)\"");
  const [unameS = "", unameM = ""] = result.stdout.trim().split(/\r?\n/);
  return parseRemotePlatform({ unameS, unameM });
}

export function buildInstallCommand(input: {
  installDir: string;
  version: string;
  assetName: string;
  assetUrl: string;
  packageDir: string;
  packageDownloadMaxTimeSeconds?: number;
}): string {
  return buildDownloadAndInstallCommand(input);
}

export function buildDownloadAndInstallCommand(input: {
  installDir: string;
  version: string;
  assetName: string;
  assetUrl: string;
  packageDir: string;
  packageDownloadMaxTimeSeconds?: number;
}): string {
  const installDir = shellPath(input.installDir);
  const assetName = shellQuote(input.assetName);
  const assetUrl = shellQuote(input.assetUrl);
  const packageDownloadMaxTimeSeconds =
    input.packageDownloadMaxTimeSeconds ?? PACKAGE_DOWNLOAD_MAX_TIME_SECONDS;
  return [
    "set -e",
    `INSTALL_DIR=${installDir}`,
    `ASSET_NAME=${assetName}`,
    `ASSET_URL=${assetUrl}`,
    'CHECKSUM_URL="$ASSET_URL.sha256"',
    'DOWNLOAD_DIR="$INSTALL_DIR/downloads"',
    'mkdir -p "$DOWNLOAD_DIR"',
    'ARCHIVE="$DOWNLOAD_DIR/$ASSET_NAME"',
    'ARCHIVE_TMP="$ARCHIVE.tmp-$$"',
    'CHECKSUM_TMP="$ARCHIVE.sha256.tmp-$$"',
    'rm -f "$ARCHIVE_TMP" "$CHECKSUM_TMP"',
    'trap \'rm -f "$ARCHIVE_TMP" "$CHECKSUM_TMP"\' EXIT',
    `if command -v curl >/dev/null 2>&1; then curl -fL --connect-timeout 15 --max-time 60 --retry 2 --retry-delay 2 "$CHECKSUM_URL" -o "$CHECKSUM_TMP" && curl -fL --connect-timeout 15 --max-time ${packageDownloadMaxTimeSeconds} --retry 2 --retry-delay 2 "$ASSET_URL" -o "$ARCHIVE_TMP"; elif command -v wget >/dev/null 2>&1; then wget --timeout=30 --tries=3 -O "$CHECKSUM_TMP" "$CHECKSUM_URL" && wget --timeout=30 --tries=3 -O "$ARCHIVE_TMP" "$ASSET_URL"; else echo "curl or wget is required to download llm-space-server" >&2; exit 1; fi`,
    'EXPECTED_SHA="$(awk \'{print $1}\' "$CHECKSUM_TMP")"',
    'case "$EXPECTED_SHA" in [A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9][A-Fa-f0-9]*) ;; *) echo "Invalid server package checksum" >&2; exit 1 ;; esac',
    'ACTUAL_SHA="$(sha256sum "$ARCHIVE_TMP" | awk \'{print $1}\')"',
    'test "$EXPECTED_SHA" = "$ACTUAL_SHA"',
    'mv "$ARCHIVE_TMP" "$ARCHIVE"',
    buildInstallFromArchiveCommand(input),
  ].join(" && ");
}

export function buildInstallFromArchiveCommand(input: {
  installDir: string;
  version: string;
  assetName: string;
  packageDir: string;
}): string {
  const installDir = shellPath(input.installDir);
  const version = shellQuote(input.version);
  const assetName = shellQuote(input.assetName);
  const packageDir = shellPath(input.packageDir);
  return [
    "set -e",
    `INSTALL_DIR=${installDir}`,
    `VERSION=${version}`,
    `ASSET_NAME=${assetName}`,
    'DOWNLOAD_DIR="$INSTALL_DIR/downloads"',
    'TMP_DIR="$INSTALL_DIR/.tmp-$VERSION-$$"',
    'TMP_PACKAGE="$INSTALL_DIR/.pkg-$VERSION-$$"',
    `PACKAGE_DIR=${packageDir}`,
    'OLD_PACKAGE="$INSTALL_DIR/.old-$VERSION-$$"',
    'mkdir -p "$INSTALL_DIR/versions" "$DOWNLOAD_DIR"',
    'rm -rf "$TMP_DIR" "$TMP_PACKAGE" "$OLD_PACKAGE"',
    'mkdir -p "$TMP_DIR"',
    'ARCHIVE="$DOWNLOAD_DIR/$ASSET_NAME"',
    'test -f "$ARCHIVE"',
    'tar -xzf "$ARCHIVE" -C "$TMP_DIR"',
    'EXTRACTED="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -1)"',
    'test -n "$EXTRACTED"',
    'mv "$EXTRACTED" "$TMP_PACKAGE"',
    'test -x "$TMP_PACKAGE/bin/llm-space-server"',
    'if [ -e "$PACKAGE_DIR" ]; then mv "$PACKAGE_DIR" "$OLD_PACKAGE"; fi',
    'if mv "$TMP_PACKAGE" "$PACKAGE_DIR"; then rm -rf "$OLD_PACKAGE"; else if [ -e "$OLD_PACKAGE" ]; then mv "$OLD_PACKAGE" "$PACKAGE_DIR"; fi; exit 1; fi',
    'rm -rf "$TMP_DIR"',
    `ln -sfn ${shellQuote(`versions/${input.version}`)} "$INSTALL_DIR/current"`,
  ].join(" && ");
}

async function _installWithFallbackUpload(
  config: SshRemoteRuntimeConfig,
  run: RemoteCommandRunner,
  options: RemoteServerInstallOptions,
  input: {
    error: unknown;
    installDir: string;
    version: string;
    assetName: string;
    assetUrl: string;
    checksumUrl: string;
    packageDir: string;
    remoteArchivePath: string;
  }
): Promise<void> {
  const remoteDownloadError = _formatInstallFailure(config, {
    error: input.error,
    assetName: input.assetName,
    assetUrl: input.assetUrl,
    timeoutMs: options.packageUploader
      ? REMOTE_DOWNLOAD_TIMEOUT_WITH_FALLBACK_MS
      : REMOTE_DOWNLOAD_TIMEOUT_MS,
  });
  if (!options.packageUploader) {
    throw new RemoteServerInstallError("server-install", remoteDownloadError, {
      cause: input.error,
    });
  }

  try {
    options.onProgress?.({
      stage: "server-install",
      message: "Remote download failed; downloading package locally",
    });
    await options.packageUploader.upload({
      config,
      assetName: input.assetName,
      assetUrl: input.assetUrl,
      checksumUrl: input.checksumUrl,
      remoteArchivePath: input.remoteArchivePath,
    });
    options.onProgress?.({
      stage: "server-install",
      message: "Installing uploaded remote runtime package",
    });
    await run(
      config,
      buildInstallFromArchiveCommand({
        installDir: input.installDir,
        version: input.version,
        assetName: input.assetName,
        packageDir: input.packageDir,
      }),
      FALLBACK_INSTALL_TIMEOUT_MS
    );
  } catch (fallbackError) {
    throw new RemoteServerInstallError(
      "server-install",
      [
        "Remote download failed and local package upload fallback failed.",
        `Remote download failure: ${remoteDownloadError}`,
        `Local package upload failure: ${
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        }`,
      ].join(" "),
      { cause: fallbackError }
    );
  }
}

function _formatInstallFailure(
  config: SshRemoteRuntimeConfig,
  input: {
    error: unknown;
    assetName: string;
    assetUrl: string;
    timeoutMs: number;
  }
): string {
  const message =
    input.error instanceof Error ? input.error.message : String(input.error);
  const target = buildSshTarget(config);
  const probeCommand = `ssh ${target} ${shellQuote(
    `curl -I -L --connect-timeout 15 ${shellQuote(input.assetUrl)}`
  )}`;
  if (/timed out after \d+ms/i.test(message)) {
    return [
      `Remote runtime package download timed out after ${input.timeoutMs}ms.`,
      `Package URL: ${input.assetUrl}`,
      `LLM Space can reach the SSH server, but the server did not finish downloading ${input.assetName}.`,
      `Check remote network access with: ${probeCommand}`,
      "If GitHub is blocked or slow on the remote server, LLM Space will try downloading the package locally and uploading it over SSH.",
    ].join(" ");
  }
  return [
    `Package URL: ${input.assetUrl}`,
    message,
    `Check remote network access with: ${probeCommand}`,
  ].join(" ");
}

async function _hasInstalledPackage(
  config: SshRemoteRuntimeConfig,
  run: RemoteCommandRunner,
  manifestPath: string,
  entrypoint: string,
  version: string,
  platform: { os: "linux"; arch: "x64" | "arm64" }
): Promise<boolean> {
  try {
    const result = await run(config, `cat ${shellPath(manifestPath)}`, 10_000);
    const manifest = JSON.parse(result.stdout) as ServerPackageManifest;
    const manifestMatches =
      manifest.name === "llm-space-server" &&
      manifest.version === version &&
      manifest.protocolVersion === expectedProtocolVersion() &&
      manifest.os === platform.os &&
      manifest.arch === platform.arch &&
      Boolean(manifest.entrypoint);
    if (!manifestMatches) return false;
    await run(config, `test -x ${shellPath(entrypoint)}`, 10_000);
    return true;
  } catch {
    return false;
  }
}

async function _pointCurrentAtVersion(
  config: SshRemoteRuntimeConfig,
  run: RemoteCommandRunner,
  installDir: string,
  version: string
): Promise<void> {
  await run(
    config,
    `mkdir -p ${shellPath(installDir)} && ln -sfn ${shellQuote(
      `versions/${version}`
    )} ${shellPath(joinRemotePath(installDir, "current"))}`,
    10_000
  );
}

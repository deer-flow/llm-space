import type {
  RemoteServerPackageArch,
  RemoteServerPackageOs,
} from "@llm-space/runtime/remote-package";
import { REMOTE_RUNTIME_PROTOCOL_VERSION } from "@llm-space/runtime/remote-protocol";

import desktopPackageJson from "../../../package.json";

export const SERVER_PACKAGE_NAME = "llm-space-server";
export const DEFAULT_REMOTE_INSTALL_DIR = "~/.llm-space/remote-runtime";
export const REQUIRED_REMOTE_CAPABILITIES = [
  "streamThread",
  "filesystem",
  "models",
  "mcp",
  "builtinTools",
  "skills",
  "search",
  "network",
  "traces",
] as const;

export interface ServerPackageTarget {
  version: string;
  os: RemoteServerPackageOs;
  arch: RemoteServerPackageArch;
}

export function currentDesktopVersion(): string {
  return desktopPackageJson.version;
}

export function serverPackageAssetName(target: ServerPackageTarget): string {
  return `${SERVER_PACKAGE_NAME}-${target.version}-${target.os}-${target.arch}.tar.gz`;
}

export function serverPackageAssetUrl(input: {
  ownerRepo?: string;
  baseUrl?: string;
  target: ServerPackageTarget;
}): string {
  const assetName = serverPackageAssetName(input.target);
  const baseUrl = input.baseUrl?.replace(/\/+$/, "");
  if (baseUrl) {
    return `${baseUrl}/${assetName}`;
  }
  const ownerRepo = input.ownerRepo ?? "deer-flow/llm-space";
  return `https://github.com/${ownerRepo}/releases/download/v${input.target.version}/${assetName}`;
}

export function serverPackageChecksumUrl(assetUrl: string): string {
  return `${assetUrl}.sha256`;
}

export function expectedProtocolVersion(): number {
  return REMOTE_RUNTIME_PROTOCOL_VERSION;
}

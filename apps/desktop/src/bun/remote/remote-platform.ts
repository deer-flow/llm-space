import type {
  RemoteServerPackageArch,
  RemoteServerPackageOs,
} from "@llm-space/runtime/remote-package";

export interface RemoteServerPlatform {
  os: RemoteServerPackageOs;
  arch: RemoteServerPackageArch;
}

export function parseRemotePlatform(input: {
  unameS: string;
  unameM: string;
}): RemoteServerPlatform {
  const os = input.unameS.trim().toLowerCase();
  const arch = input.unameM.trim().toLowerCase();
  if (os !== "linux") {
    throw new Error(`Unsupported remote server OS: ${input.unameS}`);
  }
  if (arch === "x86_64" || arch === "amd64") {
    return { os: "linux", arch: "x64" };
  }
  if (arch === "aarch64" || arch === "arm64") {
    return { os: "linux", arch: "arm64" };
  }
  throw new Error(`Unsupported remote server architecture: ${input.unameM}`);
}

export function serverPackageTarget(platform: RemoteServerPlatform): string {
  return `${platform.os}-${platform.arch}`;
}

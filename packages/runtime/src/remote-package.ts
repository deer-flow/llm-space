export type RemoteServerPackageOs = "linux";
export type RemoteServerPackageArch = "x64" | "arm64";

export interface ServerPackageManifest {
  name: "llm-space-server";
  version: string;
  protocolVersion: number;
  os: RemoteServerPackageOs;
  arch: RemoteServerPackageArch;
  createdAt: string;
  entrypoint: string;
  sha256?: string;
}

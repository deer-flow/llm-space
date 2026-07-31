import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";

export function buildSshTarget(config: SshRemoteRuntimeConfig): string {
  return config.user ? `${config.user}@${config.host}` : config.host;
}

export function buildSshBaseArgs(config: SshRemoteRuntimeConfig): string[] {
  return [
    ...(config.port ? ["-p", String(config.port)] : []),
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=2",
    ...(config.identityFile ? ["-i", config.identityFile] : []),
    ...config.extraArgs,
    buildSshTarget(config),
  ];
}

export function buildTunnelArgs(input: {
  config: SshRemoteRuntimeConfig;
  localPort: number;
}): string[] {
  return [
    ...buildSshBaseArgs(input.config).slice(0, -1),
    "-o",
    "ExitOnForwardFailure=yes",
    "-N",
    "-L",
    `127.0.0.1:${input.localPort}:127.0.0.1:${input.config.remoteServerPort}`,
    buildSshTarget(input.config),
  ];
}

export function buildRemoteServerArgs(input: {
  config: SshRemoteRuntimeConfig;
  entrypoint: string;
}): string[] {
  return [
    ...buildSshBaseArgs(input.config),
    buildRemoteServerCommand({
      entrypoint: input.entrypoint,
      host: "127.0.0.1",
      port: input.config.remoteServerPort,
      home: input.config.remoteHome,
    }),
  ];
}

export function buildRemoteServerCommand(input: {
  entrypoint: string;
  host: string;
  port: number;
  home: string;
}): string {
  return [
    "exec",
    shellPath(input.entrypoint),
    "--host",
    shellQuote(input.host),
    "--port",
    String(input.port),
    "--token-stdin",
    "--home",
    shellPath(input.home),
  ].join(" ");
}

export function buildSourceRemoteServerCommand(input: {
  remoteRepo: string;
  host: string;
  port: number;
  home: string;
}): string {
  return [
    "cd",
    shellPath(input.remoteRepo),
    "&&",
    "exec bun apps/server/src/index.ts",
    "--host",
    shellQuote(input.host),
    "--port",
    String(input.port),
    "--token-stdin",
    "--home",
    shellPath(input.home),
  ].join(" ");
}

export function shellPath(value: string): string {
  if (value === "~") {
    return '"$HOME"';
  }
  if (value.startsWith("~/")) {
    return `"$HOME"/${shellQuote(value.slice(2))}`;
  }
  return shellQuote(value);
}

export function joinRemotePath(base: string, ...parts: string[]): string {
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedParts = parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  if (trimmedParts.length === 0) return trimmedBase || "/";
  if (!trimmedBase || trimmedBase === "/") {
    return `/${trimmedParts.join("/")}`;
  }
  return `${trimmedBase}/${trimmedParts.join("/")}`;
}

export function shellQuote(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(`Cannot shell-quote non-string value: ${String(value)}`);
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

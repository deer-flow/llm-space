import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { RemoteHostKeyTrustRequest } from "../../shared/remote-servers";

import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import { buildSshBaseArgs, buildSshTarget } from "./ssh-command";

export type SshHostKeyCheckResult =
  | { status: "trusted" }
  | { status: "first-time"; request: RemoteHostKeyTrustRequest }
  | { status: "changed"; request: RemoteHostKeyTrustRequest }
  | { status: "error"; message: string; rawOutput?: string };

export interface SshHostKeyService {
  check(config: SshRemoteRuntimeConfig): Promise<SshHostKeyCheckResult>;
  trust(
    config: SshRemoteRuntimeConfig,
    request: RemoteHostKeyTrustRequest
  ): Promise<void>;
}

export class OpenSshHostKeyService implements SshHostKeyService {
  async check(config: SshRemoteRuntimeConfig): Promise<SshHostKeyCheckResult> {
    const target = buildSshTarget(config);
    const baseArgs = buildSshBaseArgs(config);
    const resolved = await _resolveSshConfig(config).catch(() => undefined);
    const probe = await _run("ssh", [
      ...baseArgs.slice(0, -1),
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "NumberOfPasswordPrompts=0",
      target,
      "true",
    ]);
    const output = `${probe.stdout}${probe.stderr}`;
    const lookup = _hostKeyLookup(config, resolved);
    const key = parseSshHostKeyOutput(output, lookup);

    if (probe.code === 0) return { status: "trusted" };
    if (!key && _isFirstTimeHostKey(output)) {
      const scanned = await _scanKey(config, resolved).catch(() => undefined);
      if (scanned) {
        return {
          status: "first-time",
          request: {
            ...scanned,
            requestId: randomUUID(),
            kind: "first-time",
            target,
            host: config.host,
            user: config.user,
            rawOutput: output,
          },
        };
      }
    }
    if (key && !key.publicKeyLine) {
      const publicKeyLine = await _scanPublicKeyLine(config, key, resolved).catch(
        () => undefined
      );
      if (publicKeyLine) key.publicKeyLine = publicKeyLine;
    }
    if (key) {
      return {
        status: key.kind,
        request: {
          ...key,
          requestId: randomUUID(),
          target,
          host: config.host,
          user: config.user,
        },
      };
    }
    if (_isAuthenticationFailure(output)) return { status: "trusted" };
    return {
      status: "error",
      message: output.trim() || `SSH host key probe failed with exit code ${probe.code}.`,
      rawOutput: output,
    };
  }

  async trust(
    config: SshRemoteRuntimeConfig,
    request: RemoteHostKeyTrustRequest
  ): Promise<void> {
    const knownHostsFile = _expandHome(
      request.knownHostsFile ?? "~/.ssh/known_hosts"
    );
    mkdirSync(path.dirname(knownHostsFile), { recursive: true, mode: 0o700 });
    if (existsSync(knownHostsFile)) {
      _backupKnownHosts(knownHostsFile);
    }

    if (request.kind === "changed") {
      await _removeKnownHost(config, request, knownHostsFile);
    }

    await _acceptHostKey(config).catch((error) => {
      const publicKeyLine = request.publicKeyLine;
      if (!publicKeyLine) throw error;

      const current = existsSync(knownHostsFile)
        ? readFileSync(knownHostsFile, "utf8")
        : "";
      if (_hasKnownHostLine(current, publicKeyLine)) return;
      const prefix = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
      writeFileSync(
        knownHostsFile,
        `${current}${prefix}${publicKeyLine}\n`,
        "utf8"
      );
    });
  }
}

async function _acceptHostKey(config: SshRemoteRuntimeConfig): Promise<void> {
  const target = buildSshTarget(config);
  const baseArgs = buildSshBaseArgs(config);
  const result = await _run("ssh", [
    ...baseArgs.slice(0, -1),
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "NumberOfPasswordPrompts=0",
    target,
    "true",
  ]);
  const output = `${result.stdout}${result.stderr}`;
  if (result.code === 0 || _isAuthenticationFailure(output)) return;
  throw new Error(
    output.trim() || `SSH host key trust failed with exit code ${result.code}.`
  );
}

export function parseSshHostKeyOutput(
  output: string,
  config: Pick<SshRemoteRuntimeConfig, "host" | "port" | "user">
): Omit<RemoteHostKeyTrustRequest, "requestId" | "target" | "host" | "user"> | null {
  const key = _parseServerKey(output);
  const changed = _isChangedHostKey(output);
  const firstTime = _isFirstTimeHostKey(output);
  if (!key || (!changed && !firstTime)) return null;

  const offending = /Offending \S+ key in ([^:\n]+):(\d+)/i.exec(output);
  const knownHostsFile = offending?.[1] ?? _knownHostsFileFromOutput(output);
  const knownHostsLine = offending?.[2] ? Number(offending[2]) : undefined;
  const lookupHost = _knownHostsHost(config.host, config.port);
  const publicKeyLine = key.publicKey
    ? `${lookupHost} ${key.keyType} ${key.publicKey}`
    : undefined;
  return {
    kind: changed ? "changed" : "first-time",
    resolvedHost: config.host,
    port: config.port,
    keyType: key.keyType,
    fingerprint: key.fingerprint,
    knownHostsFile,
    knownHostsLine,
    publicKeyLine,
    rawOutput: output,
  };
}

interface ParsedServerKey {
  keyType: string;
  publicKey: string;
  fingerprint: string;
}

interface ResolvedSshConfig {
  hostname?: string;
  port?: number;
  user?: string;
  hostKeyAlias?: string;
  userKnownHostsFile?: string;
}

async function _removeKnownHost(
  config: SshRemoteRuntimeConfig,
  request: RemoteHostKeyTrustRequest,
  knownHostsFile: string
): Promise<void> {
  if (request.knownHostsLine) {
    _removeKnownHostsLine(knownHostsFile, request.knownHostsLine);
  }

  const host = request.resolvedHost ?? config.host;
  const lookupHost = _knownHostsHost(host, request.port ?? config.port);
  const result = await _run("ssh-keygen", ["-R", lookupHost, "-f", knownHostsFile]);
  const output = `${result.stdout}${result.stderr}`;
  if (result.code === 0 && !/not found/i.test(output)) {
    return;
  }

  if (request.knownHostsLine) return;

  throw new Error(
    `Failed to remove stale SSH host key: ${output}`
  );
}

function _parseServerKey(output: string): ParsedServerKey | null {
  const fingerprint = /(?:fingerprint for the \S+ key sent by the remote host is|Server host key:|key fingerprint is)\s*(?:\S+\s+)?(SHA256:[A-Za-z0-9+/=]+)/i.exec(output)?.[1] ?? /(SHA256:[A-Za-z0-9+/=]+)/i.exec(output)?.[1];
  const serverKey = /^debug1: Server host key:\s+(\S+)\s+(SHA256:[A-Za-z0-9+/=]+)(?:\s+.*)?$/im.exec(output);
  const keyType = serverKey?.[1] ?? _publicKeyTypeFromOutput(output) ?? _keyTypeFromOutput(output);
  if (!fingerprint || !keyType) return null;
  return {
    keyType,
    fingerprint,
    // OpenSSH failure output does not print the base64 public key. Store the
    // fingerprint as a deterministic placeholder for tests and require the
    // production trust path to be backed by a keyscan/probe result before write.
    publicKey: _publicKeyFromOutput(output) ?? "",
  };
}

function _publicKeyFromOutput(output: string): string | undefined {
  return /^\S+\s+(ssh-ed25519|ecdsa-sha2-\S+|ssh-rsa|rsa-sha2-\S+)\s+([A-Za-z0-9+/=]+)(?:\s.*)?$/m.exec(output)?.[2];
}

function _publicKeyTypeFromOutput(output: string): string | undefined {
  return /^\S+\s+(ssh-ed25519|ecdsa-sha2-\S+|ssh-rsa|rsa-sha2-\S+)\s+[A-Za-z0-9+/=]+(?:\s.*)?$/m.exec(output)?.[1];
}

function _keyTypeFromOutput(output: string): string | undefined {
  const fromFingerprint = /fingerprint for the (\S+) key sent by the remote host is/i.exec(output)?.[1];
  if (!fromFingerprint) return undefined;
  if (fromFingerprint.toUpperCase() === "ECDSA") return "ecdsa-sha2-nistp256";
  if (fromFingerprint.toUpperCase() === "ED25519") return "ssh-ed25519";
  if (fromFingerprint.toUpperCase() === "RSA") return "ssh-rsa";
  return fromFingerprint;
}

function _isChangedHostKey(output: string): boolean {
  const text = output.toLowerCase();
  return (
    text.includes("remote host identification has changed") ||
    (text.includes("offending") && text.includes("known_hosts"))
  );
}

function _isFirstTimeHostKey(output: string): boolean {
  const text = output.toLowerCase();
  return (
    text.includes("the authenticity of host") ||
    text.includes("host key verification failed") ||
    text.includes("are you sure you want to continue connecting")
  );
}

function _isAuthenticationFailure(output: string): boolean {
  const text = output.toLowerCase();
  return (
    /permission denied \([^)]+\)/i.test(output) ||
    text.includes("too many authentication failures") ||
    text.includes("no more authentication methods")
  );
}

function _knownHostsFileFromOutput(output: string): string | undefined {
  return /Add correct host key in ([^\n]+?) to get rid of this message\./i.exec(output)?.[1];
}

function _knownHostsHost(host: string, port: number | undefined): string {
  return port && port !== 22 ? `[${host}]:${port}` : host;
}

function _expandHome(input: string): string {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function _backupKnownHosts(filePath: string): void {
  const backupPath = `${filePath}.llm-space-backup-${Date.now()}`;
  copyFileSync(filePath, backupPath);
}

function _hasKnownHostLine(contents: string, line: string): boolean {
  return contents
    .split(/\r?\n/)
    .map((value) => value.trim())
    .includes(line.trim());
}

function _removeKnownHostsLine(filePath: string, lineNumber: number): void {
  const lines = readFileSync(filePath, "utf8").split("\n");
  if (lineNumber < 1 || lineNumber > lines.length) {
    throw new Error(`SSH known_hosts line is out of range: ${lineNumber}`);
  }
  if (!lines[lineNumber - 1]?.trim()) {
    throw new Error(`SSH known_hosts line is empty: ${lineNumber}`);
  }
  lines.splice(lineNumber - 1, 1);
  writeFileSync(filePath, lines.join("\n"), "utf8");
}

async function _scanPublicKeyLine(
  config: SshRemoteRuntimeConfig,
  request: Omit<
    RemoteHostKeyTrustRequest,
    "requestId" | "target" | "host" | "user"
  >,
  resolved?: ResolvedSshConfig
): Promise<string | undefined> {
  const host = resolved?.hostname ?? request.resolvedHost ?? config.host;
  const port = resolved?.port ?? request.port ?? config.port;
  const result = await _run("ssh-keyscan", [
    ...(port ? ["-p", String(port)] : []),
    "-T",
    "10",
    host,
  ]);
  if (result.code !== 0 && !result.stdout.trim()) return undefined;
  const lookupHost = _knownHostsHost(resolved?.hostKeyAlias ?? host, port);
  for (const line of result.stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [, keyType, publicKey] = parts;
    if (keyType !== request.keyType) continue;
    const fingerprint = _fingerprint(publicKey);
    if (fingerprint !== request.fingerprint) continue;
    return `${lookupHost} ${keyType} ${publicKey}`;
  }
  return undefined;
}

async function _scanKey(
  config: SshRemoteRuntimeConfig,
  resolved?: ResolvedSshConfig
): Promise<Omit<RemoteHostKeyTrustRequest, "requestId" | "target" | "host" | "user" | "kind"> | undefined> {
  const host = resolved?.hostname ?? config.host;
  const port = resolved?.port ?? config.port;
  const result = await _run("ssh-keyscan", [
    ...(port ? ["-p", String(port)] : []),
    "-T",
    "10",
    host,
  ]);
  if (result.code !== 0 && !result.stdout.trim()) return undefined;
  const lookupHost = _knownHostsHost(resolved?.hostKeyAlias ?? host, port);
  for (const line of result.stdout.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) continue;
    const [, keyType, publicKey] = parts;
    if (!keyType || !publicKey) continue;
    return {
      resolvedHost: host,
      port,
      keyType,
      fingerprint: _fingerprint(publicKey),
      knownHostsFile: resolved?.userKnownHostsFile ?? "~/.ssh/known_hosts",
      publicKeyLine: `${lookupHost} ${keyType} ${publicKey}`,
    };
  }
  return undefined;
}

async function _resolveSshConfig(
  config: SshRemoteRuntimeConfig
): Promise<ResolvedSshConfig> {
  const baseArgs = buildSshBaseArgs(config);
  const target = buildSshTarget(config);
  const result = await _run("ssh", [...baseArgs.slice(0, -1), "-G", target]);
  if (result.code !== 0) return {};

  const resolved: ResolvedSshConfig = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const [key, ...rest] = line.trim().split(/\s+/);
    const value = rest.join(" ");
    switch (key) {
      case "hostname":
        resolved.hostname = value;
        break;
      case "port":
        resolved.port = Number(value) || undefined;
        break;
      case "user":
        resolved.user = value;
        break;
      case "hostkeyalias":
        resolved.hostKeyAlias = value;
        break;
      case "userknownhostsfile":
        resolved.userKnownHostsFile = _firstKnownHostsFile(value);
        break;
    }
  }
  return resolved;
}

function _hostKeyLookup(
  config: SshRemoteRuntimeConfig,
  resolved: ResolvedSshConfig | undefined
): Pick<SshRemoteRuntimeConfig, "host" | "port" | "user"> {
  return {
    host: resolved?.hostKeyAlias ?? resolved?.hostname ?? config.host,
    port: resolved?.port ?? config.port,
    user: resolved?.user ?? config.user,
  };
}

function _firstKnownHostsFile(value: string): string | undefined {
  const [first] = value.split(/\s+/).filter(Boolean);
  if (!first || first === "none") return undefined;
  return first;
}

function _fingerprint(publicKey: string): string {
  const digest = createHash("sha256")
    .update(Buffer.from(publicKey, "base64"))
    .digest("base64")
    .replace(/=+$/, "");
  return `SHA256:${digest}`;
}

async function _run(
  command: string,
  args: string[],
  timeoutMs = 15_000
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  const appendStdout = (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
    if (stdout.length > 20_000) stdout = stdout.slice(-20_000);
  };
  const appendStderr = (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
  };
  child.stdout?.on("data", appendStdout);
  child.stderr?.on("data", appendStderr);

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, stdout, stderr: `${stderr}\nSSH host key probe timed out after ${timeoutMs}ms.` });
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

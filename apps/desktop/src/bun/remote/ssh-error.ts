import { formatString, MESSAGES } from "@llm-space/ui/lib/i18n/messages";

import { isChineseLocale } from "../app/locales";

export type SshBootstrapStage =
  | "platform-detect"
  | "server-install"
  | "server-upgrade"
  | "server-start"
  | "tunnel-start"
  | "health-check"
  | "version-check";

export interface SshBootstrapFailureInput {
  stage: SshBootstrapStage;
  label: string;
  output: string;
  target?: string;
}

export interface MissingRuntimeBinaryFailure {
  path: string;
  reason: "missing" | "not-executable";
}

export interface RemotePortInUseFailure {
  port: number;
}

const MAX_GENERIC_OUTPUT_LENGTH = 1200;

/** The current locale's error templates (`t.errors`), resolved per call. */
const _errors = () => MESSAGES[isChineseLocale() ? "zh" : "en"].errors;

type ErrorTemplates = ReturnType<typeof _errors>;

export function formatSshBootstrapFailure({
  stage,
  label,
  output,
  target,
}: SshBootstrapFailureInput): string {
  const missingRuntime = _formatMissingRuntimeBinary(output);
  if (missingRuntime) return missingRuntime;

  const portInUse = _formatRemotePortInUse(output);
  if (portInUse) return portInUse;

  const hostKeyFailure = _formatHostKeyFailure(output, target, stage);
  if (hostKeyFailure) return hostKeyFailure;

  const authFailure = _formatAuthenticationFailure(output, target);
  if (authFailure) return authFailure;

  const details = output.trim();
  return [
    formatString(_errors().sshBootstrapGeneric, { stage, label }),
    details ? _truncate(details, MAX_GENERIC_OUTPUT_LENGTH) : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function _formatRemotePortInUse(output: string): string | null {
  const failure = parseRemotePortInUseFailure(output);
  if (!failure) return null;
  return formatString(_errors().sshPortInUse, { port: failure.port });
}

/**
 * Format the error thrown when the remote runtime reports a port in use that
 * differs from the one this connection attempted.
 */
export function formatRemotePortMismatch(
  port: number,
  attemptedPort: number
): string {
  return formatString(_errors().remotePortReportedInUse, {
    port,
    attemptedPort,
  });
}

/**
 * Format the error thrown when no per-connection remote port was available
 * after `attempts` tries.
 */
export function formatRemotePortsExhausted(attempts: number): string {
  return formatString(_errors().remotePortsExhausted, { attempts });
}

/**
 * Format the health-check timeout error, embedding the last failure `message`
 * and the expected protocol `version`.
 */
export function formatHealthCheckTimeout(
  message: string,
  version: string | number
): string {
  return formatString(_errors().sshHealthCheckTimeout, { message, version });
}

export function parseRemotePortInUseFailure(
  output: string
): RemotePortInUseFailure | null {
  const port = _parsePortInUsePort(output);
  if (!port) return null;
  if (
    /EADDRINUSE/i.test(output) ||
    /address already in use/i.test(output) ||
    /port\s+\d+\s+(?:is\s+)?(?:already\s+)?(?:in use|used)/i.test(output) ||
    /is port\s+\d+\s+in use\?/i.test(output)
  ) {
    return { port };
  }
  return null;
}

function _parsePortInUsePort(output: string): number | null {
  const patterns = [
    /port\s+(\d+)\s+(?:is\s+)?(?:already\s+)?(?:in use|used)/i,
    /is port\s+(\d+)\s+in use\?/i,
    /127\.0\.0\.1:(\d+)/i,
    /:(\d+)\s*$/m,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(output);
    const port = match ? Number(match[1]) : 0;
    if (Number.isInteger(port) && port >= 1 && port <= 65535) {
      return port;
    }
  }
  return null;
}

function _formatMissingRuntimeBinary(output: string): string | null {
  const failure = parseMissingRuntimeBinaryFailure(output);
  if (!failure) return null;
  const template =
    failure.reason === "missing"
      ? _errors().sshMissingBinary
      : _errors().sshNotExecutableBinary;
  return formatString(template, { path: failure.path });
}

export function parseMissingRuntimeBinaryFailure(
  output: string
): MissingRuntimeBinaryFailure | null {
  const match = /([^\s'":]+llm-space-server)/.exec(output);
  if (!match) return null;
  const path = match[1];
  if (/No such file or directory|does not exist/i.test(output)) {
    return { path, reason: "missing" };
  }
  if (/Permission denied|not executable/i.test(output)) {
    return { path, reason: "not-executable" };
  }
  return null;
}

function _formatAuthenticationFailure(
  output: string,
  target: string | undefined
): string | null {
  if (!_isAuthenticationFailure(output)) return null;

  const errors = _errors();
  return [
    target
      ? formatString(errors.sshAuthFailedFor, { target })
      : errors.sshAuthFailed,
    errors.sshAuthGuidance,
  ].join(" ");
}

function _isAuthenticationFailure(output: string): boolean {
  const text = output.toLowerCase();
  return (
    /permission denied \([^)]+\)/i.test(output) ||
    text.includes("too many authentication failures") ||
    text.includes("bad passphrase") ||
    text.includes("incorrect passphrase") ||
    text.includes("no more authentication methods")
  );
}

function _formatHostKeyFailure(
  output: string,
  target: string | undefined,
  stage: SshBootstrapStage
): string | null {
  if (!_isHostKeyFailure(output)) return null;

  const errors = _errors();
  const offending = /Offending \S+ key in ([^:\n]+):(\d+)/i.exec(output);
  const knownHosts = offending?.[1];
  const line = offending?.[2];
  const location = knownHosts
    ? line
      ? formatString(errors.sshKnownHostsLine, { knownHosts, line })
      : knownHosts
    : errors.sshKnownHostsFallback;

  return [
    target
      ? formatString(errors.sshHostKeyFailedFor, { target })
      : errors.sshHostKeyFailed,
    _hostKeyImpact(stage, errors),
    formatString(errors.sshHostKeyLocation, { location }),
    _knownHostsAction(knownHosts, line, target, errors),
  ].join(" ");
}

function _knownHostsAction(
  knownHosts: string | undefined,
  line: string | undefined,
  target: string | undefined,
  errors: ErrorTemplates
): string {
  if (knownHosts && line) return errors.sshRemoveStaleEntry;
  if (target) return formatString(errors.sshFirstConnectionFor, { target });
  return errors.sshFirstConnection;
}

function _hostKeyImpact(stage: SshBootstrapStage, errors: ErrorTemplates): string {
  if (stage === "server-start") return errors.sshHostKeyImpactServerStart;
  if (stage === "tunnel-start") return errors.sshHostKeyImpactTunnelStart;
  return errors.sshHostKeyImpactOther;
}

function _isHostKeyFailure(output: string): boolean {
  const text = output.toLowerCase();
  return (
    text.includes("remote host identification has changed") ||
    text.includes("forwarding disabled due to host key check failure") ||
    text.includes("host key verification failed") ||
    (text.includes("man-in-the-middle attack") &&
      text.includes("known_hosts"))
  );
}

function _truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

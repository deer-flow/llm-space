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
    `SSH remote runtime bootstrap failed during ${stage}: ${label} exited early.`,
    details ? _truncate(details, MAX_GENERIC_OUTPUT_LENGTH) : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function _formatRemotePortInUse(output: string): string | null {
  const failure = parseRemotePortInUseFailure(output);
  if (!failure) return null;
  return [
    `Remote runtime port ${failure.port} is already in use.`,
    "LLM Space will retry with a different per-connection port without stopping the existing listener.",
  ].join(" ");
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
  return [
    failure.reason === "missing"
      ? "Remote runtime binary is missing."
      : "Remote runtime binary is not executable.",
    `${failure.path} does not exist or is not executable on the SSH server.`,
    "Check the remote install directory, permissions, and whether the runtime package was installed under a literal '~' directory.",
  ].join(" ");
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

  const targetText = target ? ` for ${target}` : "";
  return [
    `SSH authentication failed${targetText}.`,
    "OpenSSH could not authenticate with the configured keys, password, or passphrase.",
    "Check ~/.ssh/config, ssh-agent, and any system password or passphrase prompt, then try again.",
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

  const offending = /Offending \S+ key in ([^:\n]+):(\d+)/i.exec(output);
  const knownHosts = offending?.[1];
  const line = offending?.[2];
  const location = knownHosts
    ? `${knownHosts}${line ? ` line ${line}` : ""}`
    : "your SSH known_hosts file";
  const targetText = target ? ` for ${target}` : "";

  return [
    `SSH host key verification failed${targetText}.`,
    _hostKeyImpact(stage),
    `Confirm the host identity first, then update ${location}.`,
    _knownHostsAction(knownHosts, line, target),
  ].join(" ");
}

function _knownHostsAction(
  knownHosts: string | undefined,
  line: string | undefined,
  target: string | undefined
): string {
  if (knownHosts && line) {
    return `After confirming it is safe, remove that stale known_hosts entry and reconnect.`;
  }
  if (target) {
    return `If this is a first-time connection, use the LLM Space host identity prompt or run ssh ${target} once in Terminal to review and trust the host key, then reconnect.`;
  }
  return "If this is a first-time connection, use the LLM Space host identity prompt or run ssh in Terminal once to review and trust the host key, then reconnect.";
}

function _hostKeyImpact(stage: SshBootstrapStage): string {
  if (stage === "server-start") {
    return "OpenSSH reports that this host key changed or is not trusted, so the remote runtime command was not started.";
  }
  if (stage === "tunnel-start") {
    return "OpenSSH reports that this host key changed or is not trusted, so port forwarding was disabled and LLM Space did not start the remote runtime.";
  }
  return "OpenSSH reports that this host key changed or is not trusted, so the SSH connection closed before LLM Space could verify the remote runtime.";
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

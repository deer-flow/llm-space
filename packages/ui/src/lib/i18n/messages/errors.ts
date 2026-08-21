/**
 * User-visible error templates constructed in the bun process and surfaced
 * through RPC/UI: the updater's unsupported-platform message and the SSH
 * remote-runtime bootstrap composition (`ssh-error.ts` plus the thrown
 * port-selection / health-check templates in `ssh-remote-runtime.ts`). Values
 * are verbatim from today's code; `{var}` placeholders are filled with
 * `formatString`. Log-only and programmer-invariant errors stay in code.
 */
export const errors = {
  updatesUnsupportedPlatform: "Updates are not supported on this platform.",
  updatesDownloadIncomplete: "download did not complete",
  sshBootstrapGeneric:
    "SSH remote runtime bootstrap failed during {stage}: {label} exited early.",
  sshPortInUse:
    "Remote runtime port {port} is already in use. LLM Space will retry with a different per-connection port without stopping the existing listener.",
  sshMissingBinary:
    "Remote runtime binary is missing. {path} does not exist or is not executable on the SSH server. Check the remote install directory, permissions, and whether the runtime package was installed under a literal '~' directory.",
  sshNotExecutableBinary:
    "Remote runtime binary is not executable. {path} does not exist or is not executable on the SSH server. Check the remote install directory, permissions, and whether the runtime package was installed under a literal '~' directory.",
  sshAuthFailed: "SSH authentication failed.",
  sshAuthFailedFor: "SSH authentication failed for {target}.",
  sshAuthGuidance:
    "OpenSSH could not authenticate with the configured keys, password, or passphrase. Check ~/.ssh/config, ssh-agent, and any system password or passphrase prompt, then try again.",
  sshHostKeyFailed: "SSH host key verification failed.",
  sshHostKeyFailedFor: "SSH host key verification failed for {target}.",
  sshHostKeyImpactServerStart:
    "OpenSSH reports that this host key changed or is not trusted, so the remote runtime command was not started.",
  sshHostKeyImpactTunnelStart:
    "OpenSSH reports that this host key changed or is not trusted, so port forwarding was disabled and LLM Space did not start the remote runtime.",
  sshHostKeyImpactOther:
    "OpenSSH reports that this host key changed or is not trusted, so the SSH connection closed before LLM Space could verify the remote runtime.",
  sshHostKeyLocation: "Confirm the host identity first, then update {location}.",
  sshKnownHostsFallback: "your SSH known_hosts file",
  sshKnownHostsLine: "{knownHosts} line {line}",
  sshRemoveStaleEntry:
    "After confirming it is safe, remove that stale known_hosts entry and reconnect.",
  sshFirstConnectionFor:
    "If this is a first-time connection, use the LLM Space host identity prompt or run ssh {target} once in Terminal to review and trust the host key, then reconnect.",
  sshFirstConnection:
    "If this is a first-time connection, use the LLM Space host identity prompt or run ssh in Terminal once to review and trust the host key, then reconnect.",
  remotePortReportedInUse:
    "Remote runtime reported port {port} in use, but this connection attempted port {attemptedPort}.",
  remotePortsExhausted:
    "Could not find an available per-connection remote port after {attempts} attempts; no existing listener was stopped. Retry the connection or configure a different remote server port.",
  sshHealthCheckTimeout:
    "SSH remote runtime bootstrap failed during health-check: {message}. Expected protocol {version}.",
};

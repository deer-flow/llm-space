English | [中文](./remote-runtime.zh-CN.md)

---

# Remote Runtime over SSH

Remote Runtime lets the desktop UI connect to a Linux machine over SSH and run the LLM Space runtime there. The desktop keeps the window and interaction; the remote machine owns the workspace, model settings, MCP servers, tools, skills, and network access for that runtime.

## Recommended SSH setup

Use your system OpenSSH configuration. LLM Space calls the `ssh` command and intentionally reuses the same files and behavior as your terminal.

On macOS and Linux, the standard config file is:

```text
~/.ssh/config
```

On Windows with OpenSSH, the user config is usually:

```text
%USERPROFILE%\.ssh\config
```

A typical host alias looks like this:

```sshconfig
Host llm-devbox
  HostName 203.0.113.10
  User qiangenchao
  Port 22
  IdentityFile ~/.ssh/id_ed25519
  # Optional examples:
  # ProxyJump jump-host
  # ForwardAgent yes
```

Then add a Remote Server in LLM Space with:

- **Name**: any display name, for example `Devbox`
- **Host**: the OpenSSH host alias, for example `llm-devbox`
- **User**: optional; leave it empty when `User` is already set in `~/.ssh/config`

LLM Space only stores these fields. Put SSH-level options such as port, identity file, jump host, proxy command, and agent behavior in `~/.ssh/config`.

## Passwords and passphrases

LLM Space does not store SSH passwords or private-key passphrases.

If your SSH setup needs authentication, use the normal OpenSSH mechanisms: ssh-agent, macOS Keychain, or your system password/passphrase prompt. A quick check is:

```sh
ssh llm-devbox
```

If that command cannot connect from a terminal, fix SSH first before trying LLM Space.

LLM Space may invoke several short `ssh` commands while detecting the platform and preparing the runtime. For the smoothest experience, make sure `ssh <alias>` connects reliably from a terminal, preferably through ssh-agent or your system keychain. Password-only connections may trigger multiple system prompts.

## Connection progress

During Connect, LLM Space reports the main stages:

1. Checking SSH access
2. Detecting remote platform
3. Preparing or downloading the remote runtime
4. Starting the remote runtime
5. Opening the SSH tunnel
6. Verifying the remote runtime
7. Connected

The Remote Servers page also shows a **Connection flow** timeline with SSH, Host key, Platform, Install runtime, Start server, Tunnel, and Health check. If the connection fails, the failed step keeps its detailed message so you can tell whether the failure happened during SSH authentication, package installation, server startup, tunnel creation, or runtime health check.

Before reusing an installed remote runtime package, LLM Space verifies both `server-manifest.json` and the executable `bin/llm-space-server`. If a previous install left a partial version directory where the manifest exists but the binary is missing or not executable, the connection treats it as incomplete and reinstalls that version during the install stage.

The default install directory `~/.llm-space/remote-runtime` is resolved on the SSH server as that user's `$HOME/.llm-space/remote-runtime`; it is not resolved on the local machine, and it must not create a literal `~/` directory on the server. Startup and health-check failures do not trigger an automatic reinstall retry. If `bin/llm-space-server` is missing or not executable after installation, LLM Space reports the failure with a best-effort remote diagnostic snapshot covering `$HOME`, `PWD`, the install directory, entrypoint existence, execute permission, manifest content, and possible literal `~/` install artifacts. Check install directory permissions, disk space, external cleanup jobs, and any stale literal `~/` directory before reconnecting.

If startup or health check reports that the remote runtime port, usually `39123`, is already in use, LLM Space checks whether the listener is a stale `llm-space-server` from the same remote install directory, for example `~/.llm-space/remote-runtime/versions/<old-version>/bin/llm-space-server --host 127.0.0.1 --port 39123`. When that ownership is verified, LLM Space stops that stale server and retries the current connection once. It does not stop unknown or non-LLM Space processes; in that case, inspect the process on the SSH host and stop it manually before reconnecting.

## Host key verification failures

OpenSSH protects you from connecting to a host whose identity is unknown or changed. LLM Space handles those cases separately.

On the first connection to a Host alias or IP, LLM Space shows the host key type and SHA256 fingerprint. Click **Trust and continue** only after you confirm that the fingerprint belongs to the expected server. After confirmation, LLM Space writes the host key to OpenSSH `known_hosts`, so later connections can proceed silently.

If LLM Space reports that the SSH host key changed, do not blindly delete `known_hosts`, and do not look for an “ignore host key” bypass. The server may have been rebuilt, the IP may have been reused, or a real man-in-the-middle attack may be happening.

First confirm the host identity with your infrastructure provider or administrator. After you know the change is expected, update the line reported by OpenSSH, for example:

```text
/Users/bytedance/.ssh/known_hosts line 6
```

In the changed-key dialog, LLM Space shows the new fingerprint, the `known_hosts` file, and the offending line. Only after you check that you verified the host identity can LLM Space replace the stale entry and continue.

Useful diagnostic commands:

```sh
ssh -vvv llm-devbox
ssh -G llm-devbox
ssh-keygen -F llm-devbox -f ~/.ssh/known_hosts
```

If LLM Space cannot write or replace `known_hosts` automatically, run `ssh llm-devbox` in Terminal once and complete OpenSSH's standard confirmation flow. In changed-key cases, verify the host identity first, then handle the stale entry reported by OpenSSH.

LLM Space does not provide an “ignore host key” button because bypassing host key verification can hide a real man-in-the-middle attack.

## Downloading remote runtime times out

If progress reaches **Downloading remote runtime package** and then fails with a server-install timeout, SSH is already working. The remote Linux machine could not download the `llm-space-server` release archive in time.

Newer LLM Space builds use a two-step install path automatically: first the remote server tries to download the GitHub release archive directly; if that remote download fails, the Desktop app downloads the same archive locally, caches it under the local settings directory, uploads it over SSH to the remote runtime downloads directory, and continues installation from that uploaded archive.

Check from your Mac:

```sh
ssh llm-devbox 'curl -I -L --connect-timeout 15 https://github.com/deer-flow/llm-space/releases/latest'
```

If that hangs or fails but LLM Space still connects successfully, the local download/upload fallback worked.

If the fallback still fails, use the error detail to identify the next boundary: local GitHub download failures require fixing the Desktop machine's network or proxy; upload failures usually mean SSH cannot write to the remote install directory; remote install failures usually mean missing `tar`, low disk space, permissions under `~/.llm-space/remote-runtime`, an external cleanup job, or an incorrect remote install directory.

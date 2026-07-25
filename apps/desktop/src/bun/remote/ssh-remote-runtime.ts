import { randomBytes } from "node:crypto";

import { REMOTE_RUNTIME_PROTOCOL_VERSION } from "@llm-space/runtime/remote-protocol";

import { findFreePort } from "./port";
import { spawnManagedProcess, type ManagedProcess } from "./process-utils";
import { execRemoteCommand } from "./remote-exec";
import { uploadRemoteFile } from "./remote-file-transfer";
import {
  buildRemotePortOwnerProbeCommand,
  buildStopRemotePortOwnerCommand,
  parseRemotePortOwnerProbeOutput,
} from "./remote-port-owner";
import { RemoteRuntimeClient } from "./remote-runtime-client";
import {
  installRemoteServerPackage,
  RemoteServerInstallError,
  type RemoteServerInstallResult,
} from "./remote-server-installer";
import { getOrDownloadServerPackage } from "./server-package-cache";
import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import {
  buildRemoteServerArgs,
  buildSourceRemoteServerCommand,
  buildSshBaseArgs,
  buildTunnelArgs,
  joinRemotePath,
  shellPath,
  shellQuote,
} from "./ssh-command";
import {
  formatSshBootstrapFailure,
  parseMissingRuntimeBinaryFailure,
  parseRemotePortInUseFailure,
} from "./ssh-error";

export interface SshRemoteRuntimeHandle {
  client: RemoteRuntimeClient;
  stop(): Promise<void>;
}

export interface SshRemoteRuntimeProgress {
  stage:
    | "platform-detect"
    | "server-install"
    | "server-start"
    | "tunnel-start"
    | "health-check";
  message: string;
}

export interface SshRemoteRuntimeOptions {
  onProgress?: (progress: SshRemoteRuntimeProgress) => void;
}

export async function startSshRemoteRuntime(
  config: SshRemoteRuntimeConfig,
  options: SshRemoteRuntimeOptions = {}
): Promise<SshRemoteRuntimeHandle> {
  const token = _generateToken();
  const localPort = config.localPort ?? (await findFreePort());
  const allProcesses: ManagedProcess[] = [];

  try {
    const install = await _installRemoteServer(config, options);
    const started = await _startInstalledRuntime({
      config,
      install,
      token,
      localPort,
      options,
    });
    allProcesses.push(...started.processes);
    return _handle(started.client, allProcesses);
  } catch (error) {
    await Promise.all(allProcesses.map((process) => process.stop()));
    throw error;
  }
}

async function _installRemoteServer(
  config: SshRemoteRuntimeConfig,
  options: SshRemoteRuntimeOptions
): Promise<RemoteServerInstallResult> {
  try {
    return await installRemoteServerPackage(config, undefined, {
      onProgress: options.onProgress,
      packageUploader: {
        upload: async ({
          config: sshConfig,
          assetName,
          assetUrl,
          checksumUrl,
          remoteArchivePath,
        }) => {
          const localPackage = await getOrDownloadServerPackage({
            assetName,
            assetUrl,
            checksumUrl,
          });
          options.onProgress?.({
            stage: "server-install",
            message: "Uploading remote runtime package over SSH",
          });
          await uploadRemoteFile({
            config: sshConfig,
            localPath: localPackage.path,
            remotePath: remoteArchivePath,
          });
        },
      },
    });
  } catch (error) {
    throw new Error(
      formatSshBootstrapFailure({
        stage:
          error instanceof RemoteServerInstallError
            ? error.stage
            : "server-install",
        label: "remote server installer",
        output: error instanceof Error ? error.message : String(error),
        target: config.user ? `${config.user}@${config.host}` : config.host,
      }),
      { cause: error }
    );
  }
}

async function _startInstalledRuntime(input: {
  config: SshRemoteRuntimeConfig;
  install: RemoteServerInstallResult;
  token: string;
  localPort: number;
  options: SshRemoteRuntimeOptions;
}): Promise<{ client: RemoteRuntimeClient; processes: ManagedProcess[] }> {
  let retriedPortRecovery = false;
  while (true) {
    try {
      return await _startInstalledRuntimeOnce(input);
    } catch (error) {
      const portFailure = parseRemotePortInUseFailure(_errorMessage(error));
      if (portFailure && !retriedPortRecovery) {
        retriedPortRecovery = true;
        await _recoverRemotePortInUse(input.config, input.options, portFailure.port);
        continue;
      }
      throw await _appendRemoteRuntimeDiagnostics(error, input);
    }
  }
}

async function _startInstalledRuntimeOnce(input: {
  config: SshRemoteRuntimeConfig;
  install: RemoteServerInstallResult;
  token: string;
  localPort: number;
  options: SshRemoteRuntimeOptions;
}): Promise<{ client: RemoteRuntimeClient; processes: ManagedProcess[] }> {
  const processes: ManagedProcess[] = [];
  try {
    input.options.onProgress?.({
      stage: "server-start",
      message: "Starting remote runtime",
    });
    const serverProcess = spawnManagedProcess(
      "remote server",
      "ssh",
      process.env.LLM_SPACE_REMOTE_SERVER_MODE === "source"
        ? [
            ...buildSshBaseArgs(input.config),
            buildSourceRemoteServerCommand({
              remoteRepo: input.config.remoteRepo,
              host: "127.0.0.1",
              port: input.config.remoteServerPort,
              token: input.token,
              home: input.config.remoteHome,
            }),
          ]
        : buildRemoteServerArgs({
            config: input.config,
            token: input.token,
            entrypoint: input.install.entrypoint,
          }),
      { collectOutput: false }
    );
    processes.push(serverProcess);
    await _waitForProcessAlive(serverProcess, "server-start", input.config);

    input.options.onProgress?.({
      stage: "tunnel-start",
      message: "Opening SSH tunnel",
    });
    const tunnelProcess = spawnManagedProcess(
      "ssh tunnel",
      "ssh",
      buildTunnelArgs({ config: input.config, localPort: input.localPort })
    );
    processes.push(tunnelProcess);
    await _waitForProcessAlive(tunnelProcess, "tunnel-start", input.config);

    const client = new RemoteRuntimeClient({
      id: input.config.id,
      name: input.config.name,
      baseUrl: `http://127.0.0.1:${input.localPort}`,
      token: input.token,
    });
    input.options.onProgress?.({
      stage: "health-check",
      message: "Verifying remote runtime",
    });
    await _waitForHealth(client, processes, input.config);
    return { client, processes };
  } catch (error) {
    await Promise.all(processes.map((process) => process.stop()));
    throw error;
  }
}

async function _recoverRemotePortInUse(
  config: SshRemoteRuntimeConfig,
  options: SshRemoteRuntimeOptions,
  port: number
): Promise<void> {
  if (port !== config.remoteServerPort) {
    throw new Error(
      `Remote runtime reported port ${port} in use, but this connection is configured for port ${config.remoteServerPort}.`
    );
  }
  options.onProgress?.({
    stage: "server-start",
    message: "Checking stale remote runtime port owner",
  });
  const probe = await execRemoteCommand(
    config,
    buildRemotePortOwnerProbeCommand(config),
    10_000
  );
  const owner = parseRemotePortOwnerProbeOutput(
    [probe.stdout, probe.stderr].filter(Boolean).join("\n"),
    config
  );
  if (owner.kind !== "llm-space") {
    throw new Error(
      [
        `Remote runtime port ${port} is in use, but LLM Space could not verify it owns the listening process.`,
        `Owner: ${owner.kind}.`,
        owner.detail,
      ].join(" ")
    );
  }
  options.onProgress?.({
    stage: "server-start",
    message: "Restarting stale remote runtime server",
  });
  await execRemoteCommand(
    config,
    buildStopRemotePortOwnerCommand(owner.pid),
    10_000
  );
}

async function _appendRemoteRuntimeDiagnostics(
  error: unknown,
  input: {
    config: SshRemoteRuntimeConfig;
    install: RemoteServerInstallResult;
  }
): Promise<Error> {
  const message = _errorMessage(error);
  if (!parseMissingRuntimeBinaryFailure(message)) {
    return error instanceof Error ? error : new Error(message);
  }
  const diagnostics = await _collectRemoteRuntimeDiagnostics(input).catch(
    (diagnosticError) =>
      `Remote diagnostics failed: ${_errorMessage(diagnosticError)}`
  );
  return new Error(`${message}\n\nRemote diagnostics:\n${diagnostics}`, {
    cause: error,
  });
}

async function _collectRemoteRuntimeDiagnostics(input: {
  config: SshRemoteRuntimeConfig;
  install: RemoteServerInstallResult;
}): Promise<string> {
  const installDir = input.config.remoteInstallDir;
  const packageDir = joinRemotePath(installDir, "versions", input.install.version);
  const manifestPath = joinRemotePath(packageDir, "server-manifest.json");
  const binDir = joinRemotePath(packageDir, "bin");
  const command = [
    "set +e",
    'printf "USER=%s\\nHOME=%s\\nPWD=%s\\n" "${USER:-}" "$HOME" "$PWD"',
    `printf "entrypoint=%s\\ninstallDir=%s\\npackageDir=%s\\nremoteHome=%s\\n" ${shellQuote(
      input.install.entrypoint
    )} ${shellQuote(installDir)} ${shellQuote(packageDir)} ${shellQuote(
      input.config.remoteHome
    )}`,
    "echo path_status:",
    `ls -ld ${shellPath(installDir)} ${shellPath(
      joinRemotePath(installDir, "versions")
    )} ${shellPath(packageDir)} ${shellPath(binDir)} ${shellPath(
      input.install.entrypoint
    )} 2>&1`,
    `test -e ${shellPath(input.install.entrypoint)}; echo entrypoint_exists:$?`,
    `test -x ${shellPath(
      input.install.entrypoint
    )}; echo entrypoint_executable:$?`,
    "echo manifest:",
    `head -c 4096 ${shellPath(manifestPath)} 2>&1; echo`,
    "echo literal_tilde_candidates:",
    'ls -ld "$PWD/~" "$PWD/~/.llm-space" "$PWD/~/.llm-space/remote-runtime" 2>&1',
    "true",
  ].join("; ");
  const result = await execRemoteCommand(input.config, command, 10_000);
  return [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
}

function _handle(
  client: RemoteRuntimeClient,
  processes: ManagedProcess[]
): SshRemoteRuntimeHandle {
  return {
    client,
    stop: async () => {
      await client.shutdownRemote().catch(() => undefined);
      client.shutdown();
      await Promise.all(processes.map((process) => process.stop()));
    },
  };
}

function _generateToken(): string {
  return `llm-space-${randomBytes(24).toString("base64url")}`;
}

async function _waitForProcessAlive(
  process: ManagedProcess,
  stage: "server-start" | "tunnel-start",
  config: SshRemoteRuntimeConfig
): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 250));
  if (process.child.exitCode !== null || process.child.signalCode !== null) {
    throw new Error(
      formatSshBootstrapFailure({
        stage,
        label: process.label,
        output: process.output(),
        target: config.user ? `${config.user}@${config.host}` : config.host,
      })
    );
  }
}

async function _waitForHealth(
  client: RemoteRuntimeClient,
  processes: ManagedProcess[],
  config: SshRemoteRuntimeConfig
): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    for (const process of processes) {
      if (
        process.child.exitCode !== null ||
        process.child.signalCode !== null
      ) {
        throw new Error(
          formatSshBootstrapFailure({
            stage: "health-check",
            label: process.label,
            output: process.output(),
            target: config.user ? `${config.user}@${config.host}` : config.host,
          })
        );
      }
    }
    try {
      await client.connect();
      const info = client.info();
      if (!info.capabilities.length) {
        throw new Error("Remote runtime returned no capabilities.");
      }
      return;
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(
    `SSH remote runtime bootstrap failed during health-check: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }. Expected protocol ${REMOTE_RUNTIME_PROTOCOL_VERSION}.`
  );
}

function _errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

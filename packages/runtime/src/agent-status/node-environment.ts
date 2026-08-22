import { execFile } from "node:child_process";

import {
  createAgentEnvironmentProbe,
  type AgentEnvironmentProbe,
} from "./environment";

const VERSION_TIMEOUT_MS = 3_000;

export interface NodeAgentEnvironmentProbeOptions {
  platform?: string;
  arch?: string;
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
  runExecutable?: (
    executable: string,
    args: readonly string[]
  ) => Promise<string | null>;
}

export function createNodeAgentEnvironmentProbe(
  options: NodeAgentEnvironmentProbeOptions = {}
): AgentEnvironmentProbe {
  const runExecutable = options.runExecutable ?? _runExecutable;
  return createAgentEnvironmentProbe({
    platform: options.platform ?? process.platform,
    arch: options.arch ?? process.arch,
    env: options.env ?? process.env,
    runVersion: (command) => _runVersion(command, runExecutable),
    now: options.now ?? (() => new Date()),
  });
}

async function _runVersion(
  command: string,
  runExecutable: NonNullable<NodeAgentEnvironmentProbeOptions["runExecutable"]>
): Promise<string | null> {
  const [executable, ...args] = command.split(/\s+/).filter(Boolean);
  if (!executable) {
    return null;
  }
  return runExecutable(executable, args);
}

async function _runExecutable(
  executable: string,
  args: readonly string[]
): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      executable,
      [...args],
      {
        encoding: "utf8",
        timeout: VERSION_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve(null);
          return;
        }
        resolve(stdout.trim() || stderr.trim() || null);
      }
    );
  });
}

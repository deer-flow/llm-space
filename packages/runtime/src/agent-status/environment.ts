import type { AgentStatusEnvironment } from "@llm-space/core/agent-status";

export type { AgentStatusEnvironment } from "@llm-space/core/agent-status";

export interface AgentEnvironmentProbeOptions {
  platform: string;
  arch: string;
  env: Readonly<Record<string, string | undefined>>;
  runVersion(command: string): Promise<string | null>;
  now(): Date;
}

export interface AgentEnvironmentProbe {
  inspect(input: { workingDirectory: string }): Promise<AgentStatusEnvironment>;
}

interface StaticEnvironment {
  platform: string;
  arch: string;
  shell: string;
  pythonVersion: string;
}

const UNAVAILABLE = "unavailable";

export function createAgentEnvironmentProbe(
  options: AgentEnvironmentProbeOptions
): AgentEnvironmentProbe {
  let staticEnvironment: Promise<StaticEnvironment> | undefined;

  const inspectStaticEnvironment = (): Promise<StaticEnvironment> => {
    staticEnvironment ??= _detectStaticEnvironment(options);
    return staticEnvironment;
  };

  return {
    async inspect({ workingDirectory }) {
      const detected = await inspectStaticEnvironment();
      return {
        currentTime: options.now().toISOString(),
        workingDirectory,
        ...detected,
      };
    },
  };
}

async function _detectStaticEnvironment(
  options: AgentEnvironmentProbeOptions
): Promise<StaticEnvironment> {
  return {
    platform: options.platform,
    arch: options.arch,
    shell: _detectShell(options.platform, options.env),
    pythonVersion: await _detectPythonVersion((command) =>
      options.runVersion(command)
    ),
  };
}

function _detectShell(
  platform: string,
  env: Readonly<Record<string, string | undefined>>
): string {
  const shell =
    platform === "win32"
      ? (env.COMSPEC ?? env.ComSpec)
      : (env.SHELL ?? env.shell);
  return shell?.trim() || UNAVAILABLE;
}

async function _detectPythonVersion(
  runVersion: AgentEnvironmentProbeOptions["runVersion"]
): Promise<string> {
  for (const command of ["python --version", "python3 --version"]) {
    try {
      const version = (await runVersion(command))?.trim();
      if (version) {
        return version;
      }
    } catch {
      // 单个命令不可用时继续尝试兼容名称。
    }
  }
  return UNAVAILABLE;
}

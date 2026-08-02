import { spawn } from "node:child_process";

const DEFAULT_POST_KILL_DRAIN_MS = 250;
const MAX_OUTPUT_LENGTH = 20_000;

export interface SshHostKeyCommandOptions {
  preserveOutputStart?: boolean;
  timeoutMs?: number;
  postKillDrainMs?: number;
}

export interface SshHostKeyCommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export async function runSshHostKeyCommand(
  command: string,
  args: string[],
  options: SshHostKeyCommandOptions = {}
): Promise<SshHostKeyCommandResult> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const postKillDrainMs = Math.max(
    0,
    options.postKillDrainMs ?? DEFAULT_POST_KILL_DRAIN_MS
  );
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  const appendStdout = (chunk: Buffer) => {
    stdout = _appendOutput(stdout, chunk, options.preserveOutputStart === true);
  };
  const appendStderr = (chunk: Buffer) => {
    stderr = _appendOutput(stderr, chunk, options.preserveOutputStart === true);
  };
  child.stdout?.on("data", appendStdout);
  child.stderr?.on("data", appendStderr);

  return await new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let postKillDrainTimer: ReturnType<typeof setTimeout> | undefined;
    function cleanup(): void {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (postKillDrainTimer) clearTimeout(postKillDrainTimer);
      child.removeListener("error", fail);
      child.removeListener("close", close);
      child.stdout?.removeListener("data", appendStdout);
      child.stderr?.removeListener("data", appendStderr);
    }
    function settle(result: SshHostKeyCommandResult): void {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }
    function fail(error: Error): void {
      if (settled) return;
      settled = true;
      cleanup();
      child.stdout?.destroy();
      child.stderr?.destroy();
      reject(error);
    }
    function buildResult(code: number | null): SshHostKeyCommandResult {
      return {
        code: timedOut ? null : code,
        stdout,
        stderr: timedOut
          ? `${stderr}\nSSH host key probe timed out after ${timeoutMs}ms.`
          : stderr,
      };
    }
    function close(code: number | null): void {
      settle(buildResult(code));
    }

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      if (settled) return;
      postKillDrainTimer = setTimeout(() => {
        child.stdout?.destroy();
        child.stderr?.destroy();
        settle(buildResult(null));
      }, postKillDrainMs);
    }, timeoutMs);
    child.once("error", fail);
    child.once("close", close);
  });
}

function _appendOutput(
  current: string,
  chunk: Buffer,
  preserveStart: boolean
): string {
  const next = current + chunk.toString("utf8");
  if (next.length <= MAX_OUTPUT_LENGTH) return next;
  if (!preserveStart) return next.slice(-MAX_OUTPUT_LENGTH);

  const marker = "\n... SSH output truncated ...\n";
  const startLength = MAX_OUTPUT_LENGTH / 2;
  const endLength = MAX_OUTPUT_LENGTH - startLength - marker.length;
  return `${next.slice(0, startLength)}${marker}${next.slice(-endLength)}`;
}

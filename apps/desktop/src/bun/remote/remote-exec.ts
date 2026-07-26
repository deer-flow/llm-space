import { spawn } from "node:child_process";

import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import { buildSshBaseArgs } from "./ssh-command";

export interface RemoteExecResult {
  stdout: string;
  stderr: string;
}

export async function execRemoteCommand(
  config: SshRemoteRuntimeConfig,
  command: string,
  timeoutMs = 30_000
): Promise<RemoteExecResult> {
  const child = spawn("ssh", [...buildSshBaseArgs(config), command], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  return await new Promise<RemoteExecResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Remote command timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `Remote command failed with ${signal ?? `exit code ${code}`}: ${stderr || stdout}`
        )
      );
    });
  });
}

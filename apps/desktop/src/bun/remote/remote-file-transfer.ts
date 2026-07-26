import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";

import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import { buildSshBaseArgs, shellPath } from "./ssh-command";

export interface RemoteFileUploadInput {
  config: SshRemoteRuntimeConfig;
  localPath: string;
  remotePath: string;
  timeoutMs?: number;
}

const DEFAULT_UPLOAD_TIMEOUT_MS = 300_000;

export async function uploadRemoteFile({
  config,
  localPath,
  remotePath,
  timeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
}: RemoteFileUploadInput): Promise<void> {
  const remoteTmpPath = `${remotePath}.upload-${process.pid}-${Date.now()}`;
  const command = [
    "set -e",
    `mkdir -p ${shellPath(_dirname(remotePath))}`,
    `cat > ${shellPath(remoteTmpPath)}`,
    `mv ${shellPath(remoteTmpPath)} ${shellPath(remotePath)}`,
  ].join(" && ");
  const child = spawn("ssh", [...buildSshBaseArgs(config), command], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  const append = (chunk: Buffer) => {
    output += chunk.toString("utf8");
    if (output.length > 20_000) output = output.slice(-20_000);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  const source = createReadStream(localPath);
  if (!child.stdin) {
    child.kill("SIGKILL");
    throw new Error("Remote file upload failed: ssh stdin is unavailable.");
  }
  source.pipe(child.stdin);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Remote file upload timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    source.once("error", (error) => {
      clearTimeout(timer);
      child.kill("SIGKILL");
      reject(error);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Remote file upload failed with ${signal ?? `exit code ${code}`}: ${output}`
        )
      );
    });
  });
}

function _dirname(filePath: string): string {
  const index = filePath.lastIndexOf("/");
  if (index <= 0) return ".";
  return filePath.slice(0, index);
}

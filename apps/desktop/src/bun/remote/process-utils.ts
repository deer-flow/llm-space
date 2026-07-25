import { spawn, type ChildProcess } from "node:child_process";

export interface ManagedProcess {
  label: string;
  child: ChildProcess;
  output(): string;
  stop(): Promise<void>;
}

export function spawnManagedProcess(
  label: string,
  command: string,
  args: string[],
  options: { collectOutput?: boolean } = {}
): ManagedProcess {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const append = (chunk: Buffer) => {
    output += chunk.toString("utf8");
    if (output.length > 20_000) {
      output = output.slice(-20_000);
    }
  };
  if (options.collectOutput !== false) {
    child.stdout?.on("data", append);
  }
  child.stderr?.on("data", append);

  return {
    label,
    child,
    output: () => output,
    stop: () => stopProcess(child),
  };
}

export async function stopProcess(
  child: ChildProcess,
  timeoutMs = 2_000
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

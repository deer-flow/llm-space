import { spawn, type ChildProcess } from "node:child_process";

export interface ManagedProcess {
  label: string;
  child: ChildProcess;
  output(): string;
  stop(): Promise<void>;
}

export interface ManagedProcessOptions {
  collectOutput?: boolean;
  stdinInput?: string;
}

export function spawnManagedProcess(
  label: string,
  command: string,
  args: string[],
  options: ManagedProcessOptions = {}
): ManagedProcess {
  const child = spawn(command, args, {
    stdio: [
      options.stdinInput === undefined ? "ignore" : "pipe",
      "pipe",
      "pipe",
    ],
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
  if (options.stdinInput !== undefined) {
    child.stdin?.on("error", () => {
      // The child exit/output path reports startup failures. Handling EPIPE
      // here prevents a closed remote stdin from becoming an uncaught error.
    });
    child.stdin?.end(options.stdinInput);
  }

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

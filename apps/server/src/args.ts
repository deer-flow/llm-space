import os from "node:os";
import path from "node:path";

export interface ServerArgs {
  host: string;
  port: number;
  token: string;
  home: string;
  help: boolean;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 39123;

export function parseArgs(argv: string[]): ServerArgs {
  const parsed: Partial<ServerArgs> = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    home: path.join(os.homedir(), ".llm-space-server"),
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--host") {
      parsed.host = _requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--port") {
      parsed.port = _parsePort(_requireValue(argv, ++index, arg));
      continue;
    }
    if (arg === "--token") {
      parsed.token = _requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--home") {
      parsed.home = _resolveHome(_requireValue(argv, ++index, arg));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  parsed.home = _resolveHome(
    parsed.home ?? path.join(os.homedir(), ".llm-space-server")
  );

  if (!parsed.help && !parsed.token) {
    throw new Error("--token is required.");
  }

  return parsed as ServerArgs;
}

export function helpText(): string {
  return `Usage: llm-space-server --token <token> [options]\n\nOptions:\n  --host <host>    Host to bind. Defaults to 127.0.0.1.\n  --port <port>    Port to bind. Defaults to 39123.\n  --token <token>  Bearer token required by every endpoint.\n  --home <path>    Server home. Defaults to ~/.llm-space-server.\n  --help           Show this help.\n`;
}

function _requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function _parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be an integer between 1 and 65535: ${value}`);
  }
  return port;
}

function _resolveHome(input: string): string {
  const expanded =
    input === "~"
      ? os.homedir()
      : input.startsWith("~/")
        ? path.join(os.homedir(), input.slice(2))
        : input;
  return path.resolve(expanded);
}

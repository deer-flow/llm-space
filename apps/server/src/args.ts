import os from "node:os";
import path from "node:path";

export interface ServerArgs {
  host: string;
  port: number;
  token?: string;
  tokenStdin: boolean;
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
    tokenStdin: false,
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
    if (arg === "--token-stdin") {
      parsed.tokenStdin = true;
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

  if (!parsed.help && !parsed.token && !parsed.tokenStdin) {
    throw new Error("--token is required.");
  }
  if (!parsed.help && parsed.token && parsed.tokenStdin) {
    throw new Error(
      "Choose exactly one token source: --token or --token-stdin."
    );
  }

  return parsed as ServerArgs;
}

export async function resolveServerToken(
  args: ServerArgs,
  readStdin: () => Promise<string> = () => Bun.stdin.text()
): Promise<string> {
  if (args.token !== undefined) return args.token;
  const input = await readStdin();
  const token = input.endsWith("\n") ? input.slice(0, -1) : input;
  const normalized = token.endsWith("\r") ? token.slice(0, -1) : token;
  if (!normalized) {
    throw new Error("Bearer token from standard input is empty.");
  }
  return normalized;
}

export function helpText(): string {
  return `Usage: llm-space-server (--token <token> | --token-stdin) [options]\n\nOptions:\n  --host <host>    Host to bind. Defaults to 127.0.0.1.\n  --port <port>    Port to bind. Defaults to 39123.\n  --token <token>  Bearer token required by every endpoint.\n  --token-stdin    Read the bearer token from standard input.\n  --home <path>    Server home. Defaults to ~/.llm-space-server.\n  --help           Show this help.\n`;
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

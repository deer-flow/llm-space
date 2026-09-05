import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { promisify } from "node:util";

import type { BuiltinTool } from "@llm-space/core";

import type { ToolEntry } from "../tool-registry";

const execFileAsync = promisify(execFile);

interface Voice {
  name: string;
  language: string;
  sample: string;
}

export interface SpeechDependencies {
  listVoices(): Promise<string>;
  spawnSpeech(args: string[]): ChildProcessWithoutNullStreams;
}

/** Own only this runtime's speech process; never terminate other apps' speech. */
export class MacSpeechManager {
  private active: ChildProcessWithoutNullStreams | null = null;
  private closed = false;

  constructor(
    private readonly dependencies: SpeechDependencies = {
      async listVoices() {
        const { stdout } = await execFileAsync("/usr/bin/say", ["-v", "?"], {
          timeout: 10_000,
          maxBuffer: 1024 * 1024,
        });
        return stdout;
      },
      spawnSpeech: (args) => spawn("/usr/bin/say", args, { stdio: "pipe" }),
    }
  ) {}

  async listVoices(): Promise<Voice[]> {
    const output = await this.dependencies.listVoices();
    return output.split("\n").flatMap((line) => {
      const match = /^(.*?)\s+([a-z]{2,3}_[A-Za-z_]+)\s+#\s?(.*)$/.exec(line);
      return match
        ? [{ name: match[1].trim(), language: match[2], sample: match[3] }]
        : [];
    });
  }

  async speak(args: Record<string, unknown>) {
    if (this.closed) throw new Error("macOS Speech has shut down.");
    const { text, voice, rate } = args;
    if (typeof text !== "string" || !text.trim() || text.length > 10_000) {
      throw new Error("text must contain 1–10000 characters.");
    }
    if (voice !== undefined && (typeof voice !== "string" || !voice.trim())) {
      throw new Error(
        "voice must be an installed voice name from list_voices."
      );
    }
    if (
      rate !== undefined &&
      (typeof rate !== "number" ||
        !Number.isInteger(rate) ||
        rate < 80 ||
        rate > 400)
    ) {
      throw new Error(
        "rate must be an integer between 80 and 400 words per minute."
      );
    }
    if (
      voice &&
      !(await this.listVoices()).some((item) => item.name === voice)
    ) {
      throw new Error(
        "Voice is not installed. Use list_voices to choose an available voice."
      );
    }
    if (this.closed) throw new Error("macOS Speech has shut down.");
    this.stop();
    // Feed text through stdin: it must never become a shell command or say option.
    const commandArgs = ["-f", "-"];
    if (voice) commandArgs.push("-v", voice);
    if (rate !== undefined) commandArgs.push("-r", String(rate));
    const child = this.dependencies.spawnSpeech(commandArgs);
    this.active = child;
    child.stdout.resume();
    child.stderr.resume();
    const timeout = setTimeout(() => child.kill(), 5 * 60_000);
    timeout.unref();
    const cleanup = () => {
      clearTimeout(timeout);
      if (this.active === child) this.active = null;
    };
    child.once("close", cleanup);
    child.once("error", cleanup);
    // EPIPE can occur when the user stops while the input is still being written.
    child.stdin.on("error", () => {
      // The process error/close handlers own lifecycle cleanup.
    });
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("spawn", () => {
        child.stdin.end(text);
        resolve();
      });
    });
    return {
      status: "started",
      message:
        "Speaking on this runtime's Mac. Playback continues in the background; use stop_speaking to stop it.",
    };
  }

  stop() {
    const child = this.active;
    this.active = null;
    const stopped =
      child !== null &&
      child.exitCode === null &&
      child.signalCode === null &&
      child.kill();
    return { status: stopped ? "stopped" : "idle" };
  }

  shutdown() {
    this.closed = true;
    this.stop();
  }
}

const emptyParameters = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const speechTools: BuiltinTool[] = [
  {
    type: "builtin",
    name: "list_voices",
    icon: "audio-lines",
    strict: true,
    description:
      "List installed macOS Speech voices, languages, and sample text. Use an exact returned name when calling speak. No API key is needed.",
    parameters: emptyParameters,
  },
  {
    type: "builtin",
    name: "speak",
    icon: "volume-2",
    strict: true,
    description:
      "Read text aloud using macOS Speech on the runtime's Mac. Starts background playback and replaces any speech previously started by this runtime. Uses the system voice by default. No API key or extra installation is needed.",
    parameters: {
      type: "object",
      required: ["text"],
      additionalProperties: false,
      properties: {
        text: {
          type: "string",
          minLength: 1,
          maxLength: 10_000,
          description: "Text to read aloud.",
        },
        voice: {
          type: "string",
          description:
            "Optional exact installed voice name from list_voices. Omit to use the system default.",
        },
        rate: {
          type: "integer",
          minimum: 80,
          maximum: 400,
          description: "Optional speech rate in words per minute.",
        },
      },
    },
  },
  {
    type: "builtin",
    name: "stop_speaking",
    icon: "volume-x",
    strict: true,
    description:
      "Stop macOS Speech started by this runtime. Does not affect speech from other applications. Safe when nothing is speaking.",
    parameters: emptyParameters,
  },
];

export function createSpeechBuiltInTools(
  manager: MacSpeechManager
): ToolEntry[] {
  return [
    { tool: speechTools[0], execute: () => manager.listVoices() },
    { tool: speechTools[1], execute: (args) => manager.speak(args) },
    { tool: speechTools[2], execute: () => Promise.resolve(manager.stop()) },
  ];
}

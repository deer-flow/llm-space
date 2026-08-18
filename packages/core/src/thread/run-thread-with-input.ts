import type { Message, UserMessage } from "../types/messages";
import type { SkillInfo } from "../types/skills";
import type { Thread } from "../types/threads";
import { uuid } from "../utils";

import { renderThreadPromptVariables } from "./prompt-variables";
import {
  type ExecuteThreadTool,
  runThreadLoop,
  type StreamThreadTurn,
  type ThreadRunEndReason,
  type ThreadRunEvent,
} from "./run-loop";
import {
  resolveThreadRunPolicy,
  type ThreadRunPolicy,
} from "./run-policy";

export interface RunThreadWithInputOptions {
  thread: Thread;
  input: string;
  policy?: Partial<ThreadRunPolicy> | ThreadRunPolicy;
  signal?: AbortSignal;
  streamTurn: StreamThreadTurn;
  executeTool?: ExecuteThreadTool;
  loadSkills?: () => Promise<SkillInfo[]>;
  loadFile?: (path: string) => Promise<string>;
  fileExists?: (path: string) => Promise<boolean>;
  /** Headless default: do not wait for a UI to approve a paused tool. */
  onPause?: "pause" | "fail";
}

export interface RunThreadWithInputResult {
  thread: Thread;
  messages: Message[];
  policy: ThreadRunPolicy;
  reason: ThreadRunEndReason;
  error?: string;
  events: ThreadRunEvent[];
}

/**
 * Run one user input against a Thread without an open Playground. Appends the
 * input as a user message and drives {@link runThreadLoop}.
 */
export async function runThreadWithInput(
  options: RunThreadWithInputOptions
): Promise<RunThreadWithInputResult> {
  const policy = resolveThreadRunPolicy(options.policy);
  const userMessage = _createUserMessage(options.input);
  const messages = [
    ...(options.thread.context?.messages ?? []),
    userMessage,
  ];
  const rendered = await renderThreadPromptVariables({
    context: {
      ...(options.thread.context ?? {}),
      messages,
    },
    loadSkills: options.loadSkills,
    loadFile: options.loadFile,
    fileExists: options.fileExists,
  });
  const thread: Thread = {
    ...options.thread,
    context: rendered.context,
  };
  const events: ThreadRunEvent[] = [];
  let result: RunThreadWithInputResult = {
    thread,
    messages,
    policy,
    reason: "failed",
    events,
  };
  for await (const event of runThreadLoop({
    thread,
    messages,
    policy,
    signal: options.signal,
    streamTurn: options.streamTurn,
    executeTool: options.executeTool,
    loadSkills: options.loadSkills,
    loadFile: options.loadFile,
    fileExists: options.fileExists,
    onPause: options.onPause ?? "fail",
  })) {
    events.push(event);
    if (event.type === "run_end") {
      const nextThread: Thread = {
        ...thread,
        context: {
          ...(thread.context ?? {}),
          messages: event.messages,
          snapshot: rendered.snapshot,
        },
      };
      result = {
        thread: nextThread,
        messages: event.messages,
        policy: event.policy,
        reason: event.reason,
        ...(event.error ? { error: event.error } : {}),
        events,
      };
    }
  }
  return result;
}

function _createUserMessage(text: string): UserMessage {
  return {
    id: uuid(),
    role: "user",
    content: [{ type: "text", text }],
  };
}

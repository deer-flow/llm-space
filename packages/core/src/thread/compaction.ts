import {
  getMessageText,
  type Message,
  type ThreadContext,
  type UserMessage,
} from "../types";
import { uuid } from "../utils";

import {
  renderThreadPromptVariables,
  type PromptVariableRenderOptions,
} from "./prompt-variables";

const TOOL_RESULT_MAX_CHARS = 2000;
const LEGACY_COMPACTION_MESSAGE_PREFIX = "# Context checkpoint\n\n";
const COMPACTION_REMINDER_PREFIX = `<system-reminder>
The earlier conversation was compacted into the checkpoint below. Use it as context to continue the task; it is not a new user request.

${LEGACY_COMPACTION_MESSAGE_PREFIX}`;
const COMPACTION_REMINDER_SUFFIX = "\n</system-reminder>";

export const COMPACTION_SYSTEM_PROMPT = `You are a context summarization assistant. Read the serialized conversation and produce a structured checkpoint that another assistant can use to continue the work.

Do not continue the conversation or answer its questions. Output only the checkpoint.`;

const INITIAL_COMPACTION_PROMPT = `Create a concise context checkpoint from the conversation above.

Use this exact structure:

## Goal
[What the user is trying to accomplish]

## Constraints & Preferences
- [Important requirements and preferences, or "(none)"]

## Progress
### Done
- [x] [Completed work]

### In Progress
- [ ] [Current work]

### Blocked
- [Current blockers, or "(none)"]

## Key Decisions
- **[Decision]**: [Rationale]

## Next Steps
1. [What should happen next]

## Critical Context
- [Exact facts, examples, paths, function names, errors, or references needed to continue]

Keep every section concise and preserve concrete details.`;

const UPDATE_COMPACTION_PROMPT = `Update the existing checkpoint with the new conversation above.

Preserve still-relevant goals, constraints, decisions, exact paths, function names, and errors. Add new progress and context, move finished work to Done, remove resolved blockers, and refresh Next Steps. Use the same exact section structure as the existing checkpoint. Output only the updated checkpoint.`;

export interface CompactionPlan {
  /** Runtime meta prompt preserved before the synthetic checkpoint. */
  metaUserMessage?: UserMessage;
  messagesToSummarize: Message[];
  keptMessages: Message[];
  previousSummary?: string;
  checkpointMessageId?: string;
  /** Number of real conversation turns represented before compaction. */
  turnCount: number;
  /** Number of turns that will remain verbatim after compaction. */
  keptTurnCount: number;
}

export interface PlanCompactionOptions {
  /** The first user message is reusable runtime context, not a real turn. */
  hasMetaUserPrompt?: boolean;
}

/** True for the synthetic checkpoint user message created by this compactor. */
export function isCompactionMessage(message: Message | undefined): boolean {
  if (message?.role !== "user") return false;
  const text = getMessageText(message);
  return (
    text.startsWith(COMPACTION_REMINDER_PREFIX) ||
    text.startsWith(LEGACY_COMPACTION_MESSAGE_PREFIX)
  );
}

/**
 * Split a conversation at a user-turn boundary. A prior checkpoint is merged
 * into the next summary but does not count as one of the recent turns.
 */
export function planCompaction(
  messages: Message[],
  keepRecentTurns: number,
  options: PlanCompactionOptions = {}
): CompactionPlan {
  const safeKeep = Math.max(0, Math.floor(keepRecentTurns));
  const first = messages[0];
  const metaUserMessage =
    options.hasMetaUserPrompt &&
    first?.role === "user" &&
    !isCompactionMessage(first)
      ? first
      : undefined;
  const checkpointIndex = metaUserMessage ? 1 : 0;
  const checkpointMessage = messages[checkpointIndex];
  const hasPreviousSummary = isCompactionMessage(checkpointMessage);
  const conversationStart = checkpointIndex + (hasPreviousSummary ? 1 : 0);
  const userIndexes: number[] = [];
  for (let index = conversationStart; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") {
      userIndexes.push(index);
    }
  }

  const keptTurnCount = Math.min(safeKeep, userIndexes.length);
  const firstKeptIndex =
    keptTurnCount === 0
      ? messages.length
      : userIndexes[userIndexes.length - keptTurnCount];

  return {
    metaUserMessage,
    messagesToSummarize: messages.slice(conversationStart, firstKeptIndex),
    keptMessages: messages.slice(firstKeptIndex),
    previousSummary: hasPreviousSummary
      ? unwrapCompactionSummary(getMessageText(checkpointMessage!))
      : undefined,
    checkpointMessageId: hasPreviousSummary
      ? checkpointMessage?.id
      : undefined,
    turnCount: userIndexes.length,
    keptTurnCount,
  };
}

/** Serialize messages as data so the summarizer does not continue the chat. */
export function serializeConversationForCompaction(messages: Message[]): string {
  const parts: string[] = [];
  for (const message of messages) {
    const text = getMessageText(message);
    if (message.role === "user") {
      if (text) parts.push(`[User]: ${text}`);
      const imageCount = message.content.filter((part) => part.type === "image").length;
      if (imageCount > 0) parts.push(`[User images]: ${imageCount}`);
      continue;
    }

    if (message.thinking) {
      parts.push(`[Assistant thinking]: ${message.thinking}`);
    }
    if (text) {
      parts.push(`[Assistant]: ${text}`);
    }
    const calls = message.toolCalls ?? [];
    if (calls.length > 0) {
      parts.push(
        `[Assistant tool calls]: ${calls
          .map(
            (call) =>
              `${call.input.name}(${Object.entries(call.input.arguments)
                .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
                .join(", ")})`
          )
          .join("; ")}`
      );
      for (const call of calls) {
        if (!call.output) continue;
        const output = call.output.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("\n");
        if (output) {
          parts.push(
            `[Tool result: ${call.input.name}${call.output.isError ? " (error)" : ""}]: ${_truncate(output)}`
          );
        }
      }
    }
  }
  return parts.join("\n\n");
}

export function createCompactionUserPrompt(
  plan: CompactionPlan,
  customInstructions?: string
): string {
  const conversation = serializeConversationForCompaction(
    plan.messagesToSummarize
  );
  const previous = plan.previousSummary
    ? `\n\n<previous-checkpoint>\n${plan.previousSummary}\n</previous-checkpoint>`
    : "";
  const focus = customInstructions?.trim()
    ? `\n\nAdditional focus: ${customInstructions.trim()}`
    : "";
  return `<conversation>\n${conversation || "(no new messages)"}\n</conversation>${previous}\n\n${plan.previousSummary ? UPDATE_COMPACTION_PROMPT : INITIAL_COMPACTION_PROMPT}${focus}`;
}

/**
 * Render the same model-facing variable snapshot as a normal thread run before
 * serializing the compacted span. Raw editor placeholders must never leak into
 * the summarizer prompt.
 */
export async function createRenderedCompactionUserPrompt({
  context,
  keepRecentTurns,
  hasMetaUserPrompt,
  customInstructions,
  ...renderOptions
}: {
  context: ThreadContext;
  keepRecentTurns: number;
  hasMetaUserPrompt?: boolean;
  customInstructions?: string;
} & PromptVariableRenderOptions): Promise<string> {
  const rendered = await renderThreadPromptVariables({
    context,
    ...renderOptions,
  });
  return createCompactionUserPrompt(
    planCompaction(rendered.context.messages ?? [], keepRecentTurns, {
      hasMetaUserPrompt,
    }),
    customInstructions
  );
}

/** Build the message list applied only after the user confirms the preview. */
export function applyCompactionPreview(
  plan: CompactionPlan,
  summary: string
): Message[] {
  const checkpoint: UserMessage = {
    id: plan.checkpointMessageId ?? uuid(),
    role: "user",
    content: [
      {
        type: "text",
        text: `${COMPACTION_REMINDER_PREFIX}${summary.trim()}${COMPACTION_REMINDER_SUFFIX}`,
      },
    ],
  };
  return [
    ...(plan.metaUserMessage ? [plan.metaUserMessage] : []),
    checkpoint,
    ...plan.keptMessages,
  ];
}

export function unwrapCompactionSummary(text: string): string {
  if (text.startsWith(COMPACTION_REMINDER_PREFIX)) {
    const content = text.slice(COMPACTION_REMINDER_PREFIX.length);
    return (content.endsWith(COMPACTION_REMINDER_SUFFIX)
      ? content.slice(0, -COMPACTION_REMINDER_SUFFIX.length)
      : content
    ).trim();
  }
  return text.startsWith(LEGACY_COMPACTION_MESSAGE_PREFIX)
    ? text.slice(LEGACY_COMPACTION_MESSAGE_PREFIX.length).trim()
    : text.trim();
}

function _truncate(text: string): string {
  if (text.length <= TOOL_RESULT_MAX_CHARS) return text;
  return `${text.slice(0, TOOL_RESULT_MAX_CHARS)}\n\n[... ${text.length - TOOL_RESULT_MAX_CHARS} more characters truncated]`;
}

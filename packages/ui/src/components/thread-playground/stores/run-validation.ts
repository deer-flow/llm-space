import { isRunnableConversation, type Message } from "@llm-space/core";

import type { RunValidationIssue } from "./run-validation-issue";

/**
 * Return actionable feedback for a message list that cannot be run.
 *
 * @param messages The messages selected for the run.
 */
export function getRunValidationIssue(
  messages: Message[]
): RunValidationIssue | null {
  const lastMessage = messages.at(-1);
  if (!lastMessage || isRunnableConversation(messages)) {
    return null;
  }
  return {
    code: "lastAssistantMessage",
    level: "warning",
    message: "Please add a user message to run",
    messageId: lastMessage.id,
    resolution: {
      type: "appendUserMessage",
    },
  };
}

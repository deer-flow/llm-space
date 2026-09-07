import { getMessageText, type ThreadContext } from "../types";

import { VARIABLE_NAME_PATTERN } from "./prompt-variables";

/**
 * The first user message is, by convention, a "meta" turn: a `<system-reminder>`
 * block injecting runtime context (date / workspace / skills) rather than a real
 * question. It has no schema flag — it's detected by content.
 */
export interface MetaUserMessageScore {
  score: number;
  isMeta: boolean;
}

export const META_USER_MESSAGE_THRESHOLD = 3;

/** Score whether the first turn is injected runtime context, not a real request. */
export function scoreMetaUserMessage(
  context: ThreadContext | undefined
): MetaUserMessageScore {
  const messages = context?.messages ?? [];
  const first = messages[0];
  if (first?.role !== "user") {
    return { score: 0, isMeta: false };
  }

  let score = messages[1]?.role === "user" ? 2 : 0;
  const text = getMessageText(first).trim();
  if (text.startsWith("<system-reminder>")) {
    score += 2;
    if (text.endsWith("</system-reminder>")) {
      score += 1;
    }
  }

  const knownNames = new Set(Object.keys(context?.variables ?? {}));
  for (const variant of Object.values(
    context?.variableVariants?.variants ?? {}
  )) {
    for (const name of Object.keys(variant)) {
      knownNames.add(name);
    }
  }
  const referencedNames = new Set<string>();
  const referenceRe = new RegExp(
    `\\{\\{\\s*(${VARIABLE_NAME_PATTERN})\\s*\\}\\}`,
    "g"
  );
  for (const match of text.matchAll(referenceRe)) {
    const name = match[1];
    if (name && knownNames.has(name)) {
      referencedNames.add(name);
    }
  }
  if (referencedNames.size > 0) {
    score += 1;
  }
  for (const name of referencedNames) {
    const variable = context?.variables?.[name];
    if (variable?.type === "skills") {
      score += 1;
      break;
    }
  }
  for (const name of referencedNames) {
    const variable = context?.variables?.[name];
    if (variable?.type === "currentDate") {
      score += 1;
      break;
    }
  }

  return { score, isMeta: score >= META_USER_MESSAGE_THRESHOLD };
}

export function isMetaUserMessage(context: ThreadContext | undefined): boolean {
  return scoreMetaUserMessage(context).isMeta;
}

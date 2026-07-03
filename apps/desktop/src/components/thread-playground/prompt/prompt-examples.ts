import {
  BookOpenTextIcon,
  BotIcon,
  BrainCircuitIcon,
  ImageIcon,
  LanguagesIcon,
  SparklesIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

import compactMemoryPrompt from "../prompts/examples/compact-memory.md?raw";
import deepWikiPrompt from "../prompts/examples/deep-wiki.md?raw";
import generalAgentPrompt from "../prompts/examples/general-agent.md?raw";
import metaImagePrompt from "../prompts/examples/meta-image-prompt.md?raw";
import metaPromptWithTools from "../prompts/examples/meta-prompt-with-tools.md?raw";
import translationPrompt from "../prompts/examples/translation.md?raw";
import metaToolPrompt from "../prompts/meta-tool.md?raw";

export interface PromptExample {
  type: "example";
  id: string;
  label: string;
  fileStem: string;
  description: string;
  content: string;
  icon: LucideIcon;
}

export type PromptExampleItem = PromptExample | { type: "separator" };

/**
 * Built-in system prompt examples used by both the system-prompt menu and the
 * empty-workspace "Start from Example" flow. `fileStem` is stable by design so
 * changing a display label never changes the default filename for new threads.
 */
export const PROMPT_EXAMPLES = [
  {
    type: "example",
    id: "general-agent",
    label: "General Agent",
    fileStem: "general-agent",
    description:
      "Broad-purpose assistant prompt with practical tool-use rules.",
    content: generalAgentPrompt,
    icon: BotIcon,
  },
  {
    type: "example",
    id: "translation",
    label: "Translation",
    fileStem: "translation",
    description: "Translator prompt focused on preserving meaning and style.",
    content: translationPrompt,
    icon: LanguagesIcon,
  },
  {
    type: "example",
    id: "deep-wiki",
    label: "Deep Wiki",
    fileStem: "deep-wiki",
    description: "Long-form knowledge-base answer prompt with sources.",
    content: deepWikiPrompt,
    icon: BookOpenTextIcon,
  },
  {
    type: "example",
    id: "compact-memory",
    label: "Compact Memory",
    fileStem: "compact-memory",
    description: "Memory compaction prompt for keeping useful context concise.",
    content: compactMemoryPrompt,
    icon: BrainCircuitIcon,
  },
  { type: "separator" },
  {
    type: "example",
    id: "meta-prompt",
    label: "Meta Prompt",
    fileStem: "meta-prompt",
    description: "Prompt-writing assistant that improves instructions.",
    content: metaPromptWithTools,
    icon: SparklesIcon,
  },
  {
    type: "example",
    id: "meta-tool",
    label: "Meta Tool",
    fileStem: "meta-tool",
    description: "Function-tool designer prompt for producing JSON schemas.",
    content: metaToolPrompt,
    icon: WrenchIcon,
  },
  {
    type: "example",
    id: "meta-image-prompt",
    label: "Meta Image Prompt",
    fileStem: "meta-image-prompt",
    description: "Prompt builder for structured image-generation briefs.",
    content: metaImagePrompt,
    icon: ImageIcon,
  },
] satisfies readonly PromptExampleItem[];

export function isPromptExample(
  item: PromptExampleItem
): item is PromptExample {
  return item.type === "example";
}

export function getPromptExample(id: string): PromptExample | undefined {
  for (const item of PROMPT_EXAMPLES) {
    if (isPromptExample(item) && item.id === id) {
      return item;
    }
  }
  return undefined;
}

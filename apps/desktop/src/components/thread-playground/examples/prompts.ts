import { uuid, type Message, type Tool } from "@llm-space/core";
import {
  BookOpenTextIcon,
  BotIcon,
  BrainCircuitIcon,
  FileIcon,
  ImageIcon,
  LanguagesIcon,
  SparklesIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

import compactMemoryPrompt from "./compact-memory.md?raw";
import deepWikiPrompt from "./deep-wiki.md?raw";
import generalAgentPrompt from "./general-agent.md?raw";
import metaImagePrompt from "./meta-image-prompt.md?raw";
import metaPromptWithTools from "./meta-prompt-with-tools.md?raw";
import metaToolPrompt from "./meta-tool.md?raw";
import { ASK_USER_QUESTION_BUILTIN_TOOL, TOOL_EXAMPLES } from "./tools";
import translationPrompt from "./translation.md?raw";

export interface PromptExample {
  type: "example";
  id: string;
  label: string;
  fileStem: string;
  description: string;
  content: string;
  icon: LucideIcon;
  /** Tools to seed the new thread with (only used by "Start from Example"). */
  tools?: Tool[];
  /** Messages to seed the new thread with (only used by "Start from Example"). */
  messages?: Message[];
}

export type PromptExampleItem = PromptExample | { type: "separator" };

/** Resolve shared tool definitions by their function `name` (not display label). */
function pickTools(names: string[]): Tool[] {
  return TOOL_EXAMPLES.filter(
    (item) => item.type === "tool" && names.includes(item.tool.name)
  )
    .map((item) => (item.type === "tool" ? item.tool : undefined))
    .filter(Boolean) as Tool[];
}

/**
 * Like {@link pickTools} but seeds the runtime `type: "builtin"` variant so the
 * tools are wired to real execution. Reuses each example's schema and preserves
 * the requested order; icons resolve by name in `getBuiltInToolIcon`.
 */
function pickBuiltInTools(names: string[]): Tool[] {
  return names
    .map((name) => {
      const item = TOOL_EXAMPLES.find(
        (entry) => entry.type === "tool" && entry.tool.name === name
      );
      return item?.type === "tool"
        ? { ...item.tool, type: "builtin" as const }
        : undefined;
    })
    .filter(Boolean) as Tool[];
}

/**
 * Built-in tool definitions mirroring the desktop runtime registry
 * (`bun/tools/built-in/{web,misc}.ts`). Seeded as `type: "builtin"` so they're
 * wired to real execution — the `Call` action looks them up by name on the bun
 * side, so names, schemas, and icons must match the registry.
 */
const HELLO_WORLD_BUILT_IN_TOOLS: Tool[] = [
  {
    type: "builtin",
    name: "web_search",
    icon: "search",
    description: "Search the web and return LLM-friendly results.",
    strict: true,
    parameters: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "The search query string to look up on the web.",
        },
        limit: {
          type: "number",
          description:
            "Maximum number of search results to return. Defaults to 5.",
        },
        includeContent: {
          type: "boolean",
          description:
            "Whether to include short markdown content snippets for each result. Defaults to false.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "builtin",
    name: "web_fetch",
    icon: "globe",
    description:
      "Fetch one webpage and return LLM-friendly readable markdown content.",
    strict: true,
    parameters: {
      type: "object",
      required: ["url"],
      properties: {
        url: {
          type: "string",
          description:
            "The URL to fetch. Must be a fully qualified URL starting with http:// or https://.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "builtin",
    name: "weather_report",
    icon: "cloud-sun",
    description: "Get today's weather report for a city.",
    strict: true,
    parameters: {
      type: "object",
      required: ["city"],
      properties: {
        city: {
          type: "string",
          description: "The city to get today's weather report for.",
        },
      },
      additionalProperties: false,
    },
  },
];

function userPrompt(text: string): Message[] {
  return [
    {
      id: uuid(),
      role: "user",
      content: [
        {
          type: "text",
          text,
        },
      ],
    },
  ];
}

/**
 * Built-in system prompt examples used by both the system-prompt menu and the
 * empty-workspace "Start from Example" flow. `fileStem` is stable by design so
 * changing a display label never changes the default filename for new threads.
 */
export const PROMPT_EXAMPLES: readonly PromptExampleItem[] = [
  {
    type: "example",
    id: "hello-world",
    label: "Hello World",
    fileStem: "hello-world",
    description: "A classic, helpful and harmless assistant.",
    content:
      "You're a helpful and harmless assistant that can help with tasks like daily work and writing code, answering questions, and more.",
    icon: FileIcon,
    tools: HELLO_WORLD_BUILT_IN_TOOLS,
    messages: userPrompt("What's the weather in Tokyo and Kyoto?"),
  },
  { type: "separator" },
  {
    type: "example",
    id: "general-agent",
    label: "General Agent",
    fileStem: "general-agent",
    description:
      "Broad-purpose assistant prompt with practical tool-use rules.",
    content: generalAgentPrompt,
    icon: BotIcon,
    tools: [
      ASK_USER_QUESTION_BUILTIN_TOOL,
      ...pickBuiltInTools([
        "web_search",
        "web_fetch",
        "ls",
        "read",
        "write",
        "skill",
        "edit",
        "grep",
        "glob",
        "bash",
      ]),
      ...pickTools(["agent"]),
      ...pickBuiltInTools(["todo_write", "present_files"]),
    ],
    messages: userPrompt(
      "Perform a deep research of the open source project DeerFlow 2.0"
    ),
  },
  {
    type: "example",
    id: "translation",
    label: "Translation",
    fileStem: "translation",
    description: "Translator prompt focused on preserving meaning and style.",
    content: translationPrompt,
    messages: userPrompt("Where there's a will, there's a way."),
    icon: LanguagesIcon,
  },
  {
    type: "example",
    id: "deep-wiki",
    label: "Deep Wiki",
    fileStem: "deep-wiki",
    description: "Long-form knowledge-base answer prompt with sources.",
    content: deepWikiPrompt,
    messages: userPrompt("Create a deep wiki for [/path/to/the/repository]"),
    icon: BookOpenTextIcon,
    tools: [...pickBuiltInTools(["read", "ls", "tree"])],
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
];

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

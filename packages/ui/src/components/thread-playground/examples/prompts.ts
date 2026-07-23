import { uuid, type Message, type Tool } from "@llm-space/core";
import type { SkillInfo } from "@llm-space/core";
import {
  BookOpenTextIcon,
  BotIcon,
  BrainCircuitIcon,
  FileIcon,
  ImageIcon,
  LanguagesIcon,
  SparklesIcon,
  TelescopeIcon,
  type LucideIcon,
} from "lucide-react";

import type { PathsHost, SkillsHost } from "@llm-space/ui/host";

/** The host capabilities needed to resolve an example's dynamic seed data. */
export interface SeedHost {
  skills: SkillsHost;
  paths: PathsHost;
}

import compactMemoryPrompt from "./compact-memory.md?raw";
import deepResearchPrompt from "./deep-research.md?raw";
import deepWikiPrompt from "./deep-wiki.md?raw";
import generalAgentPrompt from "./general-agent.md?raw";
import metaImagePrompt from "./meta-image-prompt.md?raw";
import metaPromptWithTools from "./meta-prompt-with-tools.md?raw";
import { TOOL_EXAMPLES } from "./tools";
import translationPrompt from "./translation.md?raw";

/**
 * A seed field that is either a literal value or a factory re-evaluated every
 * time a thread is created from the example. The factory form lets a field
 * depend on live state (e.g. the currently enabled skills) instead of a value
 * frozen at module load.
 */
export type Resolvable<T> = T | ((host: SeedHost) => T | Promise<T>);

/** Resolve a {@link Resolvable}, calling and awaiting the factory form. */
export async function resolveSeed<T>(
  value: Resolvable<T> | undefined,
  host: SeedHost
): Promise<T | undefined> {
  if (typeof value === "function") {
    return (value as (host: SeedHost) => T | Promise<T>)(host);
  }
  return value;
}

export interface PromptExample {
  type: "example";
  id: string;
  label: string;
  fileStem: string;
  description: string;
  content: Resolvable<string>;
  icon: LucideIcon;
  /** Tools to seed the new thread with (only used by "Start from Example"). */
  tools?: Resolvable<Tool[]>;
  /** Messages to seed the new thread with (only used by "Start from Example"). */
  messages?: Resolvable<Message[]>;
  /** Text variables to seed the new thread with. */
  textVariables?: Resolvable<Record<string, string>>;
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

/** Build one user message per text, each as its own turn. */
function userPrompts(texts: string[]): Message[] {
  return texts.map((text) => ({
    id: uuid(),
    role: "user",
    content: [{ type: "text", text }],
  }));
}

/**
 * Enabled skills across every configured discovery folder, de-duplicated by
 * name (first folder wins) and sorted. Reads live settings, so callers get the
 * current list at the moment a thread is created — not a snapshot from load.
 */
async function listEnabledSkills(skills: SkillsHost): Promise<SkillInfo[]> {
  const { discoveryPaths } = await skills.getSettings();
  const perPath = await Promise.all(
    discoveryPaths.map((entry) => skills.listSkills(entry.path))
  );
  const byName = new Map<string, SkillInfo>();
  for (const skill of perPath.flat()) {
    if (skill.enabled && !byName.has(skill.name)) {
      byName.set(skill.name, skill);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Seed the General Agent thread with a `<system-reminder>` listing the actually
 * enabled skills, followed by the user's question. Re-read on every thread
 * creation via the {@link Resolvable} factory form.
 */
async function generalAgentMessages(host: SeedHost): Promise<Message[]> {
  await listEnabledSkills(host.skills);
  const reminder = `<system-reminder>
<current-date>{{current_date}}</current_date>
<available-skills>
{{available_skills}}
</available-skills>
<workspace path="{{current_working_directory}}">
{% set agents_path = current_working_directory ~ "/AGENTS.md" %}
{% if exists(agents_path) %}
<file path="AGENTS.md" preloaded="true">
{{@include((agents_path))}}
</file>
{% endif %}
</workspace>
</system-reminder>`;
  return [
    {
      id: uuid(),
      role: "user",
      content: [{ type: "text", text: reminder }],
    },
    {
      id: uuid(),
      role: "user",
      content: [
        {
          type: "text",
          text: "Perform a deep research of Loop Engineering",
        },
      ],
    },
  ];
}

/** Resolve the General Agent's writable workspace when the example is created. */
async function generalAgentTextVariables(
  host: SeedHost
): Promise<Record<string, string>> {
  return {
    current_working_directory:
      await host.paths.ensureRootDir("tmp/deep-research"),
  };
}

/**
 * Built-in system prompt examples used by both the system-prompt menu and the
 * empty-workspace "Start from Example" flow. `fileStem` is stable by design so
 * changing a display label never changes the default filename for new threads.
 */
export const PROMPT_EXAMPLES: readonly PromptExampleItem[] = [
  {
    type: "example",
    id: "blank",
    label: "Blank - Create from scratch",
    fileStem: "untitled",
    description: "",
    content:
      "You're a helpful and harmless assistant, answering questions, and more.",
    icon: FileIcon,
    messages: userPrompt("What's the capital of France?"),
  },
  { type: "separator" },
  {
    type: "example",
    id: "general-agent",
    label: "General Agent",
    fileStem: "general-agent",
    description:
      "A [DeerFlow-like](https://github.com/bytedance/deer-flow) assistant for **coding**, **deep-research** and more.",
    content: generalAgentPrompt,
    icon: BotIcon,
    tools: [
      ...pickBuiltInTools([
        "ask_user_question",
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
        "todo_write",
        "present_files",
      ]),
      ...pickTools(["agent"]),
    ],
    messages: generalAgentMessages,
    textVariables: generalAgentTextVariables,
  },
  {
    type: "example",
    id: "deep-research",
    label: "Deep Research",
    fileStem: "deep-research",
    description:
      "A structured investigator that plans and researches a topic in depth.",
    content: deepResearchPrompt,
    icon: TelescopeIcon,
    tools: pickBuiltInTools(["web_search", "web_fetch", "todo_write"]),
    messages: userPrompts([
      "<system-reminder>\n<current-date>{{current_date}}</current-date>\n</system-reminder>",
      "What is Loop Engineering?",
    ]),
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

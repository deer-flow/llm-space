import type { BuiltinTool, Message, Thread, Tool } from "../types";
import { uuid } from "../utils";

import { validateThreadFileStem } from "./file-stem";
import { isMetaUserMessage } from "./meta-user-message";

export const SUBAGENT_TYPES = [
  "general-purpose",
  "researcher",
  "code-reviewer",
] as const;
export type SubagentType = (typeof SUBAGENT_TYPES)[number];

export interface SpawnAgentArgs {
  description: string;
  task_name: string;
  prompt: string;
  subagent_type?: SubagentType;
}

/** Host-owned context, never part of the model-facing tool arguments. */
export interface CreateSubagentThreadInput {
  parentPath: string;
  thread: Thread;
  arguments: SpawnAgentArgs;
}

export interface CreateSubagentThreadResult {
  path: string;
  status: "created";
  message: string;
}

export const SPAWN_AGENT_TOOL: BuiltinTool = {
  type: "builtin",
  name: "spawn_agent",
  icon: "bot",
  terminate: true,
  strict: true,
  description:
    "Requests a new thread for a self-contained task. This pauses the current run so the user can click Create subtask. The child inherits the system prompt, meta user prompt, model and selected tools, but no conversation history. It is saved and opened in the active tab, with its folder expanded in the sidebar, but is not executed. This tool does not return the sub-agent's work or run anything in the background.",
  parameters: {
    type: "object",
    required: ["description", "task_name", "prompt"],
    properties: {
      description: {
        type: "string",
        description: "A short (3-6 word) summary of the sub-agent's task.",
      },
      task_name: {
        type: "string",
        description:
          "A short, human-readable task title using natural capitalization and spaces, e.g. US 2026 GDP Research. The app converts it to lowercase with hyphens only when creating the filename. Do not include path separators or a .json extension.",
      },
      prompt: {
        type: "string",
        description:
          "The full, self-contained task, including all relevant context, file paths, and expected output. The child has no memory of this conversation.",
      },
      subagent_type: {
        type: "string",
        enum: [...SUBAGENT_TYPES],
        description:
          "Tool selection and task role. Defaults to general-purpose. All roles exclude the built-in spawn_agent tool.",
      },
    },
    additionalProperties: false,
  },
};

export function parseSpawnAgentArgs(value: unknown): SpawnAgentArgs {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("spawn_agent arguments must be an object.");
  }
  const args = value as Record<string, unknown>;
  if (
    Object.keys(args).some(
      (key) =>
        !["description", "task_name", "prompt", "subagent_type"].includes(key)
    )
  ) {
    throw new Error("Unknown spawn_agent argument.");
  }
  for (const key of ["description", "task_name", "prompt"] as const) {
    if (typeof args[key] !== "string" || !args[key].trim()) {
      throw new Error(`${key} must be a non-empty string.`);
    }
  }
  const name = validateThreadFileStem(args.task_name as string);
  if (!name.valid) throw new Error(name.error);
  if (name.value.endsWith(".json"))
    throw new Error("task_name must not include a .json extension.");
  const role = args.subagent_type ?? "general-purpose";
  if (!SUBAGENT_TYPES.includes(role as SubagentType)) {
    throw new Error(
      "Unknown subagent_type. Use general-purpose, researcher, or code-reviewer."
    );
  }
  return {
    description: (args.description as string).trim(),
    task_name: name.value,
    prompt: args.prompt as string,
    subagent_type: role as SubagentType,
  };
}

const READ_TOOLS = new Set([
  "read",
  "ls",
  "tree",
  "grep",
  "glob",
  "skill",
  "web_search",
  "web_fetch",
  "weather_report",
  "calculator",
  "date_difference",
  "sleep",
]);

export function filterSubagentTools(
  tools: readonly Tool[],
  role: SubagentType
): Tool[] {
  return tools.filter((tool) => {
    if (tool.type !== "builtin") return true;
    if (tool.name === "spawn_agent") return false;
    return (
      role === "general-purpose" ||
      READ_TOOLS.has(tool.name) ||
      (role === "code-reviewer" && ["bash", "exec_code"].includes(tool.name))
    );
  });
}

const ROLE_INSTRUCTIONS: Record<SubagentType, string> = {
  "general-purpose": "Complete the self-contained task described below.",
  researcher:
    "Gather evidence and cite sources. Research and report findings without modifying content.",
  "code-reviewer":
    "Review correctness, security risks, and test coverage. Prioritize actionable findings with file locations and supporting evidence. You may run checks and tests, but do not proactively fix or edit the code.",
};

/** Build fresh thread content from the current editor snapshot, not disk history. */
export function buildSubagentThread(
  parent: Thread,
  parentName: string,
  rawArgs: unknown
): Thread {
  const args = parseSpawnAgentArgs(rawArgs);
  const role = args.subagent_type ?? "general-purpose";
  const context = parent.context;
  const messages: Message[] = [];
  if (isMetaUserMessage(context) && context?.messages?.[0]) {
    messages.push({ ...structuredClone(context.messages[0]), id: uuid() });
  }
  messages.push({
    id: uuid(),
    role: "user",
    content: [
      {
        type: "text",
        text: `The following task was delegated by the parent agent based on the user's goal. It is not a verbatim message from the user. Follow the task instructions below.\n\nParent task: ${parentName}\nTask: ${args.task_name}\nRole: ${role}\nDescription: ${args.description}\n\n${ROLE_INSTRUCTIONS[role]}\n\n${args.prompt}`,
      },
    ],
  });
  return structuredClone({
    ...(parent.model ? { model: parent.model } : {}),
    ...(parent.runtimeId ? { runtimeId: parent.runtimeId } : {}),
    context: {
      ...(context?.systemPrompt !== undefined
        ? { systemPrompt: context.systemPrompt }
        : {}),
      ...(context?.variables ? { variables: context.variables } : {}),
      ...(context?.variableVariants
        ? { variableVariants: context.variableVariants }
        : {}),
      tools: filterSubagentTools(context?.tools ?? [], role),
      messages,
    },
  });
}

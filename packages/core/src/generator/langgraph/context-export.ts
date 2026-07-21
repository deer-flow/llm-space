import { getMessageText, type Message, type ThreadContext, type Tool } from "../../types";

/** A single file to write, as a project-relative path + contents. */
export interface ExportFile {
  path: string;
  contents: string;
}

/** How many leading messages we export as reference (the plan's first turns). */
export const EXPORTED_MESSAGE_COUNT = 5;

/**
 * The first user message is, by convention, a "meta" turn: a `<system-reminder>`
 * block injecting runtime context (date / workspace / skills) rather than a real
 * question. It has no schema flag — it's detected by content.
 */
export function isMetaUserMessage(message: Message | undefined): boolean {
  if (message?.role !== "user") {
    return false;
  }
  return getMessageText(message).trimStart().startsWith("<system-reminder>");
}

/** Filesystem-safe slug for a tool's `references/tools/<slug>.json` filename. */
export function slugifyToolName(name: string): string {
  return name.replace(/[^A-Za-z0-9_.-]+/g, "_") || "tool";
}

/** JSON metadata for one tool, tagged by kind so the plan can branch on it. */
function _toolExport(tool: Tool): unknown {
  const base = {
    name: tool.name,
    type: tool.type,
    description: tool.description,
    parameters: tool.parameters,
  };
  if (tool.type === "mcp") {
    return {
      ...base,
      mcp: {
        serverId: tool.serverId,
        serverName: tool.serverName,
        toolName: tool.toolName,
      },
    };
  }
  return base;
}

/**
 * Build the `references/` export the PLAN step (and any coding agent) reads:
 * the rendered system prompt, per-tool JSON, the first messages, and the
 * variable definitions. `rendered` carries the model-facing strings; `context`
 * the raw tool + variable metadata.
 */
export function buildContextExports(
  context: ThreadContext,
  rendered: ThreadContext
): ExportFile[] {
  const files: ExportFile[] = [];

  files.push({
    path: "references/system-prompt.md",
    contents: `${rendered.systemPrompt ?? ""}\n`,
  });

  // Built-in tools are copied into the project as real code (not references),
  // so only custom (function) and MCP tools need their JSON here.
  const tools = (context.tools ?? []).filter((t) => t.type !== "builtin");
  for (const tool of tools) {
    files.push({
      path: `references/tools/${slugifyToolName(tool.name)}.json`,
      contents: `${JSON.stringify(_toolExport(tool), null, 2)}\n`,
    });
  }

  const messages = (rendered.messages ?? []).slice(0, EXPORTED_MESSAGE_COUNT);
  messages.forEach((message, index) => {
    const seq = String(index + 1).padStart(2, "0");
    const meta = index === 0 && isMetaUserMessage(message) ? " (meta)" : "";
    files.push({
      path: `references/messages/${seq}-${message.role}.md`,
      contents: `<!-- role: ${message.role}${meta} -->\n\n${getMessageText(
        message
      )}\n`,
    });
  });

  files.push({
    path: "references/variables.json",
    contents: `${JSON.stringify(
      {
        variables: context.variables ?? {},
        variableVariants: context.variableVariants ?? null,
      },
      null,
      2
    )}\n`,
  });

  return files;
}

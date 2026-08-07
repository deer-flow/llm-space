import type {
  PluginToolContext,
  PluginToolExtension,
} from "@llm-space/core";

export default class ReadWorkspaceNoteTool implements PluginToolExtension {
  name = "atlas_read_workspace_note";
  description = "Read a UTF-8 note below the configured Atlas notes directory.";
  parameters = {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path below the Atlas notes directory.",
      },
      maxChars: {
        type: "integer",
        minimum: 1,
        maximum: 50000,
        default: 12000,
      },
    },
    required: ["path"],
    additionalProperties: false,
  } as const;
  strict = true;

  async execute(
    context: PluginToolContext,
    args: Record<string, unknown>
  ) {
    const relativePath = _safeRelativePath(
      typeof args.path === "string" ? args.path : ""
    );
    const requestedMaxChars = Number(args.maxChars ?? 12000);
    if (!Number.isInteger(requestedMaxChars) || requestedMaxChars < 1) {
      throw new Error("maxChars must be a positive integer.");
    }
    const maxChars = Math.min(requestedMaxChars, 50000);
    const configuredDirectory = context.settings.notesDirectory;
    const directory = _safeRelativePath(
      typeof configuredDirectory === "string" ? configuredDirectory : "atlas"
    );
    const path = `${directory}/${relativePath}`;
    const content = await context.readWorkspaceFile(path);

    return {
      path,
      content: content.slice(0, maxChars),
      truncated: content.length > maxChars,
    };
  }
}

function _safeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.split("/").includes("..")) {
    throw new Error("path must stay inside the Atlas notes directory.");
  }
  return normalized;
}

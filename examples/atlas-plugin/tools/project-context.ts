import type {
  JsonValue,
  PluginToolContext,
  PluginToolExtension,
} from "@llm-space/core";

export default class ProjectContextTool implements PluginToolExtension {
  name = "atlas_project_context";
  description =
    "Read the Atlas project, team, owning Thread, and resolved Prompt Variables.";
  parameters = {
    type: "object",
    properties: {
      includeVariables: {
        type: "boolean",
        description: "Include resolved Prompt Variables in the result.",
        default: false,
      },
    },
    additionalProperties: false,
  } as const;
  strict = true;

  execute(
    context: PluginToolContext,
    args: Record<string, unknown>
  ): JsonValue {
    const includeVariables = args.includeVariables === true;
    const variables = structuredClone(context.variables) as Record<
      string,
      JsonValue
    >;
    return {
      team: context.settings.teamName ?? null,
      project: context.settings.projectName ?? null,
      threadTitle: context.thread.title ?? null,
      workingDirectory: variables.current_working_directory ?? null,
      variables: includeVariables ? variables : null,
    };
  }
}

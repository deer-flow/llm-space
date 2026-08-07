import type {
  PluginCommandContext,
  PluginCommandExtension,
} from "@llm-space/core";

export default class CreateProjectBriefCommand
  implements PluginCommandExtension
{
  displayName = "Create project brief";
  description = "Create a Markdown project brief in the LLM Space workspace.";

  async execute(context: PluginCommandContext, args: readonly string[]) {
    const configuredProject = _stringSetting(
      context.settings.projectName,
      "Project Atlas"
    );
    const project = args.join(" ").trim() || configuredProject;
    const slug = _slug(project);
    if (!slug) {
      return context.createResult({
        level: "warning",
        message: "Provide a project name, for example: create-project-brief Atlas Web",
      });
    }

    const directory = _workspaceDirectory(context.settings.notesDirectory);
    const path = `${directory}/${slug}-brief.md`;
    await context.report({
      phase: "writing",
      message: `Writing ${path}…`,
    });

    const team = _stringSetting(context.settings.teamName, "Example Team");
    const source = context.activeTab
      ? `Thread: ${context.activeTab.filename}`
      : "Thread: none";
    const content = [
      `# ${project}`,
      "",
      `- Team: ${team}`,
      `- ${source}`,
      `- Created: ${new Date().toISOString()}`,
      "",
      "## Objective",
      "",
      "Describe the outcome this project should achieve.",
      "",
      "## Constraints",
      "",
      "- Add known constraints here.",
      "",
      "## Next actions",
      "",
      "- [ ] Confirm the owner.",
      "- [ ] Define the first measurable milestone.",
      "",
    ].join("\n");

    await context.writeWorkspaceFile(path, content);
    await context.executeHostCommand("refreshTree");

    return context.createResult({
      level: "success",
      message: `Created ${path}.`,
    });
  }
}

function _slug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function _workspaceDirectory(value: unknown): string {
  const directory = _stringSetting(value, "atlas").replace(
    /^\/+|\/+$/g,
    ""
  );
  if (!directory || directory.split("/").includes("..")) {
    throw new Error("notesDirectory must be a workspace-relative directory.");
  }
  return directory;
}

function _stringSetting(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

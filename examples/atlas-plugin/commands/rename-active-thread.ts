import type {
  PluginCommandContext,
  PluginCommandExtension,
} from "@llm-space/core";

export default class RenameActiveThreadCommand
  implements PluginCommandExtension
{
  displayName = "Rename active Thread";
  description = "Prefix the active Thread title with a project or custom label.";

  async execute(context: PluginCommandContext, args: readonly string[]) {
    if (!context.activeTab) {
      return context.createResult({
        level: "warning",
        message: "Open a Thread before running this Command.",
      });
    }

    const fallback =
      typeof context.settings.projectName === "string"
        ? context.settings.projectName
        : "Atlas";
    const prefix = args.join(" ").trim() || fallback;
    await context.report({
      phase: "preparing",
      message: `Preparing ${context.activeTab.filename}…`,
    });

    const nextThread = structuredClone(context.activeTab.thread);
    const currentTitle = nextThread.title?.trim() || "Untitled Thread";
    nextThread.title = `[${prefix}] ${currentTitle}`;
    await context.activeTab.writeThread(nextThread);

    return context.createResult({
      level: "success",
      message: `Renamed ${context.activeTab.filename}.`,
    });
  }
}

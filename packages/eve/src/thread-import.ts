import path from "node:path";

import { uuid, type Thread } from "@llm-space/core";

import { readEveInstructions } from "./instructions";
import { detectEveProject } from "./project";
import { listEveProjectSkills } from "./skills";
import { createScopedSkillTool, listEveProjectTools } from "./tools";
import type {
  EveProjectDetection,
  EveProjectImportOptions,
  EveProjectImportResult,
  EveSkillInfo,
} from "./types";

/**
 * Import an Eve project into a native LLM Space thread. Tool descriptors are
 * read from the actual `defineTool()` export, not inferred from source text.
 */
export async function importEveProjectToThread(
  options: EveProjectImportOptions
): Promise<EveProjectImportResult> {
  const project = detectEveProject(options.projectRoot);
  const diagnostics = [...project.diagnostics];
  if (!project.ok) {
    throw new Error(diagnostics[0]?.message ?? "Invalid Eve project.");
  }

  const skills = await listEveProjectSkills(project.projectRoot, {
    diagnostics,
  });
  const tools = project.toolsDir
    ? await listEveProjectTools(project.projectRoot, project.toolsDir, diagnostics)
    : [];
  if (skills.length > 0 && !tools.some((tool) => tool.name === "skill")) {
    tools.push(createScopedSkillTool(project.projectRoot));
  } else if (skills.length > 0) {
    diagnostics.push({
      level: "warning",
      code: "skill_tool_name_conflict",
      message:
        'Project has skills but also defines a "skill" tool; the project tool was kept and Eve skill loading was not added.',
      filePath: project.skillsDir,
    });
  }

  const systemPrompt = await _readSystemPrompt(project, skills, diagnostics);
  const thread: Thread = {
    title: `Eve: ${path.basename(project.projectRoot)}`,
    context: {
      ...(systemPrompt ? { systemPrompt } : {}),
      tools,
      eve: {
        projectRoot: project.projectRoot,
        source: options.source ?? "manual",
      },
      messages: [
        { id: uuid(), role: "user", content: [{ type: "text", text: "" }] },
      ],
    },
  };

  return { thread, diagnostics, project };
}

async function _readSystemPrompt(
  project: EveProjectDetection,
  skills: EveSkillInfo[],
  diagnostics: EveProjectImportResult["diagnostics"]
): Promise<string | undefined> {
  const parts: string[] = [];
  const instructions = await readEveInstructions(project, diagnostics);
  if (instructions) {
    parts.push(instructions);
  }
  if (skills.length > 0) {
    parts.push(
      [
        "<available-skills>",
        "{{available_skills}}",
        "</available-skills>",
        "",
        "Use the `skill` tool to load a listed skill before applying it. Only skills from this Eve project are available.",
      ].join("\n")
    );
  }
  return parts.filter(Boolean).join("\n\n") || undefined;
}

import { readFileSync } from "node:fs";
import path from "node:path";

import { moduleUrl } from "./path-utils";
import type {
  EveDiagnostic,
  EveInstructionsDefinition,
  EveProjectDetection,
} from "./types";

export const INSTRUCTIONS_CANDIDATES = [
  "instructions.md",
  "instructions.mdx",
  "instructions.txt",
  "instructions.ts",
  "instructions.tsx",
  "instructions.js",
  "instructions.mjs",
  "instructions.mts",
] as const;

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".mts"]);

/**
 * Read Eve instructions from markdown/text files or a `defineInstructions()`
 * module export. The module path is imported directly; source text is never
 * parsed or inferred.
 */
export async function readEveInstructions(
  project: EveProjectDetection,
  diagnostics: EveDiagnostic[]
): Promise<string | undefined> {
  if (!project.instructionsPath) {
    return undefined;
  }

  const extension = path.extname(project.instructionsPath);
  if (!CODE_EXTENSIONS.has(extension)) {
    return readFileSync(project.instructionsPath, "utf8").trim();
  }

  try {
    const mod = (await import(moduleUrl(project.instructionsPath))) as {
      default?: unknown;
    };
    const definition = _asInstructionsDefinition(mod.default);
    if (!definition) {
      diagnostics.push({
        level: "warning",
        code: "unsupported_instructions_export",
        message:
          "Eve instructions module did not default-export a defineInstructions() object with markdown.",
        filePath: project.instructionsPath,
      });
      return undefined;
    }
    return definition.markdown.trim();
  } catch (error) {
    diagnostics.push({
      level: "warning",
      code: "instructions_import_failed",
      message: `Could not import Eve instructions: ${
        error instanceof Error ? error.message : String(error)
      }`,
      filePath: project.instructionsPath,
    });
    return undefined;
  }
}

function _asInstructionsDefinition(
  value: unknown
): EveInstructionsDefinition | null {
  return value !== null &&
    typeof value === "object" &&
    "markdown" in value &&
    typeof value.markdown === "string"
    ? (value as EveInstructionsDefinition)
    : null;
}

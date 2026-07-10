import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { type Thread } from "@llm-space/core";
import { getLlmSpaceHomePath } from "@llm-space/core/server";
import { importEveProjectToThread, type EveDiagnostic } from "@llm-space/eve";

const ENV_PROJECT_ROOT = "LLM_SPACE_EVE_PROJECT_ROOT";
const ENV_THREAD_PATH = "LLM_SPACE_EVE_THREAD_PATH";

/**
 * Seed an Eve development thread from `LLM_SPACE_EVE_PROJECT_ROOT`. This is a
 * local-dev bridge, not a user-facing import flow: it makes the project visible
 * in the workspace and refreshes the generated thread on startup.
 */
export async function seedEveDevThreadFromEnv(): Promise<void> {
  const projectRoot = process.env[ENV_PROJECT_ROOT]?.trim();
  if (!projectRoot) {
    return;
  }

  const workspace = path.join(getLlmSpaceHomePath(), "workspace");
  mkdirSync(workspace, { recursive: true });

  const target = _targetThreadPath(workspace, projectRoot);
  const result = await importEveProjectToThread({ projectRoot, source: "env" });
  const thread = _mergeExistingEnvThread(target, projectRoot, result.thread);
  writeFileSync(target, `${JSON.stringify(thread, null, 2)}\n`, "utf8");
  _logImportResult(target, result.diagnostics);
}

function _targetThreadPath(workspace: string, projectRoot: string): string {
  const configured = process.env[ENV_THREAD_PATH]?.trim();
  if (configured) {
    return _workspacePath(workspace, configured);
  }

  const basename = _safeFileStem(path.basename(projectRoot)) || "eve-project";
  const preferred = path.join(workspace, `${basename}.eve.json`);
  if (_canOverwrite(preferred, projectRoot)) {
    return preferred;
  }

  const existingEnvThread = readdirSync(workspace)
    .filter((entry) => entry.endsWith(".eve.json"))
    .map((entry) => path.join(workspace, entry))
    .find((filePath) => _isEnvThreadForProject(filePath, projectRoot));
  if (existingEnvThread) {
    return existingEnvThread;
  }

  const siblings = new Set(readdirSync(workspace).map((entry) => entry));
  let index = 1;
  while (siblings.has(`${basename}-${index}.eve.json`)) {
    index += 1;
  }
  return path.join(workspace, `${basename}-${index}.eve.json`);
}

function _workspacePath(workspace: string, inputPath: string): string {
  const relative = path.posix.normalize(`/${inputPath}`).slice(1);
  const target = path.resolve(workspace, relative);
  if (target !== workspace && !target.startsWith(workspace + path.sep)) {
    throw new Error(`${ENV_THREAD_PATH} escapes the workspace.`);
  }
  return target.endsWith(".json") ? target : `${target}.json`;
}

function _canOverwrite(filePath: string, projectRoot: string): boolean {
  if (!existsSync(filePath)) {
    return true;
  }
  return _isEnvThreadForProject(filePath, projectRoot);
}

function _isEnvThreadForProject(
  filePath: string,
  projectRoot: string
): boolean {
  try {
    const parsed = _readThread(filePath);
    return _isEnvThread(parsed, projectRoot);
  } catch {
    return false;
  }
}

function _mergeExistingEnvThread(
  filePath: string,
  projectRoot: string,
  imported: Thread
): Thread {
  if (!existsSync(filePath)) {
    return imported;
  }
  try {
    const existing = _readThread(filePath);
    if (!_isEnvThread(existing, projectRoot)) {
      return imported;
    }
    return {
      ...imported,
      title: existing.title ?? imported.title,
      model: existing.model ?? imported.model,
      runHistory: existing.runHistory,
      evaluations: existing.evaluations,
      context: {
        ...existing.context,
        ...imported.context,
        messages: existing.context?.messages ?? imported.context?.messages,
        variables: existing.context?.variables ?? imported.context?.variables,
        variableVariants:
          existing.context?.variableVariants ??
          imported.context?.variableVariants,
        snapshot: existing.context?.snapshot ?? imported.context?.snapshot,
      },
    };
  } catch {
    return imported;
  }
}

function _readThread(filePath: string): Thread {
  return JSON.parse(readFileSync(filePath, "utf8")) as Thread;
}

function _isEnvThread(thread: Thread, projectRoot: string): boolean {
  return (
    thread.context?.eve?.source === "env" &&
    thread.context.eve.projectRoot === projectRoot
  );
}

function _safeFileStem(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function _logImportResult(
  filePath: string,
  diagnostics: EveDiagnostic[]
): void {
  const relative = path.relative(
    path.join(getLlmSpaceHomePath(), "workspace"),
    filePath
  );
  console.info(
    `[eve] Imported ${process.env[ENV_PROJECT_ROOT]} -> workspace/${relative}`
  );
  for (const diagnostic of diagnostics) {
    const prefix = diagnostic.level === "error" ? "error" : diagnostic.level;
    console.info(`[eve] ${prefix}: ${diagnostic.code}: ${diagnostic.message}`);
  }
}

await seedEveDevThreadFromEnv();

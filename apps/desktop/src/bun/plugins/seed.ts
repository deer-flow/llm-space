import type { Thread, ThreadPluginContext } from "@llm-space/core";

import { localFs } from "../storage";

import { pluginManager } from "./index";

/**
 * Run explicit development seeders after plugin discovery and write their
 * imported Threads through the normal workspace storage contract.
 */
export async function seedPluginDevelopmentSources(): Promise<void> {
  const seeded = await pluginManager.runDevelopmentSeeders(process.env);
  for (const source of seeded) {
    const target = await _targetPath(
      source.pluginId,
      source.result.contexts,
      source.workspacePath,
      source.result.suggestedWorkspaceFileName
    );
    const thread = await _mergeExisting(
      target,
      source.pluginId,
      source.result.contexts,
      source.result.thread
    );
    await localFs.write(target, thread);
    console.info(`[plugin:${source.pluginId}] Seeded workspace/${target}`);
  }
}

async function _targetPath(
  pluginId: string,
  contexts: ThreadPluginContext[],
  configuredPath: string | undefined,
  suggestedName: string | undefined
): Promise<string> {
  if (configuredPath) {
    return _normalizeWorkspacePath(configuredPath);
  }

  const nodes = await localFs.ls("");
  const files = nodes
    .filter((node) => node.type === "file" && node.path.endsWith(".json"))
    .map((node) => node.path);
  for (const filePath of files) {
    try {
      const existing = await localFs.read(filePath);
      if (_ownsSeed(existing, pluginId, contexts)) {
        return filePath;
      }
    } catch {
      // Ignore unrelated invalid JSON files while looking for a prior seed.
    }
  }

  const preferred = _normalizeWorkspacePath(
    suggestedName ?? `${pluginId}.json`
  );
  if (!files.includes(preferred)) {
    return preferred;
  }
  const extensionIndex = preferred.lastIndexOf(".json");
  const stem = preferred.slice(0, extensionIndex);
  let index = 1;
  while (files.includes(`${stem}-${index}.json`)) {
    index += 1;
  }
  return `${stem}-${index}.json`;
}

async function _mergeExisting(
  path: string,
  pluginId: string,
  contexts: ThreadPluginContext[],
  imported: Thread
): Promise<Thread> {
  try {
    const existing = await localFs.read(path);
    if (!_ownsSeed(existing, pluginId, contexts)) {
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

function _ownsSeed(
  thread: Thread,
  pluginId: string,
  contexts: ThreadPluginContext[]
): boolean {
  const contextIds = new Set(contexts.map((context) => context.contextId));
  return (thread.context?.plugins ?? []).some(
    (context) =>
      context.pluginId === pluginId && contextIds.has(context.contextId)
  );
}

function _normalizeWorkspacePath(input: string): string {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (
    !normalized ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Plugin development workspace path is invalid.");
  }
  return normalized.endsWith(".json") ? normalized : `${normalized}.json`;
}

await seedPluginDevelopmentSources();

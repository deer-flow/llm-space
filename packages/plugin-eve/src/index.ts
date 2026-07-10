import path from "node:path";

import { uuid, type Thread, type ThreadPluginContext } from "@llm-space/core";
import {
  createStablePluginContextId,
  definePlugin,
  type PluginContext,
  type PluginDevelopmentSeeder,
  type PluginDiagnostic,
  type PluginSkillProvider,
  type PluginSourceImporter,
  type PluginToolDescriptor,
  type PluginToolProvider,
} from "@llm-space/plugin-api";

import {
  callEveTool,
  detectEveProject,
  importEveProject,
  listEveProjectSkills,
  readEveProjectSkill,
  type EveDiagnostic,
  type EveToolDescriptor,
} from "./eve";

const PLUGIN_ID = "llm-space.eve";
const SOURCE_IMPORTER_ID = "eve.project";
const TOOL_PROVIDER_ID = "eve.tools";
const SKILL_PROVIDER_ID = "eve.skills";
const DEVELOPMENT_SEEDER_ID = "eve.development";
const CONTEXT_SCHEMA_VERSION = 1;
const ENV_PROJECT_ROOT = "LLM_SPACE_EVE_PROJECT_ROOT";
const ENV_THREAD_PATH = "LLM_SPACE_EVE_THREAD_PATH";

const sourceImporter: PluginSourceImporter<Thread> = {
  probe(source) {
    const project = detectEveProject(source.path);
    return Promise.resolve({
      confidence: project.ok ? 1 : 0,
      diagnostics: _diagnostics(project.diagnostics, SOURCE_IMPORTER_ID),
    });
  },

  async importSource(source) {
    const imported = await importEveProject({
      projectRoot: source.path,
      source: source.origin === "environment" ? "env" : "manual",
    });
    const pluginContext = _createContext(
      imported.project.projectRoot,
      source.origin === "environment" ? "env" : "manual"
    );
    const thread: Thread = {
      title: imported.title,
      context: {
        ...(imported.systemPrompt
          ? { systemPrompt: imported.systemPrompt }
          : {}),
        tools: imported.tools.map((tool) =>
          _pluginTool(
            tool,
            imported.project.projectRoot,
            pluginContext.contextId
          )
        ),
        plugins: [pluginContext],
        messages: [
          { id: uuid(), role: "user", content: [{ type: "text", text: "" }] },
        ],
      },
    };
    return {
      thread,
      contexts: [pluginContext],
      diagnostics: _diagnostics(imported.diagnostics, SOURCE_IMPORTER_ID),
      suggestedWorkspaceFileName: `${_safeFileStem(path.basename(imported.project.projectRoot)) || "eve-project"}.eve.json`,
    };
  },
};

const toolProvider: PluginToolProvider = {
  async listTools(context) {
    const imported = await importEveProject({
      projectRoot: _projectRoot(context),
      source: _source(context),
    });
    return imported.tools.map((tool) =>
      _toolDescriptor(tool, imported.project.projectRoot)
    );
  },

  async callTool(input, operation) {
    const context = _requiredContext(input.context);
    const projectRoot = _projectRoot(context);
    const reference = _parseToolRef(input.toolRef);
    const result = await callEveTool({
      projectRoot,
      runtime: reference.runtime,
      toolName: reference.toolName,
      ...(reference.toolPath
        ? { toolPath: path.resolve(projectRoot, reference.toolPath) }
        : {}),
      arguments: input.arguments,
      abortSignal: operation.signal,
    });
    return {
      contentText: result.contentText,
      isError: result.isError ?? false,
    };
  },
};

const skillProvider: PluginSkillProvider = {
  async listSkills(context) {
    const skills = await listEveProjectSkills(_projectRoot(context));
    return skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      resourceRef: skill.name,
    }));
  },

  async readSkill({ context, resourceRef }) {
    const skill = await readEveProjectSkill(_projectRoot(context), resourceRef);
    return skill
      ? {
          name: resourceRef,
          content: skill.content,
          basePath: skill.path,
        }
      : null;
  },
};

const developmentSeeder: PluginDevelopmentSeeder = {
  seed(env) {
    const projectRoot = env[ENV_PROJECT_ROOT]?.trim();
    if (!projectRoot) {
      return Promise.resolve([]);
    }
    const workspacePath = env[ENV_THREAD_PATH]?.trim();
    return Promise.resolve([
      {
        sourceImporterId: SOURCE_IMPORTER_ID,
        source: { kind: "path", path: projectRoot, origin: "environment" },
        ...(workspacePath ? { workspacePath } : {}),
      },
    ]);
  },
};

const plugin = definePlugin<Thread>({
  activate(registrar) {
    registrar.registerSourceImporter(SOURCE_IMPORTER_ID, sourceImporter);
    registrar.registerToolProvider(TOOL_PROVIDER_ID, toolProvider);
    registrar.registerSkillProvider(SKILL_PROVIDER_ID, skillProvider);
    registrar.registerDevelopmentSeeder(
      DEVELOPMENT_SEEDER_ID,
      developmentSeeder
    );
  },

  migrateContext(context) {
    if (context.schemaVersion > CONTEXT_SCHEMA_VERSION) {
      throw new Error(
        `Eve plugin context schema ${context.schemaVersion} is newer than supported schema ${CONTEXT_SCHEMA_VERSION}.`
      );
    }
    return { ...context, schemaVersion: CONTEXT_SCHEMA_VERSION };
  },
});

export default plugin;
export { plugin };

function _createContext(
  projectRoot: string,
  source: "env" | "manual"
): ThreadPluginContext {
  return {
    contextId: createStablePluginContextId("eve-project", projectRoot),
    pluginId: PLUGIN_ID,
    sourceId: SOURCE_IMPORTER_ID,
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    label: path.basename(projectRoot) || "Eve project",
    data: { projectRoot, source },
    toolProviderId: TOOL_PROVIDER_ID,
    skillProviderId: SKILL_PROVIDER_ID,
  };
}

function _pluginTool(
  tool: EveToolDescriptor,
  projectRoot: string,
  contextId: string
) {
  return {
    type: "plugin" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as Record<string, unknown>,
    ...(tool.strict === undefined ? {} : { strict: tool.strict }),
    pluginId: PLUGIN_ID,
    providerId: TOOL_PROVIDER_ID,
    toolRef: _toolRef(tool, projectRoot),
    contextId,
  };
}

function _toolDescriptor(
  tool: EveToolDescriptor,
  projectRoot: string
): PluginToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as Record<string, unknown>,
    ...(tool.strict === undefined ? {} : { strict: tool.strict }),
    toolRef: _toolRef(tool, projectRoot),
  };
}

function _toolRef(tool: EveToolDescriptor, projectRoot: string): string {
  if (tool.runtime === "skill") {
    return "skill";
  }
  if (tool.toolPath) {
    const relative = path.relative(projectRoot, tool.toolPath);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      return `tool:${relative.split(path.sep).join("/")}`;
    }
  }
  return `tool:${tool.toolName}`;
}

function _parseToolRef(toolRef: string): {
  runtime: "tool" | "skill";
  toolName: string;
  toolPath?: string;
} {
  if (toolRef === "skill") {
    return { runtime: "skill", toolName: "skill" };
  }
  const ref = toolRef.startsWith("tool:") ? toolRef.slice(5) : toolRef;
  if (!ref) {
    throw new Error("Eve tool reference is empty.");
  }
  const toolName = path.basename(ref, path.extname(ref));
  return ref.includes("/") || path.extname(ref)
    ? { runtime: "tool", toolName, toolPath: ref }
    : { runtime: "tool", toolName };
}

function _requiredContext(context: PluginContext | undefined): PluginContext {
  if (!context) {
    throw new Error("Eve tool call is missing its plugin context.");
  }
  return context;
}

function _projectRoot(context: PluginContext): string {
  if (context.pluginId !== PLUGIN_ID) {
    throw new Error("Eve provider received a context owned by another plugin.");
  }
  const projectRoot = context.data.projectRoot;
  if (typeof projectRoot !== "string" || !projectRoot) {
    throw new Error("Eve plugin context is missing projectRoot.");
  }
  return projectRoot;
}

function _source(context: PluginContext): "env" | "manual" {
  return context.data.source === "env" ? "env" : "manual";
}

function _diagnostics(
  diagnostics: EveDiagnostic[],
  contributionId: string
): PluginDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    pluginId: PLUGIN_ID,
    contributionId,
    severity: diagnostic.level,
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.filePath
      ? { metadata: { filePath: diagnostic.filePath } }
      : {}),
  }));
}

function _safeFileStem(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

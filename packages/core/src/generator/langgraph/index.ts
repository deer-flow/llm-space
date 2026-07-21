import {
  DEFAULT_SEARCH_SETTINGS,
  type BuiltinTool,
  type FunctionTool,
  type McpTool,
  type SearchSettings,
} from "../../types";
import type {
  GeneratorDefinition,
  GeneratorResult,
  GeneratorModelInfo,
  GeneratorSkill,
} from "../types";

import { buildContextExports } from "./context-export";
import {
  agentPy,
  applyTemplatePy,
  createModelPy,
  envExample,
  envFile,
  functionToolStub,
  gitignore,
  langgraphJson,
  literalApiKey,
  mcpEnvEntries,
  mcpModule,
  modelDependency,
  planMd,
  pyInit,
  readme,
  skillToolPy,
  toPyIdent,
  variablesPy,
  type AgentToolRef,
} from "./templates";
import {
  builtinPipDeps,
  hasBuiltinToolSource,
  builtinToolSource,
  TEMPLATED_BUILTIN_TOOLS,
  WEB_TOOL_NAMES,
} from "./tools";

/**
 * uv install steps run in order after `uv init`. The chat-model package
 * (`langchain-openai` / `langchain-deepseek`) plus any per-tool extras
 * (`requests`, `langchain-mcp-adapters`) are appended.
 */
function _uvSteps(modelPackage: string, extraDeps: string[]): string[][] {
  return [
    // Pin the interpreter — LangGraph + the deps below want a modern Python.
    ["init", "--no-workspace", "--python", "3.12"],
    ["add", "langchain", "langgraph", "jinja2", modelPackage, ...extraDeps],
    ["add", "--dev", "langgraph-cli[inmem]"],
  ];
}

/** Source for a built-in tool generated (not copied) from the user's config. */
function _templatedBuiltinSource(
  name: string,
  skills: GeneratorSkill[]
): string {
  if (name === "skill") {
    return skillToolPy(skills);
  }
  return builtinToolSource(name) ?? "";
}

/** Whether any of the model's/search's keys are literals worth writing to .env. */
function _hasLiteralSecret(
  modelInfo: GeneratorModelInfo,
  search: SearchSettings | undefined
): boolean {
  if (literalApiKey(modelInfo) !== null) {
    return true;
  }
  if (!search) {
    return false;
  }
  return [search.firecrawlApiKey, search.tavilyApiKey, search.braveApiKey].some(
    (v) => v && !v.startsWith("$")
  );
}

/**
 * The LangGraph (Python) generator. Deterministically scaffolds a runnable uv
 * project: a model factory, the rendered prompt, the real built-in tools, stubs
 * for custom function tools, an MCP scaffold, and the assembled agent. Custom
 * tools + MCP tools are also exported to `references/`, and a short, deterministic
 * `PLAN.md` lists whatever is left to finish. Makes no LLM call.
 */
export const langgraphGenerator: GeneratorDefinition = {
  id: "langgraph",
  label: "LangGraph (Python)",
  async run(workflow, input): Promise<GeneratorResult | null> {
    const {
      capabilities: caps,
      context,
      rendered,
      model,
      modelInfo,
      systemPromptTemplate,
      skills,
      renderedVariableValues,
      targetDir: dir,
    } = input;

    const written: string[] = [];
    const write = async (path: string, contents: string): Promise<void> => {
      await caps.writeFile(dir, path, contents);
      written.push(path);
    };

    // Partition the thread's tools by kind.
    const tools = context.tools ?? [];
    const functionTools = tools.filter(
      (t): t is FunctionTool => t.type === "function"
    );
    const mcpTools = tools.filter((t): t is McpTool => t.type === "mcp");
    const builtinTools = tools.filter(
      (t): t is BuiltinTool => t.type === "builtin"
    );
    // Resolve the thread's MCP tools to their server configs (from settings, via
    // the host) so we can emit a real MCP_SERVERS — not a TODO scaffold.
    const usedServerIds = new Set(mcpTools.map((t) => t.serverId));
    const mcpServers = (input.mcpServers ?? []).filter((s) =>
      usedServerIds.has(s.id)
    );
    const mcpAllowedTools = mcpTools.map((t) => t.toolName);
    const mcpEnv = mcpEnvEntries(mcpServers);
    // Only built-ins we ship a Python implementation for are copied in.
    const builtinIncluded = builtinTools.filter((t) =>
      hasBuiltinToolSource(t.name)
    );
    for (const t of builtinTools) {
      if (!hasBuiltinToolSource(t.name)) {
        workflow.log(`Skipping unknown built-in tool: ${t.name}`);
      }
    }
    const hasMcp = mcpTools.length > 0;
    if (hasMcp && mcpServers.length === 0) {
      workflow.log(
        "MCP tools present but no server configs resolved — src/tools/mcp.py will have an empty MCP_SERVERS"
      );
    }

    // The web tools read the user's search settings; only ship the search block
    // when they're present, filling literal keys when the host provided them.
    const webToolsPresent = builtinIncluded.some((t) =>
      (WEB_TOOL_NAMES as readonly string[]).includes(t.name)
    );
    const search: SearchSettings | undefined = webToolsPresent
      ? (input.searchInfo ?? DEFAULT_SEARCH_SETTINGS)
      : undefined;

    workflow.phase("Scaffold");
    const uv = await caps.checkUv();
    if (uv.installed) {
      const extraDeps = [
        ...builtinPipDeps(builtinIncluded.map((t) => t.name)),
        ...(hasMcp ? ["langchain-mcp-adapters"] : []),
      ];
      for (const args of _uvSteps(modelDependency(modelInfo), extraDeps)) {
        workflow.log(`uv ${args.join(" ")}`);
        await caps.runUv(dir, args);
      }
      // `uv init` drops a placeholder `main.py`; our entrypoint is the agent.
      await caps.removeFile(dir, "main.py");
    } else {
      workflow.log("uv not found — skipping dependency install");
    }

    workflow.phase("Write project");
    await write("langgraph.json", langgraphJson(hasMcp));
    // Overwrite uv init's minimal .gitignore with a fuller Python + LangGraph one.
    await write(".gitignore", gitignore());
    await write(".env.example", envExample(model, modelInfo, search, mcpEnv));
    if (_hasLiteralSecret(modelInfo, search)) {
      await write(".env", envFile(model, modelInfo, search));
    }
    await write("README.md", readme());

    await write("src/__init__.py", pyInit());
    await write("src/models/__init__.py", pyInit());
    await write("src/models/create_model.py", createModelPy(model, modelInfo));
    await write("src/prompting/__init__.py", pyInit());
    await write("src/prompting/variables.py", variablesPy());
    await write(
      "src/prompting/apply_template.py",
      applyTemplatePy(context, skills, renderedVariableValues)
    );
    // The raw template (variables live at runtime), not the pre-rendered prompt.
    await write("src/prompting/system_prompt.md", `${systemPromptTemplate}\n`);

    // Tools: real built-in sources, function-tool stubs, and an MCP scaffold.
    // A few built-ins are generated with the user's config baked in (skill).
    await write("src/tools/__init__.py", pyInit());
    const toolRefs: AgentToolRef[] = [];
    for (const tool of builtinIncluded) {
      const source = TEMPLATED_BUILTIN_TOOLS.has(tool.name)
        ? _templatedBuiltinSource(tool.name, skills)
        : builtinToolSource(tool.name)!;
      await write(`src/tools/${tool.name}.py`, source);
      toolRefs.push({ module: tool.name, symbol: tool.name });
    }
    for (const tool of functionTools) {
      const ident = toPyIdent(tool.name);
      await write(`src/tools/${ident}.py`, functionToolStub(tool));
      toolRefs.push({ module: ident, symbol: ident });
    }
    if (hasMcp) {
      await write("src/tools/mcp.py", mcpModule(mcpServers, mcpAllowedTools));
    }

    // The assembled agent.
    await write("src/agents/__init__.py", pyInit());
    await write("src/agents/agent.py", agentPy(toolRefs, hasMcp));

    workflow.phase("Export context");
    workflow.log("Writing rendered prompt, messages, variables, custom tools");
    for (const file of buildContextExports(context, rendered)) {
      await write(file.path, file.contents);
    }

    await write("PLAN.md", planMd(functionTools, mcpTools));

    workflow.phase("Done");
    return { dir, files: written };
  },
};

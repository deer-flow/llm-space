import type {
  FunctionTool,
  McpTool,
  McpTransportType,
  ModelConfig,
  SearchSettings,
  ThreadContext,
} from "../../types";
import type {
  GeneratorMcpServer,
  GeneratorModelInfo,
  GeneratorSkill,
} from "../types";

import { slugifyToolName } from "./context-export";
import { VARIABLES_PY_SOURCE } from "./tools";

function _pyStr(value: string): string {
  return JSON.stringify(value);
}

/**
 * A safe lower-snake Python identifier from a tool name (module + symbol name).
 * Built-in names are already valid; custom/function names may not be.
 */
export function toPyIdent(name: string): string {
  let ident = name
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (!ident) {
    ident = "tool";
  }
  if (/^[0-9]/.test(ident)) {
    ident = `_${ident}`;
  }
  return ident;
}

/** Uppercase, `_`-separated identifier from arbitrary text (for env-var names). */
function _toEnvKey(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * The env var holding the model's API key. A `$NAME` key references that env
 * var directly; otherwise the name is derived from the model — `{MODEL}_API_KEY`.
 */
export function apiKeyEnvName(
  model: ModelConfig,
  info: GeneratorModelInfo
): string {
  if (info.apiKey?.startsWith("$")) {
    return info.apiKey.slice(1);
  }
  return `${_toEnvKey(info.name || model.id) || "MODEL"}_API_KEY`;
}

/** The pip/uv package providing the chat-model class for this model. */
export function modelDependency(info: GeneratorModelInfo): string {
  if (info.anthropic) {
    return "langchain-anthropic";
  }
  return info.deepseekThinking ? "langchain-deepseek" : "langchain-openai";
}

/** The literal API key to write into `.env`, or `null` for a `$ENV` reference. */
export function literalApiKey(info: GeneratorModelInfo): string | null {
  if (!info.apiKey || info.apiKey.startsWith("$")) {
    return null;
  }
  return info.apiKey;
}

/**
 * `langgraph.json` — points the CLI at the graph in `src/agents/agent.py`. With
 * MCP tools the graph is an async factory (`make_graph`) so the MCP client can
 * load its tools before the agent is built; otherwise it's the `agent` object.
 */
export function langgraphJson(hasMcp: boolean): string {
  return `${JSON.stringify(
    {
      dependencies: ["."],
      graphs: {
        agent: `./src/agents/agent.py:${hasMcp ? "make_graph" : "agent"}`,
      },
      env: ".env",
    },
    null,
    2
  )}\n`;
}

/**
 * `src/models/create_model.py` — a runnable factory that builds the chat model
 * from the thread's selected model. DeepSeek-thinking-format models use
 * `ChatDeepSeek` (with `extra_body` to enable thinking when reasoning is on);
 * everything else uses `ChatOpenAI`. Only the params that were actually set are
 * emitted; the API key is read from the environment.
 */
export function createModelPy(
  model: ModelConfig,
  info: GeneratorModelInfo
): string {
  const cls = info.anthropic
    ? "ChatAnthropic"
    : info.deepseekThinking
      ? "ChatDeepSeek"
      : "ChatOpenAI";
  const importLine = info.anthropic
    ? "from langchain_anthropic import ChatAnthropic"
    : info.deepseekThinking
      ? "from langchain_deepseek import ChatDeepSeek"
      : "from langchain_openai import ChatOpenAI";
  const envName = apiKeyEnvName(model, info);

  // The API key is fetched into a variable and validated (below), so kwargs
  // reference `api_key` rather than inlining `os.getenv(...)`.
  const kwargs: string[] = [`        model=${_pyStr(model.id)},`];
  if (info.baseUrl) {
    kwargs.push(`        base_url=${_pyStr(info.baseUrl)},`);
  }
  kwargs.push(`        api_key=api_key,`);

  const temperature = model.params?.temperature;
  if (temperature !== undefined) {
    kwargs.push(`        temperature=${temperature},`);
  }
  const maxTokens = model.params?.maxTokens;
  if (maxTokens !== undefined) {
    kwargs.push(`        max_tokens=${maxTokens},`);
  }

  // Enable DeepSeek thinking when the model reasons and reasoning isn't off.
  const reasoningParam = model.params?.reasoning;
  const reasoningOn = reasoningParam
    ? reasoningParam !== "off"
    : info.supportsReasoning;
  if (info.deepseekThinking && reasoningOn) {
    kwargs.push(`        extra_body={"thinking": {"type": "enabled"}},`);
  }

  return `"""Chat model factory.

Generated from the LLM Space thread's selected model (${model.provider} / ${
    model.id
  }).
Set ${envName} in your environment; a .env file is included when a literal key
was configured in LLM Space.
"""

import os

${importLine}


def create_model():
    """Return the configured LangChain chat model."""
    api_key = os.getenv(${_pyStr(envName)})
    if not api_key:
        print(
            "Warning: ${envName} is empty or unset; passing api_key=None. "
            "Set it in your environment or .env."
        )
        api_key = None
    return ${cls}(
${kwargs.join("\n")}
    )


if __name__ == "__main__":
    print(create_model().invoke("Hello, what is the biggest city in the world?"))
`;
}

/** A search key's literal value, or `""` for a `$ENV` reference / empty. */
function _searchKeyLiteral(value: string | undefined): string {
  if (!value || value.startsWith("$")) {
    return "";
  }
  return value;
}

/**
 * The web-search config block for `.env`/`.env.example`, reflecting the user's
 * selected provider. `SEARCH_PROVIDER` picks the backend for the built-in
 * `web_search`/`web_fetch` tools; each provider reads its own key. When
 * `withValues` is set (the real `.env`), literal keys are filled in.
 */
function _searchEnvBlock(search: SearchSettings, withValues: boolean): string {
  const key = (value: string | undefined) =>
    withValues ? _searchKeyLiteral(value) : "";
  return `
# Web-search backend for the built-in web_search / web_fetch tools:
# one of firecrawl, tavily, or brave.
SEARCH_PROVIDER=${search.provider}
# Optional — Firecrawl's free tier works without a key.
FIRECRAWL_API_KEY=${key(search.firecrawlApiKey)}
# Required only when SEARCH_PROVIDER=tavily.
TAVILY_API_KEY=${key(search.tavilyApiKey)}
# Required only when SEARCH_PROVIDER=brave.
BRAVE_API_KEY=${key(search.braveApiKey)}
`;
}

/**
 * The MCP secrets block for `.env`/`.env.example`. Each entry is a var the
 * generated `src/tools/mcp.py` reads. When `withValues` is set (the real `.env`)
 * literal secrets are filled in; otherwise the values are left blank.
 */
function _mcpEnvBlock(entries: McpEnvEntry[], withValues: boolean): string {
  if (entries.length === 0) {
    return "";
  }
  const lines = entries
    .map((e) => `# ${e.comment}\n${e.name}=${withValues ? e.value : ""}`)
    .join("\n");
  return `\n# MCP server secrets (read by src/tools/mcp.py).\n${lines}\n`;
}

/**
 * `.env.example` — the model API-key var, the web-search config when the project
 * ships web tools (`search` provided), and any MCP server secrets (`mcpEnv`).
 */
export function envExample(
  model: ModelConfig,
  info: GeneratorModelInfo,
  search?: SearchSettings,
  mcpEnv: McpEnvEntry[] = []
): string {
  const searchBlock = search ? _searchEnvBlock(search, false) : "";
  const mcpBlock = _mcpEnvBlock(mcpEnv, false);
  return `# API key for the selected model (${info.name}).
${apiKeyEnvName(model, info)}=
${searchBlock}${mcpBlock}`;
}

/**
 * `.env` — the literal model key (when configured), the web-search config with
 * the user's literal keys filled in (when the project ships web tools), and any
 * MCP server secrets with their real values (`mcpEnv`).
 */
export function envFile(
  model: ModelConfig,
  info: GeneratorModelInfo,
  search?: SearchSettings,
  mcpEnv: McpEnvEntry[] = []
): string {
  const key = literalApiKey(info) ?? "";
  const searchBlock = search ? _searchEnvBlock(search, true) : "";
  const mcpBlock = _mcpEnvBlock(mcpEnv, true);
  return `${apiKeyEnvName(model, info)}=${key}\n${searchBlock}${mcpBlock}`;
}

/** `pyproject`-independent README explaining how to finish + run the project. */
export function readme(): string {
  return `# LangGraph agent (generated by LLM Space)

This project was scaffolded from an LLM Space thread. The model factory
(\`src/models/create_model.py\`), the rendered prompt
(\`src/prompting/\`), the built-in tools (\`src/tools/\`), and the agent itself
(\`src/agents/agent.py\`, via \`langchain.agents.create_agent\`) are ready to run.

If the thread used custom (function) or MCP tools, **PLAN.md** lists the small
amount left to finish; otherwise the project is complete.

## Run the debug server

\`\`\`sh
cp .env.example .env   # then fill in any missing API keys
uv run langgraph dev
\`\`\`

This starts the LangGraph dev server + web UI so you can trace and debug the
agent.

## Notes

- The \`grep\` tool shells out to ripgrep (\`rg\`) — install it if you use that tool.
- \`references/\` holds the exported thread context (prompt, messages, variables,
  and the JSON for any custom/MCP tools).
`;
}

/** `src/prompting/variables.py` — the shared prompt-variable helpers. */
export function variablesPy(): string {
  return VARIABLES_PY_SOURCE;
}

/**
 * `src/prompting/apply_template.py` — renders the system prompt template at
 * runtime. `current_date` and `available_skills` stay live via `variables.py`
 * (the user's skill paths baked in); `json` variables are parsed at runtime;
 * `file`/custom-string variables are baked as literals. `apply_template` is a
 * plain Jinja2 renderer the reader can reuse.
 */
export function applyTemplatePy(
  context: ThreadContext,
  skills: GeneratorSkill[],
  renderedValues: Record<string, string>
): string {
  const skillPath = new Map(skills.map((s) => [s.name, s.path]));
  const entries: string[] = [];
  let needsJson = false;
  let usesVariablesModule = false;

  for (const [name, def] of Object.entries(context.variables ?? {})) {
    if (def.type === "currentDate") {
      usesVariablesModule = true;
      entries.push(`        ${_pyStr(name)}: current_date(${_pyStr(def.format)}),`);
    } else if (def.type === "skills") {
      usesVariablesModule = true;
      const paths = def.skillNames
        .map((n) => skillPath.get(n))
        .filter((p): p is string => Boolean(p));
      const pathList = paths.map(_pyStr).join(", ");
      entries.push(
        `        ${_pyStr(name)}: available_skills([${pathList}], ${_pyStr(
          def.format
        )}, ${def.indent}),`
      );
    } else if (def.type === "json") {
      needsJson = true;
      entries.push(`        ${_pyStr(name)}: json.loads(${_pyStr(def.value)}),`);
    } else if (def.type === "file") {
      entries.push(`        ${_pyStr(name)}: ${_pyStr(renderedValues[name] ?? "")},`);
    }
  }

  // Custom string variables (the active bucket).
  const variants = context.variableVariants;
  if (variants) {
    for (const [name, value] of Object.entries(
      variants.variants?.[variants.active] ?? {}
    )) {
      entries.push(`        ${_pyStr(name)}: ${_pyStr(value)},`);
    }
  }

  const imports: string[] = [];
  if (needsJson) {
    imports.push("import json");
  }
  imports.push("from pathlib import Path");
  imports.push("");
  imports.push("from jinja2 import Template");
  if (usesVariablesModule) {
    imports.push("");
    imports.push(
      "from src.prompting.variables import available_skills, current_date"
    );
  }

  const buildBody =
    entries.length > 0 ? `    return {\n${entries.join("\n")}\n    }` : "    return {}";

  // Skip Jinja2 entirely for a prompt with no variables, so stray braces in
  // prose can't trip the renderer.
  const getBody =
    entries.length > 0
      ? `    template = _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")\n    return apply_template(build_variables(), template)`
      : `    return _SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")`;

  return `"""Prompt assembly.

Renders the system prompt template at runtime. \`current_date\` and
\`available_skills\` stay live via variables.py; other variables were resolved
when the project was generated.
"""

${imports.join("\n")}

_SYSTEM_PROMPT_PATH = Path(__file__).parent / "system_prompt.md"


def build_variables() -> dict:
    """Values substituted into the system prompt template."""
${buildBody}


def apply_template(variables: dict, content: str) -> str:
    """Render \`content\` as a Jinja2 template with \`variables\`, returning text."""
    return Template(content).render(**variables)


def get_system_prompt() -> str:
    """Return the rendered system prompt."""
${getBody}
`;
}

/**
 * `src/tools/skill.py` — the built-in `skill` tool, generated with the user's
 * configured skills baked in (name → absolute directory) so it resolves the
 * same skills LLM Space does, rather than guessing conventional directories.
 */
export function skillToolPy(skills: GeneratorSkill[]): string {
  const entries = skills
    .map((s) => `    ${_pyStr(s.name)}: ${_pyStr(s.path)},`)
    .join("\n");
  const mapBody = entries ? `{\n${entries}\n}` : "{}";
  return `"""Skill loader tool (generated with your configured skills)."""

from pathlib import Path

from langchain.tools import tool

# Skills configured in LLM Space (name -> absolute directory).
SKILLS: dict[str, str] = ${mapBody}


@tool
def skill(name: str) -> str:
    """Load a skill within the main conversation.

    Load a skill within the main conversation. When users ask you to perform
    tasks, check if any of the available skills match. Skills provide
    specialized capabilities and domain knowledge. Prefer this over read for
    loading a skill's instructions.

    Args:
        name: The name of the skill to load (its SKILL.md \`name\`).
    """
    path = SKILLS.get(name)
    if path:
        skill_md = Path(path) / "SKILL.md"
        if skill_md.is_file():
            content = skill_md.read_text(encoding="utf-8")
            return f"Base directory for this skill: {skill_md.parent}\\n\\n{content.strip()}"
    raise ValueError(f'Skill "{name}" not found.')
`;
}

/** One importable tool for the agent: its module (file stem) + symbol name. */
export interface AgentToolRef {
  module: string;
  symbol: string;
}

/**
 * `src/agents/agent.py` — assembles the runnable agent via
 * `langchain.agents.create_agent` from the model, the imported tool symbols
 * (built-ins + function stubs), and the rendered system prompt.
 *
 * With MCP tools the graph is exposed as an async factory `make_graph`, which
 * `await`s `get_mcp_tools()` (async MCP client setup) before building the agent;
 * `langgraph.json` points at it. Without MCP it's the plain `agent` object.
 */
export function agentPy(tools: AgentToolRef[], hasMcp: boolean): string {
  const toolImports = tools
    .map((t) => `from src.tools.${t.module} import ${t.symbol}`)
    .join("\n");

  if (hasMcp) {
    const mcpImport = "\nfrom src.tools.mcp import get_mcp_tools";
    const staticList =
      tools.length > 0
        ? `[\n${tools.map((t) => `        ${t.symbol},`).join("\n")}\n    ]`
        : "[]";
    return `"""Agent graph.

Assembles the LangGraph agent from the model, the tools, and the rendered system
prompt. Because this thread uses MCP tools (which load asynchronously), the graph
is built by the async factory \`make_graph\`, exposed to \`langgraph dev\` via
langgraph.json.
"""

from langchain.agents import create_agent

from src.models.create_model import create_model
from src.prompting.apply_template import get_system_prompt
${toolImports}${mcpImport}


async def make_graph():
    """Build the agent, loading the thread's MCP tools from its servers."""
    tools = ${staticList}
    tools = [*tools, *await get_mcp_tools()]
    return create_agent(
        create_model(),
        tools=tools,
        system_prompt=get_system_prompt(),
    )
`;
  }

  const items = tools.map((t) => `        ${t.symbol},`).join("\n");
  return `"""Agent graph.

Assembles the LangGraph agent from the model, the tools, and the rendered system
prompt, exposed as \`agent\` for \`langgraph dev\`.
"""

from langchain.agents import create_agent

from src.models.create_model import create_model
from src.prompting.apply_template import get_system_prompt
${toolImports}

agent = create_agent(
    create_model(),
    tools=[
${items}
    ],
    system_prompt=get_system_prompt(),
)
`;
}

/** Python param signature from a tool's JSON-schema properties (best-effort). */
function _functionParams(tool: FunctionTool): string {
  const schema = tool.parameters as
    | { properties?: Record<string, unknown>; required?: string[] }
    | undefined;
  const names = Object.keys(schema?.properties ?? {});
  if (names.length === 0) {
    return "**kwargs";
  }
  // Fall back to **kwargs if any property name isn't a plain Python identifier.
  if (names.some((n) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(n))) {
    return "**kwargs";
  }
  const required = new Set(schema?.required ?? []);
  const req = names.filter((n) => required.has(n));
  const opt = names.filter((n) => !required.has(n)).map((n) => `${n}=None`);
  return [...req, ...opt].join(", ");
}

/**
 * `src/tools/<ident>.py` — an importable STUB for a custom function tool. The
 * agent lists it live, but calling it raises until a human fills in the body
 * (the parameter schema lives in `references/tools/<slug>.json`).
 */
export function functionToolStub(tool: FunctionTool): string {
  const ident = toPyIdent(tool.name);
  const slug = slugifyToolName(tool.name);
  const params = _functionParams(tool);
  const doc = (tool.description || `${tool.name} tool.`).replace(/"""/g, '\\"\\"\\"');
  return `"""${tool.name} — function tool (STUB).

Implement this tool's body. The parameter JSON schema is in
references/tools/${slug}.json. See PLAN.md.
"""

from langchain.tools import tool


@tool
def ${ident}(${params}):
    """${doc}"""
    raise NotImplementedError(
        "Implement ${ident} — see references/tools/${slug}.json"
    )
`;
}

/** One `.env` variable a generated MCP server config reads. */
export interface McpEnvEntry {
  /** The environment variable name. */
  name: string;
  /** Its real value (a literal secret from settings), or "" when unknown. */
  value: string;
  /** A short human hint for `.env.example`. */
  comment: string;
}

/** `$VAR` / `${VAR}` references embedded in a config value. */
const MCP_ENV_REF_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

/** Names of every `$VAR` / `${VAR}` reference in `value`. */
function _mcpEnvRefs(value: string): string[] {
  const names: string[] = [];
  for (const match of value.matchAll(MCP_ENV_REF_RE)) {
    const name = match[1] ?? match[2];
    if (name) {
      names.push(name);
    }
  }
  return names;
}

/**
 * The Python expression for a secret-bearing MCP config value, resolved at
 * runtime from the environment so no secret is baked into source. A value the
 * user already wrote with `$VAR`/`${VAR}` references is expanded in place (its
 * literal text carries no secret); a fully literal value is routed through a
 * synthesized env var whose real value goes to `.env` (opt-in) / `.env.example`.
 */
function _mcpSecretValue(
  value: string,
  synthName: string,
  comment: string
): { expr: string; env: McpEnvEntry[] } {
  const refs = _mcpEnvRefs(value);
  if (refs.length > 0) {
    return {
      expr: `os.path.expandvars(${_pyStr(value)})`,
      env: refs.map((name) => ({ name, value: "", comment })),
    };
  }
  return {
    expr: `os.environ.get(${_pyStr(synthName)}, "")`,
    env: [{ name: synthName, value, comment }],
  };
}

/** LLM Space's transport name → langchain-mcp-adapters' `transport` value. */
function _mcpTransport(transport: McpTransportType): string {
  return transport === "streamableHttp" ? "streamable_http" : transport;
}

/** A `MCP_SERVERS` dict entry (as Python lines) for one server + its env vars. */
function _mcpServerBlock(server: GeneratorMcpServer): {
  block: string;
  env: McpEnvEntry[];
} {
  const I4 = "    ";
  const I8 = "        ";
  const I12 = "            ";
  const envKey = _toEnvKey(server.serverName) || "MCP";
  const env: McpEnvEntry[] = [];
  const body: string[] = [`${I8}"transport": ${_pyStr(_mcpTransport(server.transport))},`];

  if (server.transport === "stdio") {
    // command/args/cwd are the launcher — not secrets — so they stay literal.
    if (server.command) {
      body.push(`${I8}"command": ${_pyStr(server.command)},`);
    }
    if (server.args && server.args.length > 0) {
      body.push(`${I8}"args": [${server.args.map(_pyStr).join(", ")}],`);
    }
    if (server.cwd) {
      body.push(`${I8}"cwd": ${_pyStr(server.cwd)},`);
    }
    const keys = Object.keys(server.env ?? {});
    if (keys.length > 0) {
      const inner = keys.map((k) => {
        const res = _mcpSecretValue(
          server.env?.[k] ?? "",
          `MCP_${envKey}_ENV_${_toEnvKey(k)}`,
          `Env var "${k}" for MCP server ${server.serverName}`
        );
        env.push(...res.env);
        return `${I12}${_pyStr(k)}: ${res.expr},`;
      });
      body.push(`${I8}"env": {\n${inner.join("\n")}\n${I8}},`);
    }
  } else {
    // Remote (streamableHttp / sse): the URL can embed a key, so treat it whole
    // as a secret; headers likewise.
    if (server.url) {
      const res = _mcpSecretValue(
        server.url,
        `MCP_${envKey}_URL`,
        `Endpoint URL for MCP server ${server.serverName}`
      );
      env.push(...res.env);
      body.push(`${I8}"url": ${res.expr},`);
    }
    const keys = Object.keys(server.headers ?? {});
    if (keys.length > 0) {
      const inner = keys.map((h) => {
        const res = _mcpSecretValue(
          server.headers?.[h] ?? "",
          `MCP_${envKey}_HEADER_${_toEnvKey(h)}`,
          `Header "${h}" for MCP server ${server.serverName}`
        );
        env.push(...res.env);
        return `${I12}${_pyStr(h)}: ${res.expr},`;
      });
      body.push(`${I8}"headers": {\n${inner.join("\n")}\n${I8}},`);
    }
  }

  const block = `${I4}${_pyStr(server.serverName)}: {\n${body.join("\n")}\n${I4}},`;
  return { block, env };
}

/**
 * The `.env` variables the generated `src/tools/mcp.py` reads, across all its
 * servers, de-duplicated by name (a real value wins over a blank one). Reused by
 * the generator (to write `.env.example`) and the wizard's opt-in `.env`.
 */
export function mcpEnvEntries(servers: GeneratorMcpServer[]): McpEnvEntry[] {
  const byName = new Map<string, McpEnvEntry>();
  for (const server of servers) {
    for (const entry of _mcpServerBlock(server).env) {
      const existing = byName.get(entry.name);
      if (!existing || (!existing.value && entry.value)) {
        byName.set(entry.name, entry);
      }
    }
  }
  return [...byName.values()];
}

/**
 * `src/tools/mcp.py` — the thread's MCP servers wired via
 * `langchain-mcp-adapters`, populated from the user's LLM Space MCP settings.
 * Server secrets are read from the environment (never hard-coded); only the MCP
 * tools this thread actually used are exposed (`ALLOWED_TOOLS`).
 */
export function mcpModule(
  servers: GeneratorMcpServer[],
  allowedToolNames: string[]
): string {
  const blocks = servers.map((s) => _mcpServerBlock(s).block).join("\n");
  const allowed = [...new Set(allowedToolNames)].sort();
  const allowedBody =
    allowed.length > 0
      ? `{\n${allowed.map((n) => `    ${_pyStr(n)},`).join("\n")}\n}`
      : "set()";
  return `"""MCP tools (generated).

Wires this thread's MCP servers via langchain-mcp-adapters. Connection details
come from your LLM Space MCP settings; secret values (endpoint URLs, headers,
stdio env vars) are read from the environment — see .env.example / .env — and are
never hard-coded here. Only the MCP tools this thread used are attached to the
agent (ALLOWED_TOOLS).
"""

import os

from langchain_mcp_adapters.client import MultiServerMCPClient

MCP_SERVERS = {
${blocks}
}

# Only the MCP tools this thread used; a server may expose more.
ALLOWED_TOOLS = ${allowedBody}


async def get_mcp_tools():
    """Return the thread's MCP tools from the configured servers."""
    client = MultiServerMCPClient(MCP_SERVERS)
    tools = await client.get_tools()
    if not ALLOWED_TOOLS:
        return tools
    return [t for t in tools if t.name in ALLOWED_TOOLS]
`;
}

/**
 * `PLAN.md` — a short, deterministic checklist. It only mentions tool work when
 * the thread actually has custom (function) or MCP tools; otherwise the project
 * is complete and it just says how to run it.
 */
export function planMd(functionTools: FunctionTool[], mcpTools: McpTool[]): string {
  const sections: string[] = [
    `# PLAN.md

This LangGraph agent was generated from an LLM Space thread. The model, prompt,
built-in tools, and the agent itself (\`src/agents/agent.py\`) are already wired.

## Run it

\`\`\`sh
cp .env.example .env   # fill in any missing API keys
uv run langgraph dev
\`\`\``,
  ];

  if (functionTools.length > 0) {
    const list = functionTools
      .map((t) => {
        const ident = toPyIdent(t.name);
        return `- \`${ident}\` — implement in \`src/tools/${ident}.py\` (schema: \`references/tools/${slugifyToolName(
          t.name
        )}.json\`)`;
      })
      .join("\n");
    sections.push(`## Implement function tools

These custom tools are stubbed in \`src/tools/\` and raise \`NotImplementedError\`
until you fill in their bodies:

${list}`);
  }

  if (mcpTools.length > 0) {
    const list = mcpTools
      .map(
        (t) =>
          `- \`${t.name}\` (server "${t.serverName}", tool "${t.toolName}")`
      )
      .join("\n");
    sections.push(`## MCP servers

This thread's MCP tools are already wired: the servers are configured in
\`src/tools/mcp.py\` (from your LLM Space MCP settings) and loaded into the agent
by \`make_graph\`. Just set each server's secret (endpoint URL, headers, or stdio
env vars) in \`.env\` — see \`.env.example\`. Tool metadata is in
\`references/tools/\`:

${list}`);
  }

  if (functionTools.length === 0 && mcpTools.length === 0) {
    sections.push(
      "Nothing else to implement — the agent is ready to run."
    );
  }

  return `${sections.join("\n\n")}\n`;
}

/** `.gitignore` — standard Python + a LangGraph dev project's local artifacts. */
export function gitignore(): string {
  return `# Python
__pycache__/
*.py[cod]
*.egg-info/
.eggs/
build/
dist/

# Virtual environments
.venv/
venv/

# Tooling caches
.pytest_cache/
.mypy_cache/
.ruff_cache/

# Environment / secrets
.env
.env.*
!.env.example

# LangGraph dev server
.langgraph_api/

# OS / editors
.DS_Store
.idea/
.vscode/
`;
}

/** Empty `__init__.py` marking a Python package directory. */
export function pyInit(): string {
  return "";
}

import { describe, expect, test } from "bun:test";

import type { GeneratorMcpServer } from "../types";

import {
  agentPy,
  applyTemplatePy,
  langgraphJson,
  mcpEnvEntries,
  mcpModule,
  metaPromptMiddlewarePy,
} from "./templates";

const stdioServer: GeneratorMcpServer = {
  id: "s-playwright",
  serverName: "Playwright",
  transport: "stdio",
  command: "npx",
  args: ["-y", "@playwright/mcp@latest"],
  cwd: null,
};

const httpServer: GeneratorMcpServer = {
  id: "s-tavily",
  serverName: "Tavily",
  transport: "streamableHttp",
  url: "https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-SECRET",
};

describe("mcpModule", () => {
  test("stdio: literal command/args, transport as-is", () => {
    const py = mcpModule([stdioServer], ["browser_click"]);
    expect(py).toContain('"Playwright": {');
    expect(py).toContain('"transport": "stdio"');
    expect(py).toContain('"command": "npx"');
    expect(py).toContain('"args": ["-y", "@playwright/mcp@latest"]');
    // Only the used tool is allowed.
    expect(py).toContain('"browser_click"');
  });

  test("streamableHttp → streamable_http, URL routed through env (no secret in source)", () => {
    const py = mcpModule([httpServer], ["tavily_search"]);
    expect(py).toContain('"transport": "streamable_http"');
    expect(py).toContain('os.environ.get("MCP_TAVILY_URL", "")');
    // The literal secret must never be baked into the module.
    expect(py).not.toContain("tvly-SECRET");
  });

  test("a value with $VAR references is expanded at runtime, not re-keyed", () => {
    const server: GeneratorMcpServer = {
      id: "s-x",
      serverName: "X",
      transport: "streamableHttp",
      url: "https://x.example/mcp?key=${X_KEY}",
    };
    const py = mcpModule([server], []);
    expect(py).toContain(
      'os.path.expandvars("https://x.example/mcp?key=${X_KEY}")'
    );
    // No tools used → attach everything the server exposes.
    expect(py).toContain("ALLOWED_TOOLS = set()");
  });

  test("stdio env values are routed through env vars", () => {
    const server: GeneratorMcpServer = {
      id: "s-e",
      serverName: "E",
      transport: "stdio",
      command: "run",
      env: { API_TOKEN: "literal-secret" },
    };
    const py = mcpModule([server], ["t"]);
    expect(py).toContain('"env": {');
    expect(py).toContain(
      '"API_TOKEN": os.environ.get("MCP_E_ENV_API_TOKEN", "")'
    );
    expect(py).not.toContain("literal-secret");
  });
});

describe("mcpEnvEntries", () => {
  test("collects literal secrets with their real values; skips $VAR refs' values", () => {
    const entries = mcpEnvEntries([httpServer, stdioServer]);
    const tavily = entries.find((e) => e.name === "MCP_TAVILY_URL");
    expect(tavily?.value).toBe(
      "https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-SECRET"
    );
    // stdio launcher fields carry no secrets → no env entries.
    expect(entries.some((e) => e.name.startsWith("MCP_PLAYWRIGHT"))).toBe(
      false
    );
  });

  test("a $VAR reference is surfaced by name with a blank value", () => {
    const entries = mcpEnvEntries([
      {
        id: "s",
        serverName: "S",
        transport: "sse",
        url: "https://s.example?token=$S_TOKEN",
      },
    ]);
    const ref = entries.find((e) => e.name === "S_TOKEN");
    expect(ref).toBeDefined();
    expect(ref?.value).toBe("");
  });
});

describe("agentPy / langgraphJson MCP wiring", () => {
  test("with MCP: async make_graph factory awaiting get_mcp_tools", () => {
    const py = agentPy([{ module: "read", symbol: "read" }], true, false);
    expect(py).toContain("async def make_graph():");
    expect(py).toContain("from src.tools.mcp import get_mcp_tools");
    expect(py).toContain("await get_mcp_tools()");
    expect(langgraphJson(true)).toContain("./src/agents/agent.py:make_graph");
  });

  test("without MCP: plain agent object", () => {
    const py = agentPy([{ module: "read", symbol: "read" }], false, false);
    expect(py).toContain("agent = create_agent(");
    expect(py).not.toContain("make_graph");
    expect(langgraphJson(false)).toContain("./src/agents/agent.py:agent");
  });

  test("wires meta middleware into both plain and MCP agents", () => {
    for (const hasMcp of [false, true]) {
      const py = agentPy([], hasMcp, true);
      expect(py).toContain(
        "from src.prompting.meta_prompt_middleware import inject_meta_user_prompt"
      );
      expect(py).toContain(
        "middleware=[inject_meta_user_prompt(get_meta_user_prompt())]"
      );
    }
  });

  test("omits meta middleware when the first user message is not meta", () => {
    const py = agentPy([], false, false);
    expect(py).not.toContain("inject_meta_user_prompt");
    expect(py).not.toContain("middleware=");
  });
});

describe("meta prompt templates", () => {
  test("an empty skills selection emits every enabled skill path", () => {
    const py = applyTemplatePy(
      {
        variables: {
          available_skills: {
            type: "skills",
            skillNames: [],
            format: "markdown-list",
            indent: 0,
          },
        },
      },
      [
        { name: "deep-research", path: "/skills/deep-research" },
        { name: "frontend-design", path: "/skills/frontend-design" },
      ],
      {}
    );
    expect(py).toContain(
      'available_skills(["/skills/deep-research", "/skills/frontend-design"], "markdown-list", 0)'
    );
  });

  test("an explicit skills selection emits only the selected paths", () => {
    const py = applyTemplatePy(
      {
        variables: {
          available_skills: {
            type: "skills",
            skillNames: ["frontend-design"],
            format: "xml",
            indent: 2,
          },
        },
      },
      [
        { name: "deep-research", path: "/skills/deep-research" },
        { name: "frontend-design", path: "/skills/frontend-design" },
      ],
      {}
    );
    expect(py).toContain(
      'available_skills(["/skills/frontend-design"], "xml", 2)'
    );
    expect(py).not.toContain('"/skills/deep-research"');
  });

  test("apply-template module renders system and meta prompt files", () => {
    const py = applyTemplatePy({}, [], {});
    expect(py).toContain("def _render_prompt(path: Path) -> str:");
    expect(py).toContain("def get_system_prompt() -> str:");
    expect(py).toContain("def get_meta_user_prompt() -> str:");
  });

  test("apply-template exposes exists(path) when the prompt uses it", () => {
    const py = applyTemplatePy({}, [], {}, true);
    expect(py).toContain('"exists": _file_exists');
    expect(py).toContain("path.is_file() and os.access(path, os.R_OK)");
  });

  test("middleware overrides sync and async model requests without updating state", () => {
    const py = metaPromptMiddlewarePy();
    expect(py).toContain("class MetaUserPromptMiddleware(AgentMiddleware):");
    expect(py).toContain("def wrap_model_call(");
    expect(py).toContain("async def awrap_model_call(");
    expect(py).toContain(
      "messages.insert(insert_at, HumanMessage(content=text))"
    );
    expect(py).toContain(
      "return await handler(_request_with_meta_user_prompt(request, self.text))"
    );
  });
});

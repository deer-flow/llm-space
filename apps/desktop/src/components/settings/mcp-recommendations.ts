import type { McpServerDraft } from "@llm-space/core";

export interface McpRecommendation {
  draft: McpServerDraft;
  setupHint: string;
  /** Optional credential guidance, rendered consistently by the MCP editor. */
  credential?: {
    label: string;
    url: string;
    requirement: "required" | "optional";
    instructions: string;
  };
}

// Keep the menu alphabetized and local package versions pinned for reproducibility.
export const MCP_RECOMMENDATIONS: McpRecommendation[] = [
  {
    draft: {
      name: "Amap",
      transport: "streamableHttp",
      url: "https://mcp.amap.com/mcp?key=",
    },
    setupHint:
      "Search places and plan routes in China with Amap (高德地图). Connect remotely without installing additional software.",
    credential: {
      label: "Get API token",
      url: "https://console.amap.com/dev/key/app",
      requirement: "required",
      instructions:
        "Create a Key for the Web Service (Web 服务) platform in the Amap console, then paste it after key= in the URL below before connecting.",
    },
  },
  {
    draft: {
      name: "Chrome DevTools",
      transport: "stdio",
      command: "bunx",
      args: ["chrome-devtools-mcp@1.8.0", "--no-usage-statistics"],
    },
    setupHint:
      "Requires Bun, Node.js LTS, and Google Chrome on the selected runtime. The first connection downloads the server package.",
  },
  {
    draft: {
      name: "Context7",
      transport: "streamableHttp",
      url: "https://mcp.context7.com/mcp",
    },
    setupHint: "Connect to search library documentation.",
    credential: {
      label: "Get API token",
      url: "https://context7.com/dashboard",
      requirement: "optional",
      instructions:
        "For higher limits, add an Authorization header with the value Bearer followed by your Context7 API key.",
    },
  },
  {
    draft: {
      name: "ElevenLabs",
      transport: "stdio",
      command: "uvx",
      args: ["elevenlabs-mcp==0.12.2"],
      env: { ELEVENLABS_API_KEY: "" },
    },
    setupHint:
      "Generate speech with ElevenLabs. Requires uv and Python 3.11+ on the selected runtime; uv can download Python automatically. The first connection installs dependencies. This local server is archived; ElevenLabs now recommends its OAuth-hosted server.",
    credential: {
      label: "Get API token",
      url: "https://elevenlabs.io/app/settings/api-keys",
      requirement: "required",
      instructions:
        "Create an ElevenLabs API key and paste it into ELEVENLABS_API_KEY under Environment below. Audio generation uses your ElevenLabs credits.",
    },
  },
  {
    draft: {
      name: "GitHub",
      transport: "streamableHttp",
      url: "https://api.githubcopilot.com/mcp/",
      headers: { Authorization: "", "X-MCP-Readonly": "true" },
    },
    setupHint:
      "Read-only mode is enabled by default. Remove X-MCP-Readonly from Headers to allow write tools.",
    credential: {
      label: "Get API token",
      url: "https://github.com/settings/personal-access-tokens/new",
      requirement: "required",
      instructions:
        "Create a personal access token with access to the repositories you need. Set the Authorization header to Bearer followed by your token before connecting.",
    },
  },
  {
    draft: {
      name: "Playwright",
      transport: "stdio",
      command: "bunx",
      args: ["@playwright/mcp@0.0.80", "--browser", "chrome"],
    },
    setupHint:
      "Requires Bun, Node.js, and Google Chrome on the selected runtime. The first connection downloads the server package.",
  },
];

/** Recognize remote presets even after users fill in URL credentials. */
export function matchesMcpEndpoint(url: string, presetUrl?: string): boolean {
  if (!presetUrl) return false;
  try {
    const actual = new URL(url);
    const preset = new URL(presetUrl);
    return (
      actual.origin === preset.origin &&
      actual.pathname.replace(/\/$/, "") === preset.pathname.replace(/\/$/, "")
    );
  } catch {
    return false;
  }
}

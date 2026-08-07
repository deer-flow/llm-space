import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const PROJECT = process.env.ATLAS_PROJECT || "Project Atlas";
const METRICS = {
  reliability: 98,
  delivery: 84,
  documentation: 76,
} as const;

const server = new McpServer({ name: "atlas-metrics", version: "1.0.0" });

server.registerTool(
  "get_project_health",
  {
    description: "Return deterministic example health metrics for the project.",
    inputSchema: {
      includeSummary: z.boolean().default(true),
    },
  },
  ({ includeSummary }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            project: PROJECT,
            metrics: METRICS,
            summary: includeSummary
              ? "Reliability is strong; documentation has the largest gap."
              : undefined,
          },
          null,
          2
        ),
      },
    ],
  })
);

server.registerTool(
  "compare_metric",
  {
    description: "Compare one example project metric with a requested target.",
    inputSchema: {
      metric: z.enum(["reliability", "delivery", "documentation"]),
      target: z.number().min(0).max(100),
    },
  },
  ({ metric, target }) => {
    const actual = METRICS[metric];
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              project: PROJECT,
              metric,
              actual,
              target,
              delta: actual - target,
              meetsTarget: actual >= target,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

async function _main() {
  await server.connect(new StdioServerTransport());
}

_main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

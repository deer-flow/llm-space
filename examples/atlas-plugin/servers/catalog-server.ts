import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const TEAM = process.env.ATLAS_TEAM || "Example Team";
const RESOURCES = [
  {
    id: "architecture",
    title: "Architecture map",
    owner: "Platform",
    status: "maintained",
  },
  {
    id: "release-playbook",
    title: "Release playbook",
    owner: "Developer Experience",
    status: "maintained",
  },
  {
    id: "incident-log",
    title: "Incident log",
    owner: "Reliability",
    status: "review-needed",
  },
] as const;

const server = new McpServer({ name: "atlas-catalog", version: "1.0.0" });

server.registerTool(
  "list_resources",
  {
    description: "List the example knowledge resources owned by the Atlas team.",
    inputSchema: {
      status: z
        .enum(["maintained", "review-needed"])
        .optional()
        .describe("Optionally filter resources by status."),
    },
  },
  ({ status }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            team: TEAM,
            resources: status
              ? RESOURCES.filter((resource) => resource.status === status)
              : RESOURCES,
          },
          null,
          2
        ),
      },
    ],
  })
);

server.registerTool(
  "get_resource",
  {
    description: "Get one example Atlas knowledge resource by ID.",
    inputSchema: {
      id: z.string().min(1).describe("Resource ID returned by list_resources."),
    },
  },
  ({ id }) => {
    const resource = RESOURCES.find((candidate) => candidate.id === id);
    if (!resource) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown Atlas resource: ${id}` }],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ team: TEAM, ...resource }, null, 2),
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

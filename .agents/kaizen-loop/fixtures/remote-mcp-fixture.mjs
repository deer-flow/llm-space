#!/usr/bin/env bun
// Intentionally preserved as durable kaizen evidence: this fixture reproduces
// remote Streamable HTTP/SSE MCP setup states without real third-party services
// or secrets, so future reviews can rerun the Remote MCP Diagnostics V1 matrix.
import { McpServer } from "../../../apps/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js";
import { createMcpExpressApp } from "../../../apps/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/server/express.js";
import { SSEServerTransport } from "../../../apps/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/server/sse.js";
import { StreamableHTTPServerTransport } from "../../../apps/desktop/node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js";

const PORT = Number(process.env.PORT ?? 8765);
const TRANSPORT = process.env.TRANSPORT ?? "streamableHttp";
const MODE = process.env.MODE ?? "success";

/**
 * Creates one MCP server instance with a single echo tool. Each request gets a
 * fresh instance so transport/session cleanup stays isolated between cases.
 */
function _createServer() {
  const server = new McpServer({
    name: "llm-space-remote-fixture",
    version: "1.0.0",
  });
  server.registerTool(
    "remote_echo",
    {
      description: "Echoes a fixture response for remote MCP diagnostics.",
      inputSchema: {},
    },
    async () => ({
      content: [{ type: "text", text: "remote fixture ok" }],
    })
  );
  return server;
}

const app = createMcpExpressApp();

app.use((req, res, next) => {
  if (MODE !== "auth" && MODE !== "forbidden") {
    next();
    return;
  }
  if (req.header("authorization") === "Bearer fixture-token") {
    next();
    return;
  }
  res.setHeader("www-authenticate", "Bearer");
  res.status(MODE === "forbidden" ? 403 : 401).send("Unauthorized");
});

if (MODE === "timeout") {
  app.all("/mcp", async () => {
    await new Promise(() => {});
  });
} else if (MODE === "notFound") {
  app.all("/mcp", (_req, res) => {
    res.status(404).send("Not found");
  });
} else if (MODE === "malformed") {
  app.all("/mcp", (_req, res) => {
    res.status(200).type("text/plain").send("not an MCP response");
  });
} else if (TRANSPORT === "sse") {
  const transports = {};
  app.get("/mcp", async (_req, res) => {
    const transport = new SSEServerTransport("/messages", res);
    transports[transport.sessionId] = transport;
    transport.onclose = () => {
      delete transports[transport.sessionId];
    };
    await _createServer().connect(transport);
  });
  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport =
      typeof sessionId === "string" ? transports[sessionId] : undefined;
    if (!transport) {
      res.status(400).send("Missing or invalid sessionId");
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });
} else {
  app.post("/mcp", async (req, res) => {
    const server = _createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  });
  app.get("/mcp", (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });
  app.delete("/mcp", (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });
}

app.listen(PORT, (error) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(
    `Remote MCP fixture listening on http://127.0.0.1:${PORT}/mcp (${TRANSPORT}, ${MODE})`
  );
});

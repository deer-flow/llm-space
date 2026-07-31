import { describe, expect, test } from "bun:test";

import type { AgentEvent, AgentStreamRequest } from "@llm-space/core";
import type { RuntimeCapability } from "@llm-space/runtime/runtime";

import { RemoteRuntimeClient } from "./remote-runtime-client";
import { currentDesktopVersion } from "./server-package";

const CAPABILITIES: RuntimeCapability[] = [
  "streamThread",
  "filesystem",
  "models",
  "mcp",
  "builtinTools",
  "skills",
  "search",
  "network",
  "traces",
];

const HEALTH_BODY = {
  ok: true,
  version: currentDesktopVersion(),
  protocolVersion: 2,
  capabilities: CAPABILITIES,
  homePath: "/tmp/remote",
  workspacePath: "/tmp/remote/workspace",
  platform: { os: "linux", arch: "x64" },
};

describe("RemoteRuntimeClient", () => {
  test("connects with bearer auth and exposes remote info", async () => {
    const requests: Request[] = [];
    await _withFetch(
      (request) => {
        requests.push(request);
        return Response.json(HEALTH_BODY);
      },
      async () => {
        const client = new RemoteRuntimeClient({
          id: "remote:test",
          name: "Test Remote",
          baseUrl: "http://remote.test/",
          token: "secret",
        });
        await client.connect();
        expect(client.info()).toEqual({
          id: "remote:test",
          kind: "remote",
          name: "Test Remote",
          status: "connected",
          capabilities: HEALTH_BODY.capabilities,
        });
      }
    );

    expect(requests[0].url).toBe("http://remote.test/health");
    expect(requests[0].headers.get("authorization")).toBe("Bearer secret");
  });

  test("posts runtime RPC envelopes and unwraps results", async () => {
    let body: unknown;
    await _withFetch(
      async (request) => {
        body = await request.json();
        return Response.json({ id: "1", ok: true, result: [] });
      },
      async () => {
        const client = new RemoteRuntimeClient({
          id: "remote:test",
          name: "Test Remote",
          baseUrl: "http://remote.test",
          token: "secret",
        });
        expect(await client.availableModels()).toEqual([]);
      }
    );

    expect(body).toMatchObject({ method: "models.available" });
  });

  test("requests remote shutdown with bearer auth", async () => {
    const requests: Request[] = [];
    await _withFetch(
      (request) => {
        requests.push(request);
        return Response.json({ ok: true });
      },
      async () => {
        const client = new RemoteRuntimeClient({
          id: "remote:test",
          name: "Test Remote",
          baseUrl: "http://remote.test/",
          token: "secret",
        });
        await client.shutdownRemote();
      }
    );

    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("http://remote.test/shutdown");
    expect(requests[0].headers.get("authorization")).toBe("Bearer secret");
  });

  test("throws on runtime RPC errors", async () => {
    await _withFetch(
      () =>
        Response.json({
          id: "1",
          ok: false,
          error: { code: "boom", message: "Remote failed" },
        }),
      async () => {
        const client = new RemoteRuntimeClient({
          id: "remote:test",
          name: "Test Remote",
          baseUrl: "http://remote.test",
          token: "secret",
        });
        let rejection: unknown;
        try {
          await client.availableModels();
        } catch (error) {
          rejection = error;
        }
        expect(rejection).toBeInstanceOf(Error);
        expect((rejection as Error).message).toBe("Remote failed");
      }
    );
  });

  test("rejects incompatible protocol, version, and capabilities", async () => {
    await _expectConnectError(
      { ...HEALTH_BODY, protocolVersion: 1 },
      "Remote runtime protocol mismatch"
    );
    await _expectConnectError(
      { ...HEALTH_BODY, protocolVersion: 999 },
      "Remote runtime protocol mismatch"
    );
    await _expectConnectError(
      { ...HEALTH_BODY, version: "0.0.1" },
      "Remote runtime version mismatch"
    );
    await _expectConnectError(
      { ...HEALTH_BODY, capabilities: ["filesystem"] },
      "missing required capabilities"
    );
  });

  test("posts filesystem, tool, MCP, and settings methods", async () => {
    const methods: string[] = [];
    await _withFetch(
      async (request) => {
        const body = (await request.json()) as { method: string };
        methods.push(body.method);
        return Response.json({
          id: "1",
          ok: true,
          result: body.method === "fs.realpath" ? { path: "/tmp/x" } : [],
        });
      },
      async () => {
        const client = new RemoteRuntimeClient({
          id: "remote:test",
          name: "Test Remote",
          baseUrl: "http://remote.test",
          token: "secret",
        });
        await client.fsCp("a", "b");
        await client.fsMv("b", "c");
        await client.fsRm("c");
        await client.builtInCallTool({ name: "ls", arguments: {} });
        await client.mcpListTools("server-1");
        await client.mcpCallTool({
          serverId: "server-1",
          toolName: "tool",
          arguments: {},
        });
        await client.setSearchSettings({
          provider: "firecrawl",
          braveApiKey: "",
          firecrawlApiKey: "key",
          tavilyApiKey: "",
        });
      }
    );

    expect(methods).toEqual([
      "fs.cp",
      "fs.mv",
      "fs.rm",
      "builtinTools.call",
      "mcp.listTools",
      "mcp.callTool",
      "search.set",
    ]);
  });

  test("uses remote prompt-file operations without a local fallback", async () => {
    const requests: { method: string; params?: unknown }[] = [];
    await _withFetch(
      async (request) => {
        const body = (await request.json()) as {
          method: string;
          params?: unknown;
        };
        requests.push(body);
        const result =
          body.method === "fs.readText"
            ? "REMOTE CONTENT"
            : body.method === "fs.textFileExists";
        return Response.json({ id: "1", ok: true, result });
      },
      async () => {
        const client = new RemoteRuntimeClient({
          id: "remote:test",
          name: "Test Remote",
          baseUrl: "http://remote.test",
          token: "secret",
        });

        expect(await client.readTextFile("~/prompt.md")).toBe(
          "REMOTE CONTENT"
        );
        expect(await client.textFileExists("/remote-only.md")).toBe(true);
      }
    );

    expect(requests.map(({ method, params }) => ({ method, params }))).toEqual([
      { method: "fs.readText", params: { path: "~/prompt.md" } },
      {
        method: "fs.textFileExists",
        params: { path: "/remote-only.md" },
      },
    ]);
  });

  test("parses SSE stream events", async () => {
    const events: AgentEvent[] = [];
    await _withFetch(
      () => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode("data: [START]\n\n"));
            controller.enqueue(
              encoder.encode('data: {"type":"agent_start"}\n\n')
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      },
      async () => {
        const client = new RemoteRuntimeClient({
          id: "remote:test",
          name: "Test Remote",
          baseUrl: "http://remote.test",
          token: "secret",
        });
        await client.streamThread(
          { streamId: "s1", request: {} as AgentStreamRequest },
          (message) => {
            if (message.type === "event") {
              events.push(message.event);
            }
          }
        );
      }
    );

    expect(events).toEqual([{ type: "agent_start" }]);
  });
});

async function _withFetch(
  handler: (request: Request) => Response | Promise<Response>,
  run: () => Promise<void>
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = ((input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    return handler(request);
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

async function _expectConnectError(
  health: unknown,
  message: string
): Promise<void> {
  await _withFetch(
    () => Response.json(health),
    async () => {
      const client = new RemoteRuntimeClient({
        id: "remote:test",
        name: "Test Remote",
        baseUrl: "http://remote.test/",
        token: "secret",
      });
      let rejection: unknown;
      try {
        await client.connect();
      } catch (error) {
        rejection = error;
      }
      expect(rejection).toBeInstanceOf(Error);
      expect((rejection as Error).message).toContain(message);
    }
  );
}

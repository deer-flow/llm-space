import { afterEach, describe, expect, test } from "bun:test";

import { createWebBuiltInTools } from "../../../src/tools/built-in/web";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe("Brave Search provider", () => {
  test("uses the official endpoint, auth header, and normalized result shape", async () => {
    let request: { url: URL; headers: Headers } | undefined;
    globalThis.fetch = ((input, init) => {
      request = {
        url:
          input instanceof URL
            ? input
            : typeof input === "string"
              ? new URL(input)
              : new URL(input.url),
        headers: new Headers(init?.headers),
      };
      return Promise.resolve(
        Response.json({
          web: {
            results: [
              {
                title: "LLM Space",
                url: "https://example.com/llm-space",
                description: "A prompt and agent workbench.",
                extra_snippets: ["Build and inspect agent runs."],
              },
            ],
          },
        })
      );
    }) as typeof fetch;

    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "brave",
        braveApiKey: "brave-key",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        exaApiKey: "",
        anysearchApiKey: "",
        zhihuAccessSecret: "",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    const result = await search?.execute({
      query: "LLM Space",
      limit: 50,
      includeContent: true,
    });

    expect(request).toBeDefined();
    if (!request) throw new Error("Brave Search request was not captured");
    expect(request.url.origin + request.url.pathname).toBe(
      "https://api.search.brave.com/res/v1/web/search"
    );
    expect(request.url.searchParams.get("q")).toBe("LLM Space");
    expect(request.url.searchParams.get("count")).toBe("20");
    expect(request.url.searchParams.get("extra_snippets")).toBe("true");
    expect(request.headers.get("X-Subscription-Token")).toBe("brave-key");
    expect(result).toEqual([
      {
        title: "LLM Space",
        url: "https://example.com/llm-space",
        snippet: "A prompt and agent workbench.",
        content:
          "A prompt and agent workbench.\n\nBuild and inspect agent runs.",
      },
    ]);
  });

  test("requires a configured Brave Search API key", async () => {
    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "brave",
        braveApiKey: "$BRAVE_SEARCH_API_KEY",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        exaApiKey: "",
        anysearchApiKey: "",
        zhihuAccessSecret: "",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    let rejection: unknown;
    try {
      await Promise.resolve(search!.execute({ query: "test" }));
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toContain(
      "Brave Search API key is not configured"
    );
  });

  test("surfaces error details returned by Brave Search", async () => {
    globalThis.fetch = ((input) => {
      void input;
      return Promise.resolve(
        Response.json(
          {
            type: "ErrorResponse",
            error: {
              status: 422,
              detail: "The provided subscription token is invalid.",
              code: "SUBSCRIPTION_TOKEN_INVALID",
            },
          },
          { status: 422 }
        )
      );
    }) as typeof fetch;

    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "brave",
        braveApiKey: "invalid-brave-key",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        exaApiKey: "",
        anysearchApiKey: "",
        zhihuAccessSecret: "",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    let rejection: unknown;
    try {
      await Promise.resolve(search!.execute({ query: "test" }));
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe(
      "The provided subscription token is invalid."
    );
  });

  test("delegates web_fetch to Firecrawl", async () => {
    let request: { url: string; headers: Headers } | undefined;
    globalThis.fetch = ((input, init) => {
      request = {
        url:
          input instanceof URL
            ? input.toString()
            : typeof input === "string"
              ? input
              : input.url,
        headers: new Headers(init?.headers),
      };
      return Promise.resolve(
        Response.json({
          success: true,
          data: {
            markdown: "# Example",
            metadata: { title: "Example" },
          },
        })
      );
    }) as typeof fetch;

    const fetchTool = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "brave",
        braveApiKey: "brave-key",
        firecrawlApiKey: "firecrawl-key",
        tavilyApiKey: "",
        exaApiKey: "",
        anysearchApiKey: "",
        zhihuAccessSecret: "",
      }),
    }).find((entry) => entry.tool.name === "web_fetch");

    const result = await fetchTool?.execute({ url: "https://example.com" });

    expect(request).toBeDefined();
    if (!request) throw new Error("Firecrawl request was not captured");
    expect(request.url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(request.headers.get("Authorization")).toBe("Bearer firecrawl-key");
    expect(result).toEqual({
      url: "https://example.com",
      title: "Example",
      content: "# Example",
      metadata: { title: "Example" },
    });
  });
});

// -- MCP-backed providers ------------------------------------------------------

const NEW_SETTINGS_FIELDS = {
  exaApiKey: "",
  anysearchApiKey: "",
  zhihuAccessSecret: "",
};

interface RpcCallBody {
  method?: string;
  params?: Record<string, unknown>;
}

function _parseRpcBody(body: unknown): RpcCallBody | undefined {
  return typeof body === "string" ? (JSON.parse(body) as RpcCallBody) : undefined;
}

function _sseResponse(
  frames: string[],
  headers: Record<string, string> = {}
): Response {
  return new Response(frames.join("\n") + "\n\n", {
    headers: { "content-type": "text/event-stream", ...headers },
  });
}

describe("Exa MCP provider", () => {
  test("handshakes over Streamable HTTP, keeps the session, and parses results", async () => {
    const calls: { url: string; headers: Headers; body?: RpcCallBody }[] = [];
    globalThis.fetch = ((input, init) => {
      const url =
        input instanceof URL
          ? input.href
          : typeof input === "string"
            ? input
            : input.url;
      const headers = new Headers(init?.headers);
      const body = _parseRpcBody(init?.body);
      calls.push({ url, headers, body });
      if (calls.length === 1) {
        // initialize → SSE-framed response carrying a session id.
        return Promise.resolve(
          _sseResponse(
            [
              "event: message",
              `data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} })}`,
            ],
            { "mcp-session-id": "sess-exa-1" }
          )
        );
      }
      if (calls.length === 2) {
        // notifications/initialized
        return Promise.resolve(new Response(null, { status: 202 }));
      }
      return Promise.resolve(
        _sseResponse([
          "event: message",
          `data: ${JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            result: {
              content: [
                {
                  type: "text",
                  text: "Title: Bun v1.4.2 | Bun Blog\nURL: https://bun.com/blog/bun-v1.4.2\nHighlights:\nFixes two regressions impacting Elysia.\n\n---\n\nTitle: Releases · oven-sh/bun\nURL: https://github.com/oven-sh/bun/releases\nHighlights:\nLatest release notes.",
                },
              ],
            },
          })}`,
          "",
        ])
      );
    }) as typeof fetch;

    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "exa",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        ...NEW_SETTINGS_FIELDS,
        exaApiKey: "exa-key",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    const result = (await search?.execute({
      query: "bun release notes",
      limit: 50,
      includeContent: true,
    })) as { title: string; url: string; snippet?: string; content?: string }[];

    expect(calls.length).toBe(3);
    expect(calls[0].url).toBe("https://mcp.exa.ai/mcp");
    expect(calls[0].body?.method).toBe("initialize");
    expect(calls[1].headers.get("mcp-session-id")).toBe("sess-exa-1");
    expect(calls[2].body?.params).toEqual({
      name: "web_search_exa",
      arguments: { query: "bun release notes", numResults: 10 },
    });
    expect(calls[2].headers.get("x-api-key")).toBe("exa-key");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      title: "Bun v1.4.2 | Bun Blog",
      url: "https://bun.com/blog/bun-v1.4.2",
      snippet: "Fixes two regressions impacting Elysia.",
      content: "Fixes two regressions impacting Elysia.",
    });
    expect(result[1].url).toBe("https://github.com/oven-sh/bun/releases");
  });
});

describe("AnySearch MCP provider", () => {
  test("searches anonymously over Streamable HTTP with JSON responses", async () => {
    const calls: { headers: Headers; body?: RpcCallBody }[] = [];
    globalThis.fetch = ((_input, init) => {
      const headers = new Headers(init?.headers);
      const body = _parseRpcBody(init?.body);
      calls.push({ headers, body });
      if (calls.length === 1) {
        return Promise.resolve(
          Response.json({ jsonrpc: "2.0", id: 1, result: {} })
        );
      }
      if (calls.length === 2) {
        return Promise.resolve(new Response(null, { status: 202 }));
      }
      return Promise.resolve(
        Response.json({
          jsonrpc: "2.0",
          id: 2,
          result: {
            content: [
              {
                type: "text",
                text: "## Search Results (2 results, 2573ms)\n\n### 1. Blog\n- **URL**: https://bun.com/blog\n- Bun 1.3 introduces zero-config frontend development.\n\n### 2. Releases · oven-sh/bun\n- **URL**: https://github.com/oven-sh/bun/releases\n- Read the latest release notes.",
              },
            ],
          },
        })
      );
    }) as typeof fetch;

    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "anysearch",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        ...NEW_SETTINGS_FIELDS,
        anysearchApiKey: "$ANYSEARCH_API_KEY",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    const result = (await search?.execute({
      query: "bun release notes",
      limit: 2,
      includeContent: false,
    })) as { title: string; url: string; snippet?: string; content?: string }[];

    expect(calls.length).toBe(3);
    // Anonymous access: no Authorization header is sent.
    expect(calls[0].headers.get("Authorization")).toBeNull();
    expect(calls[2].body?.params).toEqual({
      name: "search",
      arguments: { query: "bun release notes", max_results: 2 },
    });
    expect(result).toEqual([
      {
        title: "Blog",
        url: "https://bun.com/blog",
        snippet: "Bun 1.3 introduces zero-config frontend development.",
        content: undefined,
      },
      {
        title: "Releases · oven-sh/bun",
        url: "https://github.com/oven-sh/bun/releases",
        snippet: "Read the latest release notes.",
        content: undefined,
      },
    ]);
  });

  test("sends the Bearer key when one is configured", async () => {
    const headersSeen: (string | null)[] = [];
    globalThis.fetch = ((_input, init) => {
      headersSeen.push(new Headers(init?.headers).get("Authorization"));
      if (headersSeen.length === 1) {
        return Promise.resolve(
          Response.json({ jsonrpc: "2.0", id: 1, result: {} })
        );
      }
      if (headersSeen.length === 2) {
        return Promise.resolve(new Response(null, { status: 202 }));
      }
      return Promise.resolve(
        Response.json({ jsonrpc: "2.0", id: 2, result: { content: [] } })
      );
    }) as typeof fetch;

    const search = createWebBuiltInTools({
      env: { ANYSEARCH_API_KEY: "secret-key" },
      getSearchSettings: () => ({
        provider: "anysearch",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        ...NEW_SETTINGS_FIELDS,
        anysearchApiKey: "$ANYSEARCH_API_KEY",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    await search?.execute({ query: "test" });
    expect(headersSeen).toEqual(["Bearer secret-key", "Bearer secret-key", "Bearer secret-key"]);
  });
});

describe("Zhihu MCP provider", () => {
  test("requires a configured access secret", async () => {
    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "zhihu",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        ...NEW_SETTINGS_FIELDS,
        zhihuAccessSecret: "$ZHIHU_ACCESS_SECRET",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    let rejection: unknown;
    try {
      await Promise.resolve(search!.execute({ query: "RAG" }));
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toContain(
      "Zhihu access secret is not configured"
    );
  });

  test("opens the SSE stream, posts to the session endpoint, and parses results", async () => {
    const requests: {
      method: string;
      url: string;
      headers: Headers;
      body?: RpcCallBody;
    }[] = [];
    globalThis.fetch = ((input, init) => {
      const method = init?.method ?? "GET";
      const url =
        input instanceof URL
          ? input.href
          : typeof input === "string"
            ? input
            : input.url;
      requests.push({
        method,
        url,
        headers: new Headers(init?.headers),
        body: _parseRpcBody(init?.body),
      });
      if (method === "GET") {
        return Promise.resolve(
          _sseResponse([
            "event: endpoint",
            "data: /api/mcp/zhihu_search/v1/message?sessionId=abc",
            "",
            "event: message",
            `data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} })}`,
            "",
            "event: message",
            `data: ${JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              result: {
                content: [
                  {
                    type: "text",
                    text: '<zhihu_search query="RAG">\n<search_item title="RAG 评测方法综述" content_type="Article" url="https://zhuanlan.zhihu.com/p/1" author_name="张三" ranking_score="0.9800">\n本文介绍了主流 RAG 评测框架。\n</search_item>\n</zhihu_search>',
                  },
                ],
              },
            })}`,
          ])
        );
      }
      return Promise.resolve(new Response(null, { status: 202 }));
    }) as typeof fetch;

    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "zhihu",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        ...NEW_SETTINGS_FIELDS,
        zhihuAccessSecret: "zhihu-secret",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    const result = (await search?.execute({
      query: "RAG",
      limit: 5,
      includeContent: false,
    })) as { title: string; url: string; snippet?: string; content?: string }[];

    expect(requests.length).toBe(4);
    expect(requests[0].method).toBe("GET");
    expect(requests[0].url).toBe(
      "https://developer.zhihu.com/api/mcp/zhihu_search/v1/sse"
    );
    expect(requests[0].headers.get("Authorization")).toBe(
      "Bearer zhihu-secret"
    );
    // JSON-RPC messages go to the session endpoint returned by `endpoint`.
    expect(requests[1].url).toBe(
      "https://developer.zhihu.com/api/mcp/zhihu_search/v1/message?sessionId=abc"
    );
    expect(requests[2].body?.method).toBe("notifications/initialized");
    expect(requests[3].body?.params).toEqual({
      name: "zhihu_search",
      arguments: { query: "RAG", count: 5 },
    });
    expect(result).toEqual([
      {
        title: "RAG 评测方法综述",
        url: "https://zhuanlan.zhihu.com/p/1",
        snippet: "本文介绍了主流 RAG 评测框架。",
        content: undefined,
      },
    ]);
  });
});

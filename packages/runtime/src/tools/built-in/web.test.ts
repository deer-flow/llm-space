import { afterEach, describe, expect, test } from "bun:test";

import { createWebBuiltInTools } from "./web";

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

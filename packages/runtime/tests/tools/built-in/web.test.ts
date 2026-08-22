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
        searxngBaseUrl: "http://localhost:8080",
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
        searxngBaseUrl: "http://localhost:8080",
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
        searxngBaseUrl: "http://localhost:8080",
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
        searxngBaseUrl: "http://localhost:8080",
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

describe("Searxng Search provider", () => {
  test("uses the base URL, JSON API params, botdetection headers, and normalized result shape", async () => {
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
          results: [
            {
              title: "LLM Space",
              url: "https://example.com/llm-space",
              content: "A prompt and agent workbench.",
            },
          ],
        })
      );
    }) as typeof fetch;

    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "searxng",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        searxngBaseUrl: "http://localhost:8080",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    const result = await search?.execute({
      query: "LLM Space",
      limit: 5,
      includeContent: true,
    });

    expect(request).toBeDefined();
    if (!request) throw new Error("SearXNG request was not captured");
    expect(request.url.origin + request.url.pathname).toBe(
      "http://localhost:8080/search"
    );
    expect(request.url.searchParams.get("q")).toBe("LLM Space");
    expect(request.url.searchParams.get("format")).toBe("json");
    expect(request.url.searchParams.get("language")).toBe("auto");
    expect(request.url.searchParams.get("pageno")).toBe("1");
    expect(request.url.searchParams.get("limit")).toBe("5");
    expect(request.headers.get("Accept")).toBe("application/json");
    expect(request.headers.get("X-Forwarded-For")).toBe("127.0.0.1");
    expect(request.headers.get("X-Real-IP")).toBe("127.0.0.1");
    expect(result).toEqual([
      {
        title: "LLM Space",
        url: "https://example.com/llm-space",
        snippet: "A prompt and agent workbench.",
        content: "A prompt and agent workbench.",
      },
    ]);
  });

  test("omits content when includeContent is false", async () => {
    globalThis.fetch = ((input) => {
      void input;
      return Promise.resolve(
        Response.json({
          results: [
            {
              title: "LLM Space",
              url: "https://example.com/llm-space",
              content: "A prompt and agent workbench.",
            },
          ],
        })
      );
    }) as typeof fetch;

    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "searxng",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        searxngBaseUrl: "http://localhost:8080",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    const result = await search?.execute({ query: "LLM Space" });

    expect(result).toEqual([
      {
        title: "LLM Space",
        url: "https://example.com/llm-space",
        snippet: "A prompt and agent workbench.",
      },
    ]);
  });

  test("requires a configured SearXNG service URL", async () => {
    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "searxng",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        searxngBaseUrl: " ",
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
      "SearXNG service URL is not configured"
    );
  });

  test("surfaces error details returned by SearXNG", async () => {
    globalThis.fetch = ((input) => {
      void input;
      return Promise.resolve(
        Response.json(
          {
            error:
              "Bot detected. Link to the CAPTCHA page: http://localhost/captcha",
          },
          { status: 429 }
        )
      );
    }) as typeof fetch;

    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "searxng",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        searxngBaseUrl: "http://localhost:8080",
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
      "Bot detected. Link to the CAPTCHA page: http://localhost/captcha"
    );
  });

  test("falls back to the status message when the non-OK body has no error", async () => {
    globalThis.fetch = ((input) => {
      void input;
      return Promise.resolve(Response.json({ nope: true }, { status: 500 }));
    }) as typeof fetch;

    const search = createWebBuiltInTools({
      env: {},
      getSearchSettings: () => ({
        provider: "searxng",
        braveApiKey: "",
        firecrawlApiKey: "",
        tavilyApiKey: "",
        searxngBaseUrl: "http://localhost:8080",
      }),
    }).find((entry) => entry.tool.name === "web_search");

    let rejection: unknown;
    try {
      await Promise.resolve(search!.execute({ query: "test" }));
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toBe("web_search failed: 500");
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
        provider: "searxng",
        braveApiKey: "",
        firecrawlApiKey: "firecrawl-key",
        tavilyApiKey: "",
        searxngBaseUrl: "http://localhost:8080",
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

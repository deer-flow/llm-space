import { afterEach, describe, expect, test } from "bun:test";

import { LangfuseClient } from "../../src/traces/langfuse-client";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function installFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): void {
  globalThis.fetch = handler as typeof fetch;
}

function client(): LangfuseClient {
  return new LangfuseClient({
    baseUrl: "https://langfuse.example.test",
    publicKey: "pk-test",
    secretKey: "sk-test",
  });
}

describe("Langfuse endpoint compatibility", () => {
  test("falls back to v2 observations when trace search is unavailable", async () => {
    const requests: string[] = [];
    installFetch(async (input) => {
      const url = requestUrl(input);
      requests.push(url);
      if (url.includes("/api/public/traces")) {
        return jsonResponse(
          {
            message:
              "This endpoint is not available on events_only deployments.",
          },
          404
        );
      }
      return jsonResponse({
        data: [
          {
            traceId: "trace-1",
            traceName: "agent-run",
            startTime: "2026-08-20T10:00:00.000Z",
            userId: "user-1",
            sessionId: "session-1",
            traceVersion: "v1",
            traceRelease: "release-1",
            environment: "production",
            tags: ["important"],
            totalCost: 1.25,
          },
          {
            traceId: "trace-1",
            traceName: "agent-run",
            startTime: "2026-08-20T10:00:01.000Z",
            totalCost: 0.75,
          },
        ],
      });
    });

    expect(client().searchTraces({ limit: 10 })).resolves.toEqual([
      {
        id: "trace-1",
        name: "agent-run",
        timestamp: "2026-08-20T10:00:00.000Z",
        userId: "user-1",
        sessionId: "session-1",
        version: "v1",
        release: "release-1",
        environment: "production",
        tags: ["important"],
        observationCount: 2,
        totalCost: 2,
      },
    ]);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain("/api/public/traces");
    expect(requests[1]).toContain("/api/public/v2/observations");
  });

  test("falls back to legacy observations when v2 observations are unavailable", async () => {
    const requests: string[] = [];
    installFetch(async (input) => {
      const url = requestUrl(input);
      requests.push(url);
      if (url.includes("/api/public/v2/observations")) {
        return jsonResponse({ message: "v2 is unavailable" }, 404);
      }
      return jsonResponse({
        data: [{ id: "observation-1", traceId: "trace-1", name: "root" }],
        meta: { page: 1, totalPages: 1 },
      });
    });

    expect(client().getObservationsForTrace("trace-1")).resolves.toEqual({
      rows: [{ id: "observation-1", traceId: "trace-1", name: "root" }],
      truncated: false,
      pageCount: 1,
      maxPages: 5,
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain("/api/public/observations");
    expect(requests[1]).toContain("page=1");
  });

  test("does not fall back for authentication failures", async () => {
    let requestCount = 0;
    installFetch(async () => {
      requestCount += 1;
      return jsonResponse({ message: "invalid credentials" }, 401);
    });

    expect(client().getObservationsForTrace("trace-1")).rejects.toThrow(
      "401 Unauthorized"
    );
    expect(requestCount).toBe(1);
  });

  test("preserves unsupported-deployment details when both search APIs fail", async () => {
    installFetch(async () =>
      jsonResponse(
        {
          message:
            "This endpoint is not available on deployments running in events_only mode.",
        },
        404
      )
    );

    expect(client().searchTraces()).rejects.toThrow("events_only mode");
  });
});

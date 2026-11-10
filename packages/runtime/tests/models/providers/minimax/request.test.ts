import { describe, expect, test } from "bun:test";

import { createModels } from "@earendil-works/pi-ai";

import { minimaxProvider } from "../../../../src/models/providers/minimax";
import { minimaxCnProvider } from "../../../../src/models/providers/minimax-cn";

for (const factory of [minimaxProvider, minimaxCnProvider]) {
  describe(factory.name, () => {
    for (const reasoning of [undefined, "low", "medium", "high", "xhigh", "max"] as const) {
      test(`serializes Flash with ${reasoning ?? "default"} thinking`, async () => {
        let body: Record<string, unknown> | undefined;
        let path: string | undefined;
        const server = Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          async fetch(request) {
            path = new URL(request.url).pathname;
            body = await request.json() as Record<string, unknown>;
            const chunk = {
              id: "local-test",
              object: "chat.completion.chunk",
              created: 0,
              model: "MiniMax-M3.1-Flash",
              choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }],
            };
            return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
              headers: { "Content-Type": "text/event-stream" },
            });
          },
        });
        try {
          const provider = factory();
          const models = createModels({
            authContext: {
              env: async () => "local-test-key",
              fileExists: async () => false,
            },
          });
          models.setProvider(provider);
          const model = {
            ...provider.getModels().find((item) => item.id === "MiniMax-M3.1-Flash")!,
            baseUrl: `http://127.0.0.1:${server.port}/v1`,
          };
          const result = await models.streamSimple(model, {
            messages: [{ role: "user", content: "hello", timestamp: 0 }],
          }, { reasoning }).result();
          expect(result.stopReason).toBe("stop");
          expect(path).toBe("/v1/chat/completions");
          expect(body?.model).toBe("MiniMax-M3.1-Flash");
          expect(body?.thinking).toEqual({ type: "adaptive" });
          expect(body?.reasoning_effort).toBe(reasoning);
          expect(body?.enable_thinking).toBeUndefined();
        } finally {
          await server.stop(true);
        }
      });
    }
  });
}

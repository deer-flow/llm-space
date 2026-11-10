import { describe, expect, test } from "bun:test";

import {
  MINIMAX_CN_MODELS,
  MINIMAX_MODELS,
} from "../../../../src/models/providers/minimax.models";

for (const [provider, baseUrl, catalog] of [
  ["minimax", "https://api.minimax.io/v1", MINIMAX_MODELS],
  ["minimax-cn", "https://api.minimaxi.com/v1", MINIMAX_CN_MODELS],
] as const) {
  describe(provider, () => {
    test("registers Flash first without removing saved legacy model IDs", () => {
      expect(Object.keys(catalog)).toEqual([
        "MiniMax-M3.1-Flash", "MiniMax-M3", "MiniMax-M2.7",
      ]);
      const flash = catalog["MiniMax-M3.1-Flash"];
      expect(flash.provider).toBe(provider);
      expect(flash.baseUrl).toBe(baseUrl);
      expect(flash.api).toBe("openai-completions");
      expect(flash.input.map(String)).toEqual(["text", "image", "video"]);
      expect(flash.contextWindow).toBe(1000000);
      expect(flash.maxTokens).toBe(524288);
      expect(flash.cost).toEqual({ input: 0.15, output: 0.6, cacheRead: 0.015, cacheWrite: 0 });
    });

    test("uses adaptive thinking and exposes only supported efforts", () => {
      const flash = catalog["MiniMax-M3.1-Flash"];
      expect(flash.samplingParams).toEqual({ thinking: { type: "adaptive" } });
      expect(flash.compat.thinkingFormat).toBe("openai");
      expect(flash.thinkingLevelMap).toEqual({
        off: null, minimal: null, low: "low", medium: "medium",
        high: "high", xhigh: "xhigh", max: "max",
      });
      expect(catalog["MiniMax-M3"].thinkingLevelMap.off).toBe("off");
      expect(catalog["MiniMax-M2.7"].thinkingLevelMap.off).toBeNull();
    });
  });
}

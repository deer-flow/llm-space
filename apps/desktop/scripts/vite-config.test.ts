import { describe, expect, test } from "bun:test";

import viteConfig from "../vite.config";

describe("desktop Vite packaging", () => {
  test("uses short imported-asset names for the Windows tar extractor", () => {
    const output = viteConfig.build?.rollupOptions?.output;

    expect(output).toBeDefined();
    expect(Array.isArray(output)).toBe(false);
    if (!output || Array.isArray(output)) return;

    expect(output.assetFileNames).toBe("assets/[hash][extname]");
  });
});

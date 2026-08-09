import { describe, expect, test } from "bun:test";

import { z } from "zod";

import { parseJsonWithSchema } from "../../src/utils/json";

const StateSchema = z.object({
  frame: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  isMaximized: z.boolean().optional(),
});

describe("parseJsonWithSchema", () => {
  test("distinguishes strict JSON from recovered truncated JSON", () => {
    expect(
      parseJsonWithSchema(
        '{"frame":{"x":1,"y":2,"width":3,"height":4}}',
        StateSchema,
        { recovery: "best-effort" }
      ).status
    ).toBe("strict");

    const result = parseJsonWithSchema(
      '{"frame":{"x":2560,"y":1871,"width":1440,"height":1265},"isMaximized":false,"isFullScree',
      StateSchema,
      { recovery: "best-effort" }
    );
    expect(result).toEqual({
      status: "recovered",
      value: {
        frame: { x: 2560, y: 1871, width: 1440, height: 1265 },
        isMaximized: false,
      },
    });
  });

  test("rejects a recovered value that fails Zod validation", () => {
    const result = parseJsonWithSchema(
      '{"frame":{"x":1,"y":2,"width":0',
      StateSchema,
      { recovery: "best-effort" }
    );
    expect(result.status).toBe("invalid-shape");
  });
});

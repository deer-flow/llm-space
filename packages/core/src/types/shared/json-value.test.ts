import { expect, test } from "bun:test";

import { z } from "zod";

import { JsonValue } from "./json-value";

test("converts recursive JSON values to Zod", () => {
  const schema = z.fromJSONSchema(
    JsonValue as unknown as Parameters<typeof z.fromJSONSchema>[0]
  );
  const value = {
    nested: [null, true, 42, "text", { deeper: [false] }],
  };

  expect(schema.parse(value)).toEqual(value);
});

import { describe, expect, test } from "bun:test";

import { findFreePort } from "./port";

describe("findFreePort", () => {
  test("returns a valid TCP port candidate", async () => {
    const port = await findFreePort();
    expect(port).toBeGreaterThanOrEqual(1);
    expect(port).toBeLessThanOrEqual(65535);
  });
});

import { describe, expect, test } from "bun:test";

import { verifyBearerToken } from "./auth";

describe("verifyBearerToken", () => {
  test("accepts exact bearer token", () => {
    const request = new Request("http://localhost/health", {
      headers: { Authorization: "Bearer test-token" },
    });
    expect(verifyBearerToken(request, "test-token")).toBe(true);
  });

  test("rejects missing or wrong token", () => {
    expect(verifyBearerToken(new Request("http://localhost/health"), "x")).toBe(
      false
    );
    expect(
      verifyBearerToken(
        new Request("http://localhost/health", {
          headers: { Authorization: "Bearer wrong" },
        }),
        "x"
      )
    ).toBe(false);
  });
});

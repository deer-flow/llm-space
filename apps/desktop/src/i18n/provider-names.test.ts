import { describe, expect, test } from "bun:test";

import { providerDisplayName } from "./provider-names";

describe("providerDisplayName", () => {
  test("uses the Chinese brand name for Volcengine builtins", () => {
    for (const id of ["ark", "ark-agent-plan", "ark-coding-plan"]) {
      expect(providerDisplayName({ id, name: "VolcanoEngine" }, "zh")).toBe(
        "火山引擎"
      );
    }
  });

  test("preserves configured names in English and for custom providers", () => {
    expect(
      providerDisplayName({ id: "ark", name: "VolcanoEngine" }, "en")
    ).toBe("VolcanoEngine");
    expect(
      providerDisplayName({ id: "my-provider", name: "My provider" }, "zh")
    ).toBe("My provider");
  });
});

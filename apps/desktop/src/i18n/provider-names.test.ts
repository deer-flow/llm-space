import { describe, expect, test } from "bun:test";

import { providerDisplayName } from "./provider-names";

describe("providerDisplayName", () => {
  test("localizes Aliyun Qwen in Chinese", () => {
    expect(
      providerDisplayName({ id: "aliyun-qwen", name: "Aliyun Qwen" }, "zh")
    ).toBe("阿里云千问 AI 平台");
    expect(
      providerDisplayName({ id: "aliyun-qwen", name: "Aliyun Qwen" }, "en")
    ).toBe("Aliyun Qwen");
  });

  test("localizes Tencent Token Hub in Chinese", () => {
    expect(
      providerDisplayName(
        { id: "tencent-tokenhub", name: "Tencent Token Hub" },
        "zh"
      )
    ).toBe("腾讯云 Token Hub");
    expect(
      providerDisplayName(
        { id: "tencent-tokenhub", name: "Tencent Token Hub" },
        "en"
      )
    ).toBe("Tencent Token Hub");
  });

  test("uses the Chinese brand name for Volcengine builtins", () => {
    for (const id of ["ark", "ark-agent-plan", "ark-coding-plan"]) {
      expect(providerDisplayName({ id, name: "VolcanoEngine" }, "zh")).toBe(
        "火山引擎"
      );
    }
  });

  test("labels mainland variants without adding a region to overseas providers", () => {
    expect(providerDisplayName({ id: "minimax", name: "MiniMax" }, "zh")).toBe(
      "MiniMax"
    );
    expect(
      providerDisplayName({ id: "minimax-cn", name: "MiniMax CN" }, "zh")
    ).toBe("MiniMax（国内）");
    expect(
      providerDisplayName({ id: "moonshotai", name: "Moonshot AI" }, "zh")
    ).toBe("月之暗面");
    expect(
      providerDisplayName({ id: "moonshotai-cn", name: "Moonshot AI CN" }, "zh")
    ).toBe("月之暗面（国内）");
    expect(providerDisplayName({ id: "zai", name: "Z.AI" }, "zh")).toBe("智普");
    expect(
      providerDisplayName({ id: "zai-coding-cn", name: "Z.AI Coding CN" }, "zh")
    ).toBe("智普 Coding（国内）");
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

import { describe, expect, test } from "bun:test";

import { withAppearancePreferences } from "./main-view-url";

describe("withAppearancePreferences", () => {
  test("leaves packaged views URLs unchanged for the CEF renderer", () => {
    expect(
      withAppearancePreferences("views://mainview/index.html", {
        "llm-space-theme": "dark",
        "llm-space-primary": "null",
        "llm-space-rendering-fidelity": "rich",
      })
    ).toBe("views://mainview/index.html");
  });

  test("passes appearance preferences to the HTTP development view", () => {
    const result = new URL(
      withAppearancePreferences("http://localhost:5173", {
        "llm-space-theme": "light",
        "llm-space-primary": "#5e80ee",
        "llm-space-rendering-fidelity": "lite",
      })
    );

    expect(result.searchParams.get("llm-space-theme")).toBe("light");
    expect(result.searchParams.get("llm-space-primary")).toBe("#5e80ee");
    expect(result.searchParams.get("llm-space-rendering-fidelity")).toBe(
      "lite"
    );
  });
});

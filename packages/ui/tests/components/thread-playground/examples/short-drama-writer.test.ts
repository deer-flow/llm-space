import { describe, expect, test } from "bun:test";

import { getPromptExample } from "../../../../src/components/thread-playground/examples/prompts";

describe("Short Drama Writer prompt example", () => {
  test("defines the production JSON and language-preservation requirements", () => {
    const example = getPromptExample("short-drama-writer");

    expect(example).toMatchObject({
      label: "Short Drama Writer",
      fileStem: "short-drama-writer",
    });
    expect(typeof example?.content).toBe("string");

    const prompt = example?.content as string;
    expect(prompt).toContain("Respect the user's language.");
    expect(prompt).toContain("Output valid JSON only.");
    expect(prompt).toContain('"aspectRatio": "9:16"');
    expect(prompt).toContain('"storyArc"');
    expect(prompt).toContain('"dramaticConflict"');
    expect(prompt).toContain('"characters"');
    expect(prompt).toContain('"backgroundSetting"');
    expect(prompt).toContain('"locations"');
  });
});

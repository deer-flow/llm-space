import { describe, expect, test } from "bun:test";

import { formatSkillLocator, parseSkillLocator } from "./skill-locator";

describe("skill locator", () => {
  test("formats and parses a valid skill name", () => {
    const locator = formatSkillLocator("frontend-design");

    expect(locator).toBe("llm-space://internal/skills/frontend-design");
    expect(parseSkillLocator(locator)).toBe("frontend-design");
  });

  test.each([
    "",
    "llm-space://internal/skills/",
    "llm-space://internal/skills/known-skill/extra",
    "llm-space://internal/skills/known-skill?mode=open",
    "llm-space://internal/skills/known-skill#section",
    "llm-space://user@internal/skills/known-skill",
    "llm-space://internal:1234/skills/known-skill",
    "llm-space://shared/gist/threads/123",
    "LLM-SPACE://internal/skills/known-skill",
    "llm-space://internal/skills/%ZZ",
    "llm-space://internal/skills/invalid%2Fname",
  ])("rejects invalid locator %s", (value) => {
    expect(parseSkillLocator(value)).toBeNull();
  });

  test.each([
    "",
    "-leading",
    "trailing-",
    "two--hyphens",
    "UPPERCASE",
    "contains/slash",
  ])("rejects invalid skill name %s", (name) => {
    expect(() => formatSkillLocator(name)).toThrow("Invalid skill name");
  });
});

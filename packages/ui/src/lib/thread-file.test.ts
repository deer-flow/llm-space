import { describe, expect, test } from "bun:test";

import { nextCompactedThreadPath } from "./thread-file";

describe("nextCompactedThreadPath", () => {
  test("creates the first compacted sibling", () => {
    expect(
      nextCompactedThreadPath("projects/agent.json", new Set(["agent.json"]))
    ).toBe("projects/agent-compact-1.json");
  });

  test("increments the sequence for original and compacted source paths", () => {
    const existing = new Set([
      "agent.json",
      "agent-compact-1.json",
      "agent-compact-2.json",
    ]);

    expect(nextCompactedThreadPath("agent.json", existing)).toBe(
      "agent-compact-3.json"
    );
    expect(nextCompactedThreadPath("agent-compact-2.json", existing)).toBe(
      "agent-compact-3.json"
    );
  });

  test("continues after the highest number without filling old gaps", () => {
    const existing = new Set(["agent.json", "agent-compact-3.json"]);

    expect(nextCompactedThreadPath("agent-compact-3.json", existing)).toBe(
      "agent-compact-4.json"
    );
  });
});

import { describe, expect, test } from "bun:test";

import type { SkillsHost } from "@llm-space/ui/host";

import { listEnabledPromptVariableSkills } from "./prompt-variable-skills";

describe("listEnabledPromptVariableSkills", () => {
  test("includes plugin skills from the runtime's effective list", async () => {
    const skills: SkillsHost = {
      getSettings: () => Promise.resolve({ discoveryPaths: [] }),
      listSkills: () => Promise.resolve([]),
      listAvailable: () =>
        Promise.resolve([
          {
            name: "plugin-review",
            description: "Review with plugin guidance",
            path: "/plugins/review/skills/plugin-review",
            enabled: true,
            source: "plugin",
            readOnly: true,
            pluginId: "review-plugin",
          },
        ]),
    };

    expect(await listEnabledPromptVariableSkills(skills)).toEqual([
      {
        name: "plugin-review",
        description: "Review with plugin guidance",
        path: "/plugins/review/skills/plugin-review",
        enabled: true,
        source: "plugin",
        readOnly: true,
        pluginId: "review-plugin",
      },
    ]);
  });
});

import { describe, expect, test } from "bun:test";

import { MESSAGES } from "@llm-space/ui/lib/i18n/messages";

import {
  parsePluginCommandArguments,
  parsePluginCommandInvocation,
  pluginCommandQualifiedName,
} from "./plugin-command-input";

const t = MESSAGES.en;

describe("Plugin Command palette arguments", () => {
  test("parses whitespace and quoted arguments", () => {
    expect(parsePluginCommandArguments(`skill "abc" '123'`, t)).toEqual([
      "skill",
      "abc",
      "123",
    ]);
    expect(
      parsePluginCommandArguments(`"" 'two words' escaped\\ value`, t)
    ).toEqual(["", "two words", "escaped value"]);
  });

  test("rejects incomplete quoting instead of executing partial input", () => {
    expect(() => parsePluginCommandArguments(`skill "abc`, t)).toThrow(
      'Unclosed " quote'
    );
    expect(() => parsePluginCommandArguments("skill\\", t)).toThrow(
      "Trailing escape"
    );
  });

  test("accepts the display name or stable command stem as the prefix", () => {
    const command = {
      id: "plugin:demo:command:sync",
      displayName: "Sync skills",
    };
    expect(
      parsePluginCommandInvocation(`sync skill "abc" '123'`, command, t)
    ).toEqual(["skill", "abc", "123"]);
    expect(
      parsePluginCommandInvocation("Sync skills all", command, t)
    ).toEqual(["all"]);
    expect(parsePluginCommandInvocation("other value", command, t)).toBeNull();
    expect(pluginCommandQualifiedName(command)).toBe("demo/sync");
    expect(
      pluginCommandQualifiedName({
        id: "plugin:@scope/tools:command:sync",
        displayName: "Sync",
      })
    ).toBe("@scope/tools/sync");
  });
});

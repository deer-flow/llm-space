import { describe, expect, test } from "bun:test";

import {
  parsePluginCommandArguments,
  parsePluginCommandInvocation,
  pluginCommandQualifiedName,
} from "./plugin-command-input";

describe("Plugin Command palette arguments", () => {
  test("parses whitespace and quoted arguments", () => {
    expect(parsePluginCommandArguments(`skill "abc" '123'`)).toEqual([
      "skill",
      "abc",
      "123",
    ]);
    expect(
      parsePluginCommandArguments(`"" 'two words' escaped\\ value`)
    ).toEqual(["", "two words", "escaped value"]);
  });

  test("rejects incomplete quoting instead of executing partial input", () => {
    expect(() => parsePluginCommandArguments(`skill "abc`)).toThrow(
      'Unclosed " quote'
    );
    expect(() => parsePluginCommandArguments("skill\\")).toThrow(
      "Trailing escape"
    );
  });

  test("accepts the display name or stable command stem as the prefix", () => {
    const command = {
      id: "plugin:demo:command:sync",
      displayName: "Sync skills",
    };
    expect(
      parsePluginCommandInvocation(`sync skill "abc" '123'`, command)
    ).toEqual(["skill", "abc", "123"]);
    expect(parsePluginCommandInvocation("Sync skills all", command)).toEqual([
      "all",
    ]);
    expect(parsePluginCommandInvocation("other value", command)).toBeNull();
    expect(pluginCommandQualifiedName(command)).toBe("demo/sync");
    expect(
      pluginCommandQualifiedName({
        id: "plugin:@scope/tools:command:sync",
        displayName: "Sync",
      })
    ).toBe("@scope/tools/sync");
  });
});

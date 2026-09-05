import { describe, expect, test } from "bun:test";

import { commandLabel, commandLabels } from "./command-labels";
import { COMMAND_META, type CommandType } from "./commands";

describe("commandLabel", () => {
  test("every command has a non-empty zh label", () => {
    const types = Object.keys(COMMAND_META) as CommandType[];
    expect(types.length).toBeGreaterThan(0);
    for (const type of types) {
      expect(commandLabel(type, "zh").length).toBeGreaterThan(0);
    }
  });

  test("en falls back to the COMMAND_META label", () => {
    for (const type of Object.keys(COMMAND_META) as CommandType[]) {
      expect(commandLabel(type, "en")).toBe(COMMAND_META[type].label);
    }
  });

  test("zh differs from the en label for translatable commands", () => {
    // Not a hard requirement per-command, but most labels must actually be
    // translated rather than copied; spot-check the whole map is not en.
    const types = Object.keys(COMMAND_META) as CommandType[];
    const translated = types.filter(
      (type) => commandLabel(type, "zh") !== COMMAND_META[type].label
    );
    expect(translated.length).toBeGreaterThan(types.length / 2);
  });
});

describe("commandLabels", () => {
  test("returns the en and zh labels for palette matching", () => {
    expect(commandLabels("openSettings")).toEqual(["Settings", "设置"]);
  });
});

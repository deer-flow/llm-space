import { describe, expect, test } from "bun:test";

import { sortToolsByName } from "../../../../src/components/thread-playground/tool/sort-tools-by-name";

describe("sortToolsByName", () => {
  test("sorts tool names alphabetically without regard to case", () => {
    const tools = [
      { name: "write_file" },
      { name: "Read_file" },
      { name: "apply_patch" },
      { name: "ls" },
    ];

    expect(sortToolsByName(tools).map((tool) => tool.name)).toEqual([
      "apply_patch",
      "ls",
      "Read_file",
      "write_file",
    ]);
  });

  test("does not mutate the source list", () => {
    const tools = [{ name: "write" }, { name: "read" }];

    sortToolsByName(tools);

    expect(tools.map((tool) => tool.name)).toEqual(["write", "read"]);
  });
});

import { describe, expect, test } from "bun:test";

import type { ToolCallInput } from "@llm-space/core";
import { renderToStaticMarkup } from "react-dom/server";

import { ToolCallInputView } from "../../../../src/components/thread-playground/message/tool-call-input-view";
import {
  HostServicesProvider,
  type HostServices,
} from "../../../../src/host";

function _render(input: ToolCallInput, streaming: boolean): string {
  return renderToStaticMarkup(
    <HostServicesProvider value={{} as HostServices}>
      <ToolCallInputView input={input} streaming={streaming} />
    </HostServicesProvider>
  );
}

describe("ToolCallInputView", () => {
  test("keeps the todo view mounted across partial streaming payloads", () => {
    const partialInputs: ToolCallInput[] = [
      { name: "todo_write", arguments: {} },
      { name: "todo_write", arguments: { todos: [{}] } },
      {
        name: "todo_write",
        arguments: { todos: [{ content: "First" }] },
      },
      {
        name: "todo_write",
        arguments: {
          todos: [{ content: "First", status: "pending" }, {}],
        },
      },
    ];

    const markups = partialInputs.map((input) => _render(input, true));

    expect(
      markups.every((markup) => markup.includes('data-slot="todo-write-view"'))
    ).toBe(true);
    expect(
      markups.slice(0, 3).every((markup) => !markup.includes("First"))
    ).toBe(true);
    expect(markups[3]).toContain("First");
  });

  test("uses the generic view after an interrupted malformed call", () => {
    const input: ToolCallInput = {
      name: "todo_write",
      arguments: {},
      partialArguments: '{"todos":[{"content":"Interrupted"',
    };

    const markup = _render(input, false);

    expect(markup).not.toContain('data-slot="todo-write-view"');
    expect(markup).toContain("todo_write");
  });

  test("does not change the view for another streaming tool", () => {
    const markup = _render({ name: "other_tool", arguments: {} }, true);

    expect(markup).not.toContain('data-slot="todo-write-view"');
    expect(markup).toContain("other_tool");
  });

  test("makes glob's home-relative target directory revealable", () => {
    const markup = _render(
      {
        name: "glob",
        arguments: {
          glob_pattern: "*.ts",
          target_directory: "~/Desktop/project",
        },
      },
      false
    );

    expect(markup).toContain('title="Reveal in file manager"');
    expect(markup).toContain("~/Desktop/project");
  });
});

import { describe, expect, test } from "bun:test";

import type { ToolCallInput } from "@llm-space/core";
import { renderToStaticMarkup } from "react-dom/server";

import {
  hasTextSelectionWithin,
  isPointerDrag,
  ToolCallInputView,
} from "../../../../src/components/thread-playground/message/tool-call-input-view";
import {
  HostServicesProvider,
  type HostServices,
} from "../../../../src/host";
import { I18nProvider } from "../../../../src/lib/i18n";

function _render(input: ToolCallInput, streaming: boolean): string {
  return renderToStaticMarkup(
    <I18nProvider initialLang="en">
      <HostServicesProvider value={{} as HostServices}>
        <ToolCallInputView input={input} streaming={streaming} />
      </HostServicesProvider>
    </I18nProvider>
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

describe("hasTextSelectionWithin", () => {
  test("distinguishes a text selection in the argument row from a click", () => {
    const target = {} as Node;
    expect(
      hasTextSelectionWithin(target, {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => ({ intersectsNode: (node: Node) => node === target }),
      })
    ).toBe(true);
  });

  test("allows an ordinary collapsed selection to toggle the row", () => {
    expect(
      hasTextSelectionWithin({} as Node, {
        isCollapsed: true,
        rangeCount: 0,
        getRangeAt: () => {
          throw new Error("Collapsed selections have no ranges");
        },
      })
    ).toBe(false);
  });
});

describe("isPointerDrag", () => {
  test("separates a selection drag from normal click jitter", () => {
    const start = { x: 10, y: 10 };

    expect(isPointerDrag(start, { clientX: 11, clientY: 11 })).toBe(false);
    expect(isPointerDrag(start, { clientX: 13, clientY: 10 })).toBe(true);
    expect(isPointerDrag(start, { clientX: 40, clientY: 10 })).toBe(true);
  });
});

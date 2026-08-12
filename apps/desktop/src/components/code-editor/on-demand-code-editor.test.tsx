import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";

import type {
  CodeEditorHandle,
  CodeEditorProps,
} from "@llm-space/ui/components/code-editor";
import { createRegexHighlightEnhancement } from "@llm-space/ui/components/code-editor";
import {
  EditorCommitScope,
  type EditorCommitScopeHandle,
} from "@llm-space/ui/components/code-editor/editor-commit-scope";
import {
  OnDemandCodeEditor,
  OnDemandEditorScope,
} from "@llm-space/ui/components/code-editor/on-demand-code-editor";
import { ThemeProvider } from "@llm-space/ui/components/theme-provider";
import {
  act,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type FormEvent,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  installReactTestDom,
  TestElement,
  TestEvent,
} from "@/test/react-test-dom";

const TEST_DOM = installReactTestDom();
let root: Root | null = null;
let container: TestElement | null = null;

const PROMPT_HIGHLIGHTS = [
  createRegexHighlightEnhancement({
    id: "prompt-variable-highlight",
    pattern: String.raw`\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}`,
    className: "cm-prompt-variable",
    style: { color: "var(--cm-variable)", fontWeight: "500" },
    priority: 10,
  }),
  createRegexHighlightEnhancement({
    id: "prompt-template-tag-highlight",
    pattern: String.raw`\{%[-+]?[\s\S]*?[-+]?%\}`,
    className: "cm-template-tag",
    style: { color: "var(--cm-template-tag)", fontWeight: "500" },
    priority: 20,
  }),
] as const;

const FakeFullEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
  function FakeFullEditor(
    { autoFocus, enhancements, onBlur, onChange, value },
    forwardedRef
  ) {
    const elementRef = useRef<HTMLTextAreaElement>(null);
    const draftRef = useRef(value);
    const commit = () => onChange?.(draftRef.current);
    useImperativeHandle(forwardedRef, () => ({
      commit,
      getValue: () => draftRef.current,
      insertText: (text) => {
        draftRef.current += text;
      },
    }));
    useLayoutEffect(() => {
      if (autoFocus) elementRef.current?.focus();
    }, [autoFocus]);
    return (
      <textarea
        ref={elementRef}
        data-testid="full-editor"
        data-enhancement-count={enhancements?.length ?? 0}
        defaultValue={value}
        onBlur={() => {
          commit();
          onBlur?.();
        }}
        onInput={(event: FormEvent<HTMLTextAreaElement>) => {
          draftRef.current = event.currentTarget.value;
        }}
      />
    );
  }
);

function _preview(): TestElement | null {
  return TEST_DOM.document.body.querySelector("[data-on-demand-preview]");
}

function _editor(): TestElement | null {
  return TEST_DOM.document.body.querySelector("[data-testid=full-editor]");
}

async function _render(element: React.ReactNode) {
  await act(async () =>
    root?.render(<ThemeProvider>{element}</ThemeProvider>)
  );
}

beforeEach(() => {
  container = TEST_DOM.document.createElement("div");
  TEST_DOM.document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

afterAll(() => TEST_DOM.restore());

describe("OnDemandCodeEditor", () => {
  test("keeps syntax-highlighted segments in the preformatted text flow", async () => {
    await _render(
      <OnDemandEditorScope active>
        <OnDemandCodeEditor
          FullEditor={FakeFullEditor}
          value={'<system-reminder date="2026-08-11">text</system-reminder>'}
        />
      </OnDemandEditorScope>
    );

    const preview = _preview();
    expect(preview?.children.length).toBeGreaterThan(1);
    expect(preview?.classList.contains("flex")).toBe(false);
    expect(preview?.classList.contains("flex-col")).toBe(false);
  });

  test("uses CodeMirror's 1.4 line height in the static preview", async () => {
    await _render(
      <OnDemandEditorScope active>
        <OnDemandCodeEditor FullEditor={FakeFullEditor} value="line 1\nline 2" />
      </OnDemandEditorScope>
    );

    expect(_preview()?.classList.contains("leading-[1.4]")).toBe(true);
  });

  test("renders prompt-template overlays before CodeMirror is mounted", async () => {
    await _render(
      <OnDemandEditorScope active>
        <OnDemandCodeEditor
          FullEditor={FakeFullEditor}
          value="{{current_date}} {% if enabled %}"
          language="markdown"
          enhancements={PROMPT_HIGHLIGHTS}
        />
      </OnDemandEditorScope>
    );

    const preview = _preview();
    const spans = preview?.children ?? [];
    const variable = spans.find(
      (span) => span.textContent === "{{current_date}}"
    );
    const templateTag = spans.find(
      (span) => span.textContent === "{% if enabled %}"
    );
    expect(variable?.style.color).toBe("var(--cm-variable)");
    expect(variable?.style.fontWeight).toBe("500");
    expect(templateTag?.style.color).toBe("var(--cm-template-tag)");
    expect(templateTag?.style.fontWeight).toBe("500");

    await act(async () => {
      preview?.dispatchEvent(new TestEvent("pointerdown"));
    });
    expect(_editor()?.getAttribute("data-enhancement-count")).toBe("2");
  });

  test.each([
    ["Enter", "Enter"],
    ["Space", " "],
  ])("%s activates the full editor and focuses it", async (_label, key) => {
    await _render(
      <OnDemandEditorScope active>
        <OnDemandCodeEditor
          FullEditor={FakeFullEditor}
          value="**hello**"
        />
      </OnDemandEditorScope>
    );

    expect(_preview()?.getAttribute("role")).toBe("textbox");
    await act(async () => {
      _preview()?.dispatchEvent(new TestEvent("keydown", { key }));
    });

    const editor = _editor();
    if (!editor) throw new Error("Full editor did not activate");
    expect(TEST_DOM.document.activeElement).toBe(editor);
  });

  test("pointer activation edits, commits on blur, and returns to preview", async () => {
    const changes: string[] = [];
    await _render(
      <OnDemandEditorScope active>
        <OnDemandCodeEditor
          FullEditor={FakeFullEditor}
          value="before"
          onChange={(value) => changes.push(value)}
        />
      </OnDemandEditorScope>
    );

    await act(async () => {
      _preview()?.dispatchEvent(new TestEvent("pointerdown"));
    });
    const editor = _editor();
    if (!editor) throw new Error("Full editor did not activate");
    editor.value = "after";
    editor.dispatchEvent(new TestEvent("input"));
    await act(async () => editor.dispatchEvent(new TestEvent("focusout")));

    expect(changes).toEqual(["after"]);
    expect(_editor()).toBeNull();
    expect(_preview()?.textContent).toBe("after");
  });

  test("readonly previews remain selectable but never activate", async () => {
    await _render(
      <OnDemandEditorScope active>
        <OnDemandCodeEditor
          FullEditor={FakeFullEditor}
          value="readonly"
          readonly
        />
      </OnDemandEditorScope>
    );

    expect(_preview()?.getAttribute("aria-readonly")).toBe("true");
    await act(async () => {
      _preview()?.dispatchEvent(new TestEvent("pointerdown"));
      _preview()?.dispatchEvent(new TestEvent("keydown", { key: "Enter" }));
    });
    expect(_editor()).toBeNull();
  });

  test("activating another editor commits the first", async () => {
    const firstChanges: string[] = [];
    await _render(
      <OnDemandEditorScope active>
        <OnDemandCodeEditor
          FullEditor={FakeFullEditor}
          value="first"
          onChange={(value) => firstChanges.push(value)}
        />
        <OnDemandCodeEditor FullEditor={FakeFullEditor} value="second" />
      </OnDemandEditorScope>
    );

    const previews = TEST_DOM.document.body.querySelectorAll(
      "[data-on-demand-preview]"
    );
    await act(async () => previews[0]?.dispatchEvent(new TestEvent("pointerdown")));
    const firstEditor = _editor();
    if (!firstEditor) throw new Error("First editor did not activate");
    firstEditor.value = "first edited";
    firstEditor.dispatchEvent(new TestEvent("input"));
    await act(async () => {
      TEST_DOM.document.body
        .querySelector("[data-on-demand-preview]")
        ?.dispatchEvent(new TestEvent("pointerdown"));
    });

    expect(firstChanges).toEqual(["first edited"]);
    expect(_editor()).not.toBeNull();
  });

  test("the View commit scope commits an active draft", async () => {
    const changes: string[] = [];
    let scope: EditorCommitScopeHandle | null = null;
    await _render(
      <EditorCommitScope onReady={(handle) => (scope = handle)}>
        <OnDemandEditorScope active>
          <OnDemandCodeEditor
            FullEditor={FakeFullEditor}
            value="before"
            onChange={(value) => changes.push(value)}
          />
        </OnDemandEditorScope>
      </EditorCommitScope>
    );
    await act(async () => {
      _preview()?.dispatchEvent(new TestEvent("pointerdown"));
    });
    const editor = _editor();
    if (!editor) throw new Error("Full editor did not activate");
    editor.value = "committed by scope";
    editor.dispatchEvent(new TestEvent("input"));

    await act(async () => scope?.commitAll());
    expect(changes).toEqual(["committed by scope"]);
    expect(_preview()?.textContent).toBe("committed by scope");
  });
});

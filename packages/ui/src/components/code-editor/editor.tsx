import { type Extension } from "@codemirror/state";
import CodeMirror, {
  ExternalChange,
  type BasicSetupOptions,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { cn } from "../../lib/utils";
import { useTheme } from "../theme-provider";

import { createExtensions } from "./extensions";
import * as themes from "./themes";

const BASIC_SETUP: BasicSetupOptions = {
  foldGutter: false,
  highlightActiveLine: false,
  highlightActiveLineGutter: false,
  lineNumbers: false,
};

export interface CodeEditorHandle {
  commit: () => void;
  getValue: () => string;
  insertText: (text: string) => void;
}

export interface CodeEditorProps {
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
  hideBorder?: boolean;
  hideFocusRing?: boolean;
  /**
   * Clip overflowing content at rest and only scroll (and show a scrollbar)
   * once the editor is focused. Suits dense, stacked list items (message list);
   * standalone editors should stay always-scrollable and leave this off.
   */
  scrollOnFocus?: boolean;
  /**
   * Render the lightweight plain-text editor (a `<textarea>`) instead of
   * mounting CodeMirror. Used by the message list under "Lite" rendering
   * fidelity so a large thread mounts zero CodeMirror editors and scroll cost
   * no longer scales with message count.
   */
  plain?: boolean;
  language?: "markdown" | "json";
  /**
   * The value is a live streaming preview: syntax highlighting is skipped
   * (restored by whatever renders the settled value — the streamed message
   * commits into a fresh editor) and content sniffing is pinned so mid-stream
   * chunks can't reconfigure the editor.
   */
  streaming?: boolean;
  value: string;
  readonly?: boolean;
  /**
   * Extra CodeMirror extensions merged in after the base setup. Lets a caller
   * layer editor-agnostic behavior (e.g. `{{variable}}` highlighting) without
   * this component knowing anything domain-specific. Ignored by the plain-text
   * (Lite) fallback. Pass a stable reference to avoid reconfiguring the editor.
   */
  extraExtensions?: Extension[];
  onChange?: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  onPaste?: (e: ClipboardEvent) => void;
}

function _CodeEditor(
  {
    className,
    autoFocus,
    placeholder,
    hideBorder,
    hideFocusRing,
    scrollOnFocus,
    language,
    value,
    streaming,
    readonly,
    extraExtensions,
    onChange,
    onKeyDown,
    onPaste,
  }: CodeEditorProps,
  ref: React.ForwardedRef<CodeEditorHandle>
) {
  const { resolvedTheme } = useTheme();
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const draftRef = useRef(value);
  const committedRef = useRef(value);
  const isFocusedRef = useRef(false);
  // CodeMirror owns the document while the user types; `syncedValue` only
  // changes when we push an *external* update in (the effect below), so a
  // keystroke never re-renders React or trips react-codemirror's value diff.
  const [syncedValue, setSyncedValue] = useState(value);

  const detectLanguage = useCallback(
    (text: string): "markdown" | "json" => {
      // While streaming, the extensions memo overrides the language to "none";
      // this branch only pins the detection *state* so a JSON-looking chunk
      // can't flip `detectedLanguage` (and reconfigure the editor) mid-stream.
      if (streaming) {
        return "markdown";
      }
      if (language) {
        return language;
      }
      return text.startsWith("{") || text.startsWith("[") ? "json" : "markdown";
    },
    [language, streaming]
  );

  // Re-detect on every keystroke, but only flip state when the result actually
  // changes — an unchanged return value makes React bail the re-render, so
  // typing stays render-free until the language genuinely switches.
  const [detectedLanguage, setDetectedLanguage] = useState(() =>
    detectLanguage(value)
  );
  const refreshLanguage = useCallback(
    (text: string) => {
      setDetectedLanguage((prev) => {
        const next = detectLanguage(text);
        return next === prev ? prev : next;
      });
    },
    [detectLanguage]
  );
  const setDraftValue = useCallback(
    (next: string, syncEditorValue = false) => {
      draftRef.current = next;
      refreshLanguage(next);
      if (syncEditorValue) {
        setSyncedValue(next);
      }
    },
    [refreshLanguage]
  );

  useEffect(() => {
    if (isFocusedRef.current && !readonly) {
      return;
    }
    // Once the view exists, dispatch external values directly instead of via
    // the `value` prop — react-codemirror applies prop updates as a full-
    // document replace (reparse + native selection resync), which saturates
    // the main thread on streamed replies growing every frame. `ExternalChange`
    // stops react-codemirror from echoing the change back through `onChange`,
    // and the untouched `syncedValue` now only seeds the initial document.
    const view = cmRef.current?.view;
    if (!view) {
      setDraftValue(value, true);
    } else if (value !== draftRef.current) {
      const previous = draftRef.current;
      const docLength = view.state.doc.length;
      view.dispatch({
        changes:
          docLength === previous.length && value.startsWith(previous)
            ? { from: docLength, insert: value.slice(previous.length) }
            : { from: 0, to: docLength, insert: value },
        annotations: ExternalChange.of(true),
      });
      setDraftValue(value);
    }
    committedRef.current = value;
  }, [value, readonly, setDraftValue]);

  const commit = useCallback(() => {
    if (onChange && draftRef.current !== committedRef.current) {
      onChange(draftRef.current);
      committedRef.current = draftRef.current;
    }
  }, [onChange]);

  const insertText = useCallback(
    (text: string) => {
      const view = cmRef.current?.view;
      const current = view?.state.doc.toString() ?? draftRef.current;
      const range = view?.state.selection.main;
      const from = range?.from ?? current.length;
      const to = range?.to ?? current.length;
      const next = `${current.slice(0, from)}${text}${current.slice(to)}`;
      const anchor = from + text.length;
      if (view) {
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor },
          scrollIntoView: true,
        });
        view.focus();
      }
      setDraftValue(next, true);
      if (onChange && next !== committedRef.current) {
        onChange(next);
        committedRef.current = next;
      }
    },
    [onChange, setDraftValue]
  );

  useImperativeHandle(
    ref,
    () => ({
      commit,
      getValue: () => draftRef.current,
      insertText,
    }),
    [commit, insertText]
  );

  const handleChange = useCallback(
    (next: string) => {
      draftRef.current = next;
      refreshLanguage(next);
    },
    [refreshLanguage]
  );

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false;
    commit();
  }, [commit]);

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);

  const handleContainerMouseDown = useCallback(
    (e: MouseEvent) => {
      const view = cmRef.current?.view;
      // Clicks inside CodeMirror are handled by CodeMirror itself; this covers
      // the container's padding / min-height area so the whole box is clickable.
      if (readonly || !view || view.dom.contains(e.target as Node)) {
        return;
      }
      e.preventDefault();
      view.focus();
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    },
    [readonly]
  );

  const handleKeyDownCapture = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && e.metaKey) {
        commit();
      }
      onKeyDown?.(e);
    },
    [commit, onKeyDown]
  );

  // While streaming, skip the language extension entirely: highlighting a
  // growing document re-parses the trailing block on every appended chunk
  // (O(paragraph) per frame — a major source of long frames), for colors the
  // reader barely sees mid-stream. Same editor, same layout; the committed
  // message (or the first post-stream update) brings the highlighting back.
  const extensions = useMemo(
    () => [
      ...createExtensions(streaming ? "none" : detectedLanguage),
      ...(extraExtensions ?? []),
    ],
    [detectedLanguage, extraExtensions, streaming]
  );
  return (
    <div
      className={cn(
        "flex cursor-text flex-col overflow-hidden rounded-lg border px-1 transition-opacity",
        "bg-(--textarea)",
        !hideFocusRing && "focus-within:border-ring!",
        hideBorder && "border-transparent",
        readonly && "opacity-67",
        className
      )}
      onMouseDown={handleContainerMouseDown}
    >
      <CodeMirror
        ref={cmRef}
        className={cn(
          "h-full font-mono [&_.cm-editor]:h-full [&_.cm-focused]:outline-none!",
          // scrollOnFocus: clip at rest, scroll only once focused. Gate overflow
          // on both this wrapper and `.cm-scroller`, since Chromium and WebKit
          // disagree on which is the scroll container (WebKit collapses the
          // `h-full` percentage height inside the outer `max-h` box, making the
          // wrapper scroll instead of `.cm-scroller`). `!` beats CodeMirror's
          // unlayered `.cm-scroller { overflow-x: auto }`.
          scrollOnFocus
            ? "overflow-hidden focus-within:overflow-auto [&_.cm-scroller]:overflow-hidden! focus-within:[&_.cm-scroller]:overflow-auto!"
            : "overflow-auto",
          // Horizontal padding lives on .cm-content (inside the scroller) so
          // the caret at column 0 is not clipped by the scroller's overflow.
          "p-0 py-1 [&_.cm-content]:px-2! [&_.cm-line]:p-0!"
        )}
        theme={resolvedTheme === "dark" ? themes.dark : themes.light}
        autoFocus={autoFocus}
        basicSetup={BASIC_SETUP}
        placeholder={placeholder}
        extensions={extensions}
        readOnly={readonly}
        value={syncedValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        onKeyDownCapture={handleKeyDownCapture}
        onPaste={onPaste}
      />
    </div>
  );
}

export const CodeEditor = memo(forwardRef(_CodeEditor));

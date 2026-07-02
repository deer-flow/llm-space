import CodeMirror, {
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

import { cn } from "@/lib/utils";

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
}

function _CodeEditor(
  {
    className,
    autoFocus,
    placeholder,
    hideBorder,
    hideFocusRing,
    language,
    value,
    streaming,
    readonly,
    onChange,
    onKeyDown,
    onPaste,
  }: {
    className?: string;
    autoFocus?: boolean;
    placeholder?: string;
    hideBorder?: boolean;
    hideFocusRing?: boolean;
    language?: "markdown" | "json";
    streaming?: boolean;
    value: string;
    readonly?: boolean;

    onChange?: (value: string) => void;

    onKeyDown?: (e: KeyboardEvent) => void;

    onPaste?: (e: ClipboardEvent) => void;
  },
  ref: React.ForwardedRef<CodeEditorHandle>
) {
  const { resolvedTheme } = { resolvedTheme: "dark" };
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const committedRef = useRef(value);
  const isFocusedRef = useRef(false);

  const setDraftValue = useCallback((next: string) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  useEffect(() => {
    if (!isFocusedRef.current || readonly) {
      setDraftValue(value);
      committedRef.current = value;
    }
  }, [value, readonly, setDraftValue]);

  const commit = useCallback(() => {
    if (onChange && draftRef.current !== committedRef.current) {
      onChange(draftRef.current);
      committedRef.current = draftRef.current;
    }
  }, [onChange]);

  useImperativeHandle(
    ref,
    () => ({
      commit,
      getValue: () => draftRef.current,
    }),
    [commit]
  );

  const handleChange = useCallback(
    (next: string) => {
      setDraftValue(next);
    },
    [setDraftValue]
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

  const resolvedLanguage = useMemo(() => {
    if (streaming) {
      return "markdown";
    }
    if (language) {
      return language;
    }
    if (draft.startsWith("{") || draft.startsWith("[")) {
      return "json";
    } else {
      return "markdown";
    }
  }, [draft, language, streaming]);
  const extensions = useMemo(
    () => createExtensions(resolvedLanguage),
    [resolvedLanguage]
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
          "h-full overflow-auto font-mono [&_.cm-editor]:h-full [&_.cm-focused]:outline-none!",
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
        value={draft}
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

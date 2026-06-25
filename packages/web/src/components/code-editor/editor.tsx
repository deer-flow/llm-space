import CodeMirror, { type BasicSetupOptions } from "@uiw/react-codemirror";
import { useTheme } from "next-themes";
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
    // eslint-disable-next-line no-unused-vars
    onChange?: (value: string) => void;
    // eslint-disable-next-line no-unused-vars
    onKeyDown?: (e: KeyboardEvent) => void;
    // eslint-disable-next-line no-unused-vars
    onPaste?: (e: ClipboardEvent) => void;
  },
  ref: React.ForwardedRef<CodeEditorHandle>
) {
  const { resolvedTheme } = useTheme();
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
        "flex cursor-text flex-col overflow-hidden rounded-md border px-1 transition-opacity",
        "bg-(--textarea)",
        !hideFocusRing && "focus-within:border-ring",
        hideBorder && "border-transparent",
        readonly && "opacity-67",
        className
      )}
      // Enforce read-only-while-running at the wrapper level via `inert` instead
      // of CodeMirror's `readOnly` prop. `@uiw/react-codemirror` lists `readOnly`
      // in the dependency array of an effect that dispatches a full
      // `StateEffect.reconfigure` (rebuilds every extension + re-parses the doc).
      // With ~100 editors mounted, toggling `readOnly` on a status change fired
      // ~100 synchronous reconfigures/reflows — the bulk of the "other time"
      // slowdown. `inert` blocks interaction without touching the editor config.
      inert={readonly}
    >
      <CodeMirror
        className={cn(
          "[&_.cm-focused]:outline-none! h-full overflow-auto font-mono [&_.cm-editor]:h-full",
          "[&_.cm-line]:p-0! p-0 px-2 py-1"
        )}
        theme={resolvedTheme === "dark" ? themes.dark : themes.light}
        autoFocus={autoFocus}
        basicSetup={BASIC_SETUP}
        placeholder={placeholder}
        extensions={extensions}
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

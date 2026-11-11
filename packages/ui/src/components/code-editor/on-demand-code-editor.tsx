"use client";

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ForwardRefExoticComponent,
  type KeyboardEvent,
  type ReactNode,
  type RefAttributes,
} from "react";

import { cn } from "../../lib/utils";
import { useTheme } from "../theme-provider";

import type { CodeEditorHandle, CodeEditorProps } from "./editor";
import { useRegisterEditorCommit } from "./editor-commit-scope";
import {
  createHighlightSegments,
  getGithubThemeForeground,
} from "./static-highlight";

interface ActiveEditor {
  id: string;
  commitAndDeactivate(): void;
}

interface OnDemandEditorCoordinator {
  activate(editor: ActiveEditor): void;
  release(id: string): void;
}

const OnDemandEditorContext = createContext<OnDemandEditorCoordinator | null>(
  null
);

/** Coordinates the single active repeated editor within one Thread View. */
export function OnDemandEditorScope({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const activeEditorRef = useRef<ActiveEditor | null>(null);
  const coordinator = useMemo<OnDemandEditorCoordinator>(
    () => ({
      activate(next) {
        const current = activeEditorRef.current;
        if (current && current.id !== next.id) {
          current.commitAndDeactivate();
        }
        activeEditorRef.current = next;
      },
      release(id) {
        if (activeEditorRef.current?.id === id) {
          activeEditorRef.current = null;
        }
      },
    }),
    []
  );

  useEffect(() => {
    if (!active) {
      activeEditorRef.current?.commitAndDeactivate();
    }
  }, [active]);

  return (
    <OnDemandEditorContext.Provider value={coordinator}>
      {children}
    </OnDemandEditorContext.Provider>
  );
}

export type OnDemandFullEditor = ForwardRefExoticComponent<
  CodeEditorProps & RefAttributes<CodeEditorHandle>
>;

export interface OnDemandCodeEditorProps
  extends Omit<CodeEditorProps, "plain" | "renderMode"> {
  /** Injected lazy Full editor; keeps this preview module CodeMirror-free. */
  FullEditor: OnDemandFullEditor;
}

export const OnDemandCodeEditor = forwardRef<
  CodeEditorHandle,
  OnDemandCodeEditorProps
>(function OnDemandCodeEditor(
  {
    FullEditor,
    autoFocus,
    className,
    enhancements,
    hideBorder,
    hideFocusRing,
    language,
    readonly = false,
    scrollOnFocus,
    streaming,
    value,
    placeholder,
    onBlur,
    onChange,
    onKeyDown,
    ...editorProps
  },
  forwardedRef
) {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const coordinator = useContext(OnDemandEditorContext);
  const editorRef = useRef<CodeEditorHandle>(null);
  const previewRef = useRef<HTMLPreElement>(null);
  const previewValueRef = useRef(value);
  const [previewValue, setPreviewValue] = useState(value);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;

  useEffect(() => {
    if (!editingRef.current) {
      previewValueRef.current = value;
      setPreviewValue(value);
    }
  }, [value]);

  const commitAndDeactivate = useCallback(() => {
    editorRef.current?.commit();
    const latest = editorRef.current?.getValue() ?? previewValueRef.current;
    previewValueRef.current = latest;
    setPreviewValue(latest);
    setEditing(false);
    coordinator?.release(id);
  }, [coordinator, id]);
  const deactivateAfterEditorBlur = useCallback(() => {
    const latest = editorRef.current?.getValue() ?? previewValueRef.current;
    previewValueRef.current = latest;
    setPreviewValue(latest);
    setEditing(false);
    coordinator?.release(id);
    onBlur?.();
  }, [coordinator, id, onBlur]);
  useRegisterEditorCommit(commitAndDeactivate);

  useEffect(
    () => () => {
      coordinator?.release(id);
    },
    [coordinator, id]
  );

  const activate = useCallback(() => {
    if (readonly || editing) return;
    coordinator?.activate({ id, commitAndDeactivate });
    setEditing(true);
  }, [commitAndDeactivate, coordinator, editing, id, readonly]);

  useLayoutEffect(() => {
    if (autoFocus && !readonly) {
      activate();
    }
  }, [activate, autoFocus, readonly]);

  const handleChange = useCallback(
    (next: string) => {
      previewValueRef.current = next;
      setPreviewValue(next);
      onChange?.(next);
    },
    [onChange]
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      commit: commitAndDeactivate,
      getValue: () =>
        editorRef.current?.getValue() ?? previewValueRef.current,
      insertText(text: string) {
        if (editorRef.current) {
          editorRef.current.insertText(text);
          return;
        }
        const next = `${previewValueRef.current}${text}`;
        previewValueRef.current = next;
        setPreviewValue(next);
        onChange?.(next);
      },
    }),
    [commitAndDeactivate, onChange]
  );

  const detectedLanguage =
    language ??
    (previewValue.startsWith("{") || previewValue.startsWith("[")
      ? "json"
      : "markdown");
  const segments = useMemo(
    () =>
      streaming
        ? [{ text: previewValue }]
        : createHighlightSegments(
            previewValue,
            detectedLanguage,
            resolvedTheme,
            enhancements
          ),
    [
      detectedLanguage,
      enhancements,
      previewValue,
      resolvedTheme,
      streaming,
    ]
  );

  if (editing) {
    return (
      <FullEditor
        {...editorProps}
        ref={editorRef}
        className={className}
        autoFocus
        hideBorder={hideBorder}
        hideFocusRing={hideFocusRing}
        enhancements={enhancements}
        language={language}
        placeholder={placeholder}
        readonly={readonly}
        scrollOnFocus={scrollOnFocus}
        streaming={streaming}
        value={previewValue}
        onBlur={deactivateAfterEditorBlur}
        onChange={handleChange}
        onKeyDown={onKeyDown}
      />
    );
  }

  const handlePreviewKeyDown = (event: KeyboardEvent<HTMLPreElement>) => {
    if (!readonly && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      activate();
      return;
    }
    onKeyDown?.(event);
  };
  return (
    <pre
      ref={previewRef}
      role="textbox"
      aria-multiline="true"
      aria-readonly={readonly}
      tabIndex={0}
      data-code-editor-mode="on-demand"
      data-on-demand-preview
      style={{ color: getGithubThemeForeground(resolvedTheme) }}
      className={cn(
        "on-demand-highlight cursor-text select-text overflow-auto rounded-lg border bg-(--textarea) px-3 py-2 font-mono text-sm leading-[1.4] break-words whitespace-pre-wrap transition-opacity outline-none",
        !hideFocusRing && "focus-visible:border-ring!",
        hideBorder && "border-transparent",
        readonly && "cursor-text opacity-67",
        scrollOnFocus && "overflow-hidden focus:overflow-auto",
        className
      )}
      onKeyDown={handlePreviewKeyDown}
      onPointerDown={(event) => {
        if (readonly) return;
        event.preventDefault();
        activate();
      }}
    >
      {previewValue ? (
        segments.map((segment, index) => (
          <span
            // Segments are deterministic for one source; offset-free keys are
            // sufficient because the preview is replaced wholesale on edits.
            key={index}
            style={segment.style}
          >
            {segment.text}
          </span>
        ))
      ) : (
        <span className="text-muted-foreground">{placeholder}</span>
      )}
    </pre>
  );
});

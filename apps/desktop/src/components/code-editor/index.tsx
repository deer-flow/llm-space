import { RefreshCw } from "lucide-react";
import {
  Component,
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

import { Tooltip } from "../tooltip";
import { Textarea } from "../ui/textarea";

import type { CodeEditorHandle, CodeEditorProps } from "./editor";

export type { CodeEditorHandle, CodeEditorProps } from "./editor";

// CodeMirror is the single heaviest first-paint dependency (~200 kB gzipped) and
// only mounts inside editors, so load it on demand. The surrounding UI and the
// message text paint immediately via the fallback below; the real editor swaps
// in once its chunk resolves (one shared load covers every editor on the page).
const LazyCodeEditor = lazy(() =>
  import("./editor").then((m) => ({ default: m.CodeEditor }))
);

/**
 * Non-interactive stand-in shown while the CodeMirror chunk loads. Mirrors the
 * editor's container and typography (same border, radius, padding, `font-mono`
 * and `--text-sm` sizing) so the swap-in doesn't shift layout.
 */
function CodeEditorLoadingFallback({
  className,
  hideBorder,
  readonly,
  value,
  placeholder,
}: CodeEditorProps) {
  return (
    <div
      className={cn(
        "flex cursor-text flex-col overflow-hidden rounded-lg border bg-(--textarea) px-1 transition-opacity",
        hideBorder && "border-transparent",
        readonly && "opacity-67",
        className
      )}
    >
      <pre className="overflow-auto px-2 py-1 font-mono text-sm break-words whitespace-pre-wrap">
        {value || <span className="text-muted-foreground">{placeholder}</span>}
      </pre>
    </div>
  );
}

interface CodeEditorErrorBoundaryProps {
  resetKey: number;
  fallback: ReactNode;
  children: ReactNode;
}

interface CodeEditorErrorBoundaryState {
  failed: boolean;
}

interface PlainTextCodeEditorProps extends CodeEditorProps {
  onRetry?: () => void;
}

/**
 * Keeps a CodeMirror mount failure local to one editor. Without this boundary,
 * a renderer-side CodeMirror exception can unmount the whole desktop app.
 */
class CodeEditorErrorBoundary extends Component<
  CodeEditorErrorBoundaryProps,
  CodeEditorErrorBoundaryState
> {
  state: CodeEditorErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): CodeEditorErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("CodeEditor failed to render", error);
  }

  componentDidUpdate(prevProps: CodeEditorErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const PlainTextCodeEditor = forwardRef<
  CodeEditorHandle,
  PlainTextCodeEditorProps
>(function PlainTextCodeEditor(
  {
    className,
    autoFocus,
    placeholder,
    hideBorder,
    readonly,
    scrollOnFocus,
    value,
    onChange,
    onKeyDown,
    onPaste,
    onRetry,
  },
  ref
) {
  const draftRef = useRef(value);
  const committedRef = useRef(value);
  const focusedRef = useRef(false);
  // Uncontrolled: the DOM textarea owns its value while the user types, so a
  // keystroke writes only to `draftRef` and never re-renders React. External
  // updates and imperative insertions are pushed in by `setDraftValue`.
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const setDraftValue = useCallback((next: string) => {
    draftRef.current = next;
    if (textareaRef.current && textareaRef.current.value !== next) {
      textareaRef.current.value = next;
    }
  }, []);

  useEffect(() => {
    if (!focusedRef.current || readonly) {
      setDraftValue(value);
      committedRef.current = value;
    }
  }, [readonly, setDraftValue, value]);

  const commit = useCallback(() => {
    if (onChange && draftRef.current !== committedRef.current) {
      onChange(draftRef.current);
      committedRef.current = draftRef.current;
    }
  }, [onChange]);

  const insertText = useCallback(
    (text: string) => {
      const textarea = textareaRef.current;
      const current = draftRef.current;
      const from = textarea?.selectionStart ?? current.length;
      const to = textarea?.selectionEnd ?? current.length;
      const next = `${current.slice(0, from)}${text}${current.slice(to)}`;
      const anchor = from + text.length;
      setDraftValue(next);
      if (onChange && next !== committedRef.current) {
        onChange(next);
        committedRef.current = next;
      }
      requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(anchor, anchor);
      });
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

  const handleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    draftRef.current = event.currentTarget.value;
  }, []);

  return (
    <div
      className={cn(
        "relative flex cursor-text flex-col rounded-lg border bg-(--textarea) px-1 transition-opacity",
        // Clip at rest, scroll once focused (mirrors the CodeMirror editor);
        // otherwise always scroll past the `max-h-*` cap.
        scrollOnFocus
          ? "overflow-hidden focus-within:overflow-auto"
          : "overflow-auto",
        hideBorder && "border-transparent",
        readonly && "opacity-67",
        className
      )}
    >
      <Textarea
        ref={textareaRef}
        className="text-foreground/80 my-0 min-h-0! w-full shrink-0 resize-none border-none bg-transparent! px-2 pt-2 pb-0 font-mono text-sm! outline-none focus-visible:border-transparent focus-visible:ring-0"
        autoFocus={autoFocus}
        placeholder={placeholder}
        readOnly={readonly}
        defaultValue={value}
        onBlur={() => {
          focusedRef.current = false;
          commit();
        }}
        onChange={handleChange}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.metaKey) {
            commit();
          }
          onKeyDown?.(event);
        }}
        onPaste={onPaste}
      />
      {onRetry ? (
        <Tooltip content="Retry CodeMirror editor">
          <button
            type="button"
            aria-label="Retry CodeMirror editor"
            className="text-muted-foreground hover:bg-accent hover:text-foreground absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded transition-colors"
            onClick={onRetry}
          >
            <RefreshCw className="size-3.5" />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
});

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
  function CodeEditor(props, ref) {
    const [retryKey, setRetryKey] = useState(0);
    // "Lite" rendering fidelity: skip CodeMirror and use the lightweight
    // plain-text editor (a <textarea>) — still editable, just no highlighting.
    if (props.plain) {
      return <PlainTextCodeEditor {...props} ref={ref} />;
    }
    return (
      <CodeEditorErrorBoundary
        resetKey={retryKey}
        fallback={
          <PlainTextCodeEditor
            {...props}
            ref={ref}
            onRetry={() => setRetryKey((key) => key + 1)}
          />
        }
      >
        <Suspense fallback={<CodeEditorLoadingFallback {...props} />}>
          <LazyCodeEditor key={retryKey} {...props} ref={ref} />
        </Suspense>
      </CodeEditorErrorBoundary>
    );
  }
);

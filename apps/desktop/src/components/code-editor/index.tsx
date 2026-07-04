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
        {value || (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
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
>(
  function PlainTextCodeEditor(
    {
      className,
      autoFocus,
      placeholder,
      hideBorder,
      readonly,
      value,
      onChange,
      onKeyDown,
      onPaste,
      onRetry,
    },
    ref
  ) {
    const [draft, setDraft] = useState(value);
    const draftRef = useRef(value);
    const committedRef = useRef(value);
    const focusedRef = useRef(false);

    const setDraftValue = useCallback((next: string) => {
      draftRef.current = next;
      setDraft(next);
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

    useImperativeHandle(
      ref,
      () => ({
        commit,
        getValue: () => draftRef.current,
      }),
      [commit]
    );

    const handleChange = useCallback(
      (event: ChangeEvent<HTMLTextAreaElement>) => {
        setDraftValue(event.currentTarget.value);
      },
      [setDraftValue]
    );

    return (
      <div
        className={cn(
          "relative flex cursor-text flex-col overflow-hidden rounded-lg border bg-(--textarea) px-1 transition-opacity",
          hideBorder && "border-transparent",
          readonly && "opacity-67",
          className
        )}
      >
        <textarea
          className="min-h-9.5 grow resize-none overflow-auto bg-transparent px-2 py-1 font-mono text-sm outline-none placeholder:text-muted-foreground"
          autoFocus={autoFocus}
          placeholder={placeholder}
          readOnly={readonly}
          value={draft}
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
  }
);

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
  function CodeEditor(props, ref) {
    const [retryKey, setRetryKey] = useState(0);
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

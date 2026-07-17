import { lazy, memo, Suspense, useRef } from "react";

import type { PreviewMode, PreviewType } from "./preview-dialog";

const PreviewDialogImpl = lazy(() =>
  import("./preview-dialog").then((m) => ({ default: m.PreviewDialog }))
);

/**
 * Lazily-loaded {@link PreviewDialog}. Its chunk (CodeEditor + Markdown) stays
 * out of the hot message-list bundle until a preview is first opened. Once open,
 * the dialog is latched mounted — via a render-time ref, so the `import()` fires
 * in the same render that opens it — keeping its close animation and later
 * reopens instant. The public props mirror {@link PreviewDialog} exactly.
 */
function _PreviewDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  value: string;
  type?: PreviewType;
  mode?: PreviewMode;
}) {
  const mounted = useRef(false);
  if (props.open) mounted.current = true;
  if (!mounted.current) return null;
  return (
    <Suspense fallback={null}>
      <PreviewDialogImpl {...props} />
    </Suspense>
  );
}

export const PreviewDialog = memo(_PreviewDialog);

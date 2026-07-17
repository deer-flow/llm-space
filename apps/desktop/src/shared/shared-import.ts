/**
 * Progress of a deep-link shared-thread import, sent bun→webview so the renderer
 * can show a modal that auto-dismisses on success and open the imported thread.
 */
export type SharedImportStatusPayload =
  | { status: "importing" }
  | { status: "success"; path: string; title?: string }
  | { status: "error"; message: string };

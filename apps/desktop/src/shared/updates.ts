/**
 * Update-flow status pushed from the bun process to the renderer over the
 * `updateStatusChanged` RPC message. `manual` marks flows started from the
 * "Check for Updates…" menu item; those surface feedback (checking /
 * up-to-date / errors) that automatic background checks keep silent.
 */
export type UpdateStatus =
  | { state: "checking" }
  | { state: "up-to-date"; version: string }
  | { state: "downloading"; version: string }
  | { state: "ready"; version: string }
  | { state: "error"; message: string };

export interface UpdateStatusChangedPayload {
  status: UpdateStatus;
  manual: boolean;
}

/**
 * How the background updater behaves. `automatic`: check + download silently
 * (menu still works). `manual`: never check on a timer — only the "Check for
 * Updates…" menu item. `off`: never check at all. The mode is owned by the bun
 * process (it must decide before the renderer exists) and persisted in
 * `settings/updates.json`.
 */
export type UpdateMode = "automatic" | "manual" | "off";

export const DEFAULT_UPDATE_MODE: UpdateMode = "automatic";

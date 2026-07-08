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

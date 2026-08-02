import type { ShareThreadActionInput } from "./types";

/** Build the host action emitted by a playground's Share button. */
export function createShareThreadAction(
  path: string,
  runtimeId?: string
): ShareThreadActionInput {
  return { path, runtimeId: runtimeId ?? "local" };
}

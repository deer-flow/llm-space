import { runRemoteRuntimeActionIfAllowed } from "./remote-runtime-actions";

/** Final pass point for Trust and continue, which connects as part of trust. */
export function runRemoteTrustContinuationIfAllowed({
  allowed,
  acquire,
  trust,
}: {
  allowed: () => boolean;
  acquire?: () => (() => void) | null;
  trust: () => Promise<void>;
}): Promise<boolean> {
  return runRemoteRuntimeActionIfAllowed({
    allowed,
    acquire,
    action: trust,
  });
}

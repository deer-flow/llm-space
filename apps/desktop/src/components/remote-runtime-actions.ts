/** Gate remote connection mutations before they can discard panes or call RPC. */
export async function runRemoteRuntimeActionIfAllowed({
  allowed,
  acquire,
  beforeAction,
  action,
  afterAction,
}: {
  allowed: () => boolean;
  acquire?: () => (() => void) | null;
  beforeAction?: () => void;
  action: () => Promise<boolean | void>;
  afterAction?: () => void | Promise<void>;
}): Promise<boolean> {
  if (!allowed()) return false;
  const release = acquire?.();
  if (acquire && !release) return false;
  try {
    beforeAction?.();
    const applied = await action();
    if (applied === false) return false;
    await afterAction?.();
    return true;
  } finally {
    release?.();
  }
}

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

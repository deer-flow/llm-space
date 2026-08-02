export interface RemoteRuntimeActionOutcome {
  applied: boolean;
  error?: unknown;
}

function _normalizeOutcome(
  result: boolean | void | RemoteRuntimeActionOutcome
): RemoteRuntimeActionOutcome {
  if (typeof result === "object") return result;
  return { applied: result !== false };
}

/** Gate remote connection mutations before they can discard panes or call RPC. */
export async function runRemoteRuntimeActionIfAllowed({
  allowed,
  acquire,
  beforeAction,
  action,
  afterAction,
  onError,
}: {
  allowed: () => boolean;
  acquire?: () => (() => void) | null;
  beforeAction?: () => void;
  action: () => Promise<boolean | void | RemoteRuntimeActionOutcome>;
  afterAction?: () => void | Promise<void>;
  onError?: (error: unknown) => void;
}): Promise<boolean> {
  if (!allowed()) return false;
  const release = acquire?.();
  if (acquire && !release) return false;
  try {
    beforeAction?.();
    const outcome = _normalizeOutcome(await action());
    if (outcome.applied) await afterAction?.();
    if (outcome.error !== undefined) {
      if (onError) onError(outcome.error);
      else {
        throw outcome.error instanceof Error
          ? outcome.error
          : new Error("Remote runtime action failed.", {
              cause: outcome.error,
            });
      }
    }
    return outcome.applied;
  } finally {
    release?.();
  }
}

/** Gate remote connection mutations before they can discard panes or call RPC. */
export async function runRemoteRuntimeActionIfAllowed({
  allowed,
  beforeAction,
  action,
  afterAction,
}: {
  allowed: () => boolean;
  beforeAction?: () => void;
  action: () => Promise<void>;
  afterAction?: () => void;
}): Promise<boolean> {
  if (!allowed()) return false;
  beforeAction?.();
  await action();
  afterAction?.();
  return true;
}

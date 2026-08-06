import type { DeepLinkScheme } from "../../shared/deep-link-scheme";

interface ActivatableWindow {
  isMinimized(): boolean;
  unminimize(): unknown;
  show(): unknown;
  activate(): unknown;
}

/** Restore and activate the app window for URLs owned by this build. */
export function activateWindowForDeepLink(
  window: ActivatableWindow,
  url: string,
  scheme: DeepLinkScheme
): boolean {
  if (!url.startsWith(`${scheme}://`)) return false;

  if (window.isMinimized()) window.unminimize();
  window.show();
  window.activate();
  return true;
}

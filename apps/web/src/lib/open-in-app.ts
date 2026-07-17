/**
 * Try to open a custom-scheme deep link (e.g. `llm-space://…`) in the native
 * app. Browsers expose no reliable way to query whether a scheme is registered,
 * so we launch it and watch for the page being backgrounded — the OS handing
 * off to the app fires `blur`/`visibilitychange`. If nothing happens within
 * `timeoutMs`, we assume the app isn't installed and call `onMissing` (the
 * download fallback).
 *
 * Must be called from a user gesture (e.g. a click) — launching a protocol
 * needs one.
 */
export function openInApp(
  deepLink: string,
  onMissing: () => void,
  timeoutMs = 1500
): void {
  let handedOff = false;
  const markHandoff = () => {
    handedOff = true;
  };
  const onVisibility = () => {
    if (document.hidden) markHandoff();
  };
  window.addEventListener("blur", markHandoff);
  document.addEventListener("visibilitychange", onVisibility);

  window.location.href = deepLink;

  window.setTimeout(() => {
    window.removeEventListener("blur", markHandoff);
    document.removeEventListener("visibilitychange", onVisibility);
    if (!handedOff) onMissing();
  }, timeoutMs);
}

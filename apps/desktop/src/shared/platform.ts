/**
 * Platform detection usable from BOTH runtime contexts: the webview renderer
 * (which only has `navigator`) and the bun main process (which only has
 * `process`). Prefer these over ad-hoc `navigator.userAgent` /
 * `process.platform` checks so every platform-gated behavior (labels,
 * shortcuts, window chrome) agrees on the answer.
 */

const _userAgent =
  typeof navigator !== "undefined" ? navigator.userAgent : null;

export const isWindows: boolean =
  _userAgent !== null
    ? /Win/i.test(_userAgent)
    : typeof process !== "undefined" && process.platform === "win32";

export const isMac: boolean =
  _userAgent !== null
    ? /Mac/i.test(_userAgent)
    : typeof process !== "undefined" && process.platform === "darwin";

/** The primary shortcut modifier, for display in tooltips/kbd hints. */
export const MOD_KEY_LABEL = isMac ? "⌘" : "Ctrl";

/**
 * Whether a keyboard event is the platform's "mod+Enter" chord (⌘Enter on
 * macOS, Ctrl+Enter elsewhere). Accepts both modifiers on every platform so a
 * mac user with an external PC keyboard isn't stranded.
 */
export function isModEnter(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey);
}

/**
 * The OS file manager's name, for "Reveal in …" labels. Windows calls it
 * Explorer; macOS (and our Linux fallback) say Finder.
 */
export const REVEAL_LABEL = isWindows
  ? "Reveal in Explorer"
  : "Reveal in Finder";

/** The "Move to …" delete label, matching the OS trash's name. */
export const MOVE_TO_TRASH_LABEL = isWindows
  ? "Move to Recycle Bin"
  : "Move to Trash";

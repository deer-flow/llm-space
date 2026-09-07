import { MESSAGES } from "../i18n/messages";

/** Palette-only entries that sit outside {@link COMMAND_META}. */
type PaletteMessageKey = "saveTo" | "importFrom";

/**
 * Both localized labels of a palette-only entry, for text matching that
 * should hit in either language — searching the Chinese UI with "Save to"
 * (or the English UI with "保存") still finds the entry. Mirrors
 * {@link commandLabels} for `CommandType` entries.
 */
export function paletteLabels(key: PaletteMessageKey): [string, string] {
  return [MESSAGES.en.palette[key], MESSAGES.zh.palette[key]];
}

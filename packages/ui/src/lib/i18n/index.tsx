import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  LOCAL_STORAGE_KEYS,
  readLocalStorage,
  writeLocalStorage,
} from "../local-storage";

import {
  LANGUAGES,
  formatString,
  langToTimeago,
  MESSAGES,
  resolveInitialLang,
  type Lang,
  type Messages,
} from "./messages";

// No manual timeago locale registration here: importing `timeago.js` (which
// every `format(ts, langToTimeago(lang))` call site does) evaluates the
// package's own barrel, which registers both locales we map to — `en_US` and
// `zh_CN` — as real ESM functions. Re-registering `zh_CN` from the CJS deep
// path (`timeago.js/lib/lang/zh_CN`) is redundant and actively dangerous:
// under Vite's CJS interop that import yields the `{ __esModule, default }`
// exports object instead of the formatter function, poisoning the registry
// so every Chinese-locale relative-time render throws
// "TypeError: localeFunc is not a function" — with no error boundary above
// it, that unmounts the whole app (the deep-research white screen).

export type { Lang, Messages };
export { LANGUAGES, formatString, langToTimeago };

/**
 * The message tree for the persisted language — for non-React consumers
 * (stores, imperative toasts) that can't use `useI18n`. Reads the persisted
 * choice at call time so a language switch is picked up by the next call.
 */
export function getMessages(): Messages {
  const stored = readLocalStorage(LOCAL_STORAGE_KEYS.appLanguage);
  return MESSAGES[stored === "zh" ? "zh" : "en"];
}

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Messages;
}

const I18nContext = createContext<I18nValue | null>(null);

function _browserLanguages(): string[] {
  if (typeof navigator === "undefined") return [];
  return Array.from(navigator.languages ?? [navigator.language]);
}

export function I18nProvider({
  initialLang,
  resolveOsLocale,
  onLanguageChanged,
  children,
}: {
  initialLang?: Lang;
  resolveOsLocale?: () => Promise<string>;
  onLanguageChanged?: (lang: Lang) => void;
  children: ReactNode;
}) {
  const stored = readLocalStorage(LOCAL_STORAGE_KEYS.appLanguage);
  const [lang, setLangState] = useState<Lang>(() =>
    initialLang ?? resolveInitialLang(stored, "", _browserLanguages())
  );
  const resolvedRef = useRef(initialLang !== undefined || stored !== null);

  // Async OS-locale refinement: only when no explicit choice exists (checked
  // again at resolution time so a mid-flight user choice is never clobbered).
  useEffect(() => {
    if (!resolveOsLocale || resolvedRef.current) return;
    let cancelled = false;
    void resolveOsLocale()
      .then((osLocale) => {
        if (cancelled || resolvedRef.current) return;
        setLangState(resolveInitialLang(null, osLocale, _browserLanguages()));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [resolveOsLocale]);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const setLang = useCallback(
    (next: Lang) => {
      resolvedRef.current = true;
      setLangState(next);
      writeLocalStorage(LOCAL_STORAGE_KEYS.appLanguage, next);
      onLanguageChanged?.(next);
    },
    [onLanguageChanged]
  );

  // Memoize so consumers re-render only when the language actually changes,
  // not on every provider re-render.
  const value = useMemo(
    () => ({ lang, setLang, t: MESSAGES[lang] }),
    [lang, setLang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}

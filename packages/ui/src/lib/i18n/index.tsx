import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { register } from "timeago.js";
import zh_CN from "timeago.js/lib/lang/zh_CN";

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

// timeago.js's `register` is idempotent and `timeago.js/lib/lang/zh_CN` is its
// documented locale path. Register the Simplified-Chinese locale client-side
// only — server/bun contexts have no document and no timeago use.
if (typeof document !== "undefined") {
  register("zh_CN", zh_CN);
}

export type { Lang, Messages };
export { LANGUAGES, formatString, langToTimeago };

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
    void resolveOsLocale().then((osLocale) => {
      if (cancelled || resolvedRef.current) return;
      setLangState(resolveInitialLang(null, osLocale, _browserLanguages()));
    });
    return () => {
      cancelled = true;
    };
  }, [resolveOsLocale]);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const setLang = (next: Lang) => {
    resolvedRef.current = true;
    setLangState(next);
    writeLocalStorage(LOCAL_STORAGE_KEYS.appLanguage, next);
    onLanguageChanged?.(next);
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t: MESSAGES[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an I18nProvider");
  return ctx;
}

"use client";

import {
  LOCAL_STORAGE_KEYS,
  readLocalStorage,
  writeLocalStorage,
} from "@llm-space/ui/lib/local-storage";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { detectAppLanguage, type AppLanguage } from "@/shared/language";

import { MESSAGES, type AppMessages } from "./messages";

interface I18nContextValue {
  lang: AppLanguage;
  setLang: (lang: AppLanguage) => void;
  t: AppMessages;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function _readInitialLanguage(): AppLanguage {
  // Minimal DOM shims (tests) may expose a window without a navigator; treat
  // that like a headless default rather than throwing during mount.
  const navigatorLanguages =
    typeof window === "undefined" || typeof window.navigator === "undefined"
      ? []
      : (window.navigator.languages ?? [window.navigator.language]);
  // An explicit past choice wins; otherwise follow the browser's preferred
  // languages (any Chinese variant opens in Chinese).
  return detectAppLanguage(
    readLocalStorage(LOCAL_STORAGE_KEYS.language),
    navigatorLanguages
  );
}

/**
 * Supplies the active UI language and its message tree to the renderer. The
 * choice persists in localStorage (mirrored to the host like every other
 * managed key); the main process rebuilds the native menu when this value
 * changes.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>(_readInitialLanguage);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const setLang = (next: AppLanguage) => {
    writeLocalStorage(LOCAL_STORAGE_KEYS.language, next);
    setLangState(next);
  };

  const value = useMemo<I18nContextValue>(
    () => ({ lang, setLang, t: MESSAGES[lang] }),
    [lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return ctx;
}

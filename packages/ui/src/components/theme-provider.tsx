"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** User-selectable appearance. `"system"` follows the OS color scheme. */
export type Theme = "light" | "dark" | "system";
/** The concrete scheme actually applied to the document. */
export type ResolvedTheme = "light" | "dark";

/** Accent (as `#rrggbb`) used when nothing is stored — the base `--primary` blue. */
export const DEFAULT_PRIMARY = "#5e80ee";

/**
 * How richly the message list renders. `"rich"` (default) uses full CodeMirror
 * editors; `"lite"` downgrades the right-side message list to plain `<pre>` text
 * to keep large threads scrollable on the native WebKit renderer, where mounting
 * one CodeMirror per message makes scroll cost scale with message count.
 */
export type RenderingFidelity = "rich" | "lite";

/**
 * localStorage keys for the persisted appearance. Kept in sync with the
 * anti-FOUC bootstrap script in `mainview/index.html`, which reads the same
 * keys to apply appearance before React mounts — change both together.
 */
export const THEME_STORAGE_KEY = "llm-space-theme";
export const PRIMARY_STORAGE_KEY = "llm-space-primary";
export const RENDERING_FIDELITY_STORAGE_KEY = "llm-space-rendering-fidelity";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

interface PrimaryColorContextValue {
  /** The active accent as a `#rrggbb` hex string. */
  primaryColor: string;
  hasPrimaryColorOverride: boolean;
  setPrimaryColor: (hex: string) => void;
  resetPrimaryColor: () => void;
  resetPrimaryColorVersion: number;
}

interface RenderingFidelityContextValue {
  fidelity: RenderingFidelity;
  setFidelity: (fidelity: RenderingFidelity) => void;
}

// Split contexts: the accent updates on every drag tick, but theme consumers
// (CodeEditor per message/tool-call, ThreadTabs, the toaster) only read
// `resolvedTheme`. Keeping accent in its own context spares those hot-list
// components a re-render storm while the color picker is dragged.
const ThemeContext = createContext<ThemeContextValue | null>(null);
const PrimaryColorContext = createContext<PrimaryColorContextValue | null>(null);
const RenderingFidelityContext =
  createContext<RenderingFidelityContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function _readStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "dark";
}

function _readStoredPrimary(): string {
  const stored = localStorage.getItem(PRIMARY_STORAGE_KEY);
  return stored && HEX_RE.test(stored) ? stored : DEFAULT_PRIMARY;
}

function _readStoredFidelity(): RenderingFidelity {
  return localStorage.getItem(RENDERING_FIDELITY_STORAGE_KEY) === "lite"
    ? "lite"
    : "rich";
}

/** Pick a readable foreground for an arbitrary accent (WCAG relative luminance). */
function _primaryForeground(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance =
    0.2126 * toLinear((n >> 16) & 255) +
    0.7152 * toLinear((n >> 8) & 255) +
    0.0722 * toLinear(n & 255);
  // Dark ink on bright accents (yellows/ambers), near-white on the rest.
  return luminance > 0.45 ? "oklch(0.216 0.006 56)" : "oklch(0.985 0 0)";
}

/** Apply the accent as inline `--primary`/`--ring`/`--primary-foreground` vars. */
function _applyPrimary(hex: string) {
  const root = document.documentElement;
  root.style.setProperty("--primary", hex);
  root.style.setProperty("--ring", hex);
  root.style.setProperty("--primary-foreground", _primaryForeground(hex));
}

function _systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function _resolve(theme: Theme): ResolvedTheme {
  return theme === "system" ? _systemTheme() : theme;
}

/** Toggle the `.dark` class the Tailwind `dark` variant keys off of. */
function _applyTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

/**
 * Toggle the `.lite` class on `<html>`. "Lite" fidelity disables all
 * transitions/animations (see the `.lite` rule in `globals.css`) alongside the
 * plain-text message list.
 */
function _applyFidelity(fidelity: RenderingFidelity) {
  document.documentElement.classList.toggle("lite", fidelity === "lite");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(_readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    _resolve(_readStoredTheme())
  );

  const [primaryColor, setPrimaryState] = useState<string>(_readStoredPrimary);
  const [hasPrimaryColorOverride, setHasPrimaryColorOverride] = useState(
    () => {
      const stored = localStorage.getItem(PRIMARY_STORAGE_KEY);
      return Boolean(stored && HEX_RE.test(stored));
    }
  );
  const [resetPrimaryColorVersion, setResetPrimaryColorVersion] = useState(0);

  const [fidelity, setFidelityState] =
    useState<RenderingFidelity>(_readStoredFidelity);

  const setFidelity = useCallback((next: RenderingFidelity) => {
    localStorage.setItem(RENDERING_FIDELITY_STORAGE_KEY, next);
    setFidelityState(next);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setThemeState(next);
  }, []);

  const setPrimaryColor = useCallback((next: string) => {
    localStorage.setItem(PRIMARY_STORAGE_KEY, next);
    setHasPrimaryColorOverride(true);
    setPrimaryState(next);
  }, []);

  const resetPrimaryColor = useCallback(() => {
    localStorage.removeItem(PRIMARY_STORAGE_KEY);
    setHasPrimaryColorOverride(false);
    setPrimaryState(DEFAULT_PRIMARY);
    setResetPrimaryColorVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    _applyPrimary(primaryColor);
  }, [primaryColor]);

  // Reflect the fidelity onto `<html>` so the global `.lite` CSS can disable
  // motion. The anti-FOUC bootstrap in `mainview/index.html` applies it before
  // React mounts — keep the storage key in sync.
  useEffect(() => {
    _applyFidelity(fidelity);
  }, [fidelity]);

  // Apply the resolved theme to the document, and — while following the system
  // — re-resolve when the OS color scheme flips.
  useEffect(() => {
    const resolved = _resolve(theme);
    setResolvedTheme(resolved);
    _applyTheme(resolved);

    if (theme !== "system") {
      return;
    }
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      const next = _systemTheme();
      setResolvedTheme(next);
      _applyTheme(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const themeValue = useMemo(
    (): ThemeContextValue => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  );
  const primaryValue = useMemo(
    (): PrimaryColorContextValue => ({
      primaryColor,
      hasPrimaryColorOverride,
      setPrimaryColor,
      resetPrimaryColor,
      resetPrimaryColorVersion,
    }),
    [
      primaryColor,
      hasPrimaryColorOverride,
      setPrimaryColor,
      resetPrimaryColor,
      resetPrimaryColorVersion,
    ]
  );

  const fidelityValue = useMemo(
    (): RenderingFidelityContextValue => ({ fidelity, setFidelity }),
    [fidelity, setFidelity]
  );

  return (
    <ThemeContext.Provider value={themeValue}>
      <PrimaryColorContext.Provider value={primaryValue}>
        <RenderingFidelityContext.Provider value={fidelityValue}>
          {children}
        </RenderingFidelityContext.Provider>
      </PrimaryColorContext.Provider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within <ThemeProvider>");
  }
  return ctx;
}

export function usePrimaryColor(): PrimaryColorContextValue {
  const ctx = useContext(PrimaryColorContext);
  if (!ctx) {
    throw new Error("usePrimaryColor must be used within <ThemeProvider>");
  }
  return ctx;
}

export function useRenderingFidelity(): RenderingFidelityContextValue {
  const ctx = useContext(RenderingFidelityContext);
  if (!ctx) {
    throw new Error(
      "useRenderingFidelity must be used within <ThemeProvider>"
    );
  }
  return ctx;
}

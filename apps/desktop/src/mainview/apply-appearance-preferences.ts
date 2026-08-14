import {
  LOCAL_STORAGE_KEYS,
  type LocalStorageValues,
} from "@llm-space/ui/lib/local-storage";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function primaryForeground(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const toLinear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  const luminance =
    0.2126 * toLinear((n >> 16) & 255) +
    0.7152 * toLinear((n >> 8) & 255) +
    0.0722 * toLinear(n & 255);
  return luminance > 0.45 ? "oklch(0.216 0.006 56)" : "oklch(0.985 0 0)";
}

/** Apply the disk-backed snapshot before importing and mounting React. */
export function applyAppearancePreferences(
  values: LocalStorageValues
): void {
  const root = document.documentElement;
  const theme = values[LOCAL_STORAGE_KEYS.theme];
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);

  root.classList.toggle(
    "lite",
    values[LOCAL_STORAGE_KEYS.renderingFidelity] === "lite"
  );

  const primary = values[LOCAL_STORAGE_KEYS.primaryColor];
  if (primary && HEX_RE.test(primary)) {
    root.style.setProperty("--primary", primary);
    root.style.setProperty("--ring", primary);
    root.style.setProperty(
      "--primary-foreground",
      primaryForeground(primary)
    );
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--ring");
    root.style.removeProperty("--primary-foreground");
  }
}

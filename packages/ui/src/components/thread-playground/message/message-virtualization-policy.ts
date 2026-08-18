import type { RenderingFidelity } from "../../theme-provider";

export type MessageVirtualizationMode = "off" | "auto" | "custom" | "on";

export const GIB = 2 ** 30;
export const DEFAULT_MESSAGE_VIRTUALIZATION_MODE: MessageVirtualizationMode =
  "auto";
export const DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD = 20;
export const MIN_AUTO_VIRTUALIZATION_THRESHOLD = 10;
export const MAX_AUTO_VIRTUALIZATION_THRESHOLD = 200;
export const RENDERING_THRESHOLD_MULTIPLIER = {
  rich: 1,
  "on-demand": 1.5,
  lite: 2,
} as const satisfies Record<RenderingFidelity, number>;

export function parseMessageVirtualizationMode(
  raw: string | null
): MessageVirtualizationMode {
  return raw === "off" ||
    raw === "auto" ||
    raw === "custom" ||
    raw === "on"
    ? raw
    : DEFAULT_MESSAGE_VIRTUALIZATION_MODE;
}

export function parseCustomVirtualizationThreshold(
  raw: string | null
): number {
  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD;
}

export function resolveFullVirtualizationThreshold(
  totalMemoryBytes: number | null
): number {
  if (
    totalMemoryBytes === null ||
    !Number.isFinite(totalMemoryBytes) ||
    totalMemoryBytes <= 0
  ) {
    return 25;
  }
  const totalMemoryGiB = Math.round(totalMemoryBytes / GIB);
  if (totalMemoryGiB <= 8) return 10;
  if (totalMemoryGiB <= 16) return 15;
  if (totalMemoryGiB <= 32) return 25;
  return 30;
}

export function applyRenderingThreshold({
  fullBaseThreshold,
  rendering,
}: {
  fullBaseThreshold: number;
  rendering: RenderingFidelity;
}): number {
  const threshold =
    fullBaseThreshold * RENDERING_THRESHOLD_MULTIPLIER[rendering];
  return Math.min(
    MAX_AUTO_VIRTUALIZATION_THRESHOLD,
    Math.max(MIN_AUTO_VIRTUALIZATION_THRESHOLD, Math.round(threshold))
  );
}

export function resolveAutoVirtualizationThreshold({
  totalMemoryBytes,
  rendering,
}: {
  totalMemoryBytes: number | null;
  rendering: RenderingFidelity;
}): number {
  return applyRenderingThreshold({
    fullBaseThreshold: resolveFullVirtualizationThreshold(totalMemoryBytes),
    rendering,
  });
}

export function shouldVirtualizeMessages({
  mode,
  rowCount,
  autoThreshold = MIN_AUTO_VIRTUALIZATION_THRESHOLD,
  customThreshold = DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD,
}: {
  mode: MessageVirtualizationMode;
  rowCount: number;
  autoThreshold?: number;
  customThreshold?: number;
}): boolean {
  if (mode === "off") return false;
  if (mode === "on") return rowCount > 0;
  return rowCount > (mode === "auto" ? autoThreshold : customThreshold);
}

import type { RuntimeId, RuntimeScopedParams } from "@/shared/runtime";

export function runtimeScope(
  runtimeId: RuntimeId | undefined
): RuntimeScopedParams {
  return runtimeId ? { runtimeId } : {};
}

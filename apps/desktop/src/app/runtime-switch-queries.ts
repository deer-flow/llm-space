import type { QueryClient } from "@tanstack/react-query";

import type { RuntimeId } from "@/shared/runtime";

export function invalidateRuntimeSwitchQueries(
  queryClient: QueryClient,
  nextRuntimeId: RuntimeId
): Promise<void> {
  // Mounted panes own their in-memory thread state; only an explicit Refresh
  // may replace it from disk. A runtime switch refreshes the destination's
  // directory listing without refetching active (including hidden) panes.
  return queryClient.invalidateQueries({
    queryKey: ["fs", nextRuntimeId],
  });
}

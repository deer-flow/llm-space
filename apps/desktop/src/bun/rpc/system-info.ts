import { totalmem } from "node:os";

export interface SystemInfo {
  totalMemoryBytes: number;
}

export function readSystemInfo(
  readTotalMemory: () => number = totalmem
): SystemInfo {
  const value = readTotalMemory();
  return {
    totalMemoryBytes:
      Number.isFinite(value) && value > 0 ? Math.floor(value) : 0,
  };
}

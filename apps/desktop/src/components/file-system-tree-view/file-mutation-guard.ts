import type { RuntimeId } from "@/shared/runtime";

export type AcquireFileMutation = (
  paths: string[],
  runtimeId: RuntimeId,
  action: string
) => (() => void) | null;

export async function runFileMutationWithGuard<T>({
  acquireMutation,
  paths,
  runtimeId,
  action,
  blockedResult,
  mutate,
  reconcile,
}: {
  acquireMutation?: AcquireFileMutation;
  paths: string[];
  runtimeId: RuntimeId;
  action: string;
  blockedResult: T;
  mutate: () => Promise<T>;
  reconcile?: (result: T) => void | Promise<void>;
}): Promise<T> {
  const release = acquireMutation?.(paths, runtimeId, action);
  if (acquireMutation && !release) return blockedResult;
  try {
    const result = await mutate();
    await reconcile?.(result);
    return result;
  } finally {
    release?.();
  }
}

export function runGuardedFileMove<T, Conflict>({
  acquireMutation,
  paths,
  runtimeId,
  action,
  blockedResult,
  detectConflict,
  confirmConflict,
  mutate,
  reconcile,
}: {
  acquireMutation?: AcquireFileMutation;
  paths: string[];
  runtimeId: RuntimeId;
  action: string;
  blockedResult: T;
  detectConflict: () => Promise<Conflict | null>;
  confirmConflict?: (conflict: Conflict) => Promise<boolean>;
  mutate: (overwrite: boolean) => Promise<T>;
  reconcile?: (result: T) => void | Promise<void>;
}): Promise<T> {
  return runFileMutationWithGuard({
    acquireMutation,
    paths,
    runtimeId,
    action,
    blockedResult,
    mutate: async () => {
      const conflict = await detectConflict();
      if (conflict !== null && !(await confirmConflict?.(conflict))) {
        return blockedResult;
      }
      return mutate(conflict !== null);
    },
    reconcile,
  });
}

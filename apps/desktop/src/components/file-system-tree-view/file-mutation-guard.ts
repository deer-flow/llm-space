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

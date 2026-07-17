import type { ReadableThreadStorage } from "../types/storage/thread-storage";
import type { Thread } from "../types/threads/thread";

/**
 * Convenience for the common two-step read: resolve a resource id to its latest
 * locator, then read that locator into a Thread.
 */
export async function readLatestThread(
  storage: ReadableThreadStorage,
  id: string
): Promise<Thread> {
  return storage.read(await storage.resolveLatest(id));
}

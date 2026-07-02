import type { Thread } from "@llm-space/core";

import { createStarterThread } from "../../shared/thread-starters";

/**
 * The starter thread written into a fresh workspace. Typed as `Thread` so the
 * shape is validated at compile time and stays aligned with the renderer's
 * starter-thread factory.
 */
export const EXAMPLE_THREAD: Thread = createStarterThread("example");

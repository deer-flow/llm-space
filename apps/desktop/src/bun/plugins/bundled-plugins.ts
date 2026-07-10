import type { Thread } from "@llm-space/core";
import { manifest as eveManifest } from "@llm-space/plugin-eve/manifest";

import type { BundledPlugin } from "./types";

/** Static imports make every production plugin reachable by Electrobun's build. */
export const BUNDLED_PLUGINS: readonly BundledPlugin<Thread>[] = [
  {
    manifest: eveManifest,
    load: () => import("@llm-space/plugin-eve"),
  },
];

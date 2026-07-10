import {
  validatePluginManifest,
  type PluginManifest,
} from "@llm-space/plugin-api";

import rawManifest from "../llm-space.plugin.json" with { type: "json" };

const validation = validatePluginManifest(rawManifest);
if (!validation.valid || !validation.manifest) {
  throw new Error(
    `Invalid bundled Eve plugin manifest: ${validation.errors.join("; ")}`
  );
}

/** Static metadata imported by the desktop before Eve runtime activation. */
export const manifest: PluginManifest = validation.manifest;

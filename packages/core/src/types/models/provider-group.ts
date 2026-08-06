import * as pi from "@earendil-works/pi-ai";

import type { ArkImageGenerationConfig } from "./image-generation";
import type { ProviderProfile } from "./provider-profile";

/**
 * A model as surfaced to the renderer: a pi model plus an optional `icon` — a
 * {@link https://github.com/lobehub/lobe-icons | @lobehub/icons} keyword used to
 * override the brand icon shown for it. Absent ⇒ the icon is auto-resolved from
 * the model id/name.
 */
export type ProviderGroupModel = pi.Model<pi.Api> & { icon?: string };

export interface ModelProviderGroup {
  id: string;
  name: string;
  builtin?: boolean;
  models: readonly ProviderGroupModel[];
  /** Connection profiles in creation order. The first profile is the default. */
  profiles: readonly ProviderProfile[];
  apiKeyDetected?: boolean;
  /** API compatibility mode for a custom provider. */
  api?: "anthropic-messages" | "openai-completions" | "openai-responses";
  /** Model ids the user has disabled. Everything not listed is enabled. */
  disabledModels?: string[];
  /** Ids of the user-added custom models within this provider. */
  customModels?: string[];
  /** Native Ark image-model inventory. Present only on the Ark provider. */
  imageGeneration?: ArkImageGenerationConfig;
  websiteLink?: string;
  websiteURL?: string;
  apiKeyURL?: string;
  iconURL?: string;
  /**
   * A `@lobehub/icons` keyword overriding the brand icon shown for this
   * provider. Absent ⇒ the icon is auto-resolved from the provider id/name.
   */
  icon?: string;
  source?: "user" | "plugin";
  readOnly?: boolean;
  pluginId?: string;
}

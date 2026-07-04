/**
 * The custom-provider API surface, shared by the add-provider form
 * (`models-page.tsx`) and the custom-model editor (`model-editor-dialog.tsx`).
 * Kept in one place so the type, the selectable options, and the default never
 * drift between the two dialogs.
 */

export type CustomProviderApi =
  | "anthropic-messages"
  | "openai-completions"
  | "openai-responses";

export const DEFAULT_CUSTOM_PROVIDER_API: CustomProviderApi =
  "openai-completions";

/** Selectable API types, ordered by preference (most common first). */
export const CUSTOM_PROVIDER_API_TYPES: {
  value: CustomProviderApi;
  label: string;
}[] = [
  { value: "openai-completions", label: "OpenAI Completions" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
];

/** Whether `api` is one of the known custom-provider API types. */
export function isCustomProviderApi(api: string): api is CustomProviderApi {
  return CUSTOM_PROVIDER_API_TYPES.some((type) => type.value === api);
}

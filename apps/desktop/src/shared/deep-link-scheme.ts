export const PRODUCTION_DEEP_LINK_SCHEME = "llm-space";
export const DEVELOPMENT_DEEP_LINK_SCHEME = "llm-space-dev";

export type DeepLinkScheme =
  typeof PRODUCTION_DEEP_LINK_SCHEME | typeof DEVELOPMENT_DEEP_LINK_SCHEME;

export function resolveDeepLinkScheme(value?: string): DeepLinkScheme {
  return value === DEVELOPMENT_DEEP_LINK_SCHEME
    ? DEVELOPMENT_DEEP_LINK_SCHEME
    : PRODUCTION_DEEP_LINK_SCHEME;
}

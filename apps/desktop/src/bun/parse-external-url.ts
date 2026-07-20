const ALLOWED_EXTERNAL_URL_PROTOCOLS = new Set(["http:", "https:"]);
const EXTERNAL_URL_REJECTION_MESSAGE = "External URL is not allowed.";

export function parseExternalUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(EXTERNAL_URL_REJECTION_MESSAGE);
  }

  if (!ALLOWED_EXTERNAL_URL_PROTOCOLS.has(url.protocol)) {
    throw new Error(EXTERNAL_URL_REJECTION_MESSAGE);
  }

  return url;
}

/**
 * GitHub OAuth **Device Flow** HTTP calls. Pure request helpers with no state —
 * {@link GitHubAuthManager} orchestrates them. Every call uses the global
 * `fetch`, which `NetworkSettingsManager` routes through the configured proxy
 * via `process.env`; do not swap in a bypassing dispatcher.
 *
 * See https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
 */

import { GITHUB_OAUTH_SCOPE, type GithubUser } from "../../shared/auth";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const USER_EMAILS_URL = "https://api.github.com/user/emails";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

/** Sent on every GitHub request so the API doesn't reject us for a missing UA. */
const USER_AGENT = "LLM-Space";

/** The device/user codes returned when a Device Flow is started. */
export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  /** Seconds until the device code expires. */
  expiresIn: number;
  /** Minimum seconds to wait between token polls. */
  interval: number;
}

/** A successfully minted access token. */
export interface AccessTokenResponse {
  accessToken: string;
  tokenType: string;
  scope: string;
}

/**
 * A terminal Device Flow failure with a stable `code` for the caller to branch
 * on (`expired_token`, `access_denied`, `device_flow_disabled`, …).
 */
export class DeviceFlowError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "DeviceFlowError";
  }
}

/** Start a Device Flow: request a device + user code for `clientId`. */
export async function requestDeviceCode(
  clientId: string
): Promise<DeviceCodeResponse> {
  const response = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ client_id: clientId, scope: GITHUB_OAUTH_SCOPE }),
  });
  if (!response.ok) {
    throw new DeviceFlowError(
      "request_failed",
      `Failed to start GitHub sign-in (HTTP ${response.status}).`
    );
  }
  const data = (await response.json()) as Record<string, unknown>;
  if (typeof data.error === "string") {
    throw new DeviceFlowError(
      data.error,
      _stringOr(data.error_description, "GitHub rejected the sign-in request.")
    );
  }
  return {
    deviceCode: String(data.device_code),
    userCode: String(data.user_code),
    verificationUri: String(data.verification_uri),
    verificationUriComplete: String(
      data.verification_uri_complete ?? data.verification_uri
    ),
    expiresIn: Number(data.expires_in ?? 900),
    interval: Number(data.interval ?? 5),
  };
}

/**
 * Poll for the access token until the user authorizes (or the flow fails). Waits
 * `intervalSec` between polls, backing off on `slow_down`, and resolves with the
 * token once GitHub returns one. Rejects with a {@link DeviceFlowError} on
 * `expired_token` / `access_denied`, or an `AbortError` when `signal` fires.
 */
export async function pollForAccessToken(
  clientId: string,
  deviceCode: string,
  intervalSec: number,
  signal: AbortSignal
): Promise<AccessTokenResponse> {
  let waitMs = Math.max(1, intervalSec) * 1000;
  for (;;) {
    await _delay(waitMs, signal);
    const response = await fetch(ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: GRANT_TYPE,
      }),
      signal,
    });
    const data = (await response.json()) as Record<string, unknown>;

    if (typeof data.access_token === "string") {
      return {
        accessToken: data.access_token,
        tokenType: _stringOr(data.token_type, "bearer"),
        scope: _stringOr(data.scope, GITHUB_OAUTH_SCOPE),
      };
    }

    switch (data.error) {
      case "authorization_pending":
        // Keep waiting at the current cadence.
        break;
      case "slow_down":
        // GitHub asks us to back off; honor the new interval when provided.
        waitMs = Number(data.interval ?? waitMs / 1000 + 5) * 1000;
        break;
      case "expired_token":
        throw new DeviceFlowError(
          "expired_token",
          "The sign-in request expired before it was approved."
        );
      case "access_denied":
        throw new DeviceFlowError(
          "access_denied",
          "GitHub sign-in was cancelled."
        );
      default:
        throw new DeviceFlowError(
          _stringOr(data.error, "unknown_error"),
          _stringOr(data.error_description, "GitHub sign-in failed.")
        );
    }
  }
}

/** Fetch the authenticated user's public profile with a bearer token. */
export async function fetchGithubUser(
  accessToken: string
): Promise<GithubUser> {
  const response = await fetch(USER_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new DeviceFlowError(
      "user_fetch_failed",
      `Signed in, but failed to load the GitHub profile (HTTP ${response.status}).`
    );
  }
  const data = (await response.json()) as Record<string, unknown>;
  const login = String(data.login);
  // `/user` only returns a public email; when it's hidden, read the primary
  // verified one via the `user:email` scope.
  const email =
    typeof data.email === "string" && data.email
      ? data.email
      : await _fetchPrimaryEmail(accessToken);
  return {
    login,
    name: typeof data.name === "string" ? data.name : null,
    email,
    avatarUrl: _stringOr(data.avatar_url, ""),
    htmlUrl: _stringOr(data.html_url, `https://github.com/${login}`),
  };
}

/** The user's primary (or first verified) email, best-effort; null on failure. */
async function _fetchPrimaryEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(USER_EMAILS_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      return null;
    }
    const emails = (await response.json()) as {
      email?: string;
      primary?: boolean;
      verified?: boolean;
    }[];
    const chosen =
      emails.find((e) => e.primary && e.verified) ??
      emails.find((e) => e.verified) ??
      emails[0];
    return typeof chosen?.email === "string" ? chosen.email : null;
  } catch {
    return null;
  }
}

/** Resolve `value` when it's a non-empty string, otherwise `fallback`. */
function _stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

/** A cancellable delay that rejects with an `AbortError` if `signal` fires. */
function _delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

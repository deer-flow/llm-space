/**
 * GitHub authentication, shared between the bun process (which runs the OAuth
 * Device Flow and persists the token) and the renderer (which shows sign-in
 * state). The token itself never crosses to the renderer — only {@link
 * GithubAuthState}, which carries at most the public user profile.
 */

/**
 * The OAuth App client id used for the Device Flow. Public by design (Device
 * Flow needs no client secret), so it is safe to ship in the app. Registered as
 * the project's GitHub OAuth App with "Enable Device Flow" ticked; the `gist`
 * scope is requested at flow start. Empty here would fail fast with a "not
 * configured" error.
 */
export const GITHUB_OAUTH_CLIENT_ID = "Ov23ctJEQnOdiLroO0yF";

/**
 * The OAuth scopes requested at sign-in (space-separated). `gist` is for
 * sharing threads as gists; `user:email` grants "Access user email addresses"
 * (read-only) so we can read the signed-in user's email.
 */
export const GITHUB_OAUTH_SCOPE = "gist user:email";

/** The public GitHub profile of the signed-in user. Safe to show in the UI. */
export interface GithubUser {
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

/**
 * The renderer-facing auth state. Deliberately never carries the access token —
 * only whether we're signed in / signing in, and the public profile when known.
 */
export type GithubAuthState =
  | { status: "signedOut"; error?: string }
  // `userCode` is the pairing code the user enters on `verificationUri`. Absent
  // in the brief window before the device code has been requested.
  | { status: "signingIn"; userCode?: string; verificationUri?: string }
  | { status: "signedIn"; user: GithubUser };

/**
 * The persisted shape on disk (`settings/auth.json`). Holds the access token, so
 * it stays in the bun process and is written with `0600` perms. `null`/absent
 * file means signed out.
 */
export interface AuthConfig {
  accessToken: string;
  tokenType: string;
  scope: string;
  user: GithubUser;
}

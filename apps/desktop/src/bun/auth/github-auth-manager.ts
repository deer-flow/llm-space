import { rmSync } from "node:fs";
import path from "node:path";

import {
  atomicWriteJsonFileSync,
  getSettingsDir,
  readJsonFileSync,
} from "@llm-space/core/server";
import { z } from "zod";

import {
  GITHUB_OAUTH_CLIENT_ID,
  type AuthConfig,
  type GithubAuthState,
} from "../../shared/auth";

import {
  DeviceFlowError,
  fetchGithubUser,
  pollForAccessToken,
  requestDeviceCode,
} from "./github-device-flow";

const AuthConfigSchema: z.ZodType<AuthConfig | null> = z
  .object({
    accessToken: z.string().min(1),
    tokenType: z.string(),
    scope: z.string(),
    user: z.object({
      login: z.string().min(1),
      name: z.string().nullable(),
      email: z.string().nullable(),
      avatarUrl: z.string(),
      htmlUrl: z.string(),
    }),
  })
  .or(z.null());

export interface GitHubAuthManagerOptions {
  /** Pushed on every auth-state transition (→ renderer over RPC). */
  onChange: (state: GithubAuthState) => void;
  /** Device Flow request implementation; defaults to the GitHub HTTP helpers. */
  deviceFlow?: GitHubDeviceFlow;
  /** Creates per-flow cancellation controllers; defaults to AbortController. */
  createAbortController?: () => AbortController;
}

export interface GitHubDeviceFlow {
  fetchGithubUser: typeof fetchGithubUser;
  pollForAccessToken: typeof pollForAccessToken;
  requestDeviceCode: typeof requestDeviceCode;
}

const GITHUB_DEVICE_FLOW: GitHubDeviceFlow = {
  fetchGithubUser,
  pollForAccessToken,
  requestDeviceCode,
};

/**
 * Owns GitHub authentication: the persisted access token (`settings/auth.json`,
 * `0600`) plus the transient Device Flow. Persistence mirrors
 * `SearchSettingsManager`'s eager load pattern, except a missing file means
 * "signed out" (no seeding) and the token never leaves the bun process — the
 * renderer only ever sees {@link GithubAuthState}.
 */
export class GitHubAuthManager {
  private _config: AuthConfig | null;
  private readonly _createAbortController: () => AbortController;
  private readonly _deviceFlow: GitHubDeviceFlow;
  private readonly _onChange: (state: GithubAuthState) => void;
  /** Non-null while a Device Flow is in progress; aborts the token poll. */
  private _signInController: AbortController | null = null;
  /** The pairing code + verification URL, once the device code is issued. */
  private _pending: { userCode: string; verificationUri: string } | null = null;

  constructor(options: GitHubAuthManagerOptions) {
    this._createAbortController =
      options.createAbortController ?? (() => new AbortController());
    this._deviceFlow = options.deviceFlow ?? GITHUB_DEVICE_FLOW;
    this._onChange = options.onChange;
    this._config = this._loadConfig();
  }

  /** The current renderer-facing state (derived from persisted token + flow). */
  getState(): GithubAuthState {
    if (this._signInController) {
      return {
        status: "signingIn",
        userCode: this._pending?.userCode,
        verificationUri: this._pending?.verificationUri,
      };
    }
    if (this._config) {
      return { status: "signedIn", user: this._config.user };
    }
    return { status: "signedOut" };
  }

  /**
   * Run the Device Flow: request a code, open the verification window, poll for
   * the token, load the profile, and persist. Safe to call fire-and-forget —
   * failures revert to the prior state and surface a message via `onChange`.
   */
  async signIn(): Promise<void> {
    if (this._signInController) {
      // A flow is already running; ignore the duplicate request.
      return;
    }
    if (!GITHUB_OAUTH_CLIENT_ID) {
      this._onChange({
        status: "signedOut",
        error: "GitHub sign-in is not configured yet.",
      });
      return;
    }

    const controller = this._createAbortController();
    this._signInController = controller;
    this._emit();

    try {
      const device = await this._deviceFlow.requestDeviceCode(
        GITHUB_OAUTH_CLIENT_ID
      );
      if (controller.signal.aborted) {
        return;
      }
      // Hand the pairing code to the renderer, which shows it in a dialog with a
      // "copy & open GitHub" button. The renderer opens the browser, not us.
      this._pending = {
        userCode: device.userCode,
        verificationUri: device.verificationUri,
      };
      this._emit();
      const token = await this._deviceFlow.pollForAccessToken(
        GITHUB_OAUTH_CLIENT_ID,
        device.deviceCode,
        device.interval,
        controller.signal
      );
      const user = await this._deviceFlow.fetchGithubUser(
        token.accessToken,
        controller.signal
      );
      if (
        controller.signal.aborted ||
        this._signInController !== controller
      ) {
        return;
      }
      this._config = {
        accessToken: token.accessToken,
        tokenType: token.tokenType,
        scope: token.scope,
        user,
      };
      this._saveConfig();
    } catch (error) {
      if (!controller.signal.aborted) {
        this._onChange({ status: "signedOut", error: _errorMessage(error) });
      }
      return;
    } finally {
      if (this._signInController === controller) {
        this._pending = null;
        this._signInController = null;
      }
    }
    this._emit();
  }

  /** Cancel an in-flight Device Flow (no-op when not signing in). */
  cancelSignIn(): void {
    if (!this._signInController) {
      return;
    }
    this._signInController.abort();
    this._signInController = null;
    this._pending = null;
    this._emit();
  }

  /** Forget the stored token and delete `auth.json`. */
  signOut(): void {
    this.cancelSignIn();
    this._config = null;
    try {
      rmSync(this._configPath, { force: true });
    } catch (error) {
      console.error("Failed to remove auth.json:", error);
    }
    this._emit();
  }

  /** Read the access token for authenticated GitHub calls (gist ops, later). */
  getAccessToken(): string | null {
    return this._config?.accessToken ?? null;
  }

  private _emit(): void {
    this._onChange(this.getState());
  }

  private get _configPath(): string {
    return path.join(getSettingsDir(), "auth.json");
  }

  private _saveConfig(): void {
    atomicWriteJsonFileSync(this._configPath, this._config, { mode: 0o600 });
  }

  /**
   * Read `settings/auth.json`. A missing file is the common "signed out" case
   * (no seeding). A malformed file is treated as signed out rather than crashing
   * startup.
   */
  private _loadConfig(): AuthConfig | null {
    try {
      return readJsonFileSync(this._configPath, {
        schema: AuthConfigSchema,
        recovery: "none",
        fallback: () => null,
        mode: 0o600,
        seedMissing: false,
      }).value;
    } catch (error) {
      console.error("Failed to read auth.json:", error);
      return null;
    }
  }
}

/** A human-readable message for a caught sign-in error. */
function _errorMessage(error: unknown): string {
  if (error instanceof DeviceFlowError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "GitHub sign-in failed.";
}

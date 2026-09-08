import { rmSync } from "node:fs";
import path from "node:path";

import {
  atomicWriteJsonFileSync,
  getSettingsDir,
  readJsonFileSync,
} from "@llm-space/core/server";
import { z } from "zod";

const VercelConfigSchema = z.object({
  accessToken: z.string().min(1),
});

/**
 * Owns the Vercel access token used to deploy generated/static projects.
 * Persisted to `settings/vercel.json` (`0600`) like GitHub's `auth.json`; the
 * token never leaves the bun process — the renderer only sees whether a token
 * is configured, never the token itself.
 */
export class VercelTokenStore {
  private _load(): string | null {
    try {
      const config = readJsonFileSync(this._configPath, {
        schema: VercelConfigSchema,
        recovery: "none",
        fallback: () => null,
        mode: 0o600,
        seedMissing: false,
      }).value;
      return config?.accessToken ?? null;
    } catch (error) {
      console.error("Failed to read vercel.json:", error);
      return null;
    }
  }

  /** Persist the token. Empty/whitespace-only input is rejected. */
  set(accessToken: string): void {
    const token = accessToken.trim();
    if (!token) {
      throw new Error("Vercel token must not be empty.");
    }
    atomicWriteJsonFileSync(
      this._configPath,
      { accessToken: token },
      { mode: 0o600 }
    );
  }

  /** Forget the stored token and delete `vercel.json`. */
  clear(): void {
    try {
      rmSync(this._configPath, { force: true });
    } catch (error) {
      console.error("Failed to remove vercel.json:", error);
    }
  }

  /** Whether a token is configured (the renderer-safe status). */
  isConfigured(): boolean {
    return this._load() !== null;
  }

  /** The raw token for authenticated Vercel calls (bun-side only). */
  getAccessToken(): string | null {
    return this._load();
  }

  private get _configPath(): string {
    return path.join(getSettingsDir(), "vercel.json");
  }
}

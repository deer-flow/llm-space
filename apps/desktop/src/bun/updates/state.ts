import { join } from "node:path";

import {
  atomicWriteJsonFile,
  getSettingsDir,
  readJsonFile,
} from "@llm-space/core/server";
import { z } from "zod";

import { DEFAULT_UPDATE_MODE, type UpdateMode } from "../../shared/updates";

/**
 * Persisted updater state (`settings/updates.json`): the user's update-mode
 * preference and the last bundle hash we launched, used to detect "we just
 * updated" after an applyUpdate relaunch.
 */
interface UpdatesState {
  mode?: UpdateMode;
  /**
   * Last launched bundle hash, keyed by app identifier. `settings/` is shared
   * by every edition (`getLlmSpaceHomePath()` is app-name independent), but the
   * hash covers the whole bundle — so the regular and Performance editions
   * always differ, even at the same version. A single flat hash here would read
   * as "we just updated" on every switch between them and pop a false toast.
   * `mode` stays flat: it is a user preference, not bundle identity.
   */
  lastSeenHashes?: Record<string, string>;
}

const STATE_PATH = join(getSettingsDir(), "updates.json");
const VALID_MODES: readonly UpdateMode[] = ["automatic", "manual", "off"];
const UpdatesStateSchema: z.ZodType<UpdatesState> = z.object({
  mode: z.enum(VALID_MODES).optional(),
  lastSeenHashes: z.record(z.string(), z.string()).optional(),
});
let stateQueue: Promise<unknown> = Promise.resolve();

async function _load(): Promise<UpdatesState> {
  return (
    await readJsonFile(STATE_PATH, {
      schema: UpdatesStateSchema,
      recovery: "best-effort",
      fallback: () => ({}),
      seedMissing: false,
    })
  ).value;
}

function _update<T>(
  mutate: (state: UpdatesState) => { state: UpdatesState; result: T }
): Promise<T> {
  const operation = stateQueue
    .catch(() => undefined)
    .then(async () => {
      const update = mutate(await _load());
      await atomicWriteJsonFile(STATE_PATH, update.state);
      return update.result;
    });
  stateQueue = operation;
  return operation;
}

export async function getUpdateMode(): Promise<UpdateMode> {
  const mode = (await _load()).mode;
  return mode && VALID_MODES.includes(mode) ? mode : DEFAULT_UPDATE_MODE;
}

export async function setUpdateMode(mode: UpdateMode): Promise<void> {
  await _update((state) => ({
    state: { ...state, mode },
    result: undefined,
  }));
}

export async function getLastSeenHash(
  identifier: string
): Promise<string | undefined> {
  return (await _load()).lastSeenHashes?.[identifier];
}

export async function setLastSeenHash(
  identifier: string,
  hash: string
): Promise<void> {
  await _update((state) => ({
    state: {
      ...state,
      lastSeenHashes: {
        ...state.lastSeenHashes,
        [identifier]: hash,
      },
    },
    result: undefined,
  }));
}

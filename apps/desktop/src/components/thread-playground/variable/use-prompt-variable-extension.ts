import { type Extension } from "@codemirror/state";
import type { ThreadContext } from "@llm-space/core";
import { useContext, useMemo } from "react";

import { useCommands } from "@/commands";
import type { SkillInfo } from "@/shared/skills";

import { ThreadStoreContext, type ThreadStore } from "../stores";

import {
  listPromptVariableCompletions,
  resolvePromptVariableValueForPlace,
} from "./prompt-variable-display";
import { createPromptVariableExtension } from "./prompt-variable-extension";
import { listEnabledPromptVariableSkills } from "./prompt-variable-skills";

// Skills settings are global (not per-thread), so the resolved list is cached
// module-wide with a short TTL and in-flight de-dupe. Repeated hovers over a
// skills placeholder reuse the cache instead of re-firing the N+1 IPC load.
const SKILLS_TTL_MS = 30_000;
let skillsCache: { at: number; skills: SkillInfo[] } | null = null;
let skillsInflight: Promise<SkillInfo[]> | null = null;

function loadSkillsCached(): Promise<SkillInfo[]> {
  if (skillsCache && Date.now() - skillsCache.at < SKILLS_TTL_MS) {
    return Promise.resolve(skillsCache.skills);
  }
  skillsInflight ??= listEnabledPromptVariableSkills()
    .then((skills) => {
      skillsCache = { at: Date.now(), skills };
      return skills;
    })
    .finally(() => {
      skillsInflight = null;
    });
  return skillsInflight;
}

// One identity-stable extension per thread store and prompt place. Stable
// identity keeps @uiw/react-codemirror from reconfiguring the editor on each
// render (which would drop focus / undo).
const extensionByStore = new WeakMap<ThreadStore, Map<string, Extension[]>>();

function getExtensionForStore(
  store: ThreadStore,
  placeKey: string | undefined,
  onInspect: (name: string) => void
): Extension[] {
  let byPlace = extensionByStore.get(store);
  if (!byPlace) {
    byPlace = new Map();
    extensionByStore.set(store, byPlace);
  }

  const key = placeKey ?? "";
  let extension = byPlace.get(key);
  if (!extension) {
    extension = createPromptVariableExtension({
      // Lazy, non-reactive reads — run only on hover / while completing, so edits
      // to variables are always reflected without any subscription.
      resolve: (name) =>
        resolvePromptVariableValueForPlace(
          name,
          store.getState().thread.context,
          placeKey,
          loadSkillsCached
        ),
      listVariables: () =>
        listPromptVariableCompletions(store.getState().thread.context),
      onInspect,
    });
    byPlace.set(key, extension);
  }
  return extension;
}

const EMPTY: Extension[] = [];

/**
 * The `{{variable}}` highlight + hover-resolve CodeMirror extension for the
 * current thread (empty outside a thread store). Pass it to
 * `<CodeEditor extraExtensions={...} />` from the system-prompt and message
 * editors — the only editors that know the thread's variables.
 */
export function usePromptVariableExtension(placeKey?: string): Extension[] {
  return usePromptVariableExtensionForContext(placeKey, undefined);
}

/**
 * Build a variable extension against an explicit context. Used by readonly run
 * snapshots, whose frozen variable values must come from that saved context
 * instead of the currently open thread store.
 */
export function usePromptVariableExtensionForContext(
  placeKey: string | undefined,
  context: ThreadContext | undefined,
  store?: ThreadStore | null
): Extension[] {
  const fallbackStore = useContext(ThreadStoreContext);
  const resolvedStore = store ?? fallbackStore;
  const { executeCommand } = useCommands();
  return useMemo(() => {
    // Readonly snapshot: frozen values from the saved context, and no inspect
    // button (its variables are historical, not the live thread's).
    if (context) {
      return createPromptVariableExtension({
        resolve: (name) =>
          resolvePromptVariableValueForPlace(
            name,
            context,
            placeKey,
            loadSkillsCached
          ),
        listVariables: () => listPromptVariableCompletions(context),
      });
    }
    if (!resolvedStore) return EMPTY;
    // `executeCommand` is app-stable; the tooltip's "view details" button routes
    // through the `openVariables` command handled by the active thread.
    return getExtensionForStore(resolvedStore, placeKey, (name) =>
      executeCommand({ type: "openVariables", args: { variableName: name } })
    );
  }, [context, placeKey, resolvedStore, executeCommand]);
}

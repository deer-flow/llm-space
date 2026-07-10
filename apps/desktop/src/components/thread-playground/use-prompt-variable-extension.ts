import { type Extension } from "@codemirror/state";
import type { ThreadContext } from "@llm-space/core";
import { useContext, useMemo } from "react";

import { useCommands } from "@/commands";
import type { SkillInfo } from "@/shared/skills";

import { createPromptVariableExtension } from "./prompt-variable-extension";
import {
  listEnabledPromptVariableSkills,
  listPromptVariableCompletions,
  resolvePromptVariableValueForPlace,
} from "./prompt-variables";
import { ThreadStoreContext, type ThreadStore } from "./stores";

// Skills are scoped: normal threads read global Skills settings, while plugin
// threads read only declared Skill Providers. Cache by scope so plugin hovers
// never leak global skills into an imported environment.
const SKILLS_TTL_MS = 30_000;
const skillsCache = new Map<string, { at: number; skills: SkillInfo[] }>();
const skillsInflight = new Map<string, Promise<SkillInfo[]>>();

function skillScopeKey(context: ThreadContext | undefined): string {
  const scopes = (context?.plugins ?? [])
    .filter((plugin) => plugin.skillProviderId)
    .map(
      (plugin) =>
        `${plugin.pluginId}:${plugin.skillProviderId}:${plugin.contextId}`
    )
    .sort();
  return scopes.length > 0 ? `plugin:${scopes.join("|")}` : "global";
}

function loadSkillsCached(
  context: ThreadContext | undefined
): Promise<SkillInfo[]> {
  const key = skillScopeKey(context);
  const cached = skillsCache.get(key);
  if (cached && Date.now() - cached.at < SKILLS_TTL_MS) {
    return Promise.resolve(cached.skills);
  }
  const existing = skillsInflight.get(key);
  if (existing) {
    return existing;
  }
  const loading = listEnabledPromptVariableSkills(context)
    .then((skills) => {
      skillsCache.set(key, { at: Date.now(), skills });
      return skills;
    })
    .finally(() => {
      skillsInflight.delete(key);
    });
  skillsInflight.set(key, loading);
  return loading;
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
          () => loadSkillsCached(store.getState().thread.context)
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
          resolvePromptVariableValueForPlace(name, context, placeKey, () =>
            loadSkillsCached(context)
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

import { type Extension } from "@codemirror/state";
import { useContext, useMemo } from "react";

import type { SkillInfo } from "@/shared/skills";

import { createPromptVariableExtension } from "./prompt-variable-extension";
import {
  listEnabledPromptVariableSkills,
  listPromptVariableCompletions,
  resolvePromptVariableValue,
} from "./prompt-variables";
import { ThreadStoreContext, type ThreadStore } from "./stores";

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

// One identity-stable extension per thread store, shared by the system-prompt
// editor and every message editor. Stable identity keeps @uiw/react-codemirror
// from reconfiguring the editor on each render (which would drop focus / undo).
const extensionByStore = new WeakMap<ThreadStore, Extension[]>();

function getExtensionForStore(store: ThreadStore): Extension[] {
  let extension = extensionByStore.get(store);
  if (!extension) {
    extension = createPromptVariableExtension({
      // Lazy, non-reactive reads — run only on hover / while completing, so edits
      // to variables are always reflected without any subscription.
      resolve: (name) =>
        resolvePromptVariableValue(
          name,
          store.getState().thread.context,
          loadSkillsCached
        ),
      listVariables: () =>
        listPromptVariableCompletions(store.getState().thread.context),
    });
    extensionByStore.set(store, extension);
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
export function usePromptVariableExtension(): Extension[] {
  const store = useContext(ThreadStoreContext);
  return useMemo(() => (store ? getExtensionForStore(store) : EMPTY), [store]);
}

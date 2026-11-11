import type { ThreadContext } from "@llm-space/core";
import type { SkillInfo } from "@llm-space/core";
import {
  listPromptVariableCompletions,
  resolvePromptVariableValue,
  resolvePromptVariableValueForPlace,
} from "@llm-space/core/thread";
import { useCallback, useContext, useMemo } from "react";

import type { EditorEnhancement } from "@llm-space/ui/components/code-editor";
import { useHostServices } from "@llm-space/ui/host";

import { ThreadStoreContext, type ThreadStore } from "../stores";

import {
  createPromptSyntaxEditingEnhancement,
  PROMPT_TEMPLATE_TAG_HIGHLIGHT,
  PROMPT_VARIABLE_HIGHLIGHT,
} from "./prompt-syntax-enhancements";
import { listEnabledPromptVariableSkills } from "./prompt-variable-skills";

type PromptSyntaxEnhancements = readonly EditorEnhancement[];

// One identity-stable enhancement list per thread store and prompt place.
// Stable identity keeps both Static memoization and CodeMirror configuration
// intact across unrelated React renders.
const enhancementsByStore = new WeakMap<
  ThreadStore,
  Map<string, PromptSyntaxEnhancements>
>();

function _composePromptSyntaxEnhancements(
  editing: EditorEnhancement
): PromptSyntaxEnhancements {
  return [
    PROMPT_VARIABLE_HIGHLIGHT,
    PROMPT_TEMPLATE_TAG_HIGHLIGHT,
    editing,
  ];
}

function _getEnhancementsForStore(
  store: ThreadStore,
  placeKey: string | undefined,
  onInspect: (name: string) => void,
  loadSkills: () => Promise<SkillInfo[]>,
  resolvePath: (path: string) => Promise<string>
): PromptSyntaxEnhancements {
  let byPlace = enhancementsByStore.get(store);
  if (!byPlace) {
    byPlace = new Map();
    enhancementsByStore.set(store, byPlace);
  }

  const key = placeKey ?? "";
  let enhancements = byPlace.get(key);
  if (!enhancements) {
    enhancements = _composePromptSyntaxEnhancements(
      createPromptSyntaxEditingEnhancement({
        // Lazy, non-reactive reads — run only on hover / while completing, so
        // edits to variables are reflected without a React subscription.
        resolve: (name) =>
          resolvePromptVariableValue(
            name,
            store.getState().thread.context,
            loadSkills,
            resolvePath
          ),
        listVariables: () =>
          listPromptVariableCompletions(store.getState().thread.context),
        onInspect,
      })
    );
    byPlace.set(key, enhancements);
  }
  return enhancements;
}

const EMPTY: PromptSyntaxEnhancements = [];

export function usePromptSyntaxEnhancements(
  placeKey?: string
): PromptSyntaxEnhancements {
  return usePromptSyntaxEnhancementsForContext(placeKey, undefined);
}

/**
 * Build prompt syntax enhancements against an explicit context. Readonly run
 * snapshots resolve their frozen variable values from that saved context.
 */
export function usePromptSyntaxEnhancementsForContext(
  placeKey: string | undefined,
  context: ThreadContext | undefined,
  store?: ThreadStore | null
): PromptSyntaxEnhancements {
  const fallbackStore = useContext(ThreadStoreContext);
  const resolvedStore = store ?? fallbackStore;
  const { skills, files, actions } = useHostServices();
  const loadSkills = useCallback(
    () => listEnabledPromptVariableSkills(skills),
    [skills]
  );
  return useMemo(() => {
    if (context) {
      return _composePromptSyntaxEnhancements(
        createPromptSyntaxEditingEnhancement({
          resolve: (name) =>
            resolvePromptVariableValueForPlace(
              name,
              context,
              placeKey,
              loadSkills,
              (path) => files.resolvePath(path)
            ),
          listVariables: () => listPromptVariableCompletions(context),
        })
      );
    }
    if (!resolvedStore) return EMPTY;
    return _getEnhancementsForStore(
      resolvedStore,
      placeKey,
      (name) => actions.openVariables(name),
      loadSkills,
      (path) => files.resolvePath(path)
    );
  }, [context, placeKey, resolvedStore, actions, files, loadSkills]);
}

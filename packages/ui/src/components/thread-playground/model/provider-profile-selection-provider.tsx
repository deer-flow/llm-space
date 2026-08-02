"use client";

import type { ModelProviderGroup } from "@llm-space/core";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ProviderProfileSelectionValue {
  selectedProfileIdsByScope: Readonly<Record<string, string>>;
  selectProfile: (
    providerId: string,
    profileId: string,
    selectionScope?: string
  ) => void;
  getProfileId: (
    providerId: string,
    selectionScope?: string
  ) => string | undefined;
}

const MODEL_PROFILE_SELECTION_SCOPE = "model";

const PROVIDER_PROFILE_SELECTION_CONTEXT =
  createContext<ProviderProfileSelectionValue | null>(null);

function _selectionKey(providerId: string, selectionScope?: string): string {
  return `${selectionScope ?? MODEL_PROFILE_SELECTION_SCOPE}:${providerId}`;
}

export function useProviderProfileSelections(
  providers: ModelProviderGroup[]
): ProviderProfileSelectionValue {
  const [selectedProfileIdsByScope, setSelectedProfileIdsByScope] = useState<
    Record<string, string>
  >({});
  const providersRef = useRef(providers);
  providersRef.current = providers;
  const selectedRef = useRef(selectedProfileIdsByScope);
  selectedRef.current = selectedProfileIdsByScope;

  const selectProfile = useCallback(
    (providerId: string, profileId: string, selectionScope?: string) => {
      setSelectedProfileIdsByScope((current) => ({
        ...current,
        [_selectionKey(providerId, selectionScope)]: profileId,
      }));
    },
    []
  );

  const getProfileId = useCallback(
    (providerId: string, selectionScope?: string) => {
      const selected =
        selectedRef.current[_selectionKey(providerId, selectionScope)];
      if (!selected) {
        return undefined;
      }
      const provider = providersRef.current.find(
        (candidate) => candidate.id === providerId
      );
      return provider?.profiles.some((profile) => profile.id === selected)
        ? selected
        : undefined;
    },
    []
  );

  return useMemo(
    () => ({ selectedProfileIdsByScope, selectProfile, getProfileId }),
    [getProfileId, selectProfile, selectedProfileIdsByScope]
  );
}

export function ProviderProfileSelectionProvider({
  value,
  children,
}: {
  value: ProviderProfileSelectionValue;
  children: ReactNode;
}) {
  return (
    <PROVIDER_PROFILE_SELECTION_CONTEXT.Provider value={value}>
      {children}
    </PROVIDER_PROFILE_SELECTION_CONTEXT.Provider>
  );
}

function _useProviderProfileSelectionContext(): ProviderProfileSelectionValue {
  const context = useContext(PROVIDER_PROFILE_SELECTION_CONTEXT);
  if (!context) {
    throw new Error(
      "Provider profile selection hooks must be used inside the playground provider"
    );
  }
  return context;
}

/** Resolve the latest valid transient profile for a provider at run time. */
export function useGetProviderProfileId(): (
  providerId: string,
  selectionScope?: string
) => string | undefined {
  return _useProviderProfileSelectionContext().getProfileId;
}

export function useProviderProfileSelection(
  providerId: string,
  selectionScope?: string
) {
  const context = _useProviderProfileSelectionContext();
  return {
    selectedProfileId: context.getProfileId(providerId, selectionScope),
    selectProfile: context.selectProfile,
  };
}

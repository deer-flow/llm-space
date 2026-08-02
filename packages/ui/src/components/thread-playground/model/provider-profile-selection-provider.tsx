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
  selectedProfileIds: Readonly<Record<string, string>>;
  selectProfile: (providerId: string, profileId: string) => void;
  getProfileId: (providerId: string) => string | undefined;
}

const PROVIDER_PROFILE_SELECTION_CONTEXT =
  createContext<ProviderProfileSelectionValue | null>(null);

export function useProviderProfileSelections(
  providers: ModelProviderGroup[]
): ProviderProfileSelectionValue {
  const [selectedProfileIds, setSelectedProfileIds] = useState<
    Record<string, string>
  >({});
  const providersRef = useRef(providers);
  providersRef.current = providers;
  const selectedRef = useRef(selectedProfileIds);
  selectedRef.current = selectedProfileIds;

  const selectProfile = useCallback((providerId: string, profileId: string) => {
    setSelectedProfileIds((current) => ({
      ...current,
      [providerId]: profileId,
    }));
  }, []);

  const getProfileId = useCallback((providerId: string) => {
    const selected = selectedRef.current[providerId];
    if (!selected) {
      return undefined;
    }
    const provider = providersRef.current.find(
      (candidate) => candidate.id === providerId
    );
    return provider?.profiles.some((profile) => profile.id === selected)
      ? selected
      : undefined;
  }, []);

  return useMemo(
    () => ({ selectedProfileIds, selectProfile, getProfileId }),
    [getProfileId, selectProfile, selectedProfileIds]
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
  providerId: string
) => string | undefined {
  return _useProviderProfileSelectionContext().getProfileId;
}

export function useProviderProfileSelection(providerId: string) {
  const context = _useProviderProfileSelectionContext();
  return {
    selectedProfileId: context.getProfileId(providerId),
    selectProfile: context.selectProfile,
  };
}

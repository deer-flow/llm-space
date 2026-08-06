"use client";

import type * as pi from "@earendil-works/pi-ai";
import type {
  ArkImageGenerationConfig,
  CustomModel,
  ModelConfig,
  ModelProviderGroup,
  ProviderProfilePatch,
} from "@llm-space/core";
import { uuid } from "@llm-space/core";
import { resolveModelConfig } from "@llm-space/core/thread";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { ModelClient } from "../host";

interface ModelContextValue {
  providers: ModelProviderGroup[];
  removeProvider: (providerId: string) => Promise<void>;
  addProvider: (providerId: string) => Promise<void>;
  addCustomProvider: (name: string, baseUrl: string) => Promise<string>;
  addProviderProfile: (providerId: string) => Promise<string>;
  updateProviderProfile: (
    providerId: string,
    profileId: string,
    fields: ProviderProfilePatch
  ) => Promise<void>;
  removeProviderProfile: (
    providerId: string,
    profileId: string
  ) => Promise<void>;
  updateProvider: (
    providerId: string,
    fields: {
      name?: string | null;
      api?:
        "anthropic-messages" | "openai-completions" | "openai-responses" | null;
      icon?: string | null;
      imageGeneration?: ArkImageGenerationConfig;
    }
  ) => Promise<void>;
  setModelEnabled: (
    providerId: string,
    modelId: string,
    enabled: boolean
  ) => Promise<void>;
  setAllModelsEnabled: (providerId: string, enabled: boolean) => Promise<void>;
  testModelConnection: (
    providerId: string,
    modelId: string,
    candidate?: CustomModel,
    profileId?: string
  ) => Promise<void>;
  removeCustomModel: (providerId: string, modelId: string) => Promise<void>;
  upsertCustomModel: (
    providerId: string,
    model: CustomModel,
    originalId?: string
  ) => Promise<void>;
  refresh: () => Promise<void>;
  builtinProviders: () => Promise<ModelProviderGroup[]>;
  getModel: (ref: { id: string; provider: string }) => pi.Model<pi.Api> | null;
  defaultModel: ModelConfig | null;
  setDefaultModel: (model: ModelConfig | null) => Promise<void>;
}

const ModelContext = createContext<ModelContextValue | null>(null);
const EMPTY_MODEL_PROVIDERS: ModelProviderGroup[] = [];

interface ModelSnapshot {
  client: ModelClient;
  defaultModel: ModelConfig | null;
  epoch: number;
  providers: ModelProviderGroup[] | null;
}

interface ModelRequestLease {
  client: ModelClient;
  epoch: number;
  generation: number;
}

function buildModelIndex(providers: ModelProviderGroup[]) {
  const map = new Map<string, pi.Model<pi.Api>>();
  for (const group of providers) {
    for (const model of group.models) {
      map.set(`${model.provider}:${model.id}`, model);
    }
  }
  return map;
}

export {
  firstAvailableModel,
  isModelAvailable,
  resolveModelConfig,
} from "@llm-space/core/thread";

export function ModelProvider({
  client,
  children,
  fallback = null,
}: {
  client: ModelClient;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<ModelSnapshot>(() => ({
    client,
    defaultModel: null,
    epoch: 1,
    providers: null,
  }));
  const committedScopeRef = useRef({ client, epoch: 1 });
  const nextEpochRef = useRef(1);
  const latestRequestGenerationRef = useRef(0);
  const mutationTailsRef = useRef(new WeakMap<ModelClient, Promise<void>>());
  useLayoutEffect(() => {
    if (committedScopeRef.current.client === client) return;
    const nextScope = {
      client,
      epoch: ++nextEpochRef.current,
    };
    committedScopeRef.current = nextScope;
    // Invalidate every request issued by the previous committed scope before
    // passive effects can start the new scope's initial refresh.
    latestRequestGenerationRef.current += 1;
    setSnapshot({
      client,
      defaultModel: null,
      epoch: nextScope.epoch,
      providers: EMPTY_MODEL_PROVIDERS,
    });
  }, [client]);

  const beginRequest = useCallback((source: ModelClient) => {
    const scope = committedScopeRef.current;
    if (scope.client !== source) return null;
    return {
      ...scope,
      generation: ++latestRequestGenerationRef.current,
    };
  }, []);

  const isCurrentScope = useCallback((lease: ModelRequestLease) => {
    const scope = committedScopeRef.current;
    return scope.client === lease.client && scope.epoch === lease.epoch;
  }, []);
  const isCurrentRequest = useCallback(
    (lease: ModelRequestLease) =>
      isCurrentScope(lease) &&
      latestRequestGenerationRef.current === lease.generation,
    [isCurrentScope]
  );

  const enqueueMutation = useCallback(
    async <T,>(
      source: ModelClient,
      mutate: () => Promise<T>
    ): Promise<{ lease: ModelRequestLease; value: T } | null> => {
      const lease = beginRequest(source);
      if (!lease) return null;
      const previous =
        mutationTailsRef.current.get(source) ?? Promise.resolve();
      const result = previous.then(async () => ({
        lease,
        value: await mutate(),
      }));
      // Keep the side-effect queue alive after a failed mutation, while still
      // returning the original rejection to its caller. The queue is keyed by
      // client (not render epoch) so A -> B -> A refreshes wait for an A request
      // that was already in flight before the round trip.
      mutationTailsRef.current.set(
        source,
        result.then(
          () => undefined,
          () => undefined
        )
      );
      return result;
    },
    [beginRequest]
  );

  const commitProviders = useCallback(
    (lease: ModelRequestLease | null, providers: ModelProviderGroup[]) => {
      if (!lease) return;
      setSnapshot((current) =>
        isCurrentScope(lease)
          ? {
              client: lease.client,
              defaultModel:
                current.client === lease.client && current.epoch === lease.epoch
                  ? current.defaultModel
                  : null,
              epoch: lease.epoch,
              providers,
            }
          : current
      );
    },
    [isCurrentScope]
  );

  const setDefaultModel = useCallback(
    async (model: ModelConfig | null) => {
      const result = await enqueueMutation(client, () =>
        client.setDefaultModel(model)
      );
      if (!result) return;
      const { lease, value: defaultModel } = result;
      setSnapshot((current) =>
        isCurrentScope(lease)
          ? {
              client,
              defaultModel,
              epoch: lease.epoch,
              providers:
                current.client === client && current.epoch === lease.epoch
                  ? current.providers
                  : EMPTY_MODEL_PROVIDERS,
            }
          : current
      );
    },
    [client, enqueueMutation, isCurrentScope]
  );

  const removeProvider = useCallback(
    async (providerId: string) => {
      const result = await enqueueMutation(client, () =>
        client.removeProvider(providerId)
      );
      if (result) commitProviders(result.lease, result.value);
    },
    [client, commitProviders, enqueueMutation]
  );

  const addProvider = useCallback(
    async (providerId: string) => {
      const result = await enqueueMutation(client, () =>
        client.addProvider(providerId)
      );
      if (result) commitProviders(result.lease, result.value);
    },
    [client, commitProviders, enqueueMutation]
  );

  const addCustomProvider = useCallback(
    async (name: string, baseUrl: string) => {
      const id = uuid();
      const result = await enqueueMutation(client, () =>
        client.addCustomProvider({ id, name, baseUrl })
      );
      if (result) commitProviders(result.lease, result.value);
      return id;
    },
    [client, commitProviders, enqueueMutation]
  );

  const addProviderProfile = useCallback(
    async (providerId: string) => {
      const result = await enqueueMutation(client, () =>
        client.addProviderProfile(providerId)
      );
      if (!result) {
        throw new Error("Model provider scope changed while adding a profile.");
      }
      commitProviders(result.lease, result.value);
      const profile = result.value
        .find((provider) => provider.id === providerId)
        ?.profiles.at(-1);
      if (!profile) {
        throw new Error(`Failed to add profile for provider: ${providerId}`);
      }
      return profile.id;
    },
    [client, commitProviders, enqueueMutation]
  );

  const updateProviderProfile = useCallback(
    async (
      providerId: string,
      profileId: string,
      fields: ProviderProfilePatch
    ) => {
      const result = await enqueueMutation(client, () =>
        client.updateProviderProfile(providerId, profileId, fields)
      );
      if (result) commitProviders(result.lease, result.value);
    },
    [client, commitProviders, enqueueMutation]
  );

  const removeProviderProfile = useCallback(
    async (providerId: string, profileId: string) => {
      const result = await enqueueMutation(client, () =>
        client.removeProviderProfile(providerId, profileId)
      );
      if (result) commitProviders(result.lease, result.value);
    },
    [client, commitProviders, enqueueMutation]
  );

  const updateProvider = useCallback(
    async (
      providerId: string,
      fields: {
        name?: string | null;
        api?:
          | "anthropic-messages"
          | "openai-completions"
          | "openai-responses"
          | null;
        icon?: string | null;
        imageGeneration?: ArkImageGenerationConfig;
      }
    ) => {
      const result = await enqueueMutation(client, () =>
        client.updateProvider(providerId, fields)
      );
      if (result) commitProviders(result.lease, result.value);
    },
    [client, commitProviders, enqueueMutation]
  );

  const setModelEnabled = useCallback(
    async (providerId: string, modelId: string, enabled: boolean) => {
      const result = await enqueueMutation(client, () =>
        client.setModelEnabled(providerId, modelId, enabled)
      );
      if (result) commitProviders(result.lease, result.value);
    },
    [client, commitProviders, enqueueMutation]
  );

  const setAllModelsEnabled = useCallback(
    async (providerId: string, enabled: boolean) => {
      const result = await enqueueMutation(client, () =>
        client.setAllModelsEnabled(providerId, enabled)
      );
      if (result) commitProviders(result.lease, result.value);
    },
    [client, commitProviders, enqueueMutation]
  );

  const testModelConnection = useCallback(
    async (
      providerId: string,
      modelId: string,
      candidate?: CustomModel,
      profileId?: string
    ) => {
      await client.testModelConnection(
        providerId,
        modelId,
        candidate,
        profileId
      );
    },
    [client]
  );

  const removeCustomModel = useCallback(
    async (providerId: string, modelId: string) => {
      const result = await enqueueMutation(client, () =>
        client.removeCustomModel(providerId, modelId)
      );
      if (result) commitProviders(result.lease, result.value);
    },
    [client, commitProviders, enqueueMutation]
  );

  const upsertCustomModel = useCallback(
    async (providerId: string, model: CustomModel, originalId?: string) => {
      const result = await enqueueMutation(client, () =>
        client.upsertCustomModel(providerId, model, originalId)
      );
      if (result) commitProviders(result.lease, result.value);
    },
    [client, commitProviders, enqueueMutation]
  );

  const builtinProviders = useCallback(
    () => client.builtinProviders(),
    [client]
  );

  // Re-fetch the providers from the host. Callers invoke this to force a fresh
  // read (e.g. every time the model dropdown opens) — the result is never cached
  // beyond the current render.
  const refresh = useCallback(async () => {
    const lease = beginRequest(client);
    if (!lease) return;
    try {
      const pendingMutation = mutationTailsRef.current.get(client);
      if (pendingMutation) await pendingMutation;
      if (!isCurrentRequest(lease)) return;
      const [nextProviders, nextDefault] = await Promise.all([
        client.availableModels(),
        client.getDefaultModel(),
      ]);
      setSnapshot((current) =>
        isCurrentRequest(lease)
          ? {
              client,
              defaultModel: nextDefault ?? null,
              epoch: lease.epoch,
              providers: nextProviders,
            }
          : current
      );
    } catch (error) {
      if (isCurrentRequest(lease)) {
        console.error("Failed to fetch models", error);
      }
    }
  }, [beginRequest, client, isCurrentRequest]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A client change represents a runtime switch. Keep the already-mounted
  // workspace alive, but expose an empty model view until that runtime's fetch
  // completes so consumers can never observe the previous runtime's models.
  const committedScope = committedScopeRef.current;
  const snapshotMatchesCommittedScope =
    committedScope.client === client &&
    snapshot.client === client &&
    snapshot.epoch === committedScope.epoch;
  const providers = snapshotMatchesCommittedScope
    ? snapshot.providers
    : snapshot.providers === null
      ? null
      : EMPTY_MODEL_PROVIDERS;
  const defaultModel = snapshotMatchesCommittedScope
    ? snapshot.defaultModel
    : null;

  const contextValue = useMemo((): ModelContextValue | null => {
    if (!providers) {
      return null;
    }
    const index = buildModelIndex(providers);
    return {
      providers,
      removeProvider,
      addProvider,
      addCustomProvider,
      addProviderProfile,
      updateProviderProfile,
      removeProviderProfile,
      updateProvider,
      setModelEnabled,
      setAllModelsEnabled,
      testModelConnection,
      removeCustomModel,
      upsertCustomModel,
      refresh,
      builtinProviders,
      getModel: (ref) => index.get(`${ref.provider}:${ref.id}`) ?? null,
      defaultModel,
      setDefaultModel,
    };
  }, [
    providers,
    removeProvider,
    addProvider,
    addCustomProvider,
    addProviderProfile,
    updateProviderProfile,
    removeProviderProfile,
    updateProvider,
    setModelEnabled,
    setAllModelsEnabled,
    testModelConnection,
    removeCustomModel,
    upsertCustomModel,
    refresh,
    builtinProviders,
    defaultModel,
    setDefaultModel,
  ]);

  if (!contextValue) {
    return fallback;
  }

  return (
    <ModelContext.Provider value={contextValue}>
      {children}
    </ModelContext.Provider>
  );
}

function useModelProvider() {
  const ctx = useContext(ModelContext);
  if (!ctx) {
    throw new Error("hooks must be used within <ModelProvider>");
  }
  return ctx;
}

export function useModels(): ModelProviderGroup[] {
  return useModelProvider().providers;
}

/**
 * The fallback model for a thread with no saved model: the user's default when
 * set and available, else the first available model (`null` if none).
 */
export function useFirstAvailableModel(): ModelConfig | null {
  const { providers, defaultModel } = useModelProvider();
  return useMemo(
    () => resolveModelConfig(providers, null, defaultModel),
    [providers, defaultModel]
  );
}

/**
 * Resolve the model a thread should display/run with, given its saved model:
 * the saved model when still available, else the default, else first available.
 */
export function useResolveModelConfig(
  saved: ModelConfig | null | undefined
): ModelConfig | null {
  const { providers, defaultModel } = useModelProvider();
  return useMemo(
    () => resolveModelConfig(providers, saved, defaultModel),
    [providers, saved, defaultModel]
  );
}

/** The model used for ad-hoc text generation (e.g. `useStreamText`). */
export function useDefaultTextGenerationModel(): ModelConfig | null {
  return useFirstAvailableModel();
}

/** The user's chosen default model, or `null` for automatic (first available). */
export function useDefaultModel(): ModelConfig | null {
  return useModelProvider().defaultModel;
}

export function useSetDefaultModel(): (
  model: ModelConfig | null
) => Promise<void> {
  return useModelProvider().setDefaultModel;
}

export function useRemoveProvider(): (providerId: string) => Promise<void> {
  return useModelProvider().removeProvider;
}

export function useAddProvider(): (providerId: string) => Promise<void> {
  return useModelProvider().addProvider;
}

export function useAddCustomProvider(): (
  name: string,
  baseUrl: string
) => Promise<string> {
  return useModelProvider().addCustomProvider;
}

/** Fetch the builtin providers (with `apiKeyDetected` flags) from the host. */
export function useFetchBuiltinProviders(): () => Promise<
  ModelProviderGroup[]
> {
  return useModelProvider().builtinProviders;
}

export function useAddProviderProfile(): (
  providerId: string
) => Promise<string> {
  return useModelProvider().addProviderProfile;
}

export function useUpdateProviderProfile(): (
  providerId: string,
  profileId: string,
  fields: ProviderProfilePatch
) => Promise<void> {
  return useModelProvider().updateProviderProfile;
}

export function useRemoveProviderProfile(): (
  providerId: string,
  profileId: string
) => Promise<void> {
  return useModelProvider().removeProviderProfile;
}

export function useUpdateProvider(): (
  providerId: string,
  fields: {
    name?: string | null;
    api?:
      "anthropic-messages" | "openai-completions" | "openai-responses" | null;
    icon?: string | null;
    imageGeneration?: ArkImageGenerationConfig;
  }
) => Promise<void> {
  return useModelProvider().updateProvider;
}

export function useSetModelEnabled(): (
  providerId: string,
  modelId: string,
  enabled: boolean
) => Promise<void> {
  return useModelProvider().setModelEnabled;
}

export function useSetAllModelsEnabled(): (
  providerId: string,
  enabled: boolean
) => Promise<void> {
  return useModelProvider().setAllModelsEnabled;
}

export function useTestModelConnection(): (
  providerId: string,
  modelId: string,
  candidate?: CustomModel,
  profileId?: string
) => Promise<void> {
  return useModelProvider().testModelConnection;
}

export function useRemoveCustomModel(): (
  providerId: string,
  modelId: string
) => Promise<void> {
  return useModelProvider().removeCustomModel;
}

export function useUpsertCustomModel(): (
  providerId: string,
  model: CustomModel,
  originalId?: string
) => Promise<void> {
  return useModelProvider().upsertCustomModel;
}

export function useRefreshModels(): () => Promise<void> {
  return useModelProvider().refresh;
}

export function useModel(ref: {
  id: string;
  provider: string;
}): pi.Model<pi.Api> | null {
  const ctx = useModelProvider();
  const { id, provider } = ref;
  return useMemo(() => ctx.getModel({ id, provider }), [ctx, id, provider]);
}

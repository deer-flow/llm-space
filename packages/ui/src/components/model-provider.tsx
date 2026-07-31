"use client";

import type * as pi from "@earendil-works/pi-ai";
import type {
  CustomModel,
  ModelConfig,
  ModelProviderGroup,
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
  updateProvider: (
    providerId: string,
    fields: {
      apiKey?: string | null;
      baseUrl?: string | null;
      name?: string | null;
      api?:
        | "anthropic-messages"
        | "openai-completions"
        | "openai-responses"
        | null;
      icon?: string | null;
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
    candidate?: CustomModel
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
  providers: ModelProviderGroup[] | null;
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
    providers: null,
  }));
  const activeClientRef = useRef(client);
  useLayoutEffect(() => {
    activeClientRef.current = client;
  }, [client]);

  const commitProviders = useCallback(
    (source: ModelClient, providers: ModelProviderGroup[]) => {
      setSnapshot((current) =>
        activeClientRef.current === source
          ? {
              client: source,
              defaultModel:
                current.client === source ? current.defaultModel : null,
              providers,
            }
          : current
      );
    },
    []
  );

  const setDefaultModel = useCallback(
    async (model: ModelConfig | null) => {
      const defaultModel = await client.setDefaultModel(model);
      setSnapshot((current) =>
        activeClientRef.current === client
          ? {
              client,
              defaultModel,
              providers:
                current.client === client
                  ? current.providers
                  : EMPTY_MODEL_PROVIDERS,
            }
          : current
      );
    },
    [client]
  );

  const removeProvider = useCallback(
    async (providerId: string) => {
      commitProviders(client, await client.removeProvider(providerId));
    },
    [client, commitProviders]
  );

  const addProvider = useCallback(
    async (providerId: string) => {
      commitProviders(client, await client.addProvider(providerId));
    },
    [client, commitProviders]
  );

  const addCustomProvider = useCallback(
    async (name: string, baseUrl: string) => {
      const id = uuid();
      commitProviders(
        client,
        await client.addCustomProvider({ id, name, baseUrl })
      );
      return id;
    },
    [client, commitProviders]
  );

  const updateProvider = useCallback(
    async (
      providerId: string,
      fields: {
        apiKey?: string | null;
        baseUrl?: string | null;
        headers?: Record<string, string> | null;
        name?: string | null;
        api?:
          | "anthropic-messages"
          | "openai-completions"
          | "openai-responses"
          | null;
        icon?: string | null;
      }
    ) => {
      commitProviders(client, await client.updateProvider(providerId, fields));
    },
    [client, commitProviders]
  );

  const setModelEnabled = useCallback(
    async (providerId: string, modelId: string, enabled: boolean) => {
      commitProviders(
        client,
        await client.setModelEnabled(providerId, modelId, enabled)
      );
    },
    [client, commitProviders]
  );

  const setAllModelsEnabled = useCallback(
    async (providerId: string, enabled: boolean) => {
      commitProviders(
        client,
        await client.setAllModelsEnabled(providerId, enabled)
      );
    },
    [client, commitProviders]
  );

  const testModelConnection = useCallback(
    async (providerId: string, modelId: string, candidate?: CustomModel) => {
      await client.testModelConnection(providerId, modelId, candidate);
    },
    [client]
  );

  const removeCustomModel = useCallback(
    async (providerId: string, modelId: string) => {
      commitProviders(
        client,
        await client.removeCustomModel(providerId, modelId)
      );
    },
    [client, commitProviders]
  );

  const upsertCustomModel = useCallback(
    async (providerId: string, model: CustomModel, originalId?: string) => {
      commitProviders(
        client,
        await client.upsertCustomModel(providerId, model, originalId)
      );
    },
    [client, commitProviders]
  );

  const builtinProviders = useCallback(
    () => client.builtinProviders(),
    [client]
  );

  // Re-fetch the providers from the host. Callers invoke this to force a fresh
  // read (e.g. every time the model dropdown opens) — the result is never cached
  // beyond the current render.
  const refresh = useCallback(async () => {
    try {
      const [nextProviders, nextDefault] = await Promise.all([
        client.availableModels(),
        client.getDefaultModel(),
      ]);
      setSnapshot((current) =>
        activeClientRef.current === client
          ? {
              client,
              defaultModel: nextDefault ?? null,
              providers: nextProviders,
            }
          : current
      );
    } catch (error) {
      console.error("Failed to fetch models", error);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A client change represents a runtime switch. Keep the already-mounted
  // workspace alive, but expose an empty model view until that runtime's fetch
  // completes so consumers can never observe the previous runtime's models.
  const providers =
    snapshot.client === client
      ? snapshot.providers
      : snapshot.providers === null
        ? null
        : EMPTY_MODEL_PROVIDERS;
  const defaultModel =
    snapshot.client === client ? snapshot.defaultModel : null;

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

export function useUpdateProvider(): (
  providerId: string,
  fields: {
    apiKey?: string | null;
    baseUrl?: string | null;
    headers?: Record<string, string> | null;
    name?: string | null;
    api?:
      | "anthropic-messages"
      | "openai-completions"
      | "openai-responses"
      | null;
    icon?: string | null;
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
  candidate?: CustomModel
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

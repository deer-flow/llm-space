"use client";

import type * as pi from "@earendil-works/pi-ai";
import type {
  CustomModel,
  ModelConfig,
  ModelProviderGroup,
} from "@llm-space/core";
import { uuid } from "@llm-space/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { electrobun } from "@/lib/electrobun";

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
  removeCustomModel: (providerId: string, modelId: string) => Promise<void>;
  upsertCustomModel: (
    providerId: string,
    model: CustomModel,
    originalId?: string
  ) => Promise<void>;
  refresh: () => Promise<void>;
  getModel: (ref: { id: string; provider: string }) => pi.Model<pi.Api> | null;
}

const ModelContext = createContext<ModelContextValue | null>(null);

function buildModelIndex(providers: ModelProviderGroup[]) {
  const map = new Map<string, pi.Model<pi.Api>>();
  for (const group of providers) {
    for (const model of group.models) {
      map.set(`${model.provider}:${model.id}`, model);
    }
  }
  return map;
}

/**
 * The first enabled model across the configured providers, or `null` when none
 * are available. Mirrors the model selector's ordering (providers sorted by
 * name, each group's `disabledModels` skipped) so the "default" the user sees
 * matches what runs. Used as the fallback for threads with no saved model.
 */
export function firstAvailableModel(
  providers: ModelProviderGroup[]
): ModelConfig | null {
  const sorted = [...providers].sort((a, b) => a.name.localeCompare(b.name));
  for (const group of sorted) {
    const disabled = new Set(group.disabledModels ?? []);
    const model = group.models.find((m) => !disabled.has(m.id));
    if (model) {
      return { provider: model.provider, id: model.id };
    }
  }
  return null;
}

export function ModelProvider({
  fetcher,
  children,
  fallback = null,
}: {
  fetcher: () => Promise<ModelProviderGroup[]>;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [providers, setProviders] = useState<ModelProviderGroup[] | null>(null);

  const removeProvider = useCallback(async (providerId: string) => {
    if (!electrobun.rpc) {
      throw new Error("Electrobun RPC is not initialized");
    }
    const updated = await electrobun.rpc.request.removeProvider({ providerId });
    setProviders(updated);
  }, []);

  const addProvider = useCallback(async (providerId: string) => {
    if (!electrobun.rpc) {
      throw new Error("Electrobun RPC is not initialized");
    }
    const updated = await electrobun.rpc.request.addProvider({ providerId });
    setProviders(updated);
  }, []);

  const addCustomProvider = useCallback(
    async (name: string, baseUrl: string) => {
      if (!electrobun.rpc) {
        throw new Error("Electrobun RPC is not initialized");
      }
      const id = uuid();
      const updated = await electrobun.rpc.request.addCustomProvider({
        id,
        name,
        baseUrl,
      });
      setProviders(updated);
      return id;
    },
    []
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
      if (!electrobun.rpc) {
        throw new Error("Electrobun RPC is not initialized");
      }
      const updated = await electrobun.rpc.request.updateProvider({
        providerId,
        ...fields,
      });
      setProviders(updated);
    },
    []
  );

  const setModelEnabled = useCallback(
    async (providerId: string, modelId: string, enabled: boolean) => {
      if (!electrobun.rpc) {
        throw new Error("Electrobun RPC is not initialized");
      }
      const updated = await electrobun.rpc.request.setModelEnabled({
        providerId,
        modelId,
        enabled,
      });
      setProviders(updated);
    },
    []
  );

  const setAllModelsEnabled = useCallback(
    async (providerId: string, enabled: boolean) => {
      if (!electrobun.rpc) {
        throw new Error("Electrobun RPC is not initialized");
      }
      const updated = await electrobun.rpc.request.setAllModelsEnabled({
        providerId,
        enabled,
      });
      setProviders(updated);
    },
    []
  );

  const removeCustomModel = useCallback(
    async (providerId: string, modelId: string) => {
      if (!electrobun.rpc) {
        throw new Error("Electrobun RPC is not initialized");
      }
      const updated = await electrobun.rpc.request.removeCustomModel({
        providerId,
        modelId,
      });
      setProviders(updated);
    },
    []
  );

  const upsertCustomModel = useCallback(
    async (providerId: string, model: CustomModel, originalId?: string) => {
      if (!electrobun.rpc) {
        throw new Error("Electrobun RPC is not initialized");
      }
      const updated = await electrobun.rpc.request.upsertCustomModel({
        providerId,
        model,
        originalId,
      });
      setProviders(updated);
    },
    []
  );

  // Re-fetch the providers from the main process. Callers invoke this to force a
  // fresh read (e.g. every time the model dropdown opens) — the result is never
  // cached beyond the current render.
  const refresh = useCallback(async () => {
    try {
      setProviders(await fetcher());
    } catch (error) {
      console.error("Failed to fetch models", error);
    }
  }, [fetcher]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      removeCustomModel,
      upsertCustomModel,
      refresh,
      getModel: (ref) => index.get(`${ref.provider}:${ref.id}`) ?? null,
    };
  }, [
    providers,
    removeProvider,
    addProvider,
    addCustomProvider,
    updateProvider,
    setModelEnabled,
    setAllModelsEnabled,
    removeCustomModel,
    upsertCustomModel,
    refresh,
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

/** The fallback model for a thread with no saved model (`null` if none). */
export function useFirstAvailableModel(): ModelConfig | null {
  const providers = useModels();
  return useMemo(() => firstAvailableModel(providers), [providers]);
}

/** The model used for ad-hoc text generation (e.g. `useStreamText`). */
export function useDefaultTextGenerationModel(): ModelConfig | null {
  return useFirstAvailableModel();
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

/** Fetch the builtin providers (with `apiKeyDetected` flags) from the main process. */
export function useFetchBuiltinProviders(): () => Promise<
  ModelProviderGroup[]
> {
  return useCallback(async () => {
    if (!electrobun.rpc) {
      throw new Error("Electrobun RPC is not initialized");
    }
    return electrobun.rpc.request.builtinProviders({});
  }, []);
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
  return useMemo(() => ctx.getModel(ref), [ctx, ref.id, ref.provider]);
}

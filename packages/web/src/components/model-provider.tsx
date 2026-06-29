"use client";

import type * as pi from "@earendil-works/pi-ai";
import type { ModelProviderGroup } from "@llm-space/core";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface ModelContextValue {
  providers: ModelProviderGroup[];

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

  useEffect(() => {
    let cancelled = false;

    void fetcher()
      .then((data) => {
        if (!cancelled) {
          setProviders(data);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to fetch models", error);
      });

    return () => {
      cancelled = true;
    };
  }, [fetcher]);

  const contextValue = useMemo((): ModelContextValue | null => {
    if (!providers) {
      return null;
    }
    const index = buildModelIndex(providers);
    return {
      providers,
      getModel: (ref) => index.get(`${ref.provider}:${ref.id}`) ?? null,
    };
  }, [providers]);

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

export function useModel(ref: {
  id: string;
  provider: string;
}): pi.Model<pi.Api> | null {
  const ctx = useModelProvider();
  return useMemo(() => ctx.getModel(ref), [ctx, ref.id, ref.provider]);
}

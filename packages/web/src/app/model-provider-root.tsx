"use client";

import { ModelProvider } from "@/components/model-provider";
import type { ModelProviderGroup } from "@/lib/model-types";

function fetchModels(): Promise<ModelProviderGroup[]> {
  return fetch("/api/models")
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch models: ${res.statusText}`);
      }
      return res.json() as Promise<ModelProviderGroup[]>;
    });
}

export function ModelProviderRoot({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ModelProvider fetcher={fetchModels}>{children}</ModelProvider>;
}

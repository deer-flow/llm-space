"use client";

import type { ModelProviderGroup } from "@llm-space/core";

import { ModelProvider } from "@/components/model-provider";

function fetchModels(): Promise<ModelProviderGroup[]> {
  return fetch("/api/models").then((res) => {
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

"use client";

import { ModelProvider } from "@llm-space/ui/components/model-provider";
import type { ModelClient } from "@llm-space/ui/host";
import { useMemo, useRef, type ReactNode } from "react";

import type { RuntimeId } from "@/shared/runtime";

export function WorkspaceModelScope({
  runtimeId,
  children,
  createClient,
}: {
  runtimeId: RuntimeId;
  children: ReactNode;
  createClient: (runtimeId: RuntimeId) => ModelClient;
}) {
  const clientsRef = useRef<{
    createClient: typeof createClient;
    values: Map<RuntimeId, ModelClient>;
  }>(null);
  if (clientsRef.current?.createClient !== createClient) {
    clientsRef.current = { createClient, values: new Map() };
  }
  const clients = clientsRef.current.values;
  const client = useMemo(
    () => {
      const cached = clients.get(runtimeId);
      if (cached) return cached;
      const created = createClient(runtimeId);
      clients.set(runtimeId, created);
      return created;
    },
    [clients, createClient, runtimeId]
  );
  return <ModelProvider client={client}>{children}</ModelProvider>;
}

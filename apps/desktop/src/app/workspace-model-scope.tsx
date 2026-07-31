"use client";

import { ModelProvider } from "@llm-space/ui/components/model-provider";
import type { ModelClient } from "@llm-space/ui/host";
import { useMemo, type ReactNode } from "react";

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
  const client = useMemo(
    () => createClient(runtimeId),
    [createClient, runtimeId]
  );
  return <ModelProvider client={client}>{children}</ModelProvider>;
}

import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { ModelProviderGroup } from "@llm-space/core";

import { ModelProvider } from "@/components/model-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { electrobun } from "@/lib/electrobun";
import "@/styles/globals.css";

import { QueryProvider } from "./query-provider";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <ModelProvider fetcher={fetchModels}>
        <TooltipProvider delayDuration={1000}>
          <div className="flex size-full flex-col">
            <Toaster theme="dark" position="top-center" offset={28} />
            {children}
          </div>
        </TooltipProvider>
      </ModelProvider>
    </QueryProvider>
  );
}

async function fetchModels(): Promise<ModelProviderGroup[]> {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  const models = await electrobun.rpc.request.availableModels({});
  return models;
}

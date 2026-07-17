import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import { ModelProviderGroup } from "@llm-space/core";
import { ThemeProvider, useTheme } from "@llm-space/ui/components/theme-provider";
import "@llm-space/ui/styles/globals.css";
import { Toaster } from "@llm-space/ui/ui/sonner";
import { TooltipProvider } from "@llm-space/ui/ui/tooltip";

import { ExperimentalProvider } from "@/components/experimental-provider";
import { ModelProvider } from "@/components/model-provider";
import { electrobun } from "@/lib/electrobun";

import { QueryProvider } from "./query-provider";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ExperimentalProvider>
        <QueryProvider>
          <ModelProvider fetcher={fetchModels}>
            <TooltipProvider delayDuration={1000}>
              <div className="flex size-full flex-col">
                <ThemedToaster />
                {children}
              </div>
            </TooltipProvider>
          </ModelProvider>
        </QueryProvider>
      </ExperimentalProvider>
    </ThemeProvider>
  );
}

/** Sonner toaster that tracks the active appearance. */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme}
      position="top-center"
      offset={28}
      closeButton
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          description: "text-muted-foreground!",
        },
      }}
    />
  );
}

async function fetchModels(): Promise<ModelProviderGroup[]> {
  if (!electrobun.rpc) {
    throw new Error("Electrobun RPC is not initialized");
  }
  const models = await electrobun.rpc.request.availableModels({});
  return models;
}

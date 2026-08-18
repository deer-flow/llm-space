import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import { MessageVirtualizationProvider } from "@llm-space/ui/components/message-virtualization-provider";
import {
  ThemeProvider,
  useTheme,
} from "@llm-space/ui/components/theme-provider";
import "@llm-space/ui/styles/globals.css";
import { Toaster } from "@llm-space/ui/ui/sonner";
import { TooltipProvider } from "@llm-space/ui/ui/tooltip";

import { ExperimentalProvider } from "@/components/experimental-provider";
import { PluginCommandExecutionProvider } from "@/components/plugin-command-execution-provider";

import { QueryProvider } from "./query-provider";

export function Layout({
  children,
  totalMemoryBytes,
}: {
  children: React.ReactNode;
  totalMemoryBytes: number | null;
}) {
  return (
    <ThemeProvider>
      <MessageVirtualizationProvider totalMemoryBytes={totalMemoryBytes}>
        <ExperimentalProvider>
          <QueryProvider>
            <TooltipProvider delayDuration={1000}>
              <PluginCommandExecutionProvider>
                <div className="flex size-full flex-col">
                  <ThemedToaster />
                  {children}
                </div>
              </PluginCommandExecutionProvider>
            </TooltipProvider>
          </QueryProvider>
        </ExperimentalProvider>
      </MessageVirtualizationProvider>
    </ThemeProvider>
  );
}

/** Sonner toaster that tracks the active appearance. */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      className="toaster group pointer-events-auto! z-[100]!"
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

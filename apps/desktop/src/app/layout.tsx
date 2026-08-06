import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
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

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
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

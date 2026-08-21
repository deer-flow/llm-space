import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import {
  ThemeProvider,
  useTheme,
} from "@llm-space/ui/components/theme-provider";
import { I18nProvider } from "@llm-space/ui/lib/i18n";
import "@llm-space/ui/styles/globals.css";
import { Toaster } from "@llm-space/ui/ui/sonner";
import { TooltipProvider } from "@llm-space/ui/ui/tooltip";

import { ExperimentalProvider } from "@/components/experimental-provider";
import { PluginCommandExecutionProvider } from "@/components/plugin-command-execution-provider";
import { electrobun } from "@/lib/electrobun";

import { QueryProvider } from "./query-provider";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider
      resolveOsLocale={async () => {
        const result = await electrobun.rpc?.request("getOsLocale", {});
        return result?.locale ?? "";
      }}
      onLanguageChanged={(lang) => {
        electrobun.rpc?.send("languageChanged", { lang });
      }}
    >
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
    </I18nProvider>
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

import "@fontsource-variable/geist/index.css";
import "@fontsource-variable/geist-mono/index.css";
import {
  ThemeProvider,
  useTheme,
} from "@llm-space/ui/components/theme-provider";
import { PlaygroundLabelsProvider } from "@llm-space/ui/components/thread-playground/playground-labels";
import "@llm-space/ui/styles/globals.css";
import { Toaster } from "@llm-space/ui/ui/sonner";
import { TooltipProvider } from "@llm-space/ui/ui/tooltip";

import { ExperimentalProvider } from "@/components/experimental-provider";
import { PluginCommandExecutionProvider } from "@/components/plugin-command-execution-provider";
import { I18nProvider, useI18n } from "@/i18n/i18n-provider";
import { PLAYGROUND_LABELS } from "@/i18n/playground-labels";

import { QueryProvider } from "./query-provider";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <PlaygroundLabelsBridge>
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
        </PlaygroundLabelsBridge>
      </I18nProvider>
    </ThemeProvider>
  );
}

/**
 * Feed the shared Thread Playground's label provider from the active app
 * language, so its header chrome follows Settings → General → Language.
 */
function PlaygroundLabelsBridge({
  children,
}: {
  children: React.ReactNode;
}) {
  const { lang } = useI18n();
  return (
    <PlaygroundLabelsProvider value={PLAYGROUND_LABELS[lang]}>
      {children}
    </PlaygroundLabelsProvider>
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

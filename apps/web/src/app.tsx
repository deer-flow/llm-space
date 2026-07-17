import type { ThreadConnector } from "@llm-space/core";
import { createGistConnector, GIST_CONNECTOR_ID } from "@llm-space/core/storage";
import { ModelProvider } from "@llm-space/ui/components/model-provider";
import { ThemeProvider } from "@llm-space/ui/components/theme-provider";
import { HostServicesProvider } from "@llm-space/ui/host";
import { TooltipProvider } from "@llm-space/ui/ui/tooltip";
import { Route, Routes, useParams } from "react-router-dom";

import { webHost, webModelClient } from "@/host/web-host";
import { App as Landing } from "@/landing/app";
import { I18nProvider } from "@/landing/lib/i18n";
import { NotFound } from "@/not-found";
import { ThreadViewer } from "@/thread-viewer";

/** The connectors this site can read shared threads through, keyed by id. */
const CONNECTORS: Record<string, ThreadConnector> = {
  [GIST_CONNECTOR_ID]: createGistConnector(),
};

/**
 * The shared-thread route: `#/shared/:connectorId/threads/:threadId`. Hash
 * routing keeps deep links working on GitHub Pages at HTTP 200 with no
 * `404.html` fallback. An unknown connector renders the not-found page.
 */
function SharedThreadRoute() {
  const { connectorId, threadId } = useParams();
  const connector = connectorId ? CONNECTORS[connectorId] : undefined;
  if (!connector || !threadId) return <NotFound />;
  return <ThreadViewer connector={connector} threadId={threadId} />;
}

export function App() {
  return (
    <ThemeProvider>
      <ModelProvider client={webModelClient}>
        <HostServicesProvider value={webHost}>
          <TooltipProvider delayDuration={800}>
            <I18nProvider>
              <Routes>
                <Route
                  path="/shared/:connectorId/threads/:threadId"
                  element={<SharedThreadRoute />}
                />
                <Route path="/shared/*" element={<NotFound />} />
                <Route path="*" element={<Landing />} />
              </Routes>
            </I18nProvider>
          </TooltipProvider>
        </HostServicesProvider>
      </ModelProvider>
    </ThemeProvider>
  );
}

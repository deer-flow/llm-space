import type { ThreadConnector } from "@llm-space/core";
import { createGistConnector, GIST_CONNECTOR_ID } from "@llm-space/core/storage";
import { ModelProvider } from "@llm-space/ui/components/model-provider";
import { ThemeProvider } from "@llm-space/ui/components/theme-provider";
import { HostServicesProvider } from "@llm-space/ui/host";
import { I18nProvider } from "@llm-space/ui/lib/i18n";
import { TooltipProvider } from "@llm-space/ui/ui/tooltip";
import { Route, Routes, useParams } from "react-router-dom";

import { webHost, webModelClient } from "@/host/web-host";
import { App as Landing } from "@/landing/app";
import {
  I18nProvider as LandingI18nProvider,
  useI18n as useLandingI18n,
} from "@/landing/lib/i18n";
import { NotFound } from "@/not-found";
import { ThreadViewer } from "@/thread-viewer";

/** The connectors this site can read shared threads through, keyed by id. */
const CONNECTORS: Record<string, ThreadConnector> = {
  [GIST_CONNECTOR_ID]: createGistConnector(),
};

// Dev-only offline fixture: `#/shared/gist/threads/mock` serves a bundled sample
// thread with no GitHub API call (handy when rate-limited). Dead-code-eliminated
// from production builds, so the mock module + fixture never ship.
if (import.meta.env.DEV) {
  const { withMockThread } = await import("@/dev/mock-thread");
  CONNECTORS[GIST_CONNECTOR_ID] = withMockThread(
    CONNECTORS[GIST_CONNECTOR_ID]
  );
}

/**
 * The shared-thread route: `#/shared/:connectorId/threads/:threadId`. Hash
 * routing keeps deep links working on GitHub Pages at HTTP 200 with no
 * `404.html` fallback. An unknown connector renders the not-found page.
 */
function SharedThreadRoute() {
  const { connectorId, threadId } = useParams();
  const connector = connectorId ? CONNECTORS[connectorId] : undefined;
  if (!connector || !threadId) return <NotFound />;
  return (
    <SharedThreadViewer connector={connector} threadId={threadId} />
  );
}

/**
 * The playground's copy comes from the shared `@llm-space/ui` messages, so the
 * viewer needs the shared provider — the landing has its own. `initialLang` is
 * seeded from the landing provider's already-resolved language (that
 * resolution covers the landingLanguage-then-navigator priority). The viewer
 * stays display-only: no switcher, no persistence writes — `initialLang` makes
 * the provider's async path unnecessary.
 */
function SharedThreadViewer({
  connector,
  threadId,
}: {
  connector: ThreadConnector;
  threadId: string;
}) {
  const { lang } = useLandingI18n();
  return (
    <I18nProvider initialLang={lang}>
      <ThreadViewer connector={connector} threadId={threadId} />
    </I18nProvider>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ModelProvider client={webModelClient}>
        <HostServicesProvider value={webHost}>
          <TooltipProvider delayDuration={800}>
            <LandingI18nProvider>
              <Routes>
                <Route
                  path="/shared/:connectorId/threads/:threadId"
                  element={<SharedThreadRoute />}
                />
                <Route path="/shared/*" element={<NotFound />} />
                <Route path="*" element={<Landing />} />
              </Routes>
            </LandingI18nProvider>
          </TooltipProvider>
        </HostServicesProvider>
      </ModelProvider>
    </ThemeProvider>
  );
}

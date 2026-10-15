"use client";

import {
  DEFAULT_SEARCH_SETTINGS,
  type SearchProviderId,
  type SearchSettings,
} from "@llm-space/core";
import { Button } from "@llm-space/ui/ui/button";
import { Check, Circle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { getSearchSettings, setSearchSettings } from "@/client/search";
import { useI18n } from "@/i18n/i18n-provider";
import type { RuntimeId } from "@/shared/runtime";

import { ApiKeyField } from "./api-key-field";
import { SettingsPage } from "./settings-page";

/** Display order of the provider picker; ids are protocol values, never localized. */
const PROVIDER_ORDER: readonly SearchProviderId[] = [
  "brave",
  "firecrawl",
  "tavily",
  "exa",
  "anysearch",
  "zhihu",
  "serply",
];

/** Where each provider's key is issued, for the "Get API key" link. */
const FAVICON_DOMAINS: Record<SearchProviderId, string> = {
  brave: "search.brave.com",
  firecrawl: "firecrawl.dev",
  tavily: "tavily.com",
  exa: "exa.ai",
  anysearch: "anysearch.com",
  zhihu: "zhihu.com",
  serply: "serply.io",
};

const GET_KEY_URLS: Record<SearchProviderId, string> = {
  brave: "https://api-dashboard.search.brave.com/app/keys",
  firecrawl: "https://www.firecrawl.dev/app/api-keys",
  tavily: "https://app.tavily.com/home",
  exa: "https://dashboard.exa.ai/api-keys",
  anysearch: "https://www.anysearch.com/console/api-keys",
  zhihu: "https://developer.zhihu.com/",
  serply: "https://serply.io",
};

export function SearchPage({ runtimeId }: { runtimeId: RuntimeId }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<SearchSettings>(
    DEFAULT_SEARCH_SETTINGS
  );
  const [selectedProvider, setSelectedProvider] = useState<SearchProviderId>(
    DEFAULT_SEARCH_SETTINGS.provider
  );

  useEffect(() => {
    let cancelled = false;
    void getSearchSettings(runtimeId)
      .then((loaded) => {
        if (!cancelled) {
          setSettings(loaded);
          setSelectedProvider(loaded.provider);
        }
      })
      .catch(() => {
        // Keep defaults; a load failure is non-fatal for the form.
      });
    return () => {
      cancelled = true;
    };
  }, [runtimeId]);

  const persist = useCallback(
    async (next: SearchSettings) => {
      try {
        const saved = await setSearchSettings(next, runtimeId);
        setSettings(saved);
      } catch (error) {
        toast.error(t.search.failedToSave, {
          description:
            error instanceof Error ? error.message : t.common.pleaseTryAgain,
        });
      }
    },
    [runtimeId, t]
  );

  return (
    <SettingsPage
      title={t.search.title}
      description={
        <>
          {t.search.descriptionPrefix}
          <code>web_search</code>
          {t.search.descriptionMiddle}
          <code>web_fetch</code>
          {t.search.descriptionSuffix}
        </>
      }
    >
      <div className="flex h-full min-h-0 gap-6">
        <aside className="flex w-64 shrink-0 flex-col gap-3 border-r pr-4">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t.search.providersHeading}
          </span>

          <div className="flex flex-col gap-1">
            {PROVIDER_ORDER.map((provider) => {
              const active = selectedProvider === provider;
              const isDefault = settings.provider === provider;
              return (
                <button
                  key={provider}
                  type="button"
                  onClick={() => setSelectedProvider(provider)}
                  className={`group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors ${active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}
                >
                  <span
                    className={`flex size-8 items-center justify-center rounded-md text-xs font-bold ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${FAVICON_DOMAINS[provider]}&sz=64`}
                      alt=""
                      className="size-full rounded-sm object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-medium ${active ? "!text-primary" : "text-foreground"}`}
                    >
                      {_displayProviderName(t.search.providers[provider])}
                    </span>
                  </span>
                  {isDefault ? (
                    <span className="text-primary flex shrink-0 items-center gap-1 text-[11px] font-medium">
                      <Check className="size-3" /> {t.search.defaultLabel}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>
        <section className="min-w-0 grow">
          {(() => {
            const provider = selectedProvider;
            const isDefault = settings.provider === provider;
            return (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="bg-primary/15 text-primary flex size-11 items-center justify-center rounded-xl">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${FAVICON_DOMAINS[provider]}&sz=64`}
                        alt=""
                        className="size-full rounded-md object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    </span>
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">
                        {_displayProviderName(t.search.providers[provider])}
                      </h2>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {t.search.detailsDescription}
                      </p>
                    </div>
                  </div>
                  {isDefault ? (
                    <span className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold">
                      <Check className="size-3.5" /> {t.search.defaultLabel}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void persist({ ...settings, provider })}
                    >
                      {t.search.setDefault}
                    </Button>
                  )}
                </div>
                <div className="border-border/70 bg-background/40 mt-8 rounded-xl border p-5">
                  <ApiKeyField
                    label={t.search.keys[provider]}
                    value={settings[_settingsKeyFor(provider)]}
                    getKeyUrl={GET_KEY_URLS[provider]}
                    getKeyButton
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        [_settingsKeyFor(provider)]: e.target.value,
                      })
                    }
                    onBlur={() => void persist(settings)}
                  />
                  <p className="text-muted-foreground mt-4 text-xs">
                    {t.search.envPrefix}
                    <code>$</code>
                    {t.search.envMiddle}
                    <code>$BRAVE_SEARCH_API_KEY</code>,{" "}
                    <code>$FIRECRAWL_API_KEY</code>,{" "}
                    <code>$TAVILY_API_KEY</code>
                    {t.search.envSuffix}
                    {t.search.keyNotes}
                  </p>
                </div>
                <div className="text-muted-foreground mt-6 flex items-center gap-2 text-xs">
                  <Circle className="size-3 fill-current" />{" "}
                  {t.search.defaultHint}
                </div>
              </>
            );
          })()}
        </section>
      </div>
    </SettingsPage>
  );
}

/**
 * The settings field backing each provider's key: every provider uses
 * `<id>ApiKey` except Zhihu, which stores an Access Secret.
 */
function _settingsKeyFor(
  provider: SearchProviderId
):
  | "braveApiKey"
  | "firecrawlApiKey"
  | "tavilyApiKey"
  | "exaApiKey"
  | "anysearchApiKey"
  | "zhihuAccessSecret"
  | "serplyApiKey" {
  return provider === "zhihu" ? "zhihuAccessSecret" : `${provider}ApiKey`;
}

function _displayProviderName(name: string): string {
  return name.replace(/\s*\(MCP\)$/i, "");
}

"use client";

import {
  DEFAULT_SEARCH_SETTINGS,
  type SearchProviderId,
  type SearchSettings,
} from "@llm-space/core";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@llm-space/ui/ui/select";
import { Separator } from "@llm-space/ui/ui/separator";
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
];

/** Where each provider's key is issued, for the "Get API key" link. */
const GET_KEY_URLS: Record<SearchProviderId, string> = {
  brave: "https://api-dashboard.search.brave.com/app/keys",
  firecrawl: "https://www.firecrawl.dev/app/api-keys",
  tavily: "https://app.tavily.com/home",
  exa: "https://dashboard.exa.ai/api-keys",
  anysearch: "https://www.anysearch.com/console/api-keys",
  zhihu: "https://developer.zhihu.com/",
};

export function SearchPage({ runtimeId }: { runtimeId: RuntimeId }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<SearchSettings>(
    DEFAULT_SEARCH_SETTINGS
  );

  useEffect(() => {
    let cancelled = false;
    void getSearchSettings(runtimeId)
      .then((loaded) => {
        if (!cancelled) {
          setSettings(loaded);
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
            error instanceof Error
              ? error.message
              : t.common.pleaseTryAgain,
        });
      }
    },
    [runtimeId, t]
  );

  return (
    <SettingsPage
      title={t.search.title}
      className="pt-0"
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
      <div className="flex flex-col gap-4">
        <div className="flex h-14 items-center justify-between gap-4">
          <span className="text-sm">{t.search.providerRow}</span>
          <Select
            value={settings.provider}
            onValueChange={(value) =>
              void persist({ ...settings, provider: value as SearchProviderId })
            }
          >
            <SelectTrigger className="w-40" aria-label={t.search.providerAria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_ORDER.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {t.search.providers[provider]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {PROVIDER_ORDER.map((provider) => (
          <ApiKeyField
            key={provider}
            label={t.search.keys[provider]}
            value={settings[_settingsKeyFor(provider)]}
            getKeyUrl={GET_KEY_URLS[provider]}
            onChange={(e) =>
              setSettings({
                ...settings,
                [_settingsKeyFor(provider)]: e.target.value,
              })
            }
            onBlur={() => void persist(settings)}
          />
        ))}

        <p className="text-muted-foreground text-xs">
          {t.search.envPrefix}
          <code>$</code>
          {t.search.envMiddle}
          <code>$BRAVE_SEARCH_API_KEY</code>,{" "}
          <code>$FIRECRAWL_API_KEY</code>, <code>$TAVILY_API_KEY</code>
          {t.search.envSuffix}
          {t.search.keyNotes}
        </p>
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
): "braveApiKey" | "firecrawlApiKey" | "tavilyApiKey" | "exaApiKey" | "anysearchApiKey" | "zhihuAccessSecret" {
  return provider === "zhihu" ? "zhihuAccessSecret" : `${provider}ApiKey`;
}

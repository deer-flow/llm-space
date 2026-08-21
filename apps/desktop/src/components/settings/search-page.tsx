"use client";

import {
  DEFAULT_SEARCH_SETTINGS,
  type SearchProviderId,
  type SearchSettings,
} from "@llm-space/core";
import { useI18n } from "@llm-space/ui/lib/i18n";
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
import type { RuntimeId } from "@/shared/runtime";

import { ApiKeyField } from "./api-key-field";
import { SettingsPage } from "./settings-page";

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
        toast.error(t.settings.search.failedToSave, {
          description:
            error instanceof Error ? error.message : t.common.pleaseTryAgain,
        });
      }
    },
    [runtimeId, t]
  );

  return (
    <SettingsPage
      title={t.settings.search.title}
      className="pt-0"
      description={
        <>
          {t.settings.search.descriptionPrefix}
          <code>web_search</code>
          {t.settings.search.descriptionMiddle}
          <code>web_fetch</code>
          {t.settings.search.descriptionSuffix}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex h-14 items-center justify-between gap-4">
          <span className="text-sm">{t.settings.search.providerLabel}</span>
          <Select
            value={settings.provider}
            onValueChange={(value) =>
              void persist({ ...settings, provider: value as SearchProviderId })
            }
          >
            <SelectTrigger
              className="w-40"
              aria-label={t.settings.search.providerLabel}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="brave">{t.settings.search.providers.brave}</SelectItem>
              <SelectItem value="firecrawl">
                {t.settings.search.providers.firecrawl}
              </SelectItem>
              <SelectItem value="tavily">{t.settings.search.providers.tavily}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <ApiKeyField
          label={t.settings.search.apiKeys.brave}
          value={settings.braveApiKey}
          getKeyUrl="https://api-dashboard.search.brave.com/app/keys"
          onChange={(e) =>
            setSettings({ ...settings, braveApiKey: e.target.value })
          }
          onBlur={() => void persist(settings)}
        />

        <ApiKeyField
          label={t.settings.search.apiKeys.firecrawl}
          value={settings.firecrawlApiKey}
          getKeyUrl="https://www.firecrawl.dev/app/api-keys"
          onChange={(e) =>
            setSettings({ ...settings, firecrawlApiKey: e.target.value })
          }
          onBlur={() => void persist(settings)}
        />

        <ApiKeyField
          label={t.settings.search.apiKeys.tavily}
          value={settings.tavilyApiKey}
          getKeyUrl="https://app.tavily.com/home"
          onChange={(e) =>
            setSettings({ ...settings, tavilyApiKey: e.target.value })
          }
          onBlur={() => void persist(settings)}
        />

        <p className="text-muted-foreground text-xs">
          {t.settings.search.valuesHintPrefix}
          <code>$</code>
          {t.settings.search.valuesHintMiddle}
          <code>$BRAVE_SEARCH_API_KEY</code>
          {t.settings.search.valuesHintSeparator}
          <code>$FIRECRAWL_API_KEY</code>
          {t.settings.search.valuesHintSeparator}
          <code>$TAVILY_API_KEY</code>
          {t.settings.search.valuesHintEnd}
        </p>
      </div>
    </SettingsPage>
  );
}

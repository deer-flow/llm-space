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
import type { RuntimeId } from "@/shared/runtime";

import { ApiKeyField } from "./api-key-field";
import { SettingsPage } from "./settings-page";

export function SearchPage({ runtimeId }: { runtimeId: RuntimeId }) {
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
        toast.error("Failed to save search settings", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        });
      }
    },
    [runtimeId]
  );

  return (
    <SettingsPage
      title="Search"
      className="pt-0"
      description={
        <>
          Choose the provider for the built-in <code>web_search</code> tool.
          When Brave Search, Exa, AnySearch, or Zhihu is selected,{" "}
          <code>web_fetch</code> continues to use Firecrawl for safe page
          extraction.
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex h-14 items-center justify-between gap-4">
          <span className="text-sm">Search provider</span>
          <Select
            value={settings.provider}
            onValueChange={(value) =>
              void persist({ ...settings, provider: value as SearchProviderId })
            }
          >
            <SelectTrigger className="w-40" aria-label="Search provider">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="brave">Brave Search</SelectItem>
              <SelectItem value="firecrawl">Firecrawl</SelectItem>
              <SelectItem value="tavily">Tavily</SelectItem>
              <SelectItem value="exa">Exa (MCP)</SelectItem>
              <SelectItem value="anysearch">AnySearch (MCP)</SelectItem>
              <SelectItem value="zhihu">Zhihu (MCP)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <ApiKeyField
          label="Brave Search API key"
          value={settings.braveApiKey}
          getKeyUrl="https://api-dashboard.search.brave.com/app/keys"
          onChange={(e) =>
            setSettings({ ...settings, braveApiKey: e.target.value })
          }
          onBlur={() => void persist(settings)}
        />

        <ApiKeyField
          label="Firecrawl API key"
          value={settings.firecrawlApiKey}
          getKeyUrl="https://www.firecrawl.dev/app/api-keys"
          onChange={(e) =>
            setSettings({ ...settings, firecrawlApiKey: e.target.value })
          }
          onBlur={() => void persist(settings)}
        />

        <ApiKeyField
          label="Tavily API key"
          value={settings.tavilyApiKey}
          getKeyUrl="https://app.tavily.com/home"
          onChange={(e) =>
            setSettings({ ...settings, tavilyApiKey: e.target.value })
          }
          onBlur={() => void persist(settings)}
        />

        <ApiKeyField
          label="Exa API key (optional)"
          value={settings.exaApiKey}
          getKeyUrl="https://dashboard.exa.ai/api-keys"
          onChange={(e) => setSettings({ ...settings, exaApiKey: e.target.value })}
          onBlur={() => void persist(settings)}
        />

        <ApiKeyField
          label="AnySearch API key (optional)"
          value={settings.anysearchApiKey}
          getKeyUrl="https://www.anysearch.com/console/api-keys"
          onChange={(e) =>
            setSettings({ ...settings, anysearchApiKey: e.target.value })
          }
          onBlur={() => void persist(settings)}
        />

        <ApiKeyField
          label="Zhihu Access Secret"
          value={settings.zhihuAccessSecret}
          getKeyUrl="https://developer.zhihu.com/"
          onChange={(e) =>
            setSettings({ ...settings, zhihuAccessSecret: e.target.value })
          }
          onBlur={() => void persist(settings)}
        />

        <p className="text-muted-foreground text-xs">
          Values starting with <code>$</code> are read from the environment
          (e.g. <code>$BRAVE_SEARCH_API_KEY</code>,{" "}
          <code>$FIRECRAWL_API_KEY</code>, <code>$TAVILY_API_KEY</code>). Exa
          and AnySearch work without a key at lower rate limits; Zhihu requires
          the Access Secret from its developer console (个人中心).
        </p>
      </div>
    </SettingsPage>
  );
}

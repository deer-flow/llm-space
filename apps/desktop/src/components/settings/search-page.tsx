"use client";

import { Eye, EyeOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { getSearchSettings, setSearchSettings } from "@/client/search";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  DEFAULT_SEARCH_SETTINGS,
  type SearchProviderId,
  type SearchSettings,
} from "@/shared/search";

import { Link } from "../link";

import { SettingsPage } from "./settings-page";

export function SearchPage() {
  const [settings, setSettings] = useState<SearchSettings>(
    DEFAULT_SEARCH_SETTINGS
  );

  useEffect(() => {
    let cancelled = false;
    void getSearchSettings()
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
  }, []);

  const persist = useCallback(async (next: SearchSettings) => {
    try {
      const saved = await setSearchSettings(next);
      setSettings(saved);
    } catch (error) {
      toast.error("Failed to save search settings", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  }, []);

  return (
    <SettingsPage title="Search">
      <div className="flex flex-col gap-4">
        <div className="flex h-14 items-center justify-between gap-4">
          <span className="flex flex-col gap-0.5 text-sm">
            Search provider
            <span className="text-muted-foreground text-xs">
              Backs the built-in web search and fetch tools.
            </span>
          </span>
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
              <SelectItem value="firecrawl">Firecrawl</SelectItem>
              <SelectItem value="tavily">Tavily</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <ApiKeyField
          label="Firecrawl API key"
          value={settings.firecrawlApiKey}
          getKeyUrl="https://www.firecrawl.dev/app/api-keys"
          onChange={(value) =>
            setSettings({ ...settings, firecrawlApiKey: value })
          }
          onBlur={() => void persist(settings)}
        />

        <ApiKeyField
          label="Tavily API key"
          value={settings.tavilyApiKey}
          getKeyUrl="https://app.tavily.com/home"
          onChange={(value) =>
            setSettings({ ...settings, tavilyApiKey: value })
          }
          onBlur={() => void persist(settings)}
        />

        <p className="text-muted-foreground text-xs">
          Values starting with <code>$</code> are read from the environment
          (e.g. <code>$FIRECRAWL_API_KEY</code>, <code>$TAVILY_API_KEY</code>).
        </p>
      </div>
    </SettingsPage>
  );
}

function ApiKeyField({
  label,
  value,
  getKeyUrl,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  getKeyUrl: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <Link
          href={getKeyUrl}
          className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
        >
          Get API key
        </Link>
      </div>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          className="pr-9"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transition-colors"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

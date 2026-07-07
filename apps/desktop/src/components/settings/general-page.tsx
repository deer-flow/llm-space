"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { getAnalyticsSettings, setAnalyticsSettings } from "@/client/analytics";
import {
  isModelAvailable,
  useDefaultModel,
  useModels,
  useSetDefaultModel,
} from "@/components/model-provider";
import {
  DEFAULT_PRIMARY,
  usePrimaryColor,
  useRenderingFidelity,
  useTheme,
  type RenderingFidelity,
  type Theme,
} from "@/components/theme-provider";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_ANALYTICS_SETTINGS } from "@/shared/analytics";

import { ModelAvatar } from "../thread-playground/model-avatar";
import { Button } from "../ui/button";

import { PrimaryColorPicker } from "./primary-color-picker";
import { SettingsPage } from "./settings-page";

/** Sentinel value for the "Automatic (first available model)" option. */
const AUTO_DEFAULT_MODEL = "__auto__";

/** A single label-on-the-left, control-on-the-right settings row. */
function SettingsRow({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-14 items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

/**
 * Picks the app-wide default model. New threads — and threads whose saved model
 * is no longer available — resolve to it. "Automatic" clears the choice and
 * falls back to the first available model.
 */
function DefaultModelSelect() {
  const providers = useModels();
  const defaultModel = useDefaultModel();
  const setDefaultModel = useSetDefaultModel();

  const groups = useMemo(
    () =>
      [...providers]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((group) => {
          const disabled = new Set(group.disabledModels ?? []);
          return {
            id: group.id,
            name: group.name,
            models: group.models.filter((model) => !disabled.has(model.id)),
          };
        })
        .filter((group) => group.models.length > 0),
    [providers]
  );

  // Show "Automatic" whenever nothing is chosen or the saved default is no
  // longer available, matching the resolution fallback.
  const value =
    defaultModel && isModelAvailable(providers, defaultModel)
      ? `${defaultModel.provider}:${defaultModel.id}`
      : AUTO_DEFAULT_MODEL;

  const handleChange = (next: string) => {
    if (next === AUTO_DEFAULT_MODEL) {
      void setDefaultModel(null);
      return;
    }
    const separator = next.indexOf(":");
    void setDefaultModel({
      provider: next.slice(0, separator),
      id: next.slice(separator + 1),
    });
  };

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className="w-64" aria-label="Default model">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO_DEFAULT_MODEL}>Automatic</SelectItem>
        {groups.length > 0 ? <SelectSeparator /> : null}
        {groups.map((group) => (
          <SelectGroup key={group.id}>
            <SelectLabel>{group.name}</SelectLabel>
            {group.models.map((model) => (
              <SelectItem
                key={`${model.provider}:${model.id}`}
                value={`${model.provider}:${model.id}`}
              >
                <ModelAvatar
                  id={model.id}
                  name={model.name}
                  icon={model.icon}
                  size={16}
                />
                <span className="font-mono">{model.name}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Opt out of anonymous, behaviour-only product analytics. The switch reflects
 * the user's stored preference; toggling it persists immediately via RPC. See
 * `shared/analytics.ts` for exactly what is (and isn't) collected.
 */
function AnalyticsToggle() {
  const [enabled, setEnabled] = useState(DEFAULT_ANALYTICS_SETTINGS.enabled);

  useEffect(() => {
    let cancelled = false;
    void getAnalyticsSettings()
      .then((loaded) => {
        if (!cancelled) setEnabled(loaded.enabled);
      })
      .catch(() => {
        // Keep the default; a load failure is non-fatal for the toggle.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback(async (next: boolean) => {
    setEnabled(next); // Optimistic; the RPC echoes the input, so no reconcile.
    try {
      await setAnalyticsSettings(next);
    } catch (error) {
      setEnabled(!next);
      toast.error("Failed to update analytics setting", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  }, []);

  return (
    <Switch
      checked={enabled}
      onCheckedChange={(next) => void handleChange(next)}
      aria-label="Share anonymous usage analytics"
    />
  );
}

export function GeneralPage() {
  const { theme, setTheme } = useTheme();
  const { fidelity, setFidelity } = useRenderingFidelity();
  const {
    primaryColor,
    resetPrimaryColor,
    resetPrimaryColorVersion,
    setPrimaryColor,
  } = usePrimaryColor();
  const showResetPrimaryColor = primaryColor !== DEFAULT_PRIMARY;
  return (
    <SettingsPage title="General">
      <SettingsRow label="Appearance">
        <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <SelectTrigger className="w-32" aria-label="Appearance">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>

      <Separator />

      <SettingsRow
        label={
          <span className="flex flex-col gap-0.5">
            Default model
            <span className="text-muted-foreground text-xs">
              Used for new threads, and when a thread&apos;s model is no longer
              available.
            </span>
          </span>
        }
      >
        <DefaultModelSelect />
      </SettingsRow>

      <Separator />

      <SettingsRow label="Primary color">
        <div className="flex items-center gap-2">
          {showResetPrimaryColor ? (
            <Button size="sm" variant="secondary" onClick={resetPrimaryColor}>
              Reset
            </Button>
          ) : null}
          <PrimaryColorPicker
            key={resetPrimaryColorVersion}
            value={primaryColor}
            onChange={setPrimaryColor}
          />
        </div>
      </SettingsRow>

      <Separator />

      <SettingsRow
        label={
          <span className="flex flex-col gap-0.5">
            Rendering fidelity
            <span className="text-muted-foreground text-xs">
              Lite renders the message list as plain text for smoother scrolling
              on large threads.
            </span>
          </span>
        }
      >
        <Select
          value={fidelity}
          onValueChange={(v) => setFidelity(v as RenderingFidelity)}
        >
          <SelectTrigger className="w-32" aria-label="Rendering fidelity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rich">Rich</SelectItem>
            <SelectItem value="lite">Lite</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>

      <Separator />

      <SettingsRow label="Language">
        <Select defaultValue="en-US" disabled>
          <SelectTrigger className="w-32" aria-label="Language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en-US">English (US)</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>

      <Separator />

      <SettingsRow
        label={
          <span className="flex flex-col gap-0.5">
            Share anonymous usage analytics
            <span className="text-muted-foreground text-xs">
              Helps improve the app. Only anonymous actions are sent - never
              your prompts, messages, or API keys.
            </span>
          </span>
        }
      >
        <AnalyticsToggle />
      </SettingsRow>
    </SettingsPage>
  );
}

"use client";

import {
  isModelAvailable,
  useDefaultModel,
  useModels,
  useSetDefaultModel,
} from "@llm-space/ui/components/model-provider";
import {
  DEFAULT_PRIMARY,
  usePrimaryColor,
  useRenderingFidelity,
  useTheme,
  type RenderingFidelity,
  type Theme,
} from "@llm-space/ui/components/theme-provider";
import { ModelAvatar } from "@llm-space/ui/components/thread-playground/model-avatar";
import { LANGUAGES, useI18n } from "@llm-space/ui/lib/i18n";
import { Button } from "@llm-space/ui/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@llm-space/ui/ui/select";
import { Switch } from "@llm-space/ui/ui/switch";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { getAnalyticsSettings, setAnalyticsSettings } from "@/client/analytics";
import { getWorkspacePath } from "@/client/paths";
import { useCommands } from "@/commands";
import { electrobun } from "@/lib/electrobun";
import { DEFAULT_ANALYTICS_SETTINGS } from "@/shared/analytics";
import { DEFAULT_UPDATE_MODE, type UpdateMode } from "@/shared/updates";

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
 * A titled category: an uppercase section label above a grouped card whose rows
 * are separated by hairline dividers. Gives the flat settings list hierarchy.
 */
function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-muted-foreground px-1 text-[0.6875rem] font-medium tracking-wider uppercase">
        {title}
      </h3>
      <div className="border-border/60 divide-border/60 bg-muted/15 divide-y rounded-xl border px-4">
        {children}
      </div>
    </section>
  );
}

/** A row label with a title and an optional muted one-line explanation. */
function RowLabel({ title, hint }: { title: string; hint?: string }) {
  if (!hint) {
    return <>{title}</>;
  }
  return (
    <span className="flex flex-col gap-0.5">
      {title}
      <span className="text-muted-foreground text-xs">{hint}</span>
    </span>
  );
}

/**
 * Picks the app-wide default model. New threads — and threads whose saved model
 * is no longer available — resolve to it. "Automatic" clears the choice and
 * falls back to the first available model.
 */
function DefaultModelSelect() {
  const { t } = useI18n();
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
      <SelectTrigger
        className="w-64"
        aria-label={t.settings.general.defaultModel}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO_DEFAULT_MODEL}>
          {t.settings.general.automatic}
        </SelectItem>
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
 * the user's stored preference; toggling it persists immediately via RPC. When
 * telemetry is force-disabled (no key, or `LLM_SPACE_ANALYTICS_DISABLED`), the
 * switch renders off and disabled and the description says nothing is sent,
 * instead of claiming data is being shared. See `shared/analytics.ts` for
 * exactly what is (and isn't) collected.
 */
function AnalyticsRow() {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(DEFAULT_ANALYTICS_SETTINGS.enabled);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getAnalyticsSettings()
      .then((loaded) => {
        if (cancelled) return;
        setEnabled(loaded.enabled);
        setAvailable(loaded.available);
      })
      .catch(() => {
        // Keep the defaults; a load failure is non-fatal for the toggle.
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
      toast.error(t.settings.general.failedToUpdateAnalytics, {
        description:
          error instanceof Error ? error.message : t.common.pleaseTryAgain,
      });
    }
  }, [t]);

  return (
    <SettingsRow
      label={
        <span className="flex flex-col gap-0.5">
          {t.settings.general.usageAnalytics}
          <span className="text-muted-foreground text-xs">
            {available
              ? t.settings.general.usageAnalyticsHint
              : t.settings.general.telemetryOff}
          </span>
        </span>
      }
    >
      <Switch
        checked={available && enabled}
        disabled={!available}
        onCheckedChange={(next) => void handleChange(next)}
        aria-label={t.settings.general.usageAnalytics}
      />
    </SettingsRow>
  );
}

function WorkspaceFolderLink() {
  const { executeCommand } = useCommands();
  const [path, setPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getWorkspacePath()
      .then((loaded) => {
        if (!cancelled) setPath(loaded);
      })
      .catch(() => {
        // Non-fatal; leave the placeholder.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!path) {
    return <span className="text-muted-foreground text-sm">…</span>;
  }

  return (
    <button
      type="button"
      onClick={() =>
        executeCommand({ type: "openWorkspaceFolder", args: {} })
      }
      className="text-primary max-w-[50%] cursor-pointer truncate font-mono text-sm underline underline-offset-2 hover:opacity-80"
      title={path}
    >
      {path}
    </button>
  );
}

/** Read/write the bun-owned update mode over RPC. */
function useUpdateMode(): [UpdateMode, (mode: UpdateMode) => void] {
  const [mode, setMode] = useState<UpdateMode>(DEFAULT_UPDATE_MODE);
  useEffect(() => {
    void electrobun.rpc?.request.updateMode({}).then(setMode);
  }, []);
  const change = (next: UpdateMode) => {
    setMode(next);
    void electrobun.rpc?.request.setUpdateMode({ mode: next });
  };
  return [mode, change];
}

export function GeneralPage() {
  const { lang, setLang, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { executeCommand } = useCommands();
  const { fidelity, setFidelity } = useRenderingFidelity();
  const [updateMode, setUpdateMode] = useUpdateMode();
  const {
    primaryColor,
    resetPrimaryColor,
    resetPrimaryColorVersion,
    setPrimaryColor,
  } = usePrimaryColor();
  const showResetPrimaryColor = primaryColor !== DEFAULT_PRIMARY;
  return (
    <SettingsPage
      title={t.settings.general.title}
      description={t.settings.general.description}
      className="overflow-y-auto"
    >
      <div className="flex flex-col gap-7 pb-2">
        <SettingsSection title={t.settings.general.sections.appearance}>
          <SettingsRow
            label={
              <RowLabel
                title={t.settings.language}
                hint={t.settings.languageHint}
              />
            }
          >
            <Select
              value={lang}
              onValueChange={(v) => setLang(v as "en" | "zh")}
            >
              <SelectTrigger className="w-48" aria-label={t.settings.language}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {LANGUAGES.map(({ code, label }) => (
                    <SelectItem key={code} value={code}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingsRow>

          <SettingsRow
            label={
              <RowLabel
                title={t.settings.general.theme}
                hint={t.settings.general.themeHint}
              />
            }
          >
            <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <SelectTrigger
                className="w-32"
                aria-label={t.settings.general.theme}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">
                  {t.settings.general.themeLight}
                </SelectItem>
                <SelectItem value="dark">
                  {t.settings.general.themeDark}
                </SelectItem>
                <SelectItem value="system">
                  {t.settings.general.themeSystem}
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>

          <SettingsRow
            label={
              <RowLabel
                title={t.settings.general.primaryColor}
                hint={t.settings.general.primaryColorHint}
              />
            }
          >
            <div className="flex items-center gap-2">
              {showResetPrimaryColor ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={resetPrimaryColor}
                >
                  {t.settings.general.resetColor}
                </Button>
              ) : null}
              <PrimaryColorPicker
                key={resetPrimaryColorVersion}
                value={primaryColor}
                onChange={setPrimaryColor}
              />
            </div>
          </SettingsRow>

          <SettingsRow
            label={
              <RowLabel
                title={t.settings.general.rendering}
                hint={t.settings.general.renderingHint}
              />
            }
          >
            <Select
              value={fidelity}
              onValueChange={(v) => setFidelity(v as RenderingFidelity)}
            >
              <SelectTrigger
                className="w-32"
                aria-label={t.settings.general.renderingAria}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rich">
                  {t.settings.general.renderingFull}
                </SelectItem>
                <SelectItem value="lite">
                  {t.settings.general.renderingFast}
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t.settings.general.sections.defaults}>
          <SettingsRow
            label={
              <RowLabel
                title={t.settings.general.defaultModel}
                hint={t.settings.general.defaultModelHint}
              />
            }
          >
            <DefaultModelSelect />
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t.settings.general.sections.dataPrivacy}>
          <SettingsRow
            label={
              <RowLabel
                title={t.settings.general.workspaceFolder}
                hint={t.settings.general.workspaceFolderHint}
              />
            }
          >
            <WorkspaceFolderLink />
          </SettingsRow>

          <AnalyticsRow />
        </SettingsSection>

        <SettingsSection title={t.settings.general.sections.updates}>
          <SettingsRow
            label={
              <RowLabel
                title={t.settings.general.softwareUpdates}
                hint={t.settings.general.softwareUpdatesHint}
              />
            }
          >
            <div className="flex items-center gap-2">
              <Select
                value={updateMode}
                onValueChange={(v) => setUpdateMode(v as UpdateMode)}
              >
                <SelectTrigger
                  className="w-40"
                  aria-label={t.settings.general.softwareUpdates}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">
                    {t.settings.general.updatesAutomatic}
                  </SelectItem>
                  <SelectItem value="manual">
                    {t.settings.general.updatesCheckManually}
                  </SelectItem>
                  <SelectItem value="off">
                    {t.settings.general.updatesOff}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="lg"
                onClick={() =>
                  executeCommand({ type: "checkForUpdates", args: {} })
                }
              >
                {t.settings.general.checkNow}
              </Button>
            </div>
          </SettingsRow>
        </SettingsSection>
      </div>
    </SettingsPage>
  );
}

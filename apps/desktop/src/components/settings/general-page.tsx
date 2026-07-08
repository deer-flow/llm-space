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
import { getWorkspacePath } from "@/client/paths";
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
import { electrobun } from "@/lib/electrobun";
import { DEFAULT_ANALYTICS_SETTINGS } from "@/shared/analytics";
import { DEFAULT_UPDATE_MODE, type UpdateMode } from "@/shared/updates";

import { Link } from "../link";
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
 * the user's stored preference; toggling it persists immediately via RPC. When
 * telemetry is force-disabled (no key, or `LLM_SPACE_ANALYTICS_DISABLED`), the
 * switch renders off and disabled and the description says nothing is sent,
 * instead of claiming data is being shared. See `shared/analytics.ts` for
 * exactly what is (and isn't) collected.
 */
function AnalyticsRow() {
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
      toast.error("Failed to update analytics setting", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  }, []);

  return (
    <SettingsRow
      label={
        <span className="flex flex-col gap-0.5">
          Share anonymous usage analytics
          <span className="text-muted-foreground text-xs">
            {available
              ? "Helps improve the app. Only anonymous actions are sent - never your prompts, messages, or API keys."
              : "Telemetry is turned off in this build or environment. Nothing is sent."}
          </span>
        </span>
      }
    >
      <Switch
        checked={available && enabled}
        disabled={!available}
        onCheckedChange={(next) => void handleChange(next)}
        aria-label="Share anonymous usage analytics"
      />
    </SettingsRow>
  );
}

function WorkspaceFolderLink() {
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
    <Link
      command={{ type: "openWorkspaceFolder", args: {} }}
      className="text-primary max-w-[50%] truncate font-mono text-sm underline underline-offset-2 hover:opacity-80"
      title={path}
    >
      {path}
    </Link>
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
  const { theme, setTheme } = useTheme();
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
    <SettingsPage title="General">
      <SettingsRow
        label={
          <RowLabel
            title="Language"
            hint="English only for now — more languages are coming."
          />
        }
      >
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
          <RowLabel
            title="Appearance"
            hint="Match your system setting, or force light or dark."
          />
        }
      >
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
          <RowLabel
            title="Primary color"
            hint="The accent color for buttons, links, and highlights."
          />
        }
      >
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
          <RowLabel
            title="Rendering"
            hint="Full renders messages with full editors. Fast shows them as plain text for smoother scrolling on large threads."
          />
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
            <SelectItem value="rich">Full</SelectItem>
            <SelectItem value="lite">Fast</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>

      <Separator />

      <SettingsRow
        label={
          <RowLabel
            title="Default model"
            hint="Used for new threads, and when a thread's model is no longer available."
          />
        }
      >
        <DefaultModelSelect />
      </SettingsRow>

      <Separator />

      <SettingsRow
        label={
          <RowLabel
            title="Software updates"
            hint="Automatic downloads updates in the background and prompts you to restart."
          />
        }
      >
        <Select
          value={updateMode}
          onValueChange={(v) => setUpdateMode(v as UpdateMode)}
        >
          <SelectTrigger className="w-40" aria-label="Software updates">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="automatic">Automatic</SelectItem>
            <SelectItem value="manual">Check manually</SelectItem>
            <SelectItem value="off">Off</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>

      <Separator />

      <SettingsRow
        label={
          <RowLabel
            title="Workspace folder"
            hint="Where your threads are stored on disk."
          />
        }
      >
        <WorkspaceFolderLink />
      </SettingsRow>

      <Separator />

      <AnalyticsRow />
    </SettingsPage>
  );
}

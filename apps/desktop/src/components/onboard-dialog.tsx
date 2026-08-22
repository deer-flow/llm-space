"use client";

import type { ModelProviderGroup } from "@llm-space/core";
import {
  useAddProvider,
  useFetchBuiltinProviders,
  useModels,
} from "@llm-space/ui/components/model-provider";
import { ProviderAvatar } from "@llm-space/ui/components/thread-playground/provider-avatar";
import { formatString, useI18n } from "@llm-space/ui/lib/i18n";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import { Dialog, DialogClose, DialogContent } from "@llm-space/ui/ui/dialog";
import { Spinner } from "@llm-space/ui/ui/spinner";
import {
  ArrowRightIcon,
  CheckIcon,
  CircleAlertIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useCommands } from "@/commands";
import { track } from "@/lib/analytics";

import "./onboard-dialog.css";


/**
 * First-run onboarding dialog. Shown automatically when no models are configured
 * yet, and reachable any time via the "Onboard..." command (Help menu).
 */
export function OnboardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const models = useModels();
  const { executeCommand } = useCommands();
  const fetchBuiltinProviders = useFetchBuiltinProviders();
  const addProvider = useAddProvider();
  const [builtinProviders, setBuiltinProviders] = useState<
    ModelProviderGroup[] | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingProviderId, setAddingProviderId] = useState<string | null>(null);
  const [addedProviderName, setAddedProviderName] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!open || models.length > 0) {
      return;
    }

    let cancelled = false;
    setLoadError(null);
    void fetchBuiltinProviders()
      .then((providers) => {
        if (!cancelled) {
          setBuiltinProviders(providers);
        }
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLoadError(t.desktop.onboard.providerCheckFailed);
        setBuiltinProviders([]);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchBuiltinProviders, models.length, open, t]);

  const detectedProviders = useMemo(() => {
    return (builtinProviders ?? [])
      .filter((provider) => provider.apiKeyDetected)
      .sort(_sortProviderForOnboarding);
  }, [builtinProviders]);

  const recommendedProviders = useMemo(() => {
    return (builtinProviders ?? [])
      .filter((provider) =>
        ONBOARDING_RECOMMENDED_PROVIDER_IDS.has(provider.id)
      )
      .sort(_sortProviderForOnboarding)
      .slice(0, 3);
  }, [builtinProviders]);

  const handleConfigureModels = useCallback(() => {
    track({
      event: "onboarding_choice",
      properties: { choice: "configure_models" },
    });
    onOpenChange(false);
    executeCommand({ type: "openSettings", args: { tab: "models" } });
  }, [executeCommand, onOpenChange]);
  const handleLearnMore = useCallback(() => {
    track({ event: "onboarding_choice", properties: { choice: "learn_more" } });
    executeCommand({ type: "openDocument", args: {} });
  }, [executeCommand]);
  const handleOpenAnalyticsSettings = useCallback(() => {
    track({
      event: "onboarding_choice",
      properties: { choice: "analytics_settings" },
    });
    onOpenChange(false);
    executeCommand({ type: "openSettings", args: { tab: "general" } });
  }, [executeCommand, onOpenChange]);

  const handleAddProvider = useCallback(
    async (provider: ModelProviderGroup) => {
      setAddingProviderId(provider.id);
      try {
        await addProvider(provider.id);
        setAddedProviderName(provider.name);
        toast.success(
          formatString(t.desktop.onboard.providerReady, {
            name: provider.name,
          })
        );
      } catch {
        toast.error(t.desktop.onboard.couldNotAddProvider, {
          description: t.desktop.onboard.addProviderFailed,
        });
      } finally {
        setAddingProviderId(null);
      }
    },
    [addProvider, t]
  );

  const handleReady = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const readyProviderName =
    addedProviderName ?? models[0]?.name ?? models[0]?.id ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[1040px]! overflow-hidden border-white/10 bg-[#050809] p-0 shadow-[0_34px_120px_rgba(0,0,0,0.7)]"
        showCloseButton={false}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
      >
        <div className="relative isolate aspect-video max-h-[calc(100dvh-2rem)] min-h-0 overflow-hidden rounded-lg bg-[#050809] text-white">
          <div className="onboard-background-enter pointer-events-none absolute inset-0">
            <img
              src="/images/onboard-no-top-light.png"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 size-full select-none object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,7,8,0.96)_0%,rgba(3,7,8,0.82)_27%,rgba(3,7,8,0.28)_46%,transparent_62%)]" />
            <div className="absolute inset-y-0 left-0 w-[72%] bg-[linear-gradient(0deg,rgba(3,7,8,0.98)_0%,rgba(3,7,8,0.78)_20%,rgba(3,7,8,0.14)_46%,transparent_66%)] [mask-image:linear-gradient(90deg,#000_0%,#000_72%,transparent_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_38%,rgba(72,225,216,0.1),transparent_27%)]" />
          </div>
          <DialogClose asChild>
            <Button
              className="onboard-close-enter absolute top-4 right-4 z-20 rounded-full border border-white/10 bg-black/35! text-white/70 backdrop-blur-md hover:bg-white/10! hover:text-white"
              variant="ghost"
              size="icon-sm"
              aria-label={t.desktop.onboard.closeAria}
            >
              <XIcon className="size-3" />
            </Button>
          </DialogClose>

          <header className="absolute top-[8%] right-[5%] left-[5%] z-10">
            <div className="onboard-copy-enter onboard-copy-enter-1 mb-5 flex items-center gap-3 text-[0.625rem] font-medium tracking-[0.28em] text-cyan-100/60 uppercase">
              <span className="h-px w-8 bg-cyan-200/55" />
              {t.desktop.onboard.agentWorkbench}
            </div>
            <h1 className="font-heading tracking-[-0.055em] text-balance">
              <span className="onboard-copy-enter onboard-copy-enter-2 block text-[clamp(2.1rem,4.1vw,3.25rem)] leading-none font-thin text-white/72">
                {t.desktop.onboard.welcomeTo}
              </span>
              <span className="onboard-copy-enter onboard-copy-enter-3 mt-1 block w-fit bg-[linear-gradient(103deg,#f2fbf9_4%,#83e5e5_56%,#ff9b86_108%)] bg-clip-text pr-[0.12em] text-[clamp(4.25rem,7.7vw,6.1rem)] leading-[0.9] font-normal tracking-[-0.075em] text-transparent">
                LLM Space
              </span>
            </h1>
            <p className="onboard-copy-enter onboard-copy-enter-4 mt-5 max-w-md text-sm/6 font-normal tracking-[0.01em] text-white/58">
              {t.desktop.onboard.tagline}
            </p>
          </header>

          <div className="absolute right-[5%] bottom-[6%] left-[5%] z-10 grid grid-cols-[minmax(0,1fr)_22rem] items-end gap-8">
            <div className="flex shrink-0 flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                {models.length === 0 ? (
                  <Button
                    className="onboard-action-enter onboard-action-enter-1 h-10 rounded-full border border-cyan-100/35 bg-cyan-100! px-5 text-[#071011] shadow-[0_12px_38px_rgba(67,220,223,0.18)] hover:bg-white!"
                    size="lg"
                    onClick={handleConfigureModels}
                  >
                    <SettingsIcon className="size-3" />
                    {t.desktop.onboard.configureModels}
                  </Button>
                ) : (
                  <DialogClose asChild>
                    <Button
                      className="onboard-action-enter onboard-action-enter-1 h-10 rounded-full border border-cyan-100/35 bg-cyan-100! px-5 text-[#071011] shadow-[0_12px_38px_rgba(67,220,223,0.18)] hover:bg-white!"
                      size="lg"
                    >
                      {t.desktop.onboard.getStarted}
                      <ArrowRightIcon className="size-3.5" />
                    </Button>
                  </DialogClose>
                )}
                <Button
                  className="onboard-action-enter onboard-action-enter-2 h-10 rounded-full border border-white/15 bg-white/[0.055]! px-5 text-white/82 backdrop-blur-md hover:bg-white/10! hover:text-white"
                  variant="outline"
                  size="lg"
                  onClick={handleLearnMore}
                >
                  {t.common.learnMore}
                </Button>
              </div>
              <div className="onboard-action-enter onboard-action-enter-3 text-[0.6875rem] text-white/42">
                {t.desktop.onboard.usagePrefix}
                <button
                  type="button"
                  className="underline decoration-white/25 underline-offset-2 transition-colors hover:text-white/85"
                  onClick={handleOpenAnalyticsSettings}
                >
                  {t.desktop.onboard.manageInSettings}
                </button>
              </div>
            </div>
            <_OnboardSetupPanel
              className="onboard-panel-enter w-[22rem] shrink-0"
              configured={models.length > 0}
              readyProviderName={readyProviderName}
              detectedProviders={detectedProviders}
              recommendedProviders={recommendedProviders}
              loading={builtinProviders === null && models.length === 0}
              loadError={loadError}
              addingProviderId={addingProviderId}
              onAddProvider={handleAddProvider}
              onConfigureModels={handleConfigureModels}
              onReady={handleReady}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ONBOARDING_PROVIDER_ORDER = [
  "openai-codex",
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "ark",
];

const ONBOARDING_RECOMMENDED_PROVIDER_IDS = new Set([
  "openai",
  "anthropic",
  "google",
]);

/** Sort discovered providers so the lowest-friction local options appear first. */
function _sortProviderForOnboarding(
  a: ModelProviderGroup,
  b: ModelProviderGroup
): number {
  const rankA = ONBOARDING_PROVIDER_ORDER.indexOf(a.id);
  const rankB = ONBOARDING_PROVIDER_ORDER.indexOf(b.id);
  const normalizedA = rankA === -1 ? ONBOARDING_PROVIDER_ORDER.length : rankA;
  const normalizedB = rankB === -1 ? ONBOARDING_PROVIDER_ORDER.length : rankB;
  return normalizedA - normalizedB || a.name.localeCompare(b.name);
}

function _OnboardSetupPanel({
  className,
  configured,
  readyProviderName,
  detectedProviders,
  recommendedProviders,
  loading,
  loadError,
  addingProviderId,
  onAddProvider,
  onConfigureModels,
  onReady,
}: {
  className?: string;
  configured: boolean;
  readyProviderName: string | null;
  detectedProviders: ModelProviderGroup[];
  recommendedProviders: ModelProviderGroup[];
  loading: boolean;
  loadError: string | null;
  addingProviderId: string | null;
  onAddProvider: (provider: ModelProviderGroup) => void;
  onConfigureModels: () => void;
  onReady: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "rounded-[1.25rem] border border-white/12 bg-[#061012]/62 p-4 text-white shadow-[0_24px_70px_rgba(0,0,0,0.45)] backdrop-blur-sm",
        className
      )}
    >
      {configured ? (
        <_ReadySetupState providerName={readyProviderName} onReady={onReady} />
      ) : loading ? (
        <_LoadingSetupState />
      ) : loadError ? (
        <_ManualSetupState
          title={t.desktop.onboard.providerCheckFailedTitle}
          description={loadError}
          recommendedProviders={[]}
          onConfigureModels={onConfigureModels}
        />
      ) : detectedProviders.length > 0 ? (
        <_DetectedSetupState
          providers={detectedProviders.slice(0, 3)}
          addingProviderId={addingProviderId}
          onAddProvider={onAddProvider}
        />
      ) : (
        <_ManualSetupState
          title={t.desktop.onboard.noProviderFound}
          description={t.desktop.onboard.addProviderHint}
          recommendedProviders={recommendedProviders}
          onConfigureModels={onConfigureModels}
        />
      )}
    </div>
  );
}

function _LoadingSetupState() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <Spinner className="size-4 text-white/80" />
      <div className="min-w-0">
        <div className="text-sm font-medium">
          {t.desktop.onboard.checkingProviders}
        </div>
        <div className="text-xs text-white/65">
          {t.desktop.onboard.checkingProvidersHint}
        </div>
      </div>
    </div>
  );
}

function _ReadySetupState({
  providerName,
  onReady,
}: {
  providerName: string | null;
  onReady?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex cursor-pointer items-start gap-3" onClick={onReady}>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/18 text-emerald-200">
        <CheckIcon className="size-4" />
      </div>
      <div className="min-w-0 grow">
        <div className="text-sm font-medium">
          {t.desktop.onboard.readyToRun}
        </div>
        <div className="text-xs text-white/65">
          {providerName
            ? formatString(t.desktop.onboard.providerConfigured, {
                name: providerName,
              })
            : t.desktop.onboard.aProviderConfigured}
        </div>
      </div>
    </div>
  );
}

function _DetectedSetupState({
  providers,
  addingProviderId,
  onAddProvider,
}: {
  providers: ModelProviderGroup[];
  addingProviderId: string | null;
  onAddProvider: (provider: ModelProviderGroup) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-sm font-medium">
          {providers.length === 1
            ? t.desktop.onboard.providerDetected.one
            : t.desktop.onboard.providerDetected.other}
        </div>
        <div className="text-xs text-white/65">
          {providers.length === 1
            ? t.desktop.onboard.providerDetectedDescription.one
            : t.desktop.onboard.providerDetectedDescription.other}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {providers.map((provider) => {
          const adding = addingProviderId === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-white/12 bg-white/[0.055] p-2.5 text-left transition-colors hover:border-cyan-100/25 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-100/45 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
              disabled={Boolean(addingProviderId)}
              aria-label={formatString(t.desktop.onboard.addDetectedProvider, {
                name: provider.name,
              })}
              onClick={() => onAddProvider(provider)}
            >
              <ProviderAvatar
                id={provider.id}
                name={provider.name}
                icon={provider.icon}
                className="shrink-0"
              />
              <span className="min-w-0 grow">
                <span className="block truncate text-sm font-medium">
                  {provider.name}
                </span>
                <span className="block text-xs text-white/60">
                  {t.desktop.onboard.detectedLocally}
                </span>
              </span>
              {adding ? (
                <Spinner className="size-3.5 shrink-0 text-white/80" />
              ) : (
                <ArrowRightIcon className="size-3.5 shrink-0 text-white/70" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function _ManualSetupState({
  title,
  description,
  recommendedProviders,
  onConfigureModels,
}: {
  title: string;
  description: string;
  recommendedProviders: ModelProviderGroup[];
  onConfigureModels: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/75">
          <CircleAlertIcon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-white/65">{description}</div>
        </div>
      </div>
      {recommendedProviders.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium text-white/80">
            {t.desktop.onboard.recommendedSetup}
          </div>
          {recommendedProviders.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-white/12 bg-white/[0.055] p-2.5 text-left transition-colors hover:border-cyan-100/25 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-100/45 focus-visible:outline-none"
              aria-label={formatString(
                t.desktop.onboard.openModelSettingsFor,
                { name: provider.name }
              )}
              onClick={onConfigureModels}
            >
              <ProviderAvatar
                id={provider.id}
                name={provider.name}
                icon={provider.icon}
                className="shrink-0"
              />
              <span className="min-w-0 grow">
                <span className="block truncate text-sm font-medium">
                  {provider.name}
                </span>
                <span className="block text-xs text-white/60">
                  {t.desktop.onboard.setUpInSettings}
                </span>
              </span>
              <ArrowRightIcon className="size-3.5 shrink-0 text-white/70" />
            </button>
          ))}
        </div>
      )}
      <Button
        className="h-9 w-full rounded-xl border border-white/15 bg-white/[0.055]! backdrop-blur-xs hover:bg-white/10!"
        variant="outline"
        onClick={onConfigureModels}
      >
        <SettingsIcon className="size-3.5" />
        {t.desktop.onboard.openModelSettings}
      </Button>
    </div>
  );
}

"use client";

import type { ModelProviderGroup } from "@llm-space/core";
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
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import {
  useAddProvider,
  useFetchBuiltinProviders,
  useModels,
} from "./model-provider";
import { ProviderAvatar } from "./thread-playground/provider-avatar";
import { Button } from "./ui/button";
import { RainbowButton } from "./ui/rainbow-button";
import { Spinner } from "./ui/spinner";

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
        setLoadError(PROVIDER_DISCOVERY_ERROR_MESSAGE);
        setBuiltinProviders([]);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchBuiltinProviders, models.length, open]);

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
        toast.success(`${provider.name} is ready`);
      } catch {
        toast.error("Could not add provider", {
          description: ADD_PROVIDER_ERROR_MESSAGE,
        });
      } finally {
        setAddingProviderId(null);
      }
    },
    [addProvider]
  );

  const readyProviderName =
    addedProviderName ?? models[0]?.name ?? models[0]?.id ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-full max-w-[820px]! overflow-hidden p-0"
        showCloseButton={false}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
      >
        <div className="relative">
          <img
            src="/images/onboard.png"
            alt="Onboard"
            className="w-full rounded-lg"
          />
          <DialogClose asChild>
            <Button
              className="bg-muted/75 hover:bg-muted/85! text-foreground/80 absolute top-2 right-2 rounded-full"
              variant="ghost"
              size="icon-sm"
              aria-label="Close onboarding"
            >
              <XIcon className="size-3" />
            </Button>
          </DialogClose>
          <div className="absolute right-6 bottom-6 left-6 flex flex-col gap-3 md:right-8 md:bottom-8 md:left-12 md:flex-row md:items-end md:justify-between">
            <div className="flex shrink-0 flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-4">
                {models.length === 0 ? (
                  <Button
                    className="border-ring/75 h-11 rounded-2xl border bg-white/10! px-6 backdrop-blur-xs"
                    variant="outline"
                    size="lg"
                    onClick={handleConfigureModels}
                  >
                    <SettingsIcon className="size-3" />
                    Configure models
                  </Button>
                ) : (
                  <DialogClose asChild>
                    <RainbowButton
                      variant="outline"
                      className="dark:bg-[red]!"
                      size="lg"
                    >
                      Get started
                      <ArrowRightIcon className="size-3.5" />
                    </RainbowButton>
                  </DialogClose>
                )}
                <Button
                  className="h-11 rounded-2xl border border-white/20 bg-white/10! px-8 backdrop-blur-xs"
                  variant="outline"
                  size="lg"
                  onClick={handleLearnMore}
                >
                  Learn more
                </Button>
              </div>
              <div className="text-xs text-white/65">
                We collect anonymous usage data to improve the app.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2 transition-colors hover:text-white/90"
                  onClick={handleOpenAnalyticsSettings}
                >
                  Manage in settings
                </button>
              </div>
            </div>
            <_OnboardSetupPanel
              className="w-full md:w-[22rem] md:shrink-0"
              configured={models.length > 0}
              readyProviderName={readyProviderName}
              detectedProviders={detectedProviders}
              recommendedProviders={recommendedProviders}
              loading={builtinProviders === null && models.length === 0}
              loadError={loadError}
              addingProviderId={addingProviderId}
              onAddProvider={handleAddProvider}
              onConfigureModels={handleConfigureModels}
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

const PROVIDER_DISCOVERY_ERROR_MESSAGE =
  "Provider check did not finish. Open model settings to continue.";

const ADD_PROVIDER_ERROR_MESSAGE = "Open model settings and try again.";

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
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/15 bg-black/45 p-3.5 text-white shadow-2xl backdrop-blur-md",
        className
      )}
    >
      {configured ? (
        <_ReadySetupState providerName={readyProviderName} />
      ) : loading ? (
        <_LoadingSetupState />
      ) : loadError ? (
        <_ManualSetupState
          title="Provider check failed"
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
          title="No local provider found"
          description="Add a provider in settings to choose a model."
          recommendedProviders={recommendedProviders}
          onConfigureModels={onConfigureModels}
        />
      )}
    </div>
  );
}

function _LoadingSetupState() {
  return (
    <div className="flex items-center gap-3">
      <Spinner className="size-4 text-white/80" />
      <div className="min-w-0">
        <div className="text-sm font-medium">Checking local providers</div>
        <div className="text-xs text-white/65">
          Looking for credentials already available on this computer.
        </div>
      </div>
    </div>
  );
}

function _ReadySetupState({ providerName }: { providerName: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/18 text-emerald-200">
        <CheckIcon className="size-4" />
      </div>
      <div className="min-w-0 grow">
        <div className="text-sm font-medium">Ready to run</div>
        <div className="text-xs text-white/65">
          {providerName
            ? `${providerName} is configured for this workspace.`
            : "A provider is configured for this workspace."}
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
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-sm font-medium">Provider detected</div>
        <div className="text-xs text-white/65">
          Add one detected provider to get started.
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {providers.map((provider) => {
          const adding = addingProviderId === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-2.5 text-left transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
              disabled={Boolean(addingProviderId)}
              aria-label={`Add detected provider ${provider.name}`}
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
                  Detected locally
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
            Recommended setup
          </div>
          {recommendedProviders.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-white/15 bg-white/10 p-2.5 text-left transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
              aria-label={`Open model settings to configure ${provider.name}`}
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
                  Set up in model settings
                </span>
              </span>
              <ArrowRightIcon className="size-3.5 shrink-0 text-white/70" />
            </button>
          ))}
        </div>
      )}
      <Button
        className="h-9 w-full rounded-xl border border-white/20 bg-white/10! backdrop-blur-xs"
        variant="outline"
        onClick={onConfigureModels}
      >
        <SettingsIcon className="size-3.5" />
        Open model settings
      </Button>
    </div>
  );
}

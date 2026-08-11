"use client";

import {
  formatProviderProfileLabel,
  getArkImageModelDefinitions,
  type ArkImageGenerationConfig,
  type CustomModel,
  type ModelProviderGroup,
  type ProviderProfile,
  type SeedreamImageModelDefinition,
} from "@llm-space/core";
import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { Link } from "@llm-space/ui/components/link";
import {
  useAddCustomProvider,
  useAddProvider,
  useAddProviderProfile,
  useFetchBuiltinProviders,
  useModels,
  useRemoveCustomModel,
  useRemoveProvider,
  useRemoveProviderProfile,
  useSetAllModelsEnabled,
  useSetModelEnabled,
  useTestModelConnection,
  useUpdateProvider,
  useUpdateProviderProfile,
} from "@llm-space/ui/components/model-provider";
import { ModelAvatar } from "@llm-space/ui/components/thread-playground/model-avatar";
import { ProviderAvatar } from "@llm-space/ui/components/thread-playground/provider-avatar";
import { Tooltip } from "@llm-space/ui/components/tooltip";
import { useAutoAnimation } from "@llm-space/ui/lib/use-auto-animation";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@llm-space/ui/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@llm-space/ui/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@llm-space/ui/ui/dropdown-menu";
import { Input } from "@llm-space/ui/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@llm-space/ui/ui/item";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@llm-space/ui/ui/popover";
import { ScrollArea } from "@llm-space/ui/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@llm-space/ui/ui/select";
import { Spinner } from "@llm-space/ui/ui/spinner";
import { Switch } from "@llm-space/ui/ui/switch";
import {
  Ban,
  CableIcon,
  Check,
  CheckCheck,
  ChevronRight,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ApiKeyField } from "./api-key-field";
import {
  CUSTOM_PROVIDER_API_TYPES,
  DEFAULT_CUSTOM_PROVIDER_API,
  type CustomProviderApi,
} from "./custom-provider-api";
import { ImageModelEditorDialog } from "./image-model-editor-dialog";
import { ModelEditorDialog } from "./model-editor-dialog";
import { SettingsPage } from "./settings-page";

/**
 * Base-URL guidance for the Anthropic Messages API. Its SDK appends `/v1/...`
 * to the base URL itself, so — unlike the OpenAI-style APIs, whose SDKs expect
 * the `/v1` to be part of the base URL — a `/v1` suffix here would double up
 * into `/v1/v1/...` on every request.
 */
const ANTHROPIC_BASE_URL_HINT =
  "The Anthropic SDK adds /v1 to the request path itself, so enter the URL without a /v1 suffix.";

function sortProviders(providers: ModelProviderGroup[]): ModelProviderGroup[] {
  return [...providers].sort((a, b) => a.name.localeCompare(b.name));
}

export function ModelsPage() {
  const providers = useModels();
  const firstProviderId = useMemo(
    () => sortProviders(providers)[0]?.id ?? null,
    [providers]
  );
  const [selectedId, setSelectedId] = useState<string | null>(firstProviderId);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (
      !selectedId ||
      !providers.some((provider) => provider.id === selectedId)
    ) {
      setSelectedId(firstProviderId);
      setSelectedProfileId(null);
    }
  }, [firstProviderId, providers, selectedId]);

  const selected =
    providers.find((provider) => provider.id === selectedId) ?? null;

  useEffect(() => {
    if (
      selectedProfileId &&
      !selected?.profiles.some((profile) => profile.id === selectedProfileId)
    ) {
      setSelectedProfileId(null);
    }
  }, [selected, selectedProfileId]);

  const selectProvider = (id: string) => {
    setSelectedId(id);
    setSelectedProfileId(null);
  };

  const selectProfile = (providerId: string, profileId: string) => {
    setSelectedId(providerId);
    setSelectedProfileId(profileId);
  };

  return (
    <SettingsPage
      className="flex size-full min-h-0"
      title="Models"
      description="LLM Space supports various model providers and their custom models, from OpenAI, Anthropic and Google compatible to Codex."
    >
      <ProviderList
        providers={providers}
        selectedId={selectedId}
        selectedProfileId={selectedProfileId}
        onSelectProvider={selectProvider}
        onSelectProfile={selectProfile}
        onAdd={selectProvider}
      />
      <ProviderEditor
        key={selected?.id}
        provider={selected}
        selectedProfileId={selectedProfileId}
        onSelectProfile={(profileId) => {
          if (selected) selectProfile(selected.id, profileId);
        }}
      />
    </SettingsPage>
  );
}

function ProviderList({
  providers,
  selectedId,
  selectedProfileId,
  onSelectProvider,
  onSelectProfile,
  onAdd,
}: {
  providers: ModelProviderGroup[];
  selectedId: string | null;
  selectedProfileId: string | null;
  onSelectProvider: (id: string) => void;
  onSelectProfile: (providerId: string, profileId: string) => void;
  onAdd: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [listRef] = useAutoAnimation<HTMLDivElement>();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? providers.filter((provider) => provider.name.toLowerCase().includes(q))
      : providers;
    return sortProviders(matched);
  }, [providers, query]);

  return (
    <div className="flex w-64 shrink-0 flex-col gap-3 border-r pr-4">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        PROVIDERS
      </span>

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
        <Input
          className="h-8 pl-7"
          aria-label="Search providers"
          placeholder="Search providers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <ScrollArea className="min-h-0 grow">
        {providers.length === 0 ? (
          <div className="text-muted-foreground px-2 py-6 text-center text-xs text-balance">
            No providers yet. Click the &quot;Add provider&quot; button below to
            get started.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-muted-foreground px-2 py-6 text-center text-xs text-balance">
            No provider matches &quot;{query.trim()}&quot;.
          </div>
        ) : (
          <div ref={listRef} className="flex flex-col gap-1 pr-2">
            {filtered.map((provider) => (
              <ProviderListItem
                key={provider.id}
                provider={provider}
                selected={
                  provider.id === selectedId && selectedProfileId === null
                }
                activeProfileId={
                  provider.id === selectedId ? selectedProfileId : null
                }
                onSelect={() => onSelectProvider(provider.id)}
                onSelectProfile={(profileId) =>
                  onSelectProfile(provider.id, profileId)
                }
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <AddProviderMenu onAdd={onAdd} />
    </div>
  );
}

/**
 * Recommended builtin providers, shown in their own menu group. The `google`
 * provider backs Gemini.
 */
const RECOMMENDED_PROVIDER_IDS = new Set([
  "ark",
  "ark-agent-plan",
  "ark-coding-plan",
  "openai",
  "anthropic",
  "google",
  "deepseek",
]);

/**
 * The "Add provider" upward menu. Lists every builtin provider, split into
 * priority groups: Discovered (an API key was detected and it isn't configured
 * yet), Recommended, then Built-in. Each provider lands in the highest group it
 * qualifies for; empty groups are omitted. Already-configured providers are
 * checked.
 */
function AddProviderMenu({ onAdd }: { onAdd: (id: string) => void }) {
  const configured = useModels();
  const addProvider = useAddProvider();
  const addCustomProvider = useAddCustomProvider();
  const fetchBuiltins = useFetchBuiltinProviders();
  const [open, setOpen] = useState(false);
  const [builtins, setBuiltins] = useState<ModelProviderGroup[] | null>(null);

  const configuredIds = useMemo(
    () => new Set(configured.map((provider) => provider.id)),
    [configured]
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      void fetchBuiltins()
        .then(setBuiltins)
        .catch((error) => console.error("Failed to load providers", error));
    }
  };

  const groups = useMemo(() => {
    const discovered: ModelProviderGroup[] = [];
    const recommended: ModelProviderGroup[] = [];
    const rest: ModelProviderGroup[] = [];
    for (const provider of builtins ?? []) {
      // Only offer providers that haven't been added yet.
      if (configuredIds.has(provider.id)) {
        continue;
      }
      if (provider.apiKeyDetected) {
        discovered.push(provider);
      } else if (RECOMMENDED_PROVIDER_IDS.has(provider.id)) {
        recommended.push(provider);
      } else {
        rest.push(provider);
      }
    }
    const discoveredCount = discovered.length;
    const groups = [];
    if (discoveredCount > 0) {
      groups.push({
        id: "discovered",
        label: (
          <div className="flex flex-col gap-2">
            <div className="text-foreground text-xs font-medium">
              Discovered
            </div>
            <div className="flex gap-1 pl-1">
              {discoveredCount}{" "}
              {discoveredCount === 1 ? "provider" : "providers"} discovered in
              your environment
            </div>
          </div>
        ),
        items: discovered,
      });
    }
    if (recommended.length > 0) {
      groups.push({
        id: "recommended",
        label: "Recommended",
        items: recommended,
      });
    }
    if (rest.length > 0) {
      groups.push({ id: "built-in", label: "Built-in", items: rest });
    }
    return groups;
  }, [builtins, configuredIds]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full">
          <Plus />
          Add provider
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search providers..." />
          <CommandList className="max-h-72">
            <CommandEmpty>No providers found.</CommandEmpty>
            <CommandGroup heading="Customized">
              <CommandItem
                value="Add custom provider"
                onSelect={() => {
                  setOpen(false);
                  void addCustomProvider("Custom provider", "").then(onAdd);
                }}
              >
                <ProviderAvatar id="custom-provider" name="Custom provider" />
                <span className="line-clamp-1 grow">Add custom provider</span>
              </CommandItem>
            </CommandGroup>
            {groups.map((group) => (
              <Fragment key={group.id}>
                <CommandSeparator />
                <CommandGroup heading={group.label}>
                  {group.items.map((provider) => (
                    <CommandItem
                      key={provider.id}
                      value={`${provider.name} ${provider.id}`}
                      onSelect={() => {
                        setOpen(false);
                        void addProvider(provider.id).then(() =>
                          onAdd(provider.id)
                        );
                      }}
                    >
                      <ProviderAvatar
                        id={provider.id}
                        name={provider.name}
                        icon={provider.icon}
                      />
                      <span className="line-clamp-1 grow">{provider.name}</span>
                      {provider.websiteURL && (
                        <Link
                          href={provider.websiteURL}
                          aria-label={`Open ${provider.name} website`}
                          className="text-muted-foreground/80 hover:text-foreground shrink-0"
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <ExternalLink className="size-2.5" />
                        </Link>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Fragment>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ProviderListItem({
  provider,
  selected,
  activeProfileId,
  onSelect,
  onSelectProfile,
}: {
  provider: ModelProviderGroup;
  selected: boolean;
  activeProfileId: string | null;
  onSelect: () => void;
  onSelectProfile: (profileId: string) => void;
}) {
  const removeProvider = useRemoveProvider();
  const addProviderProfile = useAddProviderProfile();
  const removeProviderProfile = useRemoveProviderProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expanded, setExpanded] = useState(provider.profiles.length > 1);
  const [profilePendingRemoval, setProfilePendingRemoval] =
    useState<ProviderProfile | null>(null);

  useEffect(() => {
    if (activeProfileId) setExpanded(true);
  }, [activeProfileId]);

  const handleAddProfile = async () => {
    try {
      const profileId = await addProviderProfile(provider.id);
      setExpanded(true);
      onSelectProfile(profileId);
    } catch (error) {
      toast.error("Failed to add connection profile", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const handleRemoveProfile = async (profile: ProviderProfile) => {
    try {
      await removeProviderProfile(provider.id, profile.id);
      if (activeProfileId === profile.id) {
        onSelect();
      }
    } catch (error) {
      toast.error("Failed to remove connection profile", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const handleGroupClick = () => {
    if (selected && provider.profiles.length > 1) {
      setExpanded((value) => !value);
      return;
    }
    onSelect();
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Select ${provider.name} provider`}
        aria-expanded={
          provider.profiles.length > 1 ? expanded : undefined
        }
        onClick={handleGroupClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleGroupClick();
          }
        }}
        className={cn(
          "group flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors",
          selected ? "bg-muted font-medium" : "hover:bg-muted/50"
        )}
      >
        <ProviderAvatar
          id={provider.id}
          name={provider.name}
          icon={provider.icon}
        />
        <span className="min-w-0 truncate">{provider.name}</span>
        {provider.profiles.length > 1 ? (
          <button
            type="button"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${provider.name} profiles`}
            className="text-muted-foreground hover:text-foreground inline-flex size-4 shrink-0 items-center justify-center rounded"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((value) => !value);
            }}
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                expanded && "rotate-90"
              )}
            />
          </button>
        ) : null}

        {!provider.readOnly ? (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                aria-label={`${provider.name} provider actions`}
                title={`${provider.name} provider actions`}
                className={cn(
                  "text-muted-foreground hover:bg-accent hover:text-foreground ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded",
                  menuOpen
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem onSelect={() => void handleAddProfile()}>
                <Plus />
                Add connection profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmOpen(true)}
              >
                <Trash2 />
                Remove {provider.name}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="text-muted-foreground ml-auto text-[10px] uppercase">
            Plugin
          </span>
        )}
      </div>

      {provider.profiles.length > 1 && expanded ? (
        <div className="mt-0.5 flex flex-col gap-0.5 pl-7">
          {provider.profiles.slice(1).map((profile, index) => {
            const profileSelected = profile.id === activeProfileId;
            return (
              <div
                key={profile.id}
                className={cn(
                  "group/profile flex items-center rounded-md text-xs transition-colors",
                  profileSelected ? "bg-muted font-medium" : "hover:bg-muted/50"
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 grow items-center gap-2 px-2 py-1.5 text-left"
                  onClick={() => onSelectProfile(profile.id)}
                >
                  <CableIcon
                    aria-hidden="true"
                    className="text-muted-foreground size-4 shrink-0"
                  />
                  <span className="truncate">
                    {formatProviderProfileLabel(profile, index + 1)}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${profile.name} profile actions`}
                      className="text-muted-foreground hover:text-foreground mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded opacity-0 hover:bg-accent group-hover/profile:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setProfilePendingRemoval(profile)}
                    >
                      <Trash2 />
                      Remove {profile.name}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      ) : null}

      {!provider.readOnly ? (
        <>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={`Remove ${provider.name}?`}
            description={`This removes ${provider.name} from your configured providers. You can add it back later.`}
            confirmLabel="Remove"
            dimBackground={false}
            onConfirm={() => {
              setConfirmOpen(false);
              void removeProvider(provider.id);
            }}
          />
          <ConfirmDialog
            open={profilePendingRemoval !== null}
            onOpenChange={(open) => {
              if (!open) setProfilePendingRemoval(null);
            }}
            title={`Remove ${profilePendingRemoval?.name ?? "profile"}?`}
            description="This removes the connection profile and its credentials. This action cannot be undone."
            confirmLabel="Remove"
            dimBackground={false}
            onConfirm={() => {
              if (profilePendingRemoval) {
                void handleRemoveProfile(profilePendingRemoval);
              }
              setProfilePendingRemoval(null);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function ProviderEditor({
  provider,
  selectedProfileId,
  onSelectProfile,
}: {
  provider: ModelProviderGroup | null;
  selectedProfileId: string | null;
  onSelectProfile: (profileId: string) => void;
}) {
  const updateProvider = useUpdateProvider();
  const addProviderProfile = useAddProviderProfile();
  const setModelEnabled = useSetModelEnabled();
  const setAllModelsEnabled = useSetAllModelsEnabled();
  const [iconDraft, setIconDraft] = useState(provider?.icon ?? "");
  const [modelView, setModelView] = useState<"all" | "enabled" | "disabled">(
    "all"
  );
  const [apiValue, setApiValue] = useState<CustomProviderApi>(
    DEFAULT_CUSTOM_PROVIDER_API
  );
  const [modelListRef] = useAutoAnimation<HTMLDivElement>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [profileCreating, setProfileCreating] = useState(false);
  // The custom model being edited, or `null` for a fresh create.
  const [editingModel, setEditingModel] = useState<CustomModel | null>(null);

  const openCreateModel = () => {
    setEditingModel(null);
    setEditorOpen(true);
  };

  const openEditModel = (model: CustomModel) => {
    setEditingModel(model);
    setEditorOpen(true);
  };

  const disabledModels = useMemo(
    () => new Set(provider?.disabledModels ?? []),
    [provider]
  );

  const customModels = useMemo(
    () => new Set(provider?.customModels ?? []),
    [provider]
  );

  useEffect(() => {
    setApiValue(provider?.api ?? DEFAULT_CUSTOM_PROVIDER_API);
  }, [provider?.api, provider?.id]);

  const handleNameBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (!provider) return;
    const value = event.target.value.trim();
    if (value === "" || value === provider.name) {
      return;
    }
    void updateProvider(provider.id, { name: value });
  };

  const handleApiChange = (api: CustomProviderApi) => {
    if (!provider) {
      return;
    }
    const previous = apiValue;
    setApiValue(api);
    if (api === previous) {
      return;
    }
    void updateProvider(provider.id, { api }).catch((error) => {
      setApiValue(previous);
      toast.error("Failed to update API type", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    });
  };

  // Persist the icon override on blur when changed. Empty ⇒ auto-resolve.
  const handleIconBlur = () => {
    if (!provider) return;
    const value = iconDraft.trim();
    const next = value === "" ? null : value;
    const current = provider.icon ?? null;
    if (next !== current) {
      void updateProvider(provider.id, { icon: next });
    }
  };

  const handleAddCustomProfile = async () => {
    if (!provider || profileCreating) return;
    setProfileCreating(true);
    try {
      const profileId = await addProviderProfile(provider.id);
      onSelectProfile(profileId);
    } catch (error) {
      toast.error("Failed to add custom profile", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setProfileCreating(false);
    }
  };

  if (!provider) {
    return (
      <div className="text-muted-foreground flex min-w-0 grow items-center justify-center text-sm">
        Select or add a provider from the left sidebar
      </div>
    );
  }

  if (provider.readOnly) {
    return (
      <div className="flex min-w-0 grow flex-col overflow-auto px-6 py-4">
        <div className="flex items-center gap-2">
          <h3 className="font-heading text-lg font-medium">{provider.name}</h3>
          <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] uppercase">
            Plugin · Read only
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{provider.id}</p>
        <div className="mt-5 space-y-2">
          {provider.models.map((model) => (
            <div key={model.id} className="rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">{model.name}</div>
              <div className="text-muted-foreground font-mono text-xs">
                {model.id}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalModels = provider.models.length;
  const enabledModels = provider.models.filter(
    (model) => !disabledModels.has(model.id)
  ).length;
  const isBuiltin = provider.builtin === true;
  const selectedProfile =
    provider.profiles.find((profile) => profile.id === selectedProfileId) ??
    provider.profiles[0];
  const selectedProfileIndex = provider.profiles.findIndex(
    (profile) => profile.id === selectedProfile.id
  );
  const isOfficialProfile = isBuiltin && selectedProfileIndex === 0;
  const canManageModels = selectedProfileIndex === 0;
  const visibleModels = provider.models.filter((model) => {
    if (modelView === "enabled") return !disabledModels.has(model.id);
    if (modelView === "disabled") return disabledModels.has(model.id);
    return true;
  });

  // Which base-URL convention applies (see ANTHROPIC_BASE_URL_HINT): builtin
  // providers are recognized by their models' API; custom providers follow the
  // live API type selection.
  const usesAnthropicApi = isBuiltin
    ? provider.models.some((model) => model.api === "anthropic-messages")
    : apiValue === "anthropic-messages";
  return (
    <div className="flex min-w-0 grow flex-col">
      <ScrollArea className="min-h-0 grow">
        <div className="flex flex-col gap-6 pr-4 pl-6">
          <div className="flex items-center gap-2">
            {isBuiltin && provider.websiteLink ? (
              <Tooltip content={`Learn more about ${provider.name}`}>
                <Link
                  href={provider.websiteLink}
                  aria-label={`Open ${provider.name} website`}
                  className="group/provider-link text-foreground hover:text-foreground flex items-center gap-2"
                >
                  <h3 className="font-heading text-lg font-medium">
                    {provider.name}
                  </h3>
                  <ExternalLink className="text-muted-foreground group-hover/provider-link:text-foreground size-4 transition-colors" />
                </Link>
              </Tooltip>
            ) : (
              <h3 className="font-heading text-lg font-medium">
                {provider.name}
              </h3>
            )}
          </div>

          {!isBuiltin && (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Provider name</span>
                <Input
                  defaultValue={provider.name}
                  placeholder="Custom provider"
                  aria-label="Custom provider name"
                  onBlur={handleNameBlur}
                />
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">API type</span>
                <Select
                  value={apiValue}
                  onValueChange={(value) =>
                    handleApiChange(value as CustomProviderApi)
                  }
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label={`${provider.name} API type`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {CUSTOM_PROVIDER_API_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {!isBuiltin && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Icon</span>
              <div className="flex items-center gap-2">
                <ProviderAvatar
                  id={provider.id}
                  name={provider.name}
                  icon={iconDraft.trim() || undefined}
                />
                <Input
                  value={iconDraft}
                  placeholder="Auto (e.g. openai, anthropic, google)"
                  aria-label={`${provider.name} icon`}
                  onChange={(e) => setIconDraft(e.target.value)}
                  onBlur={handleIconBlur}
                />
              </div>
              <div className="text-muted-foreground text-xs">
                A{" "}
                <Link
                  href="https://icons.lobehub.com"
                  className="underline underline-offset-2"
                >
                  @lobehub/icons
                </Link>{" "}
                keyword. Leave blank to auto-resolve from the provider name.
              </div>
            </div>
          )}

          <Card size="sm">
            <CardHeader className="border-b">
              <CardTitle>
                {isOfficialProfile
                  ? "Official service"
                  : formatProviderProfileLabel(
                      selectedProfile,
                      selectedProfileIndex
                    )}
              </CardTitle>
              <CardDescription>
                {isOfficialProfile
                  ? `Connect directly to ${provider.name}. The official endpoint is used automatically.`
                  : "Custom profile for gateways, proxies, and compatible API endpoints."}
              </CardDescription>
            </CardHeader>
            <CardContent key={selectedProfile.id}>
              <_ProviderProfileEditor
                provider={provider}
                profile={selectedProfile}
                isOfficial={isOfficialProfile}
                usesAnthropicApi={usesAnthropicApi}
              />
            </CardContent>
            {isOfficialProfile ? (
              <CardFooter className="justify-between gap-4 border-t">
                <p className="text-muted-foreground text-xs">
                  Need a custom URL or request headers?
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={profileCreating}
                  onClick={() => void handleAddCustomProfile()}
                >
                  {profileCreating ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Plus data-icon="inline-start" />
                  )}
                  Add custom profile
                </Button>
              </CardFooter>
            ) : null}
          </Card>

          {canManageModels ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {provider.id === "ark" ? "Chat models" : "Models"}
                </span>
                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                  {enabledModels === totalModels
                    ? totalModels
                    : `${enabledModels}/${totalModels}`}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Tooltip content="Add custom model">
                    <button
                      type="button"
                      aria-label="Add custom model"
                      onClick={openCreateModel}
                      className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 items-center justify-center rounded transition-colors"
                    >
                      <Plus className="size-4" />
                    </button>
                  </Tooltip>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Model list actions for ${provider.name}`}
                        className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 items-center justify-center rounded transition-colors"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        onSelect={() =>
                          void setAllModelsEnabled(provider.id, false)
                        }
                      >
                        <Ban />
                        Disable All
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          void setAllModelsEnabled(provider.id, true)
                        }
                      >
                        <CheckCheck />
                        Enable All
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {(
                        [
                          ["enabled", "Show Enabled Only"],
                          ["disabled", "Show Disabled Only"],
                          ["all", "Show All"],
                        ] as const
                      ).map(([value, label]) => (
                        <DropdownMenuItem
                          key={value}
                          onSelect={() => setModelView(value)}
                        >
                          <Check
                            className={cn(
                              "size-3.5",
                              modelView !== value && "invisible"
                            )}
                          />
                          {label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div ref={modelListRef} className="flex flex-col gap-1.5">
                {visibleModels.length === 0 ? (
                  <div className="text-muted-foreground px-1 py-2 text-xs">
                    No models to show.
                  </div>
                ) : (
                  visibleModels.map((model) => (
                    <ModelListItem
                      key={model.id}
                      providerId={provider.id}
                      providerName={provider.name}
                      profileId={selectedProfile.id}
                      model={model}
                      enabled={!disabledModels.has(model.id)}
                      isCustom={customModels.has(model.id)}
                      onToggle={(next) =>
                        void setModelEnabled(provider.id, model.id, next)
                      }
                      onEdit={() => openEditModel(model)}
                    />
                  ))
                )}
              </div>
            </div>
          ) : null}

          {provider.id === "ark" && canManageModels ? (
            <_ArkImageGenerationEditor provider={provider} />
          ) : null}
        </div>
      </ScrollArea>

      <ModelEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        providerId={provider.id}
        profileId={selectedProfile.id}
        providerApi={isBuiltin ? undefined : apiValue}
        model={editingModel}
      />
    </div>
  );
}

function _ProviderProfileEditor({
  provider,
  profile,
  isOfficial,
  usesAnthropicApi,
}: {
  provider: ModelProviderGroup;
  profile: ProviderProfile;
  isOfficial: boolean;
  usesAnthropicApi: boolean;
}) {
  const updateProviderProfile = useUpdateProviderProfile();
  const baseUrlPlaceholder = usesAnthropicApi
    ? "https://api.example.com"
    : "https://api.example.com/v1";

  const update = (
    fields: Parameters<ReturnType<typeof useUpdateProviderProfile>>[2]
  ) => updateProviderProfile(provider.id, profile.id, fields);

  const handleNameBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const value = event.target.value.trim();
    if (!value || value === profile.name) {
      event.target.value = profile.name;
      return;
    }
    void update({ name: value }).catch((error) => {
      event.target.value = profile.name;
      toast.error("Failed to rename connection profile", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    });
  };

  const handleApiKeyBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const value = event.target.value.trim();
    const next = value === "" ? null : value;
    if (next !== (profile.apiKey ?? null)) {
      void update({ apiKey: next });
    }
  };

  const handleBaseUrlBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const value = event.target.value.trim();
    const next = value === "" ? null : value;
    if (next !== (profile.baseUrl ?? null)) {
      void update({ baseUrl: next });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {!isOfficial ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Profile name</span>
          <Input
            defaultValue={profile.name}
            placeholder="Profile name"
            aria-label={`${provider.name} profile name`}
            onBlur={handleNameBlur}
          />
        </div>
      ) : null}

      {provider.id !== "openai-codex" ? (
        <ApiKeyField
          label="API key"
          getKeyUrl={provider.websiteLink}
          defaultValue={profile.apiKey ?? ""}
          placeholder={`Input API Key for ${provider.name}.`}
          aria-label={`${profile.name} API key`}
          onBlur={handleApiKeyBlur}
          description={
            <div className="text-muted-foreground pl-5 text-xs">
              <div className="list-item">
                {
                  'Use "${ENV_NAME}" to reference environment variables. e.g. "$OPENAI_API_KEY"'
                }
              </div>
              {isOfficial ? (
                <div className="list-item">
                  Leave it blank to use the official {provider.name}{" "}
                  environment variable
                </div>
              ) : null}
            </div>
          }
        />
      ) : isOfficial ? (
        <p className="text-muted-foreground text-xs">
          OpenAI Codex uses your signed-in account. No API key is required.
        </p>
      ) : null}

      {!isOfficial ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Base URL</span>
          <Input
            required
            defaultValue={profile.baseUrl ?? ""}
            placeholder={baseUrlPlaceholder}
            aria-label={`${profile.name} base URL`}
            onBlur={handleBaseUrlBlur}
          />
          <div className="text-muted-foreground text-xs">
            Required for custom profiles.
            {usesAnthropicApi ? ` ${ANTHROPIC_BASE_URL_HINT}` : null}
          </div>
        </div>
      ) : null}

      {!isOfficial ? (
        <_ProviderHeadersEditor
          providerId={provider.id}
          providerName={provider.name}
          profile={profile}
        />
      ) : null}
    </div>
  );
}

/** Chat-model-parity inventory management for Ark image models. */
function _ArkImageGenerationEditor({
  provider,
}: {
  provider: ModelProviderGroup;
}) {
  const updateProvider = useUpdateProvider();
  const config = provider.imageGeneration ?? {};
  const models = getArkImageModelDefinitions(config);
  const disabledModels = new Set(config.disabledModels ?? []);
  const enabledModels = models.filter((model) => !disabledModels.has(model.id));
  const customModels = new Set((config.models ?? []).map((model) => model.id));
  const [modelView, setModelView] = useState<"all" | "enabled" | "disabled">(
    "all"
  );
  const [modelListRef] = useAutoAnimation<HTMLDivElement>();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingModel, setEditingModel] =
    useState<SeedreamImageModelDefinition | null>(null);

  const visibleModels = models.filter((model) => {
    if (modelView === "enabled") return !disabledModels.has(model.id);
    if (modelView === "disabled") return disabledModels.has(model.id);
    return true;
  });

  const update = (imageGeneration: ArkImageGenerationConfig) => {
    void updateProvider(provider.id, { imageGeneration }).catch((error) => {
      toast.error("Failed to update image generation", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    });
  };

  /** Enable or disable one image model without changing Thread tool bindings. */
  const handleModelEnabled = (modelId: string, enabled: boolean) => {
    const disabled = new Set(config.disabledModels ?? []);
    if (enabled) disabled.delete(modelId);
    else disabled.add(modelId);
    update({
      ...config,
      ...(disabled.size > 0
        ? { disabledModels: [...disabled] }
        : { disabledModels: undefined }),
    });
  };

  /** Apply the existing list-wide enable policy to every image model. */
  const handleAllModelsEnabled = (enabled: boolean) => {
    update({
      ...config,
      disabledModels: enabled ? undefined : models.map((model) => model.id),
    });
  };

  /** Add or replace a custom image model and preserve its disabled state. */
  const handleSaveCustomModel = (
    model: SeedreamImageModelDefinition,
    originalId?: string
  ) => {
    const custom = (config.models ?? []).filter(
      (candidate) => candidate.id !== (originalId ?? model.id)
    );
    const disabled = (config.disabledModels ?? []).map((modelId) =>
      originalId && modelId === originalId ? model.id : modelId
    );
    update({
      ...config,
      models: [...custom, model],
      ...(disabled.length > 0
        ? { disabledModels: disabled }
        : { disabledModels: undefined }),
    });
  };

  /** Remove one custom image model without repairing Thread tool bindings. */
  const handleDeleteCustomModel = (modelId: string) => {
    const custom = (config.models ?? []).filter(
      (candidate) => candidate.id !== modelId
    );
    const disabled = (config.disabledModels ?? []).filter(
      (candidate) => candidate !== modelId
    );
    update({
      ...config,
      models: custom.length > 0 ? custom : undefined,
      disabledModels: disabled.length > 0 ? disabled : undefined,
    });
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Image models</span>
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
            {enabledModels.length === models.length
              ? models.length
              : `${enabledModels.length}/${models.length}`}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Tooltip content="Add custom image model">
              <button
                type="button"
                aria-label="Add custom image model"
                onClick={() => {
                  setEditingModel(null);
                  setEditorOpen(true);
                }}
                className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 items-center justify-center rounded transition-colors"
              >
                <Plus className="size-4" />
              </button>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Image model list actions for ${provider.name}`}
                  className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 items-center justify-center rounded transition-colors"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onSelect={() => handleAllModelsEnabled(false)}
                >
                  <Ban />
                  Disable All
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleAllModelsEnabled(true)}>
                  <CheckCheck />
                  Enable All
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {(
                  [
                    ["enabled", "Show Enabled Only"],
                    ["disabled", "Show Disabled Only"],
                    ["all", "Show All"],
                  ] as const
                ).map(([value, label]) => (
                  <DropdownMenuItem
                    key={value}
                    onSelect={() => setModelView(value)}
                  >
                    <Check
                      className={cn(
                        "size-3.5",
                        modelView !== value && "invisible"
                      )}
                    />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div ref={modelListRef} className="flex flex-col gap-1.5">
          {visibleModels.length === 0 ? (
            <div className="text-muted-foreground px-1 py-2 text-xs">
              No image models to show.
            </div>
          ) : (
            visibleModels.map((model) => (
              <_ImageModelListItem
                key={model.id}
                providerName={provider.name}
                model={model}
                enabled={!disabledModels.has(model.id)}
                isCustom={customModels.has(model.id)}
                onToggle={(enabled) => handleModelEnabled(model.id, enabled)}
                onEdit={() => {
                  setEditingModel(model);
                  setEditorOpen(true);
                }}
                onDelete={() => handleDeleteCustomModel(model.id)}
              />
            ))
          )}
        </div>
      </div>

      <ImageModelEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        model={editingModel}
        existingIds={models.map((model) => model.id)}
        onSave={handleSaveCustomModel}
      />
    </>
  );
}

/** Image-model row matching the existing Chat model management interaction. */
function _ImageModelListItem({
  providerName,
  model,
  enabled,
  isCustom,
  onToggle,
  onEdit,
  onDelete,
}: {
  providerName: string;
  model: SeedreamImageModelDefinition;
  enabled: boolean;
  isCustom: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <Item variant="muted" size="sm" className="group">
      <ItemMedia>
        <ModelAvatar
          id={model.id}
          name={model.name}
          icon={model.icon}
          size={20}
        />
      </ItemMedia>
      <ItemContent className={cn(!enabled && "opacity-50")}>
        <ItemTitle className="font-mono">{model.name}</ItemTitle>
      </ItemContent>
      <ItemActions>
        {isCustom && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            <button
              type="button"
              aria-label={`Edit ${model.name}`}
              onClick={onEdit}
              className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 items-center justify-center rounded transition-colors"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label={`Delete ${model.name}`}
              onClick={() => setConfirmOpen(true)}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive inline-flex size-6 items-center justify-center rounded transition-colors"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
        <Switch
          size="sm"
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={
            enabled ? `Disable ${model.name}` : `Enable ${model.name}`
          }
        />
      </ItemActions>
      {isCustom && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Delete ${model.name}?`}
          description={`This permanently removes the custom image model "${model.name}" from ${providerName}.`}
          confirmLabel="Delete"
          dimBackground={false}
          onConfirm={() => {
            setConfirmOpen(false);
            onDelete();
          }}
        />
      )}
    </Item>
  );
}

/**
 * Key-value editor for a profile's extra HTTP headers. Rows live in local state
 * so half-typed entries survive re-renders; only rows with a non-empty name are
 * persisted, on blur or row removal.
 */
function _ProviderHeadersEditor({
  providerId,
  providerName,
  profile,
}: {
  providerId: string;
  providerName: string;
  profile: ProviderProfile;
}) {
  const updateProviderProfile = useUpdateProviderProfile();
  const [rows, setRows] = useState<{ key: string; value: string }[]>(() =>
    Object.entries(profile.headers ?? {}).map(([key, value]) => ({
      key,
      value,
    }))
  );

  const setRow = (index: number, row: { key: string; value: string }) => {
    setRows((prev) => prev.map((r, i) => (i === index ? row : r)));
  };

  // Persist the named rows when they differ from the stored headers. An empty
  // set clears the field (stored as `null`).
  const persist = (nextRows: { key: string; value: string }[]) => {
    const headers: Record<string, string> = {};
    for (const row of nextRows) {
      const key = row.key.trim();
      if (key !== "") headers[key] = row.value;
    }
    const current = profile.headers ?? {};
    const currentKeys = Object.keys(current);
    const same =
      Object.keys(headers).length === currentKeys.length &&
      currentKeys.every((key) => headers[key] === current[key]);
    if (same) return;
    void updateProviderProfile(providerId, profile.id, {
      headers: Object.keys(headers).length > 0 ? headers : null,
    });
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    persist(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Custom headers</span>
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={row.key}
            placeholder="X-Header-Name"
            aria-label={`${providerName} header ${index + 1} name`}
            onChange={(e) => setRow(index, { ...row, key: e.target.value })}
            onBlur={() => persist(rows)}
          />
          <Input
            value={row.value}
            placeholder="Value"
            aria-label={`${providerName} header ${index + 1} value`}
            onChange={(e) => setRow(index, { ...row, value: e.target.value })}
            onBlur={() => persist(rows)}
          />
          <Tooltip content="Remove header">
            <button
              type="button"
              aria-label={`Remove header ${index + 1}`}
              onClick={() => removeRow(index)}
              className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 shrink-0 items-center justify-center rounded transition-colors"
            >
              <Trash2 className="size-4" />
            </button>
          </Tooltip>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => setRows((prev) => [...prev, { key: "", value: "" }])}
      >
        <Plus /> Add header
      </Button>
      <div className="text-muted-foreground text-xs">
        Sent with every request made through this profile.
      </div>
    </div>
  );
}

/**
 * A single model row. Custom (user-added) models get a hover-revealed action
 * cluster — edit and delete — to the left of the enable switch. Delete is gated
 * behind a confirmation.
 */
function ModelListItem({
  providerId,
  providerName,
  profileId,
  model,
  enabled,
  isCustom,
  onToggle,
  onEdit,
}: {
  providerId: string;
  providerName: string;
  profileId: string;
  model: ModelProviderGroup["models"][number];
  enabled: boolean;
  isCustom: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
}) {
  const removeCustomModel = useRemoveCustomModel();
  const testModelConnection = useTestModelConnection();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      await testModelConnection(providerId, model.id, undefined, profileId);
      toast.success("Model connected successfully", {
        description: model.name,
      });
    } catch (error) {
      toast.error("Failed to connect to model", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Item variant="muted" size="sm" className="group">
      <ItemMedia>
        <ModelAvatar
          id={model.id}
          name={model.name}
          icon={model.icon}
          size={20}
        />
      </ItemMedia>
      <ItemContent className={cn(!enabled && "opacity-50")}>
        <ItemTitle className="font-mono">{model.name}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <Tooltip content="Test connection">
            <button
              type="button"
              aria-label={`Test connection for ${model.name}`}
              disabled={testing}
              onClick={() => void handleTestConnection()}
              className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 items-center justify-center rounded transition-colors"
            >
              {testing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CableIcon className="size-3.5" />
              )}
            </button>
          </Tooltip>
          {isCustom ? (
            <>
              <button
                type="button"
                aria-label={`Edit ${model.name}`}
                onClick={onEdit}
                className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 items-center justify-center rounded transition-colors"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${model.name}`}
                onClick={() => setConfirmOpen(true)}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive inline-flex size-6 items-center justify-center rounded transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          ) : null}
        </div>
        <Switch
          size="sm"
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={
            enabled ? `Disable ${model.name}` : `Enable ${model.name}`
          }
        />
      </ItemActions>
      {isCustom ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Delete ${model.name}?`}
          description={`This permanently removes the custom model "${model.name}" from ${providerName}.`}
          confirmLabel="Delete"
          dimBackground={false}
          onConfirm={() => {
            setConfirmOpen(false);
            void removeCustomModel(providerId, model.id);
          }}
        />
      ) : null}
    </Item>
  );
}

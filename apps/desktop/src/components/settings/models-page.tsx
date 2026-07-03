"use client";

import type { CustomModel, ModelProviderGroup } from "@llm-space/core";
import {
  Ban,
  Check,
  CheckCheck,
  ExternalLink,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAutoAnimation } from "@/lib/use-auto-animation";
import { cn } from "@/lib/utils";

import { ConfirmDialog } from "../confirm-dialog";
import { Link } from "../link";
import {
  useAddCustomProvider,
  useAddProvider,
  useFetchBuiltinProviders,
  useModels,
  useRemoveCustomModel,
  useRemoveProvider,
  useSetAllModelsEnabled,
  useSetModelEnabled,
  useUpdateProvider,
} from "../model-provider";
import { ModelAvatar } from "../thread-playground/model-avatar";
import { ProviderAvatar } from "../thread-playground/provider-avatar";
import { Tooltip } from "../tooltip";
import { ScrollArea } from "../ui/scroll-area";

import { ModelEditorDialog } from "./model-editor-dialog";
import { SettingsPage } from "./settings-page";

type CustomProviderApi =
  | "anthropic-messages"
  | "openai-completions"
  | "openai-responses";

const DEFAULT_CUSTOM_PROVIDER_API: CustomProviderApi = "openai-completions";

const CUSTOM_PROVIDER_API_TYPES: {
  value: CustomProviderApi;
  label: string;
}[] = [
  { value: "openai-completions", label: "OpenAI Completions" },
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "anthropic-messages", label: "Anthropic Messages" },
];

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

  useEffect(() => {
    if (
      !selectedId ||
      !providers.some((provider) => provider.id === selectedId)
    ) {
      setSelectedId(firstProviderId);
    }
  }, [firstProviderId, providers, selectedId]);

  const selected =
    providers.find((provider) => provider.id === selectedId) ?? null;

  return (
    <SettingsPage className="flex size-full min-h-0" title="Models">
      <ProviderList
        providers={providers}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onAdd={setSelectedId}
      />
      <ProviderEditor key={selected?.id} provider={selected} />
    </SettingsPage>
  );
}

function ProviderList({
  providers,
  selectedId,
  onSelect,
  onAdd,
}: {
  providers: ModelProviderGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
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
                selected={provider.id === selectedId}
                onSelect={() => onSelect(provider.id)}
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
  onSelect,
}: {
  provider: ModelProviderGroup;
  selected: boolean;
  onSelect: () => void;
}) {
  const removeProvider = useRemoveProvider();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Select ${provider.name} provider`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
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
      <span className="line-clamp-1 grow">{provider.name}</span>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            aria-label={`${provider.name} provider actions`}
            title={`${provider.name} provider actions`}
            className={cn(
              "text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-5 shrink-0 items-center justify-center rounded transition-opacity",
              menuOpen
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmOpen(true)}
          >
            <Trash2 />
            Remove {provider.name}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
    </div>
  );
}

function ProviderEditor({ provider }: { provider: ModelProviderGroup | null }) {
  const updateProvider = useUpdateProvider();
  const setModelEnabled = useSetModelEnabled();
  const setAllModelsEnabled = useSetAllModelsEnabled();
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [iconDraft, setIconDraft] = useState(provider?.icon ?? "");
  const [baseUrlEnabled, setBaseUrlEnabled] = useState(
    Boolean(provider?.baseUrl)
  );
  const [modelView, setModelView] = useState<"all" | "enabled" | "disabled">(
    "all"
  );
  const [apiValue, setApiValue] = useState<CustomProviderApi>(
    DEFAULT_CUSTOM_PROVIDER_API
  );
  const [modelListRef] = useAutoAnimation<HTMLDivElement>();
  const [editorOpen, setEditorOpen] = useState(false);
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

  // Persist on blur, but only when the value actually changed. An empty field
  // clears the key (stored as `null`).
  const handleApiKeyBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (!provider) return;
    const value = event.target.value.trim();
    const next = value === "" ? null : value;
    const current = provider.apiKey ?? null;
    if (next !== current) {
      void updateProvider(provider.id, { apiKey: next });
    }
  };

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

  // Persist the custom base URL on blur when changed. Empty ⇒ use the default.
  const handleBaseUrlBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (!provider) return;
    const value = event.target.value.trim();
    const next = value === "" ? null : value;
    const current = provider.baseUrl ?? null;
    if (next !== current) {
      void updateProvider(provider.id, { baseUrl: next });
    }
  };

  // The switch reveals/hides the base URL input; turning it off clears the
  // stored value (⇒ use the provider default).
  const handleBaseUrlToggle = (enabled: boolean) => {
    setBaseUrlEnabled(enabled);
    if (!enabled && provider) {
      void updateProvider(provider.id, { baseUrl: null });
    }
  };

  if (!provider) {
    return (
      <div className="text-muted-foreground flex min-w-0 grow items-center justify-center text-sm">
        Select or add a provider from the left sidebar
      </div>
    );
  }

  const totalModels = provider.models.length;
  const enabledModels = provider.models.filter(
    (model) => !disabledModels.has(model.id)
  ).length;

  const visibleModels = provider.models.filter((model) => {
    if (modelView === "enabled") return !disabledModels.has(model.id);
    if (modelView === "disabled") return disabledModels.has(model.id);
    return true;
  });
  const isBuiltin = provider.builtin === true;

  // Which base-URL convention applies (see ANTHROPIC_BASE_URL_HINT): builtin
  // providers are recognized by their models' API; custom providers follow the
  // live API type selection.
  const usesAnthropicApi = isBuiltin
    ? provider.models.some((model) => model.api === "anthropic-messages")
    : apiValue === "anthropic-messages";
  const baseUrlPlaceholder = usesAnthropicApi
    ? "https://api.example.com"
    : "https://api.example.com/v1";

  return (
    <div className="flex min-w-0 grow flex-col">
      <ScrollArea className="min-h-0 grow">
        <div className="flex flex-col gap-6 pl-6">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-lg font-medium">
              {provider.name}
            </h3>
            {isBuiltin && provider.websiteLink ? (
              <Tooltip content={`Learn more about ${provider.name}`}>
                <Link
                  href={provider.websiteLink}
                  aria-label={`Open ${provider.name} website`}
                >
                  <ExternalLink className="text-muted-foreground hover:text-foreground size-4 transition-colors" />
                </Link>
              </Tooltip>
            ) : null}
          </div>

          {!isBuiltin && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  defaultValue={provider.name}
                  placeholder="Custom provider"
                  aria-label="Custom provider name"
                  onBlur={handleNameBlur}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">API type</label>
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
                    {CUSTOM_PROVIDER_API_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {!isBuiltin && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Icon</label>
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

          {provider.id !== "openai-codex" && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">API key</label>
              <div className="relative">
                <Input
                  type={apiKeyVisible ? "text" : "password"}
                  defaultValue={provider.apiKey ?? ""}
                  placeholder={`Input API Key for ${provider.name}.`}
                  className="pr-9"
                  aria-label={`${provider.name} API key`}
                  onBlur={handleApiKeyBlur}
                />
                <button
                  type="button"
                  onClick={() => setApiKeyVisible((visible) => !visible)}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 transition-colors"
                  aria-label={apiKeyVisible ? "Hide API key" : "Show API key"}
                >
                  {apiKeyVisible ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <div className="text-muted-foreground pl-5 text-xs">
                <div className="list-item">
                  {
                    'Use "${ENV_NAME}" to reference environment variables. e.g. "$OPENAI_API_KEY"'
                  }
                </div>
                <div className="list-item">
                  Leave it blank to use the official {provider.name} environment
                  variable
                </div>
              </div>
            </div>
          )}

          {isBuiltin ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Custom base URL</label>
                <Switch
                  aria-label={
                    baseUrlEnabled
                      ? `Disable custom base URL for ${provider.name}`
                      : `Enable custom base URL for ${provider.name}`
                  }
                  checked={baseUrlEnabled}
                  onCheckedChange={handleBaseUrlToggle}
                />
              </div>
              {baseUrlEnabled && (
                <>
                  <Input
                    defaultValue={provider.baseUrl ?? ""}
                    placeholder={baseUrlPlaceholder}
                    aria-label={`${provider.name} custom base URL`}
                    onBlur={handleBaseUrlBlur}
                  />
                  <div className="text-muted-foreground text-xs">
                    Leave empty to use the default endpoint.
                    {usesAnthropicApi ? ` ${ANTHROPIC_BASE_URL_HINT}` : null}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Base URL</label>
              <Input
                required
                defaultValue={provider.baseUrl ?? ""}
                placeholder={baseUrlPlaceholder}
                aria-label={`${provider.name} base URL`}
                onBlur={handleBaseUrlBlur}
              />
              {usesAnthropicApi && (
                <div className="text-muted-foreground text-xs">
                  {ANTHROPIC_BASE_URL_HINT}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Models</span>
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
        </div>
      </ScrollArea>

      <ModelEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        providerId={provider.id}
        providerApi={isBuiltin ? undefined : apiValue}
        model={editingModel}
      />
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
  model,
  enabled,
  isCustom,
  onToggle,
  onEdit,
}: {
  providerId: string;
  providerName: string;
  model: ModelProviderGroup["models"][number];
  enabled: boolean;
  isCustom: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
}) {
  const removeCustomModel = useRemoveCustomModel();
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
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
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
          description={`This permanently removes the custom model "${model.name}" from ${providerName}.`}
          confirmLabel="Delete"
          dimBackground={false}
          onConfirm={() => {
            setConfirmOpen(false);
            void removeCustomModel(providerId, model.id);
          }}
        />
      )}
    </Item>
  );
}

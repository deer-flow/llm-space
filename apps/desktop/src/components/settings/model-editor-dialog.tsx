"use client";

import type { CustomModel } from "@llm-space/core";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { useUpdateProvider, useUpsertCustomModel } from "../model-provider";
import { ModelAvatar } from "../thread-playground/model-avatar";

import {
  CUSTOM_PROVIDER_API_TYPES,
  DEFAULT_CUSTOM_PROVIDER_API,
  isCustomProviderApi,
  type CustomProviderApi,
} from "./custom-provider-api";

const DEFAULT_CONTEXT_WINDOW = 262144;
const DEFAULT_MAX_TOKENS = 131072;

interface FormState {
  id: string;
  name: string;
  icon: string;
  api: CustomProviderApi;
  reasoning: boolean;
  deepseekThinking: boolean;
  image: boolean;
  contextWindow: number;
  maxTokens: number;
}

function initialState(
  model: CustomModel | null | undefined,
  api: CustomProviderApi = DEFAULT_CUSTOM_PROVIDER_API
): FormState {
  if (!model) {
    return {
      id: "",
      name: "",
      icon: "",
      api,
      reasoning: false,
      deepseekThinking: false,
      image: false,
      contextWindow: DEFAULT_CONTEXT_WINDOW,
      maxTokens: DEFAULT_MAX_TOKENS,
    };
  }
  return {
    id: model.id,
    name: model.name,
    icon: model.icon ?? "",
    api: isCustomProviderApi(model.api) ? model.api : api,
    reasoning: model.reasoning,
    deepseekThinking:
      (model.compat as { thinkingFormat?: string } | undefined)
        ?.thinkingFormat === "deepseek",
    image: model.input.includes("image"),
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
}

/**
 * Create or edit a provider's custom model. `model` present ⇒ edit mode (its id
 * is passed as `originalId` so a rename replaces the old entry). Only the fields
 * a user cares about are exposed; the rest (`cost`, `compat.supportsDeveloperRole`)
 * get sensible defaults.
 */
export function ModelEditorDialog({
  open,
  onOpenChange,
  providerId,
  providerApi,
  model,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  providerApi?: CustomProviderApi;
  model?: CustomModel | null;
}) {
  const updateProvider = useUpdateProvider();
  const upsertCustomModel = useUpsertCustomModel();
  const [form, setForm] = useState<FormState>(() =>
    initialState(model, providerApi)
  );

  // Reset the form whenever the dialog opens (for a fresh create or a different
  // model to edit).
  useEffect(() => {
    if (open) {
      setForm(initialState(model, providerApi));
    }
  }, [open, model, providerApi]);

  const isEdit = Boolean(model);

  // Editing the id also updates the name while the two are still "linked" — the
  // name is empty or still mirrors the id. Editing the name never touches the id.
  const handleIdChange = (nextId: string) => {
    setForm((prev) => ({
      ...prev,
      id: nextId,
      name: prev.name === "" || prev.name === prev.id ? nextId : prev.name,
    }));
  };

  const trimmedId = form.id.trim();
  const canSave = trimmedId.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const trimmedIcon = form.icon.trim();
    const built: CustomModel = {
      id: trimmedId,
      name: form.name.trim() || trimmedId,
      ...(trimmedIcon ? { icon: trimmedIcon } : {}),
      api: form.api,
      reasoning: form.reasoning,
      input: form.image ? ["text", "image"] : ["text"],
      contextWindow: form.contextWindow,
      maxTokens: form.maxTokens,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: {
        supportsDeveloperRole: false,
        ...(form.reasoning && form.deepseekThinking
          ? { thinkingFormat: "deepseek" }
          : {}),
      },
    };
    void (async () => {
      if (providerApi && form.api !== providerApi) {
        await updateProvider(providerId, { api: form.api });
      }
      await upsertCustomModel(providerId, built, model?.id);
    })();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit model" : "Add custom model"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this custom model's configuration."
              : "Define a custom model for this provider."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Model ID">
            <Input
              value={form.id}
              placeholder="deepseek-v4-pro"
              onChange={(e) => handleIdChange(e.target.value)}
            />
          </Field>

          <Field label="Model name">
            <Input
              value={form.name}
              placeholder="DeepSeek V4 Pro"
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </Field>

          <Field label="Icon">
            <div className="flex items-center gap-2">
              <ModelAvatar
                id={form.id.trim() || "model"}
                name={form.name.trim() || form.id.trim() || "Model"}
                icon={form.icon.trim() || undefined}
              />
              <Input
                value={form.icon}
                placeholder="Auto (e.g. openai, claude, deepseek)"
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, icon: e.target.value }))
                }
              />
            </div>
            <p className="text-muted-foreground mt-1.5 text-xs">
              A{" "}
              <a
                href="https://icons.lobehub.com"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                @lobehub/icons
              </a>{" "}
              keyword. Leave blank to auto-resolve from the model ID.
            </p>
          </Field>

          <Field label="API type">
            <Select
              value={form.api}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  api: value as CustomProviderApi,
                }))
              }
            >
              <SelectTrigger className="w-full">
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
          </Field>

          <ToggleField
            label="Reasoning supported"
            checked={form.reasoning}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, reasoning: checked }))
            }
          />

          {form.reasoning && (
            <ToggleField
              label="Use DeepSeek thinking format"
              checked={form.deepseekThinking}
              onCheckedChange={(checked) =>
                setForm((prev) => ({ ...prev, deepseekThinking: checked }))
              }
            />
          )}

          <ToggleField
            label="Image supported"
            checked={form.image}
            onCheckedChange={(checked) =>
              setForm((prev) => ({ ...prev, image: checked }))
            }
          />

          <div className="flex gap-4">
            <Field label="Context window" className="flex-1">
              <Input
                type="number"
                min={1}
                value={form.contextWindow}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    contextWindow:
                      Number(e.target.value) || DEFAULT_CONTEXT_WINDOW,
                  }))
                }
              />
            </Field>
            <Field label="Max tokens" className="flex-1">
              <Input
                type="number"
                min={1}
                value={form.maxTokens}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    maxTokens: Number(e.target.value) || DEFAULT_MAX_TOKENS,
                  }))
                }
              />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm font-medium">{label}</label>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
    </div>
  );
}

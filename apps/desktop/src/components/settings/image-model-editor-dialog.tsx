"use client";

import {
  SEEDREAM_IMAGE_SIZES,
  type SeedreamImageModelDefinition,
  type SeedreamImageSize,
} from "@llm-space/core";
import { ModelAvatar } from "@llm-space/ui/components/thread-playground/model-avatar";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { Input } from "@llm-space/ui/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@llm-space/ui/ui/select";
import { Switch } from "@llm-space/ui/ui/switch";
import { useEffect, useState } from "react";

interface ImageModelFormState {
  id: string;
  name: string;
  icon: string;
  supportedSizes: SeedreamImageSize[];
  defaultSize: SeedreamImageSize;
}

/** Create the editable form state for a new or existing image model. */
function _initialState(
  model: SeedreamImageModelDefinition | null | undefined
): ImageModelFormState {
  return model
    ? {
        id: model.id,
        name: model.name,
        icon: model.icon ?? "",
        supportedSizes: [...model.supportedSizes],
        defaultSize: model.defaultSize,
      }
    : {
        id: "",
        name: "",
        icon: "",
        supportedSizes: [...SEEDREAM_IMAGE_SIZES],
        defaultSize: "2K",
      };
}

/** Add or edit one provider-owned custom image model definition. */
export function ImageModelEditorDialog({
  open,
  onOpenChange,
  model,
  existingIds,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model?: SeedreamImageModelDefinition | null;
  existingIds: readonly string[];
  onSave: (model: SeedreamImageModelDefinition, originalId?: string) => void;
}) {
  const [form, setForm] = useState<ImageModelFormState>(() =>
    _initialState(model)
  );

  useEffect(() => {
    if (open) {
      setForm(_initialState(model));
    }
  }, [model, open]);

  const id = form.id.trim();
  const duplicateId = existingIds.some(
    (candidate) => candidate === id && candidate !== model?.id
  );
  const canSave =
    id.length > 0 && form.supportedSizes.length > 0 && !duplicateId;

  /** Keep the default size valid while the supported-size set changes. */
  const handleSizeToggle = (size: SeedreamImageSize, enabled: boolean) => {
    setForm((current) => {
      const supportedSizes = enabled
        ? SEEDREAM_IMAGE_SIZES.filter(
            (candidate) =>
              current.supportedSizes.includes(candidate) || candidate === size
          )
        : current.supportedSizes.filter((candidate) => candidate !== size);
      return {
        ...current,
        supportedSizes,
        defaultSize: supportedSizes.includes(current.defaultSize)
          ? current.defaultSize
          : (supportedSizes[0] ?? current.defaultSize),
      };
    });
  };

  /** Persist a trimmed definition; provider credentials remain shared. */
  const handleSave = () => {
    if (!canSave) {
      return;
    }
    const icon = form.icon.trim();
    onSave(
      {
        id,
        name: form.name.trim() || id,
        supportedSizes: form.supportedSizes,
        defaultSize: form.defaultSize,
        ...(icon ? { icon } : {}),
      },
      model?.id
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {model ? "Edit image model" : "Add custom image model"}
          </DialogTitle>
          <DialogDescription>
            Image models reuse this provider&apos;s API key and base URL.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <_Field label="Model ID">
            <Input
              value={form.id}
              placeholder="ep-20260731-example"
              aria-label="Image model ID"
              aria-invalid={duplicateId}
              onChange={(event) =>
                setForm((current) => ({ ...current, id: event.target.value }))
              }
            />
            {duplicateId && (
              <p className="text-destructive mt-1.5 text-xs">
                This model ID is already in use.
              </p>
            )}
          </_Field>

          <_Field label="Model name">
            <Input
              value={form.name}
              placeholder="Seedream endpoint"
              aria-label="Image model name"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </_Field>

          <_Field label="Icon">
            <div className="flex items-center gap-2">
              <ModelAvatar
                id={id || "image-model"}
                name={form.name.trim() || id || "Image model"}
                icon={form.icon.trim() || undefined}
              />
              <Input
                value={form.icon}
                placeholder="Auto (e.g. seedream)"
                aria-label="Image model icon"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    icon: event.target.value,
                  }))
                }
              />
            </div>
          </_Field>

          <_Field label="Supported sizes">
            <div className="grid grid-cols-2 gap-2">
              {SEEDREAM_IMAGE_SIZES.map((size) => (
                <div
                  key={size}
                  className="bg-muted/40 flex items-center justify-between rounded-md px-3 py-2 text-sm"
                >
                  {size}
                  <Switch
                    size="sm"
                    checked={form.supportedSizes.includes(size)}
                    aria-label={`Support ${size}`}
                    onCheckedChange={(enabled) =>
                      handleSizeToggle(size, enabled)
                    }
                  />
                </div>
              ))}
            </div>
          </_Field>

          <_Field label="Default size">
            <Select
              value={form.defaultSize}
              disabled={form.supportedSizes.length === 0}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  defaultSize: value as SeedreamImageSize,
                }))
              }
            >
              <SelectTrigger className="w-full" aria-label="Model default size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {form.supportedSizes.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </_Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {model ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Label one image-model editor field and keep helper content grouped. */
function _Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

"use client";

import {
  getOpenAIImageSizes,
  normalizeImageSize,
  SEEDREAM_IMAGE_SIZES,
  type ImageGenerationApi,
  type ImageModelDefinition,
  type ImageSize,
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

import { useI18n } from "@/i18n/i18n-provider";
import { formatMessage } from "@/i18n/messages";

interface ImageModelFormState {
  id: string;
  name: string;
  icon: string;
  supportedSizes: ImageSize[];
  defaultSize: ImageSize;
  responseFormat: "auto" | "b64_json";
}

/** Create the editable form state for a new or existing image model. */
function _initialState(
  model: ImageModelDefinition | null | undefined,
  api: ImageGenerationApi
): ImageModelFormState {
  if (model) {
    return {
      id: model.id,
      name: model.name,
      icon: model.icon ?? "",
      supportedSizes: [
        ...new Set(
          model.supportedSizes.map((size) => normalizeImageSize(size, api))
        ),
      ],
      defaultSize: normalizeImageSize(model.defaultSize, api),
      responseFormat: model.responseFormat ?? "auto",
    };
  }
  return {
    id: "",
    name: "",
    icon: "",
    supportedSizes:
      api === "openai-images" ? ["1024x1024"] : [...SEEDREAM_IMAGE_SIZES],
    defaultSize: api === "openai-images" ? "1024x1024" : "2K",
    responseFormat: "auto",
  };
}

/** Add or edit one provider-owned custom image model definition. */
export function ImageModelEditorDialog({
  open,
  onOpenChange,
  api,
  model,
  existingIds,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: ImageGenerationApi;
  model?: ImageModelDefinition | null;
  existingIds: readonly string[];
  onSave: (model: ImageModelDefinition, originalId?: string) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<ImageModelFormState>(() =>
    _initialState(model, api)
  );

  useEffect(() => {
    if (open) {
      setForm(_initialState(model, api));
    }
  }, [model, open, api]);

  const id = form.id.trim();
  const sizeOptions: readonly ImageSize[] =
    api === "openai-images" ? getOpenAIImageSizes(id) : SEEDREAM_IMAGE_SIZES;
  const unsupportedSizes = form.supportedSizes.filter(
    (size) => !sizeOptions.includes(size)
  );
  const displayedSizes = [...sizeOptions, ...unsupportedSizes];
  const duplicateId = existingIds.some(
    (candidate) => candidate === id && candidate !== model?.id
  );
  const canSave =
    id.length > 0 &&
    form.supportedSizes.length > 0 &&
    form.supportedSizes.includes(form.defaultSize) &&
    unsupportedSizes.length === 0 &&
    !duplicateId;

  /** Keep the default size valid while the supported-size set changes. */
  const handleSizeToggle = (size: ImageSize, enabled: boolean) => {
    setForm((current) => {
      const supportedSizes = enabled
        ? displayedSizes.filter(
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
        ...(form.responseFormat === "b64_json"
          ? { responseFormat: "b64_json" as const }
          : {}),
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
            {model ? t.models.editImageModel : t.models.addImageModel}
          </DialogTitle>
          <DialogDescription>{t.models.imageModelHint}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <_Field label={t.models.modelId}>
            <Input
              value={form.id}
              placeholder={t.models.imageModelIdPlaceholder}
              aria-label={t.models.modelId}
              aria-invalid={duplicateId}
              onChange={(event) =>
                setForm((current) => ({ ...current, id: event.target.value }))
              }
            />
            {duplicateId && (
              <p className="text-destructive mt-1.5 text-xs">
                {t.models.imageModelIdInUse}
              </p>
            )}
          </_Field>

          <_Field label={t.models.modelName}>
            <Input
              value={form.name}
              placeholder={t.models.imageModelNamePlaceholder}
              aria-label={t.models.modelName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </_Field>

          <_Field label={t.models.icon}>
            <div className="flex items-center gap-2">
              <ModelAvatar
                id={id || "image-model"}
                name={form.name.trim() || id || "Image model"}
                icon={form.icon.trim() || undefined}
              />
              <Input
                value={form.icon}
                placeholder={t.models.imageModelIconPlaceholder}
                aria-label={t.models.icon}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    icon: event.target.value,
                  }))
                }
              />
            </div>
          </_Field>

          <_Field label={t.models.supportedSizes}>
            <div className="grid grid-cols-2 gap-2">
              {displayedSizes.map((size) => (
                <div
                  key={size}
                  className="bg-muted/40 flex items-center justify-between rounded-md px-3 py-2 text-sm"
                >
                  {size}
                  <Switch
                    size="sm"
                    checked={form.supportedSizes.includes(size)}
                    aria-label={formatMessage(t.models.supportSize, { size })}
                    onCheckedChange={(enabled) =>
                      handleSizeToggle(size, enabled)
                    }
                  />
                </div>
              ))}
            </div>
            {unsupportedSizes.length > 0 && (
              <p role="alert" className="text-destructive text-xs">
                {formatMessage(t.models.unsupportedImageSizes, {
                  sizes: unsupportedSizes.join(", "),
                })}
              </p>
            )}
          </_Field>

          <_Field label={t.models.defaultSize}>
            <Select
              value={form.defaultSize}
              disabled={form.supportedSizes.length === 0}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  defaultSize: value as ImageSize,
                }))
              }
            >
              <SelectTrigger
                className="w-full"
                aria-label={t.models.defaultSize}
              >
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

          {api === "openai-images" && (
            <_Field label={t.models.responseFormat}>
              <Select
                value={form.responseFormat}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    responseFormat:
                      value as ImageModelFormState["responseFormat"],
                  }))
                }
              >
                <SelectTrigger
                  className="w-full"
                  aria-label={t.models.imageResponseFormat}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    {t.models.automaticResponseFormat}
                  </SelectItem>
                  <SelectItem value="b64_json">
                    {t.models.base64ResponseFormat}
                  </SelectItem>
                </SelectContent>
              </Select>
            </_Field>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.models.cancel}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {model ? t.models.save : t.models.add}
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

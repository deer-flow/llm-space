import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  BuiltinTool,
  ImageGenerationApi,
  ImageModelDefinition,
  ModelProviderGroup,
} from "@llm-space/core";
import {
  act,
  createContext,
  useContext,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import { createArkImageGenerator } from "../../../../../packages/runtime/src/models/ark-image-generation";
import { ModelManager } from "../../../../../packages/runtime/src/models/model-manager";
import { I18nProvider } from "../../../src/i18n/i18n-provider";
import {
  installReactTestDom,
  TestEvent,
  type TestElement,
} from "../../../src/test/react-test-dom";

const DOM = installReactTestDom();
const MOUNTS: { root: Root; container: TestElement }[] = [];
const TEMP_DIRS: string[] = [];
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==";
const LEGACY_MODEL: ImageModelDefinition = {
  id: "dall-e-3",
  name: "Original",
  supportedSizes: ["1K"],
  defaultSize: "1K",
};
const TOOL: BuiltinTool = {
  type: "builtin",
  name: "generate_image",
  description: "Generate an image.",
  parameters: { type: "object", properties: {} },
};
let providers: ModelProviderGroup[] = [];
const HOST = { builtinTools: { list: () => Promise.resolve([TOOL]) } };

function _Container({ children }: { children?: ReactNode }) {
  return <div>{children}</div>;
}

const SELECT_CONTEXT = createContext<{
  value?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}>({});

await mock.module("@llm-space/ui/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: _Container,
  DialogHeader: _Container,
  DialogFooter: _Container,
  DialogTitle: _Container,
  DialogDescription: _Container,
}));
await mock.module("@llm-space/ui/ui/select", () => ({
  Select: ({
    children,
    ...state
  }: {
    children?: ReactNode;
    value?: string;
    disabled?: boolean;
    onValueChange?: (value: string) => void;
  }) => (
    <SELECT_CONTEXT.Provider value={state}>{children}</SELECT_CONTEXT.Provider>
  ),
  SelectTrigger: function TestSelectTrigger({
    "aria-label": label,
  }: {
    "aria-label"?: string;
  }) {
    const { value, disabled } = useContext(SELECT_CONTEXT);
    return <button aria-label={label} data-value={value} disabled={disabled} />;
  },
  SelectValue: () => null,
  SelectContent: _Container,
  SelectItem: function TestSelectItem({
    value,
    children,
  }: {
    value: string;
    children?: ReactNode;
  }) {
    const { onValueChange, disabled } = useContext(SELECT_CONTEXT);
    return (
      <button
        data-option={value}
        disabled={disabled}
        onClick={() => onValueChange?.(value)}
      >
        {children}
      </button>
    );
  },
}));
await mock.module("@llm-space/ui/ui/switch", () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
    "aria-label": label,
  }: {
    checked?: boolean;
    disabled?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    "aria-label"?: string;
  }) => (
    <button
      role="switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
    />
  ),
}));
await mock.module("@llm-space/ui/ui/input", () => ({
  Input: ({ onChange, ...props }: ComponentProps<"input">) => (
    <input
      {...props}
      onChange={onChange}
      onInput={(event) => onChange?.({ ...event, target: event.currentTarget })}
    />
  ),
}));
await mock.module(
  "@llm-space/ui/components/thread-playground/model-avatar",
  () => ({
    ModelAvatar: () => null,
  })
);
await mock.module("@llm-space/ui/components/model-provider", () => ({
  useModels: () => providers,
}));
await mock.module("@llm-space/ui/host", () => ({
  useHostServices: () => HOST,
}));
await mock.module(
  "@llm-space/ui/components/thread-playground/model/provider-profile-selector",
  () => ({ ProviderProfileSelector: () => null })
);
await mock.module(
  "@llm-space/ui/components/thread-playground/tool/tool-import-sidebar-actions",
  () => ({ ToolImportSidebarActions: () => null })
);

const { ImageModelEditorDialog } =
  await import("../../../src/components/settings/image-model-editor-dialog");
const { BuiltInToolImportDialog } =
  await import("@llm-space/ui/components/thread-playground/tool/built-in-tool-import-dialog");

afterEach(async () => {
  for (const { root, container } of MOUNTS.splice(0)) {
    await act(() => Promise.resolve(root.unmount()));
    container.remove();
  }
  for (const directory of TEMP_DIRS.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
  providers = [];
});
afterAll(() => {
  DOM.restore();
  mock.restore();
});

async function _mount(element: ReactElement) {
  const container = DOM.document.createElement("div");
  DOM.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  MOUNTS.push({ root, container });
  await act(() =>
    Promise.resolve(root.render(<I18nProvider>{element}</I18nProvider>))
  );
  return container;
}

function _find(container: TestElement, selector: string): TestElement {
  const element = container.querySelector(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

async function _click(container: TestElement, selector: string) {
  await act(() => Promise.resolve(_find(container, selector).click()));
}

async function _save(container: TestElement) {
  const button = container
    .querySelectorAll("button")
    .find((candidate) => candidate.textContent === "Save");
  if (!button) throw new Error("Missing Save button");
  expect(button.hasAttribute("disabled")).toBe(false);
  await act(() => Promise.resolve(button.click()));
}

async function _edit(
  model: ImageModelDefinition,
  api: ImageGenerationApi = "openai-images"
) {
  const saved: ImageModelDefinition[] = [];
  const container = await _mount(
    <ImageModelEditorDialog
      open
      onOpenChange={() => undefined}
      api={api}
      model={model}
      existingIds={[model.id]}
      onSave={(value) => saved.push(value)}
    />
  );
  return { container, saved };
}

function _provider(
  model: ImageModelDefinition,
  api?: ImageGenerationApi
): ModelProviderGroup {
  return {
    id: "gateway",
    name: "Gateway",
    models: [],
    profiles: [{ id: "default", name: "Default" }],
    imageGeneration: { ...(api ? { api } : {}), models: [model] },
  };
}

async function _toolDialog(existing?: BuiltinTool) {
  const added: BuiltinTool[] = [];
  const updated: BuiltinTool[] = [];
  const container = await _mount(
    <BuiltInToolImportDialog
      open
      onOpenChange={() => undefined}
      existingToolNames={new Set(existing ? [existing.name] : [])}
      existingTools={new Map(existing ? [[existing.name, existing]] : [])}
      onAdd={(tool) => {
        added.push(tool);
        return true;
      }}
      onUpdate={(_name, tool) => {
        updated.push(tool);
        return true;
      }}
      onRemove={() => undefined}
    />
  );
  await _click(container, "[aria-label=Media]");
  return { container, added, updated };
}

test("editing a legacy model preserves its size, and new and old threads generate after reload", async () => {
  const { container, saved } = await _edit(LEGACY_MODEL);
  expect(
    _find(container, "[aria-label=Default size]").getAttribute("data-value")
  ).toBe("1024x1024");
  expect(container.querySelector("[aria-label=Support auto]")).toBeNull();
  const name = _find(container, "[aria-label=Model name]");
  await act(async () => {
    name.value = "Renamed";
    name.dispatchEvent(new TestEvent("input"));
    await Promise.resolve();
  });
  await _save(container);
  expect(saved).toEqual([
    {
      id: "dall-e-3",
      name: "Renamed",
      supportedSizes: ["1024x1024"],
      defaultSize: "1024x1024",
    },
  ]);

  const settingsDir = await mkdtemp(path.join(os.tmpdir(), "image-settings-"));
  TEMP_DIRS.push(settingsDir);
  const manager = new ModelManager({ settingsDir });
  manager.addCustomProvider({
    id: "gateway",
    name: "Gateway",
    baseUrl: "https://images.example/v1",
  });
  manager.updateProvider("gateway", { imageGeneration: { models: saved } });
  const reloaded = new ModelManager({ settingsDir });
  const config = reloaded.getImageGenerationConfig("gateway");
  expect(config?.models).toEqual(saved);
  providers = [{ ..._provider(saved[0]), imageGeneration: config }];
  const fresh = await _toolDialog();
  await _click(fresh.container, "[aria-label=Add generate_image]");
  expect(fresh.added[0]?.config?.size).toBe("1024x1024");
  const legacyTool: BuiltinTool = {
    ...TOOL,
    connection: { providerId: "gateway" },
    config: { model: LEGACY_MODEL.id, size: "1K", watermark: true },
  };
  const legacy = await _toolDialog(legacyTool);
  expect(
    _find(legacy.container, "[aria-label=Default image size]").getAttribute(
      "data-value"
    )
  ).toBe("1024x1024");
  await _click(legacy.container, "[aria-label=Add AI-generated watermark]");
  expect(legacy.updated[0]?.config?.size).toBe("1024x1024");
  expect(legacyTool.config?.size).toBe("1K");

  const requests: unknown[] = [];
  const generate = createArkImageGenerator({
    getConfig: (providerId) => reloaded.getImageGenerationConfig(providerId),
    resolveConnection: () =>
      Promise.resolve({
        apiKey: "test-key",
        baseUrl: "https://images.example/v1",
      }),
    fetch: (_url, init) => {
      requests.push(
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined
      );
      return Promise.resolve(
        Response.json({ data: [{ b64_json: PNG_BASE64 }] })
      );
    },
  });
  for (const tool of [fresh.added[0], legacyTool]) {
    expect(
      await generate({
        prompt: "fixture",
        model: String(tool.config?.model),
        size: tool.config?.size as "1K" | "1024x1024",
        watermark: true,
        connection: tool.connection,
      })
    ).toMatchObject({ data: PNG_BASE64, size: "1024x1024" });
  }
  expect(requests).toEqual(
    Array.from({ length: 2 }, () => ({
      model: "dall-e-3",
      prompt: "fixture",
      size: "1024x1024",
      response_format: "b64_json",
    }))
  );
});

test("the editor saves and reopens an explicit base64 response format for an alias", async () => {
  const { container, saved } = await _edit({
    ...LEGACY_MODEL,
    id: "dalle-prod",
  });
  await _click(container, "[data-option=b64_json]");
  await _save(container);
  expect(saved[0]?.responseFormat).toBe("b64_json");
  const reopened = await _edit(saved[0]);
  expect(
    _find(
      reopened.container,
      "[aria-label=Image response format]"
    ).getAttribute("data-value")
  ).toBe("b64_json");
  await _click(reopened.container, "[data-option=auto]");
  await _save(reopened.container);
  expect(reopened.saved[0]).not.toHaveProperty("responseFormat");
});

test.each(["ark-images", "openai-images-extra-body"] as const)(
  "the editor and tool keep native 1K for %s",
  async (api) => {
    const model = { ...LEGACY_MODEL, id: "custom-image" };
    const { container, saved } = await _edit(model, api);
    await _save(container);
    expect(saved).toEqual([model]);
    providers = [_provider(model, api)];
    const tool = await _toolDialog();
    expect(
      _find(tool.container, "[aria-label=Default image size]").getAttribute(
        "data-value"
      )
    ).toBe("1K");
    await _click(tool.container, "[aria-label=Add generate_image]");
    expect(tool.added[0]?.config?.size).toBe("1K");
  }
);

test("deduplicates a legacy size alias without widening the configured size set", async () => {
  const { container, saved } = await _edit({
    ...LEGACY_MODEL,
    supportedSizes: ["1K", "1024x1024", "1792x1024"],
  });
  await _save(container);
  expect(saved[0]?.supportedSizes).toEqual(["1024x1024", "1792x1024"]);
  expect(saved[0]?.defaultSize).toBe("1024x1024");
});

test("does not silently replace an ambiguous legacy size with all OpenAI sizes", async () => {
  const { container, saved } = await _edit({
    ...LEGACY_MODEL,
    supportedSizes: ["2K"],
    defaultSize: "2K",
  });
  expect(_find(container, "[role=alert]").textContent).toContain("2K");
  const save = container
    .querySelectorAll("button")
    .find((button) => button.textContent === "Save");
  expect(save?.hasAttribute("disabled")).toBe(true);
  await act(() => Promise.resolve(save?.click()));
  expect(saved).toEqual([]);
  await _click(container, "[aria-label=Support 2K]");
  await _click(container, "[aria-label=Support 1024x1024]");
  await _save(container);
  expect(saved[0]?.supportedSizes).toEqual(["1024x1024"]);
  expect(saved[0]?.defaultSize).toBe("1024x1024");
});

test.each(["gpt-image-2", "gpt-image-2-2026-04-21"])(
  "the editor preserves a valid landscape size for %s",
  async (id) => {
    const model: ImageModelDefinition = {
      id,
      name: id,
      supportedSizes: ["1792x1024"],
      defaultSize: "1792x1024",
    };
    const { container, saved } = await _edit(model);
    expect(
      _find(container, "[aria-label=Support 1792x1024]").getAttribute(
        "aria-checked"
      )
    ).toBe("true");
    await _save(container);
    expect(saved).toEqual([model]);
  }
);

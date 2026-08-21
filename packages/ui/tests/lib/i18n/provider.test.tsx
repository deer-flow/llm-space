/* eslint-disable @typescript-eslint/no-empty-function */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { installReactTestDom } from "../../../../../apps/desktop/src/test/react-test-dom";
import { I18nProvider, useI18n } from "../../../src/lib/i18n";

// Bun's test runner ships no DOM, and this repository deliberately has no
// jsdom-style dependency — so install the repo's hand-rolled host adapter
// (the one the desktop renderer tests use) to get `document`/`localStorage`.
installReactTestDom();
// The adapter exposes storage on `window` only; mirror it as a global so the
// tests below can call `localStorage` directly.
globalThis.localStorage = window.localStorage;
// Bun's partial navigator exposes no language properties; give it a non-zh
// preference so the provider's browser-languages fallback resolves to `en`.
Object.assign(navigator, { languages: ["en-US"] });

let root: Root | null = null;
let hostEl: HTMLDivElement | null = null;

function Probe() {
  const { lang } = useI18n();
  return <div data-testid="lang">{lang}</div>;
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = "";
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  hostEl?.remove();
  hostEl = null;
  document.documentElement.lang = "";
});

function mount(node: ReactNode) {
  hostEl = document.createElement("div");
  document.body.appendChild(hostEl);
  root = createRoot(hostEl);
  act(() => root!.render(node));
}

describe("I18nProvider", () => {
  test("sets document.documentElement.lang from the chosen language", () => {
    mount(<I18nProvider initialLang="zh">x</I18nProvider>);
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(hostEl!.textContent).toBe("x");
  });

  test("re-resolves via resolveOsLocale when no explicit choice exists", async () => {
    mount(
      <I18nProvider resolveOsLocale={() => Promise.resolve("zh-CN")}>
        <Probe />
      </I18nProvider>
    );
    expect(hostEl!.querySelector("[data-testid=lang]")!.textContent).toBe("en");
    await act(async () => {});
    expect(hostEl!.querySelector("[data-testid=lang]")!.textContent).toBe("zh");
  });

  test("an explicit stored choice wins over resolveOsLocale", async () => {
    localStorage.setItem("llm-space-app-lang", "en");
    mount(
      <I18nProvider resolveOsLocale={() => Promise.resolve("zh-CN")}>
        <Probe />
      </I18nProvider>
    );
    await act(async () => {});
    expect(hostEl!.querySelector("[data-testid=lang]")!.textContent).toBe("en");
  });
});

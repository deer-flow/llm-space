import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import pluginPrettier from "eslint-config-prettier";
import pluginImportX from "eslint-plugin-import-x";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.turbo/**",
      ".agents/**",
      ".llm-space/**",
      "apps/desktop/electrobun.config.ts",
      "packages/ui/src/ui/**",
      // Excluded from packages/ui's typecheck project (no test runner), so the
      // typed-lint project service can't resolve them.
      "packages/ui/src/**/*.test.ts",
      "packages/ui/src/**/*.test.tsx",
      "apps/desktop/vite.config.ts",
    ],
  },

  // JavaScript rules
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: { js },
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },

  // TypeScript rules
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { tseslint },
    extends: [
      tseslint.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },

  // React rules
  pluginReact.configs.flat.recommended,
  pluginReactHooks.configs.flat["recommended-latest"],
  {
    settings: {
      react: {
        version: "19.0",
      },
    },
  },

  // Customized rules
  {
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "import-x": pluginImportX,
    },
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "import-x/order": [
        "error",
        {
          warnOnUnassignedImports: true,
          distinctGroup: false,
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "object",
          ],
          pathGroups: [
            {
              pattern: "@/**",
              group: "internal",
            },
            {
              pattern: "node:**",
              group: "builtin",
            },
            {
              pattern: "./**.css",
              group: "object",
            },
            {
              pattern: "**.md",
              group: "object",
            },
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
      "no-console": ["warn", { allow: ["info", "warn", "error"] }],
      "no-unused-vars": "off",
      // The house `export const Foo = memo(_Foo)` pattern names the inner
      // implementation `_Foo`, which rules-of-hooks reads as a non-component
      // (must start with an uppercase letter), flagging every hook call inside.
      "react-hooks/rules-of-hooks": "off",
      // These two React-Compiler rules mostly flag intentional, correct
      // patterns in this codebase — the latest-ref pattern, drag-and-drop
      // render props, and controlled-state resets — so they're off.
      // exhaustive-deps (warn, upstream) stays on.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react/react-in-jsx-scope": "off",
    },
  },

  // Prettier
  pluginPrettier,

  // Linter options
  {
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.config.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);

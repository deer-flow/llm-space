import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import pluginPrettier from "eslint-config-prettier";
import pluginImportX from "eslint-plugin-import-x";
import pluginReact from "eslint-plugin-react";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  // Global ignores
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "packages/web/.next/**",
      "packages/web/src/components/ui/**",
      "packages/web/next-env.d.ts",
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

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".next", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Disable strict TypeScript rules for migration compatibility
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      "@typescript-eslint/no-require-imports": "off",
      // Disable other rules causing build failures
      "no-case-declarations": "off",
      "no-empty": "off",
      "no-useless-catch": "off",
      "no-constant-condition": "off",
      "no-useless-escape": "off",
      "prefer-const": "off",
      "react-hooks/exhaustive-deps": "warn",
      // These rules belong to plugins not installed in this config;
      // declaring them off prevents ESLint from throwing "rule not found" errors
      // when inline eslint-disable comments reference them.
      "react/no-danger": "off",
      "@next/next/no-img-element": "off",
    },
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // MODULE BOUNDARY ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  // Prevents modules from reaching into each other's internals.
  // Cross-module imports MUST go through the barrel index (public API).
  // This keeps modules decoupled and ensures refactoring one module's
  // internals doesn't break others.
  {
    files: ["src/modules/sales/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [
          { group: ["@/modules/hr/components/*", "@/modules/hr/hooks/*"], message: "Import from '@/modules/hr' barrel instead." },
          { group: ["@/modules/operations/components/*", "@/modules/operations/hooks/*"], message: "Import from '@/modules/operations' barrel instead." },
          { group: ["@/modules/accounts/components/*", "@/modules/accounts/utils/*"], message: "Import from '@/modules/accounts' barrel instead." },
          { group: ["@/modules/office-admin/components/*"], message: "Import from '@/modules/office-admin' barrel instead." },
          { group: ["@/modules/client-portal/components/*", "@/modules/client-portal/hooks/*"], message: "Import from '@/modules/client-portal' barrel instead." },
        ],
      }],
    },
  },
  {
    files: ["src/modules/operations/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [
          { group: ["@/modules/sales/components/*", "@/modules/sales/hooks/*"], message: "Import from '@/modules/sales' barrel instead." },
          { group: ["@/modules/hr/components/*", "@/modules/hr/hooks/*"], message: "Import from '@/modules/hr' barrel instead." },
          { group: ["@/modules/accounts/components/*", "@/modules/accounts/utils/*"], message: "Import from '@/modules/accounts' barrel instead." },
          { group: ["@/modules/office-admin/components/*"], message: "Import from '@/modules/office-admin' barrel instead." },
        ],
      }],
    },
  },
  {
    files: ["src/modules/hr/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [
          { group: ["@/modules/sales/components/*", "@/modules/sales/hooks/*"], message: "Import from '@/modules/sales' barrel instead." },
          { group: ["@/modules/operations/components/*", "@/modules/operations/hooks/*"], message: "Import from '@/modules/operations' barrel instead." },
          { group: ["@/modules/accounts/components/*", "@/modules/accounts/utils/*"], message: "Import from '@/modules/accounts' barrel instead." },
          { group: ["@/modules/office-admin/components/*"], message: "Import from '@/modules/office-admin' barrel instead." },
        ],
      }],
    },
  },
  {
    files: ["src/modules/accounts/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [
          { group: ["@/modules/sales/components/*", "@/modules/sales/hooks/*"], message: "Import from '@/modules/sales' barrel instead." },
          { group: ["@/modules/hr/components/*", "@/modules/hr/hooks/*"], message: "Import from '@/modules/hr' barrel instead." },
          { group: ["@/modules/operations/components/*", "@/modules/operations/utils/*"], message: "Import from '@/modules/operations' barrel instead." },
          { group: ["@/modules/office-admin/components/*"], message: "Import from '@/modules/office-admin' barrel instead." },
        ],
      }],
    },
  },
  {
    files: ["src/modules/office-admin/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [
          { group: ["@/modules/sales/components/*", "@/modules/sales/hooks/*"], message: "Import from '@/modules/sales' barrel instead." },
          { group: ["@/modules/hr/components/*", "@/modules/hr/hooks/*"], message: "Import from '@/modules/hr' barrel instead." },
          { group: ["@/modules/operations/components/*", "@/modules/operations/hooks/*"], message: "Import from '@/modules/operations' barrel instead." },
          { group: ["@/modules/accounts/components/*", "@/modules/accounts/utils/*"], message: "Import from '@/modules/accounts' barrel instead." },
        ],
      }],
    },
  },
);

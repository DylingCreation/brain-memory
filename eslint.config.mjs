import globals from "globals";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      indent: ["error", 2],
      "linebreak-style": ["error", "unix"],
      quotes: ["error", "single"],
      semi: ["error", "always"],
      // Core no-unused-vars disabled: @typescript-eslint/no-unused-vars handles TypeScript properly
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
      // ESLint 10 new rules — relax to match existing codebase patterns:
      // `preserve-caught-error`: requires error.cause in re-throws; too noisy for current code
      "preserve-caught-error": "off",
      // `no-useless-assignment`: flags temp vars assigned but only used in try; defer to C-2 lint pass
      "no-useless-assignment": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "_bak/**"],
  }
);

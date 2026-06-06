import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
// npm install -D eslint-plugin-jsx-a11y
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "functions", ".claude", "ios"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // DS1 footgun guard: the bare Tailwind class `text-muted` resolves
      // to --color-muted (a SURFACE fill), NOT a text colour, so it
      // renders near-invisible text. The correct token is
      // `text-muted-foreground`. The regex requires whitespace/boundary
      // after `text-muted`, so `text-muted-foreground` (and `-bg` etc.)
      // are unaffected. Zero current misuse — purely preventive.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/(^|\\s)text-muted(\\s|$)/]",
          message:
            'Use "text-muted-foreground" — the bare "text-muted" class maps to the muted SURFACE fill and renders near-invisible text.',
        },
      ],
    },
  },
]);

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
      // ── Hardcoded-hex guardrail ────────────────────────────────────────
      // Colours must come from THEME / Tailwind semantic tokens. This rule is
      // the durable fix for the "stray hex keeps creeping back" drift the
      // codebase has repeatedly had to sweep. New code is blocked everywhere;
      // the files with pre-existing hex are grandfathered in the override
      // block at the bottom of this config (burn down when next touched).
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/(^|\\s)text-muted(\\s|$)/]",
          message:
            'Use "text-muted-foreground" — the bare "text-muted" class maps to the muted SURFACE fill and renders near-invisible text.',
        },
        {
          selector:
            "JSXAttribute[name.name='style'] Literal[value=/#[0-9a-fA-F]{6}/]",
          message:
            "No hardcoded hex in inline style — use a THEME token or Tailwind semantic class (e.g. THEME.success, bg-lifting).",
        },
        {
          selector:
            "JSXAttribute[name.name='style'] TemplateElement[value.raw=/#[0-9a-fA-F]{6}/]",
          message:
            "No hardcoded hex in inline style — use a THEME token (e.g. `${THEME.success}` + alpha) or a Tailwind semantic class.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]",
          message:
            "No Tailwind arbitrary hex (bg-[#…]) — use a semantic token class (bg-lifting, text-running, bg-success/…).",
        },
      ],
    },
  },
  {
    // Hex-colour guardrail BASELINE (burn-down list). These files have
    // pre-existing hardcoded hex — sport/semantic colours that should become
    // THEME tokens (most of them), plus genuinely-fixed artwork (ShareCard's
    // generated share image, PRBadge's gold). Grandfathered so the guardrail
    // can land now without a risky 29-site swap; tokenize a file's hex when
    // you next touch it, then delete it from this list. The `text-muted`
    // guard stays enforced — only the hex selectors are relaxed here.
    files: [
      "src/components/FoodCameraModal.tsx",
      "src/components/ManualFoodLogger.tsx",
      "src/components/analytics/PRBadge.tsx",
      "src/components/analytics/PRCard.tsx",
      "src/components/food/EditServingsSheet.tsx",
      "src/components/program/ExercisePicker.tsx",
      "src/components/run/RunBottomSheet.tsx",
      "src/components/run/RunResumePrompt.tsx",
      "src/components/social/ActivityCard.tsx",
      "src/components/social/FullLeaderboard.tsx",
      "src/components/social/ShareCard.tsx",
      "src/pages/RunSummary.tsx",
    ],
    rules: {
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

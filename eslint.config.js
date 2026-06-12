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
        // ── Dark-mode leak guard ─────────────────────────────────────────
        // Solid `bg-white` / `text-black` don't flip with the .dark theme —
        // on theme-aware surfaces they render dark-on-dark / white flashes.
        // Use the semantic classes (bg-card / bg-background / text-foreground)
        // instead. Alpha tints (bg-white/10) stay allowed: they're deliberate
        // overlays on the ALWAYS-dark surfaces (active-run screen, camera
        // chrome). Genuinely always-white elements (iOS-style switch thumbs,
        // the camera shutter) carry a line-level eslint-disable with a reason.
        {
          selector: "Literal[value=/(^|[\\s:])bg-white(\\s|$)/]",
          message:
            "Solid bg-white doesn't flip in dark mode — use bg-card / bg-background. If this surface is genuinely always-white (switch thumb, camera shutter), add an eslint-disable-next-line with the reason.",
        },
        {
          selector: "Literal[value=/(^|[\\s:])text-black(\\s|$)/]",
          message:
            "text-black doesn't flip in dark mode — use text-foreground (or text-card-foreground on cards).",
        },
        // ── Hand-rolled primary-CTA guard ────────────────────────────────
        // Every primary CTA routes through the <Button> primitive (variant
        // primary = the canonical bg-primary-strong). A `<button>` with a
        // STATIC primary-fill className is a hand-rolled CTA that bypasses the
        // primitive's shade + focus ring + 44px floor. Targets the button's own
        // string className only — tab/segment selectors that set bg-primary in a
        // ternary/template (active-state) aren't a plain Literal, so they're not
        // flagged. Use <Button> / <Button variant="primary"> instead.
        {
          selector:
            "JSXOpeningElement[name.name='button'] > JSXAttribute[name.name='className'] > Literal[value=/(?=.*bg-primary(-strong)?(\\s|$))(?=.*text-(primary-foreground|white)(\\s|$))/]",
          message:
            "Hand-rolled primary CTA — use the <Button> primitive (variant primary) instead of bg-primary[-strong] text-primary-foreground/white markup on a raw <button>.",
        },
      ],
    },
  },
  {
    // Hex-colour guardrail EXEMPTIONS. The original burn-down list has been
    // tokenized; these four remain by design, not as TODOs, because the hex
    // has no faithful THEME/Tailwind token home:
    //   - ShareCard      generated share IMAGE — fixed colours for export,
    //                    must not shift with theme.
    //   - PRBadge        gold badge ARTWORK (#facc15) — no gold token.
    //   - PRCard         driven by a configurable `accentColor` PROP; the hex
    //                    are component-config defaults, not stray drift.
    //   - ActivityCard   the "liked" amber (#F59E0B) has no semantic token
    //                    (closest is the nutrition orange — wrong meaning).
    // The `text-muted` + dark-mode-leak guards stay enforced; only the hex
    // selectors are relaxed for these files.
    files: [
      "src/components/analytics/PRBadge.tsx",
      "src/components/analytics/PRCard.tsx",
      "src/components/social/ActivityCard.tsx",
      "src/components/social/ShareCard.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/(^|\\s)text-muted(\\s|$)/]",
          message:
            'Use "text-muted-foreground" — the bare "text-muted" class maps to the muted SURFACE fill and renders near-invisible text.',
        },
        {
          selector: "Literal[value=/(^|[\\s:])bg-white(\\s|$)/]",
          message:
            "Solid bg-white doesn't flip in dark mode — use bg-card / bg-background. If this surface is genuinely always-white (switch thumb, camera shutter), add an eslint-disable-next-line with the reason.",
        },
        {
          selector: "Literal[value=/(^|[\\s:])text-black(\\s|$)/]",
          message:
            "text-black doesn't flip in dark mode — use text-foreground (or text-card-foreground on cards).",
        },
        // ── Hand-rolled primary-CTA guard ────────────────────────────────
        // Every primary CTA routes through the <Button> primitive (variant
        // primary = the canonical bg-primary-strong). A `<button>` with a
        // STATIC primary-fill className is a hand-rolled CTA that bypasses the
        // primitive's shade + focus ring + 44px floor. Targets the button's own
        // string className only — tab/segment selectors that set bg-primary in a
        // ternary/template (active-state) aren't a plain Literal, so they're not
        // flagged. Use <Button> / <Button variant="primary"> instead.
        {
          selector:
            "JSXOpeningElement[name.name='button'] > JSXAttribute[name.name='className'] > Literal[value=/(?=.*bg-primary(-strong)?(\\s|$))(?=.*text-(primary-foreground|white)(\\s|$))/]",
          message:
            "Hand-rolled primary CTA — use the <Button> primitive (variant primary) instead of bg-primary[-strong] text-primary-foreground/white markup on a raw <button>.",
        },
      ],
    },
  },
]);

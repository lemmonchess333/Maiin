# AGENTS.md — Tropos

Guidance for AI agents (Codex et al.) working in this repo. Claude Code reads
`CLAUDE.md`; this file is the equivalent entry point for other agents.

## What Tropos is

An adaptive fitness PWA: React 19 + TypeScript 5.9 + Vite 7, Tailwind CSS v4,
React Router v7, Firebase 12 (Auth/Firestore/Functions/Storage), Recharts,
MapLibre, Framer Motion, Capacitor (iOS/Android). Path alias `@/` → `src/`.

## Commands

```bash
npm run dev          # local dev server (Vite)
npm run build        # tsc check + production build  — must pass before submitting
npm run lint         # ESLint (TS/TSX only; functions/ is excluded)
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright E2E
npm run verify       # lint + build + test in one shot — the pre-handback gate
```

Run `npm run verify` (= `npm run lint && npm run build && npm run test`)
before you hand work back.

## Repo conventions

- **Components:** default export, PascalCase filename.
- **Hooks:** named export, `use` prefix, camelCase.
- **Lib functions:** named export, camelCase.
- **Tests:** colocated in `__tests__/`, `*.test.ts(x)`.
- **Icons:** `lucide-react`, individual imports only.
- **Toasts:** `sonner` (`toast.success()` / `toast.error()`).
- **Class names:** `cn()` (`clsx` + `tailwind-merge`).
- `functions/` is plain CommonJS JS (not part of the TS/ESLint config). Every
  HTTP/trigger Cloud Function **must** declare `maxInstances` via `runWith` —
  see the deploy + safety notes in `CLAUDE.md` before touching `functions/`.
- Do **not** open a pull request unless explicitly asked.

## Design work — READ THIS

Anything visual must follow the Tropos design system. The full spec is
**[`DESIGN_GUIDE.md`](./DESIGN_GUIDE.md)** — read it before touching UI. The
non-negotiables, inline so you can't miss them:

1. **No new colours, gradients, or decorative elements.** The palette is closed.
2. **Purple = lifting/brand. Coral = running.** Never cross the sport-coding.
3. **Numbers = Archivo (the numeral font) + `tabular-nums`. Everything else = Plus Jakarta
   Sans.** Two fonts, no third — ever.
4. **44px minimum touch target** (iOS shell).
5. **Use the primitives** (`Button`, `IconButton`, `Banner`, `BottomSheet`,
   `Dialog`, `.ds-card`, `.ds-input`) — don't hand-roll a button from a `div`.
6. **Colours come from tokens, never hardcoded hex** — Tailwind classes
   (`bg-primary`, `text-muted-foreground`, `bg-primary-strong` for filled CTAs)
   or the `THEME` object from `@/lib/theme` (e.g. `THEME.running` for coral,
   which has no HSL token yet). Tints use the hex-alpha suffix pattern
   (`${THEME.running}0F` = 6%).
7. **Light AND dark mode must both work.** Verify both.
8. **WCAG AA contrast** + **reduced-motion** respected.
9. **Calm over flashy, breathing room over density.** When in doubt, do less.
10. **Design for 1000+ users, not "the one current user"** — cold-start, empty,
    and sparse-data states get the same care as the happy path.

Source of truth for tokens: `src/styles/tokens.css`, `src/index.css`,
`src/lib/theme.ts`, `src/styles/components.css`, `src/styles/animations.css`,
`src/components/ui/`.

> When this file or `DESIGN_GUIDE.md` disagrees with generic UI instincts, the
> docs win. When something genuinely isn't covered, ask before inventing.

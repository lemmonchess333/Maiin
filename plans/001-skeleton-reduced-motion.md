# 001 — Stop staggered skeletons going blank, worst under Reduce Motion

- **Status**: TODO
- **Commit**: 1ad7dd6a
- **Severity**: HIGH
- **Category**: Accessibility (Reduce Motion)
- **Estimated scope**: 2 source files and 1 new test file, about 40 lines

## Problem

`Skeleton` in `src/components/LoadingSkeleton.tsx:10-38` sets its animation
inline, which overrides the `motion-safe:animate-pulse` class it also carries.
A staggered block (any `stagger` prop) also starts at `opacity: 0` with
`animationFillMode: "forwards"`:

```tsx
/* src/components/LoadingSkeleton.tsx:10-38 — current */
export function Skeleton({ className, stagger }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      aria-live="polite"
      className={cn(
        "motion-safe:animate-pulse rounded-lg bg-muted dark:bg-muted/60",
        className
      )}
      style={{
        /* Theme-flipped token, not a literal. The hardcoded
           rgba(255,255,255,0.04) this replaced assumed a dark canvas: over
           light `bg-muted` (rgb 248,248,249) it changed the pixel by ZERO
           bytes, so every light-mode skeleton in the app had no sweep at
           all — only the `pulse` opacity. Same shape as the ChallengeCard
           marker that rendered invisibly on the white card. */
        backgroundImage:
          "linear-gradient(90deg, transparent 0%, var(--skeleton-shimmer) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        animation:
          "pulse 2s ease-in-out infinite, shimmer 1.5s ease-in-out infinite",
        animationDelay: stagger != null ? `${stagger * 80}ms` : undefined,
        opacity: stagger != null ? 0 : undefined,
        animationFillMode: stagger != null ? "forwards" : undefined,
      }}
    />
  );
}
```

Tailwind's `pulse` keyframe has only a `50% { opacity: 0.5 }` step. Its 0%
and 100% frames are taken from the element's own opacity, which the inline
style sets to `0`. So:

- **With motion on:** a staggered block swings 0 → 0.5 → 0, forever. It is
  never more than half visible, and it vanishes completely once per cycle.
- **With Reduce Motion on:** the global reset in
  `src/styles/animations.css:73-81` (`animation-duration: 0.01ms`,
  `animation-iteration-count: 1`) plays the pulse once, instantly. The
  `forwards` fill then holds the 100% frame, which is `opacity: 0`. **Every
  staggered block is invisible.** The inline `animation` also overrides the
  `motion-safe:` guard, so the class gives no protection.

This is a blank loading screen exactly for the people who asked for less
motion:

- `HomeSkeleton` (`src/components/LoadingSkeleton.tsx:97-110`), where every block is staggered, is Home's loading state (`src/pages/Home.tsx:740`).
- `ActivityCardSkeleton` is the feed's loading state (`src/components/social/views/FeedView.tsx:647-648,759-761`) and the profile's (`src/pages/UserProfile.tsx:331-332`).
- `CardSkeleton` and `ChartSkeleton` are used inside `HomeSkeleton`.

The `shimmer` sweep is constant motion but uses `ease-in-out`, so it
speeds up and slows down on every pass.

The shimmer keyframe it names lives here:

```css
/* src/styles/animations.css:28-36 — current */
/* ─── SKELETON SHIMMER (LoadingSkeleton names this keyframe inline) ── */
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

## Target

- A skeleton block is **always** at full opacity at rest. Motion only varies
  it between 1 and 0.5.
- The animation lives in CSS, inside `@media (prefers-reduced-motion: no-preference)`.
  Under Reduce Motion, a skeleton is a still block at full opacity. (Reduce
  Motion means fewer, gentler animations. A loading placeholder needs none:
  its shape and its `role="status"` already say "loading".)
- The stagger only offsets each block's place in the pulse, so the column
  breathes in sequence. It never hides a block.
- The sweep runs `linear`, because it is constant motion.

```css
/* target — src/styles/animations.css, replacing lines 28-36 */
/* ─── SKELETON (LoadingSkeleton's `Skeleton`) ─────────────────
   A breathing opacity and a sweep across the theme-flipped
   `--skeleton-shimmer` gradient the component sets inline. Only when
   motion is welcome: under Reduce Motion a skeleton is a still block at
   full opacity. The sweep is constant motion, so it runs linear. */
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
@keyframes ds-skeleton-pulse {
  50% {
    opacity: 0.5;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .ds-skeleton {
    animation:
      ds-skeleton-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite,
      shimmer 1.5s linear infinite;
  }
}
```

`cubic-bezier(0.4, 0, 0.6, 1)` is Tailwind's own `animate-pulse` curve, kept
for the breathing. The inline `animationDelay` still applies, because inline
style beats the stylesheet's `animation` shorthand.

```tsx
/* target — src/components/LoadingSkeleton.tsx, Skeleton */
export function Skeleton({ className, stagger }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      aria-live="polite"
      className={cn("ds-skeleton rounded-lg bg-muted dark:bg-muted/60", className)}
      style={{
        /* Theme-flipped token, not a literal. The hardcoded
           rgba(255,255,255,0.04) this replaced assumed a dark canvas: over
           light `bg-muted` (rgb 248,248,249) it changed the pixel by ZERO
           bytes, so every light-mode skeleton in the app had no sweep at
           all — only the `pulse` opacity. Same shape as the ChallengeCard
           marker that rendered invisibly on the white card. */
        backgroundImage:
          "linear-gradient(90deg, transparent 0%, var(--skeleton-shimmer) 50%, transparent 100%)",
        backgroundSize: "200% 100%",
        /* The stagger offsets each block's place in the pulse (the
           `.ds-skeleton` animation in animations.css), so a column breathes
           in sequence. It never hides a block. Blocks used to start at
           opacity 0 and fill `forwards` into a keyframe with no end state,
           which left every staggered block invisible under Reduce Motion:
           a blank Home and feed while loading. */
        animationDelay: stagger != null ? `${stagger * 80}ms` : undefined,
      }}
    />
  );
}
```

## Repo conventions to follow

- Hand-written keyframes and their classes live in `src/styles/animations.css`,
  prefixed `ds-` (see `ds-run-pulse` / `.btn-start-run-pulse` at the top of
  that file). Imitate that.
- `src/lib/__tests__/stylesUsage.test.ts` fails on a class or keyframe that
  nothing uses. `.ds-skeleton` is used by `Skeleton`, `ds-skeleton-pulse` and
  `shimmer` are named by the `.ds-skeleton` rule, so all three stay live.
- `src/components/__tests__/skeletonShimmerThemes.test.tsx:138-144` reads
  `el.style.backgroundImage`. The gradient **must stay inline**.
- File-scanning tests in this repo resolve the root as
  `resolve(dirname(fileURLToPath(import.meta.url)), "../../..")` (see
  `skeletonShimmerThemes.test.tsx:31`). Imitate that.

## Steps

1. In `src/styles/animations.css`, replace lines 28-36 (the
   `SKELETON SHIMMER` header comment and `@keyframes shimmer`) with the CSS
   block under **Target**, exactly.
2. In `src/components/LoadingSkeleton.tsx`, replace the `Skeleton` function
   (lines 10-38) with the TSX under **Target**, exactly. In the className,
   `motion-safe:animate-pulse` becomes `ds-skeleton`. The inline
   `animation`, `opacity` and `animationFillMode` keys are gone. Run
   prettier on the file afterwards. It may wrap the `cn(...)` call over
   several lines, which is fine.
3. In the same file, the comment above `function Bar` (lines 112-124) gives
   two reasons. Reason 1 is no longer true. Replace the whole comment with:

   ```tsx
   /*
    * Route-shaped page-load skeletons (the app-root Suspense fallback).
    *
    * These use `Bar`, NOT `Skeleton` above: `Skeleton` fills with
    * `bg-muted`, which is ~the same colour as the grouped page background —
    * so a block placed directly on the page (a title, a pill row) is
    * invisible. `Bar` fills with a translucent `foreground` tint that
    * contrasts on BOTH the page background and the white card surface, and
    * uses Tailwind's built-in `motion-safe:animate-pulse`.
    */
   ```

4. Create `src/components/__tests__/skeletonReducedMotion.test.tsx`:

   ```tsx
   import { describe, it, expect } from "vitest";
   import { render } from "@testing-library/react";
   import { readFileSync } from "node:fs";
   import { fileURLToPath } from "node:url";
   import { dirname, resolve } from "node:path";
   import { Skeleton } from "../LoadingSkeleton";

   /**
    * A staggered skeleton block used to start at opacity 0 and fill
    * `forwards` into Tailwind's `pulse`, whose only step is 50%. Under
    * Reduce Motion the global reset plays an animation once, instantly, so
    * the fill held opacity 0: Home and the feed loaded as blank screens for
    * exactly the people who asked for less motion. The block now never
    * hides, and its animation only exists when motion is welcome.
    */
   const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
   const css = readFileSync(resolve(repoRoot, "src/styles/animations.css"), "utf8")
     .replace(/\/\*[\s\S]*?\*\//g, "");

   describe("Skeleton — never hidden, motion only when welcome", () => {
     it("a staggered block carries no opacity, fill mode or inline animation", () => {
       const { container } = render(<Skeleton stagger={3} />);
       const el = container.firstElementChild as HTMLElement;
       expect(el.style.opacity).toBe("");
       expect(el.style.animationFillMode).toBe("");
       expect(el.style.animation).toBe("");
       expect(el.style.animationDelay).toBe("240ms");
       expect(el.classList.contains("ds-skeleton")).toBe(true);
     });

     it("the skeleton animation is declared once, inside a no-preference query", () => {
       expect(css.match(/\.ds-skeleton\b/g)).toHaveLength(1);
       expect(css).toMatch(
         /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.ds-skeleton\s*\{[^}]*ds-skeleton-pulse[^}]*shimmer 1\.5s linear infinite/
       );
     });
   });
   ```

## Boundaries

- Do NOT touch `Bar`, `PillRowSkeleton` or the route skeletons. They use
  `motion-safe:animate-pulse` correctly.
- Do NOT remove the `style={{ animationDelay }}` on the `CardSkeleton` /
  `ChartSkeleton` wrapper divs (lines 44 and 57). They animate nothing and
  are harmless, so they are out of scope.
- Do NOT move `backgroundImage` / `backgroundSize` into CSS. A test reads
  them inline.
- Do NOT change `UNGUARDED_ANIMATION_BASELINE` in
  `src/lib/__tests__/designSystemInvariants.test.ts:307`. This change
  removes a guarded class and adds no unguarded one.
- Do NOT add dependencies.
- If the code at the cited lines does not match this plan (drift since
  1ad7dd6a), STOP and report instead of improvising.

## Verification

- **Mechanical**:
  - `npx vitest run src/components/__tests__/skeletonReducedMotion.test.tsx src/components/__tests__/skeletonShimmerThemes.test.tsx src/lib/__tests__/stylesUsage.test.ts src/lib/__tests__/designSystemInvariants.test.ts` passes.
  - `npm run lint` passes: read the `✖ N problems (E errors…)` line or the exit code, not the last line.
  - `npm run verify` passes.
- **Feel check**: run `npm run dev`. Make Home's loading state stay up, by
  throttling the network to "Slow 3G" in DevTools and reloading `/`, then:
  - With motion on, every block is visible from the first frame. The blocks
    breathe between full and half opacity in a top-to-bottom wave, and never
    blink out.
  - The sweep crosses each block at a constant speed, with no
    speed-up and slow-down at the edges.
  - In DevTools → Rendering, set **Emulate CSS media feature
    prefers-reduced-motion** to `reduce` and reload. Every block shows as a
    still, solid grey shape at full opacity. Nothing is blank.
  - In the Animations panel at 10% playback, the pulse's lowest point is
    0.5 opacity, not 0.
- **Done when**: under emulated Reduce Motion,
  `getComputedStyle(el).opacity === "1"` for every `[aria-label="Loading"]`
  element on Home's skeleton. With motion on, no block's computed opacity
  ever reads below 0.5. The new test passes.

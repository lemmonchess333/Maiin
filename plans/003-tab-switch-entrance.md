# 003 — Make switching tabs nearly instant: a 150ms fade, no slide, no restagger

- **Status**: IN PR (#2579)
- **Commit**: 1ad7dd6a
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 3 files, about 30 lines (mostly deletion)

## Problem

Switching tabs is the most frequent thing anyone does in the app, tens of
times a day. Every switch currently plays three animations in sequence.

**1. Layout slides the whole page in.** `src/components/Layout.tsx:132-146`
works out a direction from the tab-index delta. `:287-296` mounts the page
24px to the side and slides it in over 0.2s, with framer's default
easeInOut:

```tsx
/* src/components/Layout.tsx:132-146 — current */
  // Directional page transition: slide toward the new tab's side. Derived
  // from the tab-index delta so a TAP on the nav slides the same way a swipe
  // does. Uses React's "adjust state during render" pattern to remember the
  // previous tab index — computing slideDir synchronously so the keyed
  // motion.div below mounts with the correct entry offset (an effect would
  // land one render too late). Sub-page nav (idx -1) just fades (slideDir 0).
  const activeIdx = tabRoutes.indexOf(location.pathname);
  const [prevIdx, setPrevIdx] = useState(activeIdx);
  const [slideDir, setSlideDir] = useState<-1 | 0 | 1>(0);
  if (prevIdx !== activeIdx) {
    setSlideDir(
      activeIdx !== -1 && prevIdx !== -1 ? (activeIdx > prevIdx ? 1 : -1) : 0
    );
    setPrevIdx(activeIdx);
  }
```

```tsx
/* src/components/Layout.tsx:287-296 — current */
        <motion.div
          key={location.pathname}
          initial={
            prefersReducedMotion ? false : { opacity: 0, x: slideDir * 24 }
          }
          animate={{ opacity: 1, x: 0 }}
          transition={
            prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }
          }
        >
```

**2. PageShell restaggers every section.** Every tab root renders through
`PageShell`. It starts all of its variant children at `hidden`
(`opacity: 0, y: 12`) and staggers them in at 0.06s intervals, 0.3s each
(`src/components/ui/pageMotion.ts:13-21`):

```tsx
/* src/components/ui/PageShell.tsx:93-99 — current */
    <motion.div
      {...rest}
      className={cn("space-y-4", className)}
      initial="hidden"
      animate="visible"
      variants={pageStaggerContainer}
    >
```

The children are the header plus every section a page marks with
`pageItemVariant` or its own `hidden`/`visible` variants:

- Home's six section wrappers (`src/pages/Home.tsx:894, 945, 974, 999, 1025, 1086`)
- Food (`src/pages/Food.tsx:1837, 1844, 1882, 1939, 2159`)
- History (`src/pages/History.tsx:1025`)
- Settings (`src/pages/SettingsIndex.tsx:201, 229`)

**3. Home's session cards stagger again inside that.**
`src/components/home/StackedCTACards.tsx:48-53` sets its own
`initial="hidden"`, so it ignores its parent and staggers its cards
(`y: 10`, 0.25s, 0.08s apart) every time Home mounts:

```tsx
/* src/components/home/StackedCTACards.tsx:48-53 — current */
    <motion.div
      className="space-y-3"
      initial="hidden"
      animate="visible"
      variants={stagger}
    >
```

Together, Home takes about 0.7s to settle on every return to it. The slide
uses easeInOut, which starts slowly, so the page feels like it lags the tap.
Nothing here tells the person anything they don't already know: they tapped
the tab and know where they are going. At this frequency the rule is
"remove or drastically reduce".

## Target

- **Layout:** a 150ms opacity fade on the strong UI ease-out, and no
  horizontal movement. Under Reduce Motion it stays instant.
  ```tsx
  /* target — src/components/Layout.tsx, the page motion.div */
          <motion.div
            key={location.pathname}
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { duration: 0.15, ease: [0.23, 1, 0.32, 1] }
            }
          >
  ```
  `[0.23, 1, 0.32, 1]` is `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`,
  the strong ease-out for UI. Nothing in `src/` defines it yet, so it is
  written inline.
- **PageShell:** `initial={false}`. Framer then mounts the shell and every
  variant child at `visible`. That covers every child listed above, and any
  section that mounts later inside the shell, because variant children
  inherit `initial` from their parent.
- **StackedCTACards:** `initial={false}`, for the same reason. It sets its
  own `initial`, so the shell's value does not reach it.
- The direction state is deleted. With no slide it has no reader.

## Repo conventions to follow

- Reduce Motion in framer is branched on `useReducedMotion()` from
  `@/hooks/useReducedMotion`. Layout already holds it as
  `prefersReducedMotion` (`src/components/Layout.tsx:90`), and already branches
  `initial` / `transition` on it. Keep that shape. See the banner animations
  at `src/components/Layout.tsx:212-221` for the same idiom.
- `initial={false}` is the house way to say "start settled". See the tab
  icon at `src/components/BottomNavigation.tsx:155`.

## Steps

1. `src/components/Layout.tsx`: delete lines 132-146 (the "Directional page
   transition" comment, `activeIdx`, `prevIdx`/`setPrevIdx`,
   `slideDir`/`setSlideDir` and the `if` block). Keep `tabRoutes` and the
   `useSwipeNavigation` call above them (lines 125-130), which still use it.
2. `src/components/Layout.tsx`: replace the page `motion.div` opening tag
   (lines 287-296) with the Layout target above. Keep the comment above
   `<main>` (lines 278-280). It is still true.
3. Check `useState` is still imported and used in Layout. It is
   (`retryingUid`, line 97), so leave the import alone.
4. `src/components/ui/PageShell.tsx:96`: `initial="hidden"` →
   `initial={false}`. Leave `animate="visible"` and
   `variants={pageStaggerContainer}`.
5. `src/components/home/StackedCTACards.tsx:50`: `initial="hidden"` →
   `initial={false}`.
6. Leave `src/components/ui/pageMotion.ts` and every page's `variants=` prop
   as they are. The `hidden` states become unreachable but harmless.
   Removing them is a separate cleanup, listed in `plans/README.md`.

## Boundaries

- Do NOT touch `useSwipeNavigation` or `tabRoutes`.
- Do NOT touch Program's day carousel (`src/pages/Program.tsx:1226-1238`).
  It sets its own `initial="enter"` and is a deliberate in-page direction
  cue, not a page entrance.
- Do NOT change any card's own mount animation (CalorieRing's draw, count-ups,
  `useCountUp`). This plan is the page-level slide and the two staggers only.
- Do NOT add an `exit` / `AnimatePresence` to the page. Exits on tab switches
  would hold the old page on screen.
- Do NOT add dependencies.
- If the code at the cited lines does not match this plan (drift since
  1ad7dd6a), STOP and report instead of improvising.

## Verification

- **Mechanical**:
  - `npx vitest run src/components src/pages/__tests__/Home.firstVisitGuide.test.tsx`
    passes. The guide walk measures `data-guide-stop` targets, which now
    sit still from the first frame.
  - `npx tsc -b` and `npm run lint` pass. For lint, read the `✖` summary line
    or the exit code: an unused `useState` or a leftover `slideDir` shows
    there.
  - `npm run verify` passes.
- **Feel check**: run `npm run dev` with the mobile emulator on, signed in:
  - Tap Home → Food → Train → Social → Home in quick succession. Each page
    is just there. It fades in over a blink, with no sideways travel and no
    sections rising into place.
  - Spam-tap between two tabs. Nothing stacks up or replays from offset, and
    the page never lags the tab bar's pill.
  - Swipe between tabs on a tab root. The page changes with the same quick
    fade, and no slide.
  - In the Animations panel at 10% playback, only `opacity` animates on the
    page wrapper, 0 → 1 over 150ms. It is fast at the start and settles at
    the end, which is ease-out. No `transform` appears on the wrapper or the
    PageShell sections.
  - Under emulated `prefers-reduced-motion: reduce`, the page swaps
    instantly, as before.
  - Open a sub-page (Settings → Profile). It fades the same way, with no slide.
- **Done when**: the `slideDir`, `prevIdx` and `activeIdx` identifiers no
  longer appear in `src/components/Layout.tsx`. `grep -n 'initial="hidden"'
  src/components/ui/PageShell.tsx src/components/home/StackedCTACards.tsx`
  prints nothing. Home is fully settled within 150ms of a tab tap. A
  Performance recording of the tap shows no animation frames on Home's
  sections after 150ms.

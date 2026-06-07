# Home visual-hierarchy prototype (Home2-hierarchy) — THROWAWAY

**Question:** Should the Home screen stay a flat equal-altitude card stack,
or gain visual hierarchy via section grouping / tiering?

**Route (dev only):** `/Maiin/prototype/home-hierarchy?variant=A|B|C`
(mounted outside the auth gate so it's viewable without login). Floating
bottom bar + ← / → keys cycle variants.

**Cards are faithful MOCKS** (real card classes, the `SectionLabel`
primitive, real sport tokens, representative content/density). The
question is ARRANGEMENT, not card internals — so no data wiring.

## Variants

- **A — Flat (control).** Today's layout: equal-altitude `gap-4` stack,
  no group labels. WeekStrip → Performance hero → nudge → energy → CTAs →
  insight.
- **B — Grouped (iOS sections).** Three labelled groups
  (`YOUR WEEK` / `PERFORMANCE` / `TODAY`) using `SectionLabel tier="section"`,
  tight within a group (`space-y-2`), airy between groups (`gap-7`).
- **C — Hero-first (demoted tail).** One dominant Performance hero (larger
  padding) at top, a hairline divider, then everything else collapsed into
  a compact, quieter secondary tier.

## Verdict

_PENDING — awaiting the user's pick. Capture the chosen direction (or the
"B's grouping + C's hero emphasis" hybrid) here, then fold it into
`src/pages/Home.tsx` and delete:_

- `src/pages/__prototype__/` (this dir)
- `src/components/__prototype__/PrototypeSwitcher.tsx`
- the `import.meta.env.DEV` prototype route + lazy import in `src/App.tsx`

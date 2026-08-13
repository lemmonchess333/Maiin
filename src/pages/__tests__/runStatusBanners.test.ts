/**
 * The run screen's status banners must stack, not float at hand-picked
 * offsets — and the whole file must stay off the raw Tailwind palette.
 *
 * Device QA, 2026-08-12. Three banners were each absolutely positioned at
 * their own `top-*`, and it went wrong in two ways at once:
 *
 *   - `autoPaused` and `bgGapBanner` BOTH sat at `top-20`, so any moment
 *     where both applied rendered them on top of each other;
 *   - the GPS-recovering pill sat at `top-32`, far enough down that with the
 *     bottom sheet expanded it landed squarely over the elapsed-time
 *     readout — the single most important number on the screen — and was
 *     itself `z-50`, so it won.
 *
 * Both are the same underlying mistake: vertical position picked per element
 * instead of derived from what else is showing. They now share one
 * flow-stacked container, which is why this file asserts on POSITIONING
 * rather than on any single banner's offset — moving `top-32` to `top-24`
 * would have satisfied a narrower test and left the class of bug alive.
 *
 * Asserted against source. A render test would need the GPS hook, the map,
 * a live timer and a bottom sheet at a specific drag offset to reproduce a
 * collision that is fundamentally about CSS position — it would pin the
 * fixture, not the property.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const runSrc = readFileSync(resolve(repoRoot, "src/pages/Run.tsx"), "utf8");

/** Comments are not markup. This file's own explanatory comments name the
 *  old classes, and matching raw source would flag them. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}
const run = stripComments(runSrc);

describe("run screen — status banners share one stack", () => {
  it("no banner is positioned at a hand-picked vertical offset", () => {
    // `top-20` and `top-32` were the two colliding offsets. The surviving
    // anchor is `top-3`, which the stack as a whole hangs from.
    expect(run).not.toMatch(/absolute[^"]*\btop-20\b/);
    expect(run).not.toMatch(/absolute[^"]*\btop-32\b/);
  });

  it("keeps exactly one top-anchored overlay stack", () => {
    // The positive control. If the stack were deleted rather than the
    // offsets, the assertion above would pass while the banners vanished.
    const anchors = run.match(/absolute inset-x-0 top-3 z-50 flex/g) || [];
    expect(anchors).toHaveLength(1);
    expect(run).toMatch(/flex-col items-center gap-1\.5/);
  });

  it("gives the stack full width, not half", () => {
    /* `left-1/2` centres visually via a transform but leaves the box only
       half the container to lay out in, so at 375px a pill capped at
       ~187px and "GPS recovering · last fix 47s ago" wrapped to two lines.
       Two lines is then tall enough for the expanded sheet to clip — which
       looked like a separate bug and was the same one. */
    expect(run).not.toMatch(/absolute[^"]*\bleft-1\/2\b[^"]*flex-col/);
    expect(run).toMatch(/absolute inset-x-0 top-3/);
  });

  it("keeps every banner on one line", () => {
    // The height of this stack is what decides whether the sheet clips it,
    // and the text is dynamic (the age counts up), so the guard is on the
    // wrap rather than on any particular string length.
    // Whole className, not a fragment: the utility order is not fixed, and
    // a regex anchored mid-string silently missed `whitespace-nowrap`
    // sitting before `rounded-full` when this was first written.
    const pills =
      run.match(/className="[^"]*bg-(?:warning|destructive)-bg[^"]*"/g) || [];
    expect(pills.length).toBe(3);
    for (const cls of pills) expect(cls).toContain("whitespace-nowrap");
  });

  it("still renders all three banners", () => {
    // Guards against "fixing" the collision by removing the banners.
    expect(run).toMatch(/Auto-paused · start moving to resume/);
    expect(run).toMatch(/bgGapBanner/);
    expect(run).toMatch(/GPS recovering · last fix/);
  });
});

describe("run screen — design-system invariants", () => {
  const RAW_PALETTE =
    /\b(?:bg|text|border|from|to|via)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b/g;

  it("uses semantic tokens, never the raw Tailwind palette", () => {
    /* The GPS signal indicator was a green/amber/red traffic light built
       from `bg-green-400` / `bg-yellow-400` / `bg-red-400` — which is
       exactly what the success/warning/destructive tokens mean, so it was
       hand-rolling a thing the design system already owns. Ten occurrences
       in this one file. */
    expect(run.match(RAW_PALETTE) || []).toEqual([]);
  });

  it("gates every ambient loop behind motion-safe", () => {
    // `prefers-reduced-motion` must get the settled state. Five pulses in
    // this file, none of them guarded before.
    expect(run.match(/(?<!motion-safe:)animate-pulse/g) || []).toEqual([]);
    expect(run).toMatch(/motion-safe:animate-pulse/);
  });

  it("the detector would catch a reintroduction", () => {
    // Guards the guard: a regex that matched nothing would make both
    // assertions above vacuously true, and the failure would look like
    // success.
    expect("bg-red-500/20".match(RAW_PALETTE)).not.toBeNull();
    expect("text-yellow-300".match(RAW_PALETTE)).not.toBeNull();
    expect("animate-pulse".match(/(?<!motion-safe:)animate-pulse/g)).not.toBeNull();
  });
});

describe("workout session — PREV is a working-set reference", () => {
  const workout = stripComments(
    readFileSync(resolve(repoRoot, "src/components/WorkoutSession.tsx"), "utf8")
  );

  it("shows no previous figure on a warm-up row", () => {
    /* On a 60kg squat the warm-up ramp (20 / 30 / 42.5) was each captioned
       "PREV 60×8" — the last working set — and each one tappable to prefill
       60kg as a warm-up. The label is per-exercise, so every row in the grid
       carried the same value regardless of what that row is for. */
    expect(workout).toMatch(/set\.type === "warmup" \?/);
  });

  it("still offers tap-to-fill on working rows", () => {
    // The other half: suppressing PREV everywhere would also pass the
    // assertion above while removing a real affordance.
    expect(workout).toMatch(/canFillPrev && !set\.completed && prev/);
    expect(workout).toMatch(/\{prevLabel\}/);
  });
});

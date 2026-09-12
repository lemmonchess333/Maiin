/**
 * Design-system invariants as tests, not vigilance (D15).
 *
 * CLAUDE.md names three invariants that "regress constantly and keep getting
 * swept up after the fact": (1) numeric displays use font-mono + tabular-nums,
 * (2) every colour is a THEME/token (no hex), (3) interactive elements clear
 * 44px via the Button/IconButton/Toggle primitives.
 *
 * #2 (hex) is already LINT-enforced (eslint.config.js no-restricted-syntax).
 * #1 and #3 are NOT — they're caught only by per-PR eyeballing, which is exactly
 * how the week-strip mono bug slipped in. This test converts that vigilance into
 * a CI nudge.
 *
 * These are HEURISTICS, shipped as RATCHETS (the backlog's "warnings, not
 * errors, and tune" guidance): the current violation count is pinned as a
 * BASELINE, and the test fails only when a change pushes the count ABOVE it.
 * Existing violations are grandfathered (burn them down in D16's primitive
 * sweep); new ones are blocked. When you fix some and the count drops, lower the
 * baseline to lock in the win — the test prints the new floor when it notices
 * slack.
 *
 * Deliberately imperfect: a ratchet trades precision for zero false FAILURES on
 * existing code while still stopping regressions. Don't chase 100% precision.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const srcRoot = resolve(repoRoot, "src");

/** Every .tsx under src (components + pages + features), tests excluded.
 *  `pages/dev/*` is excluded too — those are internal dev-only tools (e.g. the
 *  font bake-off), not shipped product surface subject to the DS invariants. */
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (
        name === "node_modules" ||
        name === "__tests__" ||
        name === "test" ||
        name === "dev"
      )
        continue;
      out.push(...tsxFiles(full));
      continue;
    }
    if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const FILES = tsxFiles(srcRoot);

/** Collect every className UNIT in a file — each unit is the resolved class
 *  string for one element. Handles `className="…"`, `className='…'`, multi-line
 *  `className={`…`}`, AND `className={cn(…)}` / clsx / twMerge (the dominant
 *  pattern here — a per-element check would miss it, which is how the
 *  StreakFlame/RestTimer mono gaps hid). For a cn() call, all string-literal
 *  segments are concatenated into one unit so `font-mono` in one arg covers
 *  `tabular-nums` in another (no false positive). Inline `style` objects
 *  (`fontVariantNumeric: "tabular-nums"`) are deliberately NOT scanned — that's
 *  a different font mechanism where `font-mono` doesn't apply. */
function classNameChunks(src: string): string[] {
  const chunks: string[] = [];
  // className="..." and className='...'
  for (const m of src.matchAll(/className=("([^"]*)"|'([^']*)')/g)) {
    chunks.push(m[2] ?? m[3] ?? "");
  }
  // className={`...`} (template literal — capture the whole literal body)
  for (const m of src.matchAll(/className=\{`([\s\S]*?)`\}/g)) {
    chunks.push(m[1]);
  }
  // className={cn(...)} / clsx(...) / twMerge(...) — concat every string-literal
  // segment in the call body into one unit (non-greedy to the first `)}`).
  for (const m of src.matchAll(
    /className=\{(?:cn|clsx|twMerge)\(([\s\S]*?)\)\}/g
  )) {
    let combined = "";
    for (const s of m[1].matchAll(/[`"']([^`"']*)[`"']/g))
      combined += " " + s[1];
    chunks.push(combined);
  }
  return chunks;
}

/** Count occurrences of a per-file predicate across the whole tree, returning
 *  the total and the offending files (for an actionable message). */
function scan(predicate: (src: string, rel: string) => number): {
  total: number;
  byFile: Map<string, number>;
} {
  const byFile = new Map<string, number>();
  let total = 0;
  for (const file of FILES) {
    const rel = relative(repoRoot, file);
    const n = predicate(readFileSync(file, "utf8"), rel);
    if (n > 0) {
      byFile.set(rel, n);
      total += n;
    }
  }
  return { total, byFile };
}

/** Ratchet assertion: total must not exceed baseline; if it's safely BELOW,
 *  surface the new floor so the next PR can tighten it. */
function expectRatchet(
  label: string,
  total: number,
  baseline: number,
  byFile: Map<string, number>
) {
  const offenders = [...byFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([f, n]) => `${f} (${n})`)
    .join("\n  ");
  expect(
    total,
    `${label}: ${total} violations, baseline ${baseline}. A change ADDED ` +
      `violations. Route the new control/number through the primitive / add ` +
      `the missing class, or justify and bump the baseline.\n  ${offenders}`
  ).toBeLessThanOrEqual(baseline);
  if (total < baseline) {
    // Not a failure — a nudge. The win is real; lock it in.
    console.info(
      `[DS ratchet] ${label}: ${total} < baseline ${baseline} — lower the ` +
        `baseline to ${total} to lock in the fix.`
    );
  }
}

describe("D15 · DS invariant — touch-target primitive (44px floor)", () => {
  // Invariant #3 proxy: a `role="switch"` element IS a toggle and must be the
  // Toggle primitive (which supplies the 44px floor + focus ring + haptic). A
  // hand-rolled <button role="switch"> bypasses all three. The Toggle primitive
  // itself legitimately carries the role, so it's excluded.
  const SWITCH_BASELINE = 0; // fully burned down — every toggle is now the Toggle primitive. Floor is 0: any hand-rolled role=switch fails.
  it("hand-rolled role=switch toggles do not increase (use the Toggle primitive)", () => {
    const { total, byFile } = scan((src, rel) => {
      if (rel.endsWith("components/ui/Toggle.tsx")) return 0;
      return (src.match(/role=("switch"|'switch')/g) || []).length;
    });
    expectRatchet("hand-rolled role=switch", total, SWITCH_BASELINE, byFile);
  });

  it("the Toggle primitive itself clears the 44px floor (positive pin)", () => {
    const toggle = readFileSync(
      resolve(srcRoot, "components/ui/Toggle.tsx"),
      "utf8"
    );
    // The primitive must guarantee the touch target — a 44px affordance
    // somewhere in its markup (`size-11` = 44px square, or a min/fixed height).
    // This is what makes routing through it the fix for the ratchet above.
    expect(
      /size-11|min-h-\[44|h-11|h-12|h-14|min-h-11|min-h-12/.test(toggle)
    ).toBe(true);
  });

  it("the Button primitive's DEFAULT (md) size keeps the 44px floor", () => {
    // The shared Button is how the "every CTA clears 44px" invariant is actually
    // satisfied across the app. A regression that shrank the md default would
    // silently break every default CTA's touch target — pin it. (sm is
    // intentionally 36px for inline filters; not pinned here.)
    // The SIZE_CLASSES map was extracted from Button.tsx into buttonClasses.ts
    // (so non-button controls — e.g. nav <Link> CTAs — can share the canonical
    // look via buttonClasses()); the md floor now lives there.
    const buttonSource = readFileSync(
      resolve(srcRoot, "components/ui/buttonClasses.ts"),
      "utf8"
    );
    expect(buttonSource, "Button md size must keep min-h-[44px]").toMatch(
      /md:\s*"min-h-\[44px\]/
    );
  });

  it("the IconButton primitive's DEFAULT (md) size keeps the 44px floor", () => {
    // size-11 = 44px square. Same cascade risk as Button — header chrome / close
    // buttons all rely on this default. (sm is intentionally size-9; not pinned.)
    const iconButton = readFileSync(
      resolve(srcRoot, "components/ui/IconButton.tsx"),
      "utf8"
    );
    expect(iconButton, "IconButton md size must keep size-11 (44px)").toMatch(
      /md:\s*"size-11"/
    );
  });
});

describe("D15 · DS invariant — numeric displays use the mono numeral font", () => {
  /* Only ONE direction of this is a defect, and it is worth saying so
     because the other one scans as if it were. `font-mono` WITHOUT
     `tabular-nums` looks like the same class of miss and is not: `index.css`
     applies `font-variant-numeric: tabular-nums` (and `tnum`) to every
     `.font-mono` element, precisely because Archivo is proportional. So the
     class is redundant wherever `font-mono` is present, and a sweep to add
     it — the live run HUD's big numbers among them — would change nothing.
     That rests entirely on the stylesheet rule, so the rule is pinned below
     rather than trusted: if it ever goes, those sites become real defects
     the same day.

     The direction after that IS real: `tabular-nums` alone opts into aligned
     columns while leaving the text in the proportional UI face, which is the
     week-strip bug's exact shape. */

  it("`.font-mono` forces tabular figures, so the class alone is enough", () => {
    // Archivo is proportional (it replaced JetBrains Mono in the brand
    // bake-off), so digit alignment is not inherent to the face — it comes
    // from this rule. Everything that writes `font-mono` and omits
    // `tabular-nums` depends on it.
    const css = readFileSync(resolve(repoRoot, "src/index.css"), "utf8");
    const rule = /\.font-mono\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule, "no `.font-mono` rule in index.css").not.toBe("");
    expect(rule).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  // Invariant #1 proxy: `tabular-nums` is a NUMERIC-display utility — if a
  // className opts into tabular figures, it's rendering numbers, so it must
  // also carry `font-mono` (the Archivo numeral font; CLAUDE.md). `tabular-nums`
  // WITHOUT `font-mono` is the week-strip-bug shape: aligned columns in the
  // wrong (proportional UI) font.
  const MONO_BASELINE = 0; // fully burned down from 30 → 14 → 0 (price/macro/usage/rank/date displays given font-mono; the FoodMealSection uppercase-label tabular-nums removed as spurious). Floor is 0: any tabular-nums without font-mono now fails. Keep numbers on the Archivo numeral font.
  it("tabular-nums classes also carry font-mono (no proportional-font numbers)", () => {
    const { total, byFile } = scan((src) => {
      let n = 0;
      for (const cls of classNameChunks(src)) {
        if (cls.includes("tabular-nums") && !cls.includes("font-mono")) n += 1;
      }
      return n;
    });
    expectRatchet(
      "tabular-nums without font-mono",
      total,
      MONO_BASELINE,
      byFile
    );
  });
});

/**
 * Surface-level drift ratchets (2026-09-05). Each of these is a convention
 * CLAUDE.md states and nothing enforced; each regressed silently in the
 * survey that produced the app-improvement prompt. Ratchets, not bans:
 * every one has legitimate instances (a pressable card IS a `<button>`, a
 * pill label IS `font-medium`, the wordmark h1 is deliberately not the page
 * title scale), so the assertion is only that a change does not ADD to the
 * count. Lower a baseline when you burn some down; raise one only with the
 * reason written beside the number.
 */
describe("DS ratchets — surface-level drift", () => {
  // Raw <button> elements. CTAs belong on the Button / IconButton
  // primitives (44px floor, focus ring, press feedback come with them);
  // pressable cards, rows, chips and day-cells are legitimately bare.
  const RAW_BUTTON_BASELINE = 386;
  it("raw <button> elements do not increase (CTAs use the Button primitive)", () => {
    const { total, byFile } = scan(
      (src) => (src.match(/<button\b/g) ?? []).length
    );
    expectRatchet("raw <button>", total, RAW_BUTTON_BASELINE, byFile);
  });

  /* font-medium (500) is the small-text emphasis weight, and this pins the
     boundary rather than a count.

     It used to be a count ratchet on the theory that 500 was off-scale
     drift — a "slightly bold" reflex against a documented 800/700/600.
     Counting where it actually lands settled that: of 269 uses carrying a
     size, 113 are text-sm and 105 are text-xs, and ZERO are text-lg or
     above. A convention that consistent across ~96 components is the
     scale, not drift, so DESIGN_GUIDE §Typography now documents 500 and
     the count is no longer interesting.

     What IS interesting is the boundary the codebase has never crossed:
     500 at heading scale would be a real regression, because that is
     where 600/700/800 carry the hierarchy. It sits at zero, which makes
     it the rare invariant that can be asserted outright. */
  it("font-medium never appears at heading scale (text-lg and above)", () => {
    const offenders: string[] = [];
    /* Per className CHUNK, not per line: the dominant pattern here is
       `className={cn(...)}` spanning several lines, where the weight and
       the size sit in different arguments. A line-wise check would miss
       exactly those. */
    scan((src, rel) => {
      for (const chunk of classNameChunks(src)) {
        if (!/\bfont-medium\b/.test(chunk)) continue;
        const size = chunk.match(/\btext-(lg|xl|2xl|3xl|4xl|5xl)\b/);
        if (size) offenders.push(`${rel}  font-medium + text-${size[1]}`);
      }
      return 0;
    });
    expect(
      offenders,
      `font-medium at heading scale. 500 is the small-text emphasis ` +
        `weight (text-sm / text-xs); hierarchy at text-lg and above is ` +
        `carried by 600 / 700 / 800. See DESIGN_GUIDE.md §Typography.\n` +
        offenders.join("\n")
    ).toEqual([]);
  });

  // Ambient animation must respect prefers-reduced-motion: `motion-safe:`
  // is the Tailwind spelling of that promise. `animate-none` is a reset,
  // not an animation, and is excluded.
  const UNGUARDED_ANIMATION_BASELINE = 8;
  it("animate-* classes without a motion-safe: prefix do not increase", () => {
    const { total, byFile } = scan((src) => {
      let n = 0;
      for (const m of src.matchAll(/(motion-safe:)?\banimate-([a-z0-9-]+)/g)) {
        if (!m[1] && m[2] !== "none") n++;
      }
      return n;
    });
    expectRatchet(
      "animate-* without motion-safe:",
      total,
      UNGUARDED_ANIMATION_BASELINE,
      byFile
    );
  });

  // The page-title scale is the H1 TOKEN (`text-h1`, ~31px), not `text-xl`.
  //
  // This block previously defined on-scale as `text-xl font-extrabold` — i.e.
  // it pinned 20px, the H3 *card-title* tier, as the page-title standard, and
  // noted that moving page titles onto the real H1 was out of scope. That is
  // the definition under which a card title outranked the page title on the
  // same screen. The five route pages now render their h1 through
  // `PageShell` at `text-h1`; the remaining `text-xl` h1s (settings and
  // detail sub-pages) are grandfathered here and burn down as they adopt
  // the shell.
  //
  // Two sanctioned exceptions to `text-h1`, both pinned below rather than
  // counted here: the Home brand WORDMARK (tracked uppercase — a brand
  // mark, not a page name) and the `PageShell` primitive itself, whose h1
  // takes its class from a variable the regex cannot read.
  const OFF_SCALE_H1_BASELINE = 22;
  const H1_PRIMITIVE = "src/components/ui/PageShell.tsx";
  it("<h1> elements off the H1 token do not increase", () => {
    const { total, byFile } = scan((src, rel) => {
      if (rel === H1_PRIMITIVE) return 0;
      let n = 0;
      for (const m of src.matchAll(/<h1\b([^>]*)>/g)) {
        const attrs = m[1];
        const c =
          /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{(?:cn|clsx|twMerge)\(([\s\S]*?)\)\})/.exec(
            attrs
          );
        const cls = c ? (c[1] ?? c[2] ?? c[3] ?? "") : "";
        if (!/\btext-h1\b/.test(cls)) n++;
      }
      return n;
    });
    expectRatchet("off-scale <h1>", total, OFF_SCALE_H1_BASELINE, byFile);
  });

  it("the PageShell primitive sizes its title at the H1 token (positive pin)", () => {
    // The exemption above is only safe because this holds.
    const shell = readFileSync(resolve(repoRoot, H1_PRIMITIVE), "utf8");
    expect(shell).toMatch(
      /text-h1 leading-tight tracking-tight font-extrabold/
    );
    // And the brand variant is the ONE way off the token: tracked uppercase.
    expect(shell).toMatch(/tracking-\[0\.14em\] uppercase/);
  });

  it("every route page renders its title through PageShell, not a local <h1>", () => {
    for (const page of ["Home", "Program", "Food", "Social", "History"]) {
      const src = readFileSync(
        resolve(repoRoot, `src/pages/${page}.tsx`),
        "utf8"
      );
      expect(src, `${page}.tsx should import PageShell`).toMatch(
        /from "@\/components\/ui\/PageShell"/
      );
      expect(src, `${page}.tsx should not declare its own <h1>`).not.toMatch(
        /<h1\b/
      );
    }
  });

  /* Cards. The measurements behind the `Card` primitive: 96 surfaces on
     `rounded-2xl p-4`, 64 on `rounded-xl p-3`, and 37 `bg-card` surfaces on
     some other radius/padding pairing — `p-3.5`, `rounded-lg p-4`,
     `rounded-2xl p-3`, `p-5`, `p-6`. A card on its own pairing is the
     "thrown together" the owner could feel and not name. The primitive
     decides the pairing; this counts the hand-rolled `bg-card` surfaces
     that carry BOTH a radius and a padding and are on neither pairing.
     Surfaces the primitive renders carry no `bg-card` literal, so
     migrating one lowers the count. (The 37 was a plain-string grep; this
     scanner also reads cn() and template chunks and found 45, of which the
     first migration batch — the Home CTA trio, the macro and lifetime
     tiles, the usual-meal card, the two flat programme cards — took 13.)
     Grandfathered: the settings option rows, the run-setup rows, the
     modals and the empty states — they adopt the primitive as they are
     touched. */
  const CARD_PAIRINGS = new Set(["rounded-2xl p-4", "rounded-xl p-3"]);
  const OFF_PAIRING_CARD_BASELINE = 32;
  const CARD_PRIMITIVE = "src/components/ui/cardClasses.ts";
  it("hand-rolled bg-card surfaces off the two card pairings do not increase", () => {
    const { total, byFile } = scan((src) => {
      let n = 0;
      for (const chunk of classNameChunks(src)) {
        if (!/\bbg-card\b/.test(chunk)) continue;
        const radius = /\brounded-(?:md|lg|xl|2xl|3xl)\b/.exec(chunk)?.[0];
        const padding = /\bp-\d+(?:\.\d+)?\b/.exec(chunk)?.[0];
        if (!radius || !padding) continue;
        if (!CARD_PAIRINGS.has(`${radius} ${padding}`)) n++;
      }
      return n;
    });
    expectRatchet(
      "bg-card off the two pairings",
      total,
      OFF_PAIRING_CARD_BASELINE,
      byFile
    );
  });

  it("the Card primitive carries exactly the two pairings (positive pin)", () => {
    // The ratchet above only means something if the thing surfaces migrate
    // TO is on the pairings. `cardClasses.ts` is a .ts file, outside the
    // .tsx scan, so it is read directly.
    const src = readFileSync(resolve(repoRoot, CARD_PRIMITIVE), "utf8");
    expect(src).toMatch(/hero: \{ radius: "rounded-2xl", padding: "p-4" \}/);
    expect(src).toMatch(/compact: \{ radius: "rounded-xl", padding: "p-3" \}/);
    expect(src).toMatch(/card: "bg-card card-shadow"/);
  });

  /* `shadow-card` is a trap, documented in index.css: Tailwind parses it
     as shadow-COLOUR=card with no size, so it renders nothing. Three cards
     that meant to float were flat because of it. The utility is
     `card-shadow`. Floor is 0: any new `shadow-card` in a class string
     fails. (`--ds-shadow-card` in a style object is the token, not the
     trap, and is not matched.) */
  const SHADOW_TRAP_BASELINE = 0;
  it("the shadow-card trap class does not appear (use card-shadow)", () => {
    const { total, byFile } = scan((src) => {
      let n = 0;
      for (const chunk of classNameChunks(src))
        n += (chunk.match(/\bshadow-card\b/g) ?? []).length;
      return n;
    });
    expectRatchet("shadow-card trap", total, SHADOW_TRAP_BASELINE, byFile);
  });

  /* Uppercase tracked labels hand-rolled beside `SectionLabel`. The
     primitive consolidated ~60 variants; the survivors below re-drift on
     every axis it fixed (size, tracking, weight, colour) and cannot take
     the role tiers. Counted: any class string carrying `uppercase` and a
     `tracking-*` utility. Grandfathered until touched (Diagnostics carries
     8 of them, RunDetail 4, WorkoutDetail 3); `pages/dev/*` is outside
     the scan as usual. */
  const HAND_ROLLED_LABEL_BASELINE = 34;
  const LABEL_PRIMITIVE = "src/components/ui/SectionLabel.tsx";
  it("hand-rolled uppercase tracked labels do not increase (use SectionLabel)", () => {
    const { total, byFile } = scan((src, rel) => {
      if (rel === LABEL_PRIMITIVE) return 0;
      let n = 0;
      for (const chunk of classNameChunks(src)) {
        if (
          /\buppercase\b/.test(chunk) &&
          /\btracking-(?:wide|wider|widest|\[[^\]]+\])/.test(chunk)
        )
          n++;
      }
      return n;
    });
    expectRatchet(
      "hand-rolled uppercase label",
      total,
      HAND_ROLLED_LABEL_BASELINE,
      byFile
    );
  });

  it("SectionLabel's two tiers share a size and differ on every other axis (positive pin)", () => {
    // The ratchet above sends labels to the primitive; this is what the
    // primitive promises. One pixel of difference between the tiers is
    // the drift being closed, so the size is pinned EQUAL and the rest
    // pinned different.
    const src = readFileSync(resolve(repoRoot, LABEL_PRIMITIVE), "utf8");
    expect(src).toMatch(
      /caption: "text-xs font-semibold tracking-wider text-muted-foreground"/
    );
    expect(src).toMatch(
      /section: "text-xs font-bold tracking-widest text-foreground"/
    );
    expect(src).not.toMatch(/text-caption/);
  });

  /* Inline banners. `Banner` and `SustainedOfflineBanner` each carried
     their own geometry (rounded-xl p-3 gap-3 with a 16px icon beside
     rounded-lg px-3 py-2 gap-2 with a 14px icon and a self-margin), and
     the offline one kept an always-rendered live-region wrapper that sat
     in the page rhythm as an empty first child. One primitive now: the
     offline notice renders through Banner's neutral variant, and Banner's
     base geometry is the compact-card pairing. */
  const BANNER_PRIMITIVE = "src/components/ui/Banner.tsx";
  const OFFLINE_BANNER = "src/components/ui/SustainedOfflineBanner.tsx";
  it("the offline notice renders through the Banner primitive, with no permanent wrapper (positive pin)", () => {
    const src = readFileSync(resolve(repoRoot, OFFLINE_BANNER), "utf8");
    expect(src).toMatch(/<Banner\b/);
    // The attribute, not the word — the header comment names what went.
    expect(src).not.toMatch(/aria-live=/);
    for (const chunk of classNameChunks(src))
      expect(chunk).not.toMatch(/\b(?:rounded-lg|py-2|mt-2)\b/);
  });

  it("Banner's base geometry is the compact-card pairing (positive pin)", () => {
    const src = readFileSync(resolve(repoRoot, BANNER_PRIMITIVE), "utf8");
    expect(src).toMatch(/"relative flex gap-3 rounded-xl p-3 text-xs"/);
  });

  /* Stack rhythm. Three steps: space-y-2 within a group, space-y-3 for a
     break inside a card, space-y-4 between page sections (PageShell's).
     Measured before this pin, Home grouped its cards at space-y-2.5 while
     Analytics separated its sections at space-y-8 — the same role at 10px
     and 32px — and 60 half-step stacks (0.5 / 1.5 / 2.5) sat across the
     tree. The five route pages and the shell are pinned to the scale
     outright; the rest of the tree is ratcheted. */
  const HALF_STEP_STACK_BASELINE = 56;
  it("half-step vertical stacks (space-y-0.5 / 1.5 / 2.5) do not increase", () => {
    const { total, byFile } = scan((src) => {
      let n = 0;
      for (const chunk of classNameChunks(src))
        n += (chunk.match(/\bspace-y-(?:0\.5|1\.5|2\.5)\b/g) ?? []).length;
      return n;
    });
    expectRatchet("half-step space-y", total, HALF_STEP_STACK_BASELINE, byFile);
  });

  it("the route pages and PageShell stack only on space-y-1 / 2 / 3 / 4 (positive pin)", () => {
    // 1 is the text rhythm inside a single card (a caption under its
    // figure); 2 / 3 / 4 are the three layout steps. Nothing else.
    const ON_SCALE = new Set(["1", "2", "3", "4"]);
    for (const rel of [
      "src/pages/Home.tsx",
      "src/pages/Program.tsx",
      "src/pages/Food.tsx",
      "src/pages/Social.tsx",
      "src/pages/History.tsx",
      "src/components/ui/PageShell.tsx",
    ]) {
      const src = readFileSync(resolve(repoRoot, rel), "utf8");
      const off: string[] = [];
      for (const chunk of classNameChunks(src))
        for (const m of chunk.matchAll(/\bspace-y-([0-9.]+)\b/g))
          if (!ON_SCALE.has(m[1])) off.push(m[0]);
      expect(off, `${rel} stacks off the scale: ${off.join(", ")}`).toEqual([]);
    }
  });

  /* A section label carries no margin of its own — its group's stack
     places it. Analytics' three labels (and PerformanceSection's) still
     wear `mt-6 mb-2`, which stacked on their container's own spacing is
     how one page got 56px between sections while Home got 16; that
     restructure is Analytics' own change. Counted here so no new label
     picks the habit up. Multi-line openers included. */
  const SECTION_LABEL_MARGIN_BASELINE = 10;
  it("section-tier labels with their own vertical margin do not increase", () => {
    const { total, byFile } = scan((src) => {
      let n = 0;
      for (const m of src.matchAll(/<SectionLabel\b([^>]*)>/g)) {
        const attrs = m[1];
        if (!/tier="section"/.test(attrs)) continue;
        const c = /className="([^"]*)"/.exec(attrs);
        if (c && /\bm[tb]-[0-9.]+\b/.test(c[1])) n++;
      }
      return n;
    });
    expectRatchet(
      "section label self-margin",
      total,
      SECTION_LABEL_MARGIN_BASELINE,
      byFile
    );
  });

  // Arbitrary pixel sizes (`text-[10px]`, `text-[15px]`) sit off the
  // documented scale — 11px is text-caption (tracked labels only), then
  // 12 / 14 / 16 and up. The cohesion pass (batch 3, 2026-09-05) burned the
  // product surfaces to zero; a new one has to be argued for here.
  const OFF_SCALE_TEXT_BASELINE = 0;
  it("arbitrary text-[Npx] sizes do not increase (use the documented scale)", () => {
    const { total, byFile } = scan(
      (src) => (src.match(/\btext-\[\d+(?:\.\d+)?px\]/g) ?? []).length
    );
    expectRatchet("text-[Npx]", total, OFF_SCALE_TEXT_BASELINE, byFile);
  });
});

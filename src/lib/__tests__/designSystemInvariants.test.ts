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
    const rel = relative(repoRoot, file).replaceAll("\\", "/");
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
    // somewhere in its markup (`size-11` / `size-[44px]` = 44px square, or a
    // min/fixed height; it is px since controls keep their size at larger
    // text).
    // This is what makes routing through it the fix for the ratchet above.
    expect(
      /size-11|size-\[44px\]|min-h-\[44|h-11|h-12|h-14|min-h-11|min-h-12/.test(
        toggle
      )
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
  const RAW_BUTTON_BASELINE = 293;
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
  // One sanctioned exception to `text-h1`, pinned below rather than
  // counted here: the `PageShell` primitive itself, whose h1 takes its
  // class from a variable the regex cannot read. There used to be a
  // second, Home's brand WORDMARK (tracked uppercase); DS3 retired it for
  // a plain "Today" title with the date above it, so the primitive now
  // has no way off the token at all.
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
    // And nothing takes the title off it: the tracked-uppercase brand
    // variant, the one way off the token, is gone (DS3). Checked on the
    // code alone, because the header comment still tells its history.
    const code = shell
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    expect(code).not.toMatch(/uppercase/);
    expect(code).not.toMatch(/\bbrand\b/);
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
  const HAND_ROLLED_LABEL_BASELINE = 20;
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

  it("SectionLabel's caption tier is sentence case, and the section tier stays 12px (positive pin)", () => {
    // DS3 (2026-09-27): capitals are for table column headers. A caption
    // inside a card is written the way it is said, so the tier carries no
    // `uppercase` and no letter-spacing. The section tier is the Food
    // page's small group label (pinned below to the two Food surfaces that
    // use it), sentence case since the Food pass; both stay on the 12px
    // micro step.
    const src = readFileSync(resolve(repoRoot, LABEL_PRIMITIVE), "utf8");
    expect(src).toMatch(
      /caption: "text-xs font-semibold text-muted-foreground"/
    );
    expect(src).toMatch(/section: "text-xs font-bold text-foreground"/);
    expect(src).not.toMatch(/text-caption/);
  });

  /* The capital-letter group label is retired (DS3). A group of cards or
     rows opens with a `SectionHeading` — a real heading, 20px on a page,
     16px in a sheet, card or form. `tier="section"`, sentence case since
     the Food pass, stays on two Food surfaces: the Food page keeps its
     current look (DS3's Food carve-out, which the owner reaffirmed on
     2026-09-28). Nothing else may pick it up. */
  const SECTION_TIER_ALLOWED = new Set([
    "src/components/food/HeroDrillDownSheet.tsx",
    "src/components/food/FoodSuggestionsDropdown.tsx",
  ]);
  it("the section-tier label appears only on the two Food surfaces", () => {
    const { byFile } = scan(
      (src) => (src.match(/tier="section"/g) ?? []).length
    );
    const outside = [...byFile.keys()].filter(
      (f) => !SECTION_TIER_ALLOWED.has(f)
    );
    expect(
      outside,
      `tier="section" outside the Food carve-out — head the group with ` +
        `<SectionHeading> (size "compact" in a sheet, card or form):\n  ` +
        outside.join("\n  ")
    ).toEqual([]);
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
    // A grid since the large-text pass: the action can take the whole
    // banner when the icon gives way. Same gap, padding and radius.
    expect(src).toMatch(
      /"@container relative grid gap-x-3 rounded-xl p-3 text-xs"/
    );
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

  /* A section heading carries no margin of its own — its group's stack
     places it. A heading that brings `mt-6 mb-2` to a container that
     already spaces its children is how one page ends up with 56px between
     sections while another gets 16. Analytics is fully burned down (its
     four page sections and PerformanceSection all take their placement
     from a `space-y-2` section stack); the five left are Shoes, run
     setup, route setup, the challenge list and Programme settings' field
     groups. Counted across `SectionHeading` and the legacy section-tier
     label, so neither picks the habit up. Multi-line openers included. */
  const SECTION_LABEL_MARGIN_BASELINE = 5;
  it("section headings with their own vertical margin do not increase", () => {
    const { total, byFile } = scan((src) => {
      let n = 0;
      for (const m of src.matchAll(
        /<(SectionHeading|SectionLabel)\b([^>]*)>/g
      )) {
        const attrs = m[2];
        if (m[1] === "SectionLabel" && !/tier="section"/.test(attrs)) continue;
        const c = /className="([^"]*)"/.exec(attrs);
        if (c && /\bm[tb]-[0-9.]+\b/.test(c[1])) n++;
      }
      return n;
    });
    expectRatchet(
      "section heading self-margin",
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

describe("type tiers", () => {
  /* `text-caption` (11px) is the floor for dense numerals and units
     (DESIGN_GUIDE §10). A unit with neither `font-mono` nor `tabular-nums`
     is counted as words; words belong on `text-micro` (12px) or above.
     The count holds the remaining word uses and may only fall. */
  const CAPTION_WORDS_BASELINE = 66;
  it("text-caption on words does not increase (words sit on text-micro)", () => {
    const { total, byFile } = scan((src) => {
      let n = 0;
      for (const chunk of classNameChunks(src)) {
        if (
          /\btext-caption\b/.test(chunk) &&
          !/\b(?:font-mono|tabular-nums)\b/.test(chunk)
        )
          n++;
      }
      return n;
    });
    expectRatchet(
      "text-caption on words",
      total,
      CAPTION_WORDS_BASELINE,
      byFile
    );
  });

  /* "Never mix 700 and 800 in the same visual tier" (§4 weight rules). A
     tier is a size step plus its register: numerals (`font-mono` or
     `tabular-nums`) are hero figures and words are headings, so the two
     registers are separate tiers. Every tier listed here carries one
     weight; a tier joins the list once it is aligned. */
  const SINGLE_WEIGHT_TIERS = [
    "text-display num",
    "text-3xl num",
    "text-h1 word",
    "text-h2 word",
    "text-h2 num",
    "text-h3 word",
    "text-lg word",
  ];
  it("a pinned type tier uses one weight, never 700 beside 800", () => {
    const seen = new Map<string, Map<string, string[]>>();
    for (const file of FILES) {
      const rel = relative(repoRoot, file).replaceAll("\\", "/");
      for (const chunk of classNameChunks(readFileSync(file, "utf8"))) {
        const tokens = chunk.split(/\s+/);
        const weights = tokens.filter(
          (t) => t === "font-bold" || t === "font-extrabold"
        );
        if (weights.length !== 1) continue;
        const size = tokens.find((t) =>
          /^text-(?:lg|xl|2xl|3xl|h1|h2|h3|display)$/.test(t)
        );
        if (!size) continue;
        const register = tokens.some(
          (t) => t === "font-mono" || t === "tabular-nums"
        )
          ? "num"
          : "word";
        const tier = `${size} ${register}`;
        const byWeight = seen.get(tier) ?? new Map<string, string[]>();
        byWeight.set(weights[0], [...(byWeight.get(weights[0]) ?? []), rel]);
        seen.set(tier, byWeight);
      }
    }
    const mixed = SINGLE_WEIGHT_TIERS.filter(
      (tier) => (seen.get(tier)?.size ?? 0) > 1
    ).map(
      (tier) =>
        `${tier}: ` +
        [...seen.get(tier)!.entries()]
          .map(([w, files]) => `${w} ×${files.length} (${files.join(", ")})`)
          .join(" | ")
    );
    expect(mixed, mixed.join("\n")).toEqual([]);
  });
});

/* Form controls on one field. A text input, a select and a textarea are
   the same kind of box to the person filling them in, and `.ds-input`
   (src/styles/components.css) is that box: radius, the 3:1 edge, the card
   fill, the inset and a floor above 44px. Selects render through the
   `Select` primitive, which puts a native <select> on that field (so iOS
   keeps its picker) and owns the tapped-select focus fix. Floors are 0
   for selects and textareas; typed inputs off the field are a named list,
   each with its reason, and the list only shrinks. */
describe("form controls share the field primitive", () => {
  const SELECT_PRIMITIVE = "src/components/ui/Select.tsx";

  /** Source with comments blanked, so prose that names `<select>` or
   *  `<input type=file>` is not counted. A `//` after a colon or a quote
   *  is a URL in a string, not a comment. */
  const code = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:"'`\\])\/\/[^\n]*/gm, "$1");

  /** A JSX opening tag from `<` to its `>`, skipping a `>` inside braces
   *  (an arrow function in an onChange) or inside a string. */
  function openingTag(src: string, start: number): string {
    let depth = 0;
    let quote: string | null = null;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) return src.slice(start, i + 1);
    }
    return src.slice(start);
  }

  /** Whether a tag's class carries `.ds-input`: a literal, a cn() call,
   *  or a module constant (`className={INPUT_CLASS}`) read from the file. */
  function onField(tag: string, src: string): boolean {
    if (/\bds-input\b/.test(tag)) return true;
    const ident = /className=\{([A-Z_a-z]\w*)\}/.exec(tag)?.[1];
    if (!ident) return false;
    const decl = new RegExp(`const ${ident}\\s*=\\s*["'\`]([^"'\`]*)`).exec(
      src
    );
    return !!decl && /\bds-input\b/.test(decl[1]);
  }

  const lineOf = (src: string, index: number) =>
    src.slice(0, index).split("\n").length;

  it("a <select> renders only inside the Select primitive", () => {
    const offenders: string[] = [];
    scan((src, rel) => {
      if (rel === SELECT_PRIMITIVE) return 0;
      const body = code(src);
      for (const m of body.matchAll(/<select\b/g))
        offenders.push(`${rel}:${lineOf(body, m.index!)}`);
      return 0;
    });
    expect(
      offenders,
      `Raw <select> outside the primitive. Render it through <Select> ` +
        `(src/components/ui/Select.tsx): the field, the chevron and the ` +
        `tapped-select focus fix come with it.\n  ` +
        offenders.join("\n  ")
    ).toEqual([]);
  });

  it("every <textarea> is on .ds-input", () => {
    const offenders: string[] = [];
    scan((src, rel) => {
      const body = code(src);
      for (const m of body.matchAll(/<textarea\b/g)) {
        const tag = openingTag(body, m.index!);
        if (!onField(tag, body))
          offenders.push(`${rel}:${lineOf(body, m.index!)}`);
      }
      return 0;
    });
    expect(
      offenders,
      `A <textarea> off the field primitive. Give it \`ds-input\` and ` +
        `keep only its own type size, rows and resize.\n  ` +
        offenders.join("\n  ")
    ).toEqual([]);
  });

  /* The typed inputs that are deliberately their own control. The counts
     are exact, so an exception that moves onto the field comes off the
     list rather than lingering with a stale reason, and nothing new goes
     on without its reason written beside it. */
  const INPUTS_OFF_FIELD: Record<string, { count: number; why: string }> = {
    "src/components/WorkoutSession.tsx": {
      count: 2,
      why: "the set row's weight and reps: compact 44px cells on FIELD_EDGE",
    },
    "src/components/food/EditServingsSheet.tsx": {
      count: 2,
      why: "the serving editor's quantity and unit, sized per field, on FIELD_FOCUS_RING",
    },
    "src/components/food/FoodDateBar.tsx": {
      count: 1,
      why: "an sr-only date input that the visible day button opens",
    },
    "src/components/nutrition/ServingSizeDrawer.tsx": {
      count: 1,
      why: "the stepper's readout between its minus and plus",
    },
    "src/components/program/ExercisePicker.tsx": {
      count: 1,
      why: "a search bar: filled, borderless, with its magnifier",
    },
    "src/components/social/views/PeopleView.tsx": {
      count: 1,
      why: "a search bar: filled, borderless, with its magnifier",
    },
    "src/components/run/TreadmillMode.tsx": {
      count: 1,
      why: "the run screen's dark stage, white on translucent white",
    },
  };
  const NOT_TYPED = /\btype="(checkbox|radio|range|hidden|file|color)"/;

  it("typed inputs off .ds-input are only the named exceptions", () => {
    const { byFile } = scan((src) => {
      const body = code(src);
      let n = 0;
      for (const m of body.matchAll(/<input\b/g)) {
        const tag = openingTag(body, m.index!);
        if (NOT_TYPED.test(tag)) continue;
        if (!onField(tag, body)) n++;
      }
      return n;
    });
    const sorted = (entries: [string, number][]) =>
      Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
    expect(
      sorted([...byFile.entries()]),
      `Typed inputs off the field primitive, by file. Put a new field on ` +
        `\`ds-input\`; when an exception moves onto it, take it off ` +
        `INPUTS_OFF_FIELD.`
    ).toEqual(
      sorted(Object.entries(INPUTS_OFF_FIELD).map(([f, e]) => [f, e.count]))
    );
  });

  it("the Select primitive is a native select on the field, with its chevron (positive pin)", () => {
    // The guards above are only a fix if what they send people to is the
    // field and keeps the platform's picker.
    const body = code(
      readFileSync(resolve(repoRoot, SELECT_PRIMITIVE), "utf8")
    );
    expect(body.match(/<select\b/g)?.length).toBe(1);
    expect(body).toMatch(/"peer ds-input appearance-none/);
    expect(body).toMatch(/<ChevronDown\b/);
    expect(body).toMatch(/pointerFocus && "ds-input-pointer-focus"/);
  });

  it(".ds-input clears the 44px floor and hides the number spinners (positive pin)", () => {
    const css = readFileSync(
      resolve(repoRoot, "src/styles/components.css"),
      "utf8"
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    const box = /select\.ds-input\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    // 3rem is 48px at the default root size, and grows with the text.
    expect(box).toMatch(/min-height:\s*3rem/);
    expect(css).toMatch(
      /input\.ds-input\[type="number"\]\s*\{[^}]*appearance:\s*textfield/
    );
    expect(css).toMatch(
      /input\.ds-input\[type="number"\]::-webkit-inner-spin-button/
    );
  });
});

/* An action takes its domain's colour wherever it appears (DESIGN_GUIDE
   §14i). The colour says what the button does, not which page it sits on:
   logging food is the food orange on Home, Analytics and the run summary as
   much as on Food; starting a run is coral; starting a lift is purple.

   It is a scan of the source, not a render, because the drift it stops is
   a call site written with the default variant on a page whose own colour
   is something else. Food10 made every Log on Food orange while the
   manual logger, the search result's serving sheet and the portion sheet
   kept logging in purple, and the run summary's "Log recovery food" was a
   bare grey button. The control is found by its label: a literal label
   that logs food (or a bare "Log" in a food file), starts a run or starts
   a lift. A label built at run time is not seen, which is why the test
   also names the controls it must find. */
describe("an action takes its domain's colour wherever it appears", () => {
  type Hue = "food" | "running" | "lifting" | "other";
  interface Control {
    file: string;
    line: number;
    label: string;
    hue: Hue;
  }

  /** Comments blanked to spaces, so offsets and line numbers still hold
   *  and an apostrophe in a comment cannot open a string. `://` is kept,
   *  so a URL in copy is not cut short. */
  function blankComments(src: string): string {
    const blank = (m: string) => m.replace(/[^\n]/g, " ");
    return src
      .replace(/\/\*[\s\S]*?\*\//g, blank)
      .replace(
        /(^|[^:\\])\/\/[^\n]*/g,
        (m, lead: string) => lead + blank(m.slice(lead.length))
      );
  }

  /** Where an opening tag ends: the first `>` outside braces and strings. */
  function openTagEnd(src: string, from: number): number {
    let depth = 0;
    let quote: string | null = null;
    for (let i = from; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) return i;
    }
    return -1;
  }

  /** The `{…}` expressions of a run of JSX children, outermost only. */
  function expressions(text: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "{") {
        if (depth === 0) start = i + 1;
        depth++;
      } else if (text[i] === "}" && depth > 0) {
        depth--;
        if (depth === 0) out.push(text.slice(start, i));
      }
    }
    return out;
  }

  /** What the control says: its aria-label or ctaLabel, its plain text,
   *  and the string literals its children choose between. */
  function labelsOf(open: string, body: string): string[] {
    const out: string[] = [];
    for (const m of open.matchAll(
      /\b(?:aria-label|ctaLabel)=(?:"([^"]*)"|\{`([^`$]*))/g
    ))
      out.push(m[1] ?? m[2] ?? "");
    const children = body.replace(/<[^>]*>/g, " ");
    const exprs = expressions(children);
    let plain = children;
    for (const e of exprs) plain = plain.replace(`{${e}}`, " ");
    out.push(plain);
    for (const e of exprs)
      for (const m of e.matchAll(/"([^"]+)"|'([^']+)'|`([^`$]+)/g))
        out.push(m[1] ?? m[2] ?? m[3] ?? "");
    return out.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  }

  /** The hue the control paints: its variant, else a fill class, else the
   *  primitive's default (`primary`). */
  function hueOf(tag: string, open: string): Hue {
    const variant = /\bvariant(?:=\{?\s*|:\s*)["']([a-z-]+)["']/.exec(
      open
    )?.[1];
    if (variant)
      return variant.startsWith("nutrition")
        ? "food"
        : variant.startsWith("sport")
          ? "running"
          : variant === "primary"
            ? "lifting"
            : "other";
    if (
      /\b(bg|text)-nutrition(-fill|-strong|\/)|THEME\.semantic\.nutrition/.test(
        open
      )
    )
      return "food";
    if (/\b(bg|text)-running(-fill|-strong|\/)|THEME\.running\b/.test(open))
      return "running";
    if (/\bbg-(lifting-fill|primary-strong)\b/.test(open)) return "lifting";
    if (tag === "Button" || /\bbuttonClasses\(/.test(open)) return "lifting";
    return "other";
  }

  const FOOD_FILE =
    /^src\/(components\/(food|nutrition)\/|pages\/Food\.tsx$|components\/(FoodAnalyzer|ManualFoodLogger|FoodCameraModal)\.tsx$)/;

  /** The domain an action label belongs to, if it names one. A Pro
   *  offer is the brand's, whatever it promises to log. A bare "Log" is
   *  read only on the Button primitive in a food file: on a raw button it
   *  is the hint inside a pressable row, which keeps the row's look. */
  function domainOf(label: string, file: string, tag: string): Hue | null {
    if (/\bPro\b/.test(label)) return null;
    if (/^Log\b.*\b(food|meals?|portion)\b|^Log to\b/i.test(label))
      return "food";
    if (label === "Log" && tag === "Button" && FOOD_FILE.test(file))
      return "food";
    if (/^Start (a )?run$/i.test(label)) return "running";
    if (/^Start (lift|workout)$/i.test(label)) return "lifting";
    return null;
  }

  function domainControls(): (Control & { domain: Hue })[] {
    const found: (Control & { domain: Hue })[] = [];
    for (const full of FILES) {
      const file = relative(repoRoot, full).replaceAll("\\", "/");
      const src = blankComments(readFileSync(full, "utf8"));
      for (const m of src.matchAll(
        /<(Button|button|Link|SectionEmptyCTA)(?=[\s>/])/g
      )) {
        const tag = m[1];
        const end = openTagEnd(src, m.index + 1);
        if (end < 0) continue;
        const open = src.slice(m.index, end + 1);
        const close = src.indexOf(`</${tag}>`, end);
        const body =
          src[end - 1] === "/" || close < 0 ? "" : src.slice(end + 1, close);
        const line = src.slice(0, m.index).split("\n").length;
        for (const label of labelsOf(open, body)) {
          const domain = domainOf(label, file, tag);
          if (!domain) continue;
          found.push({ file, line, label, hue: hueOf(tag, open), domain });
          break;
        }
      }
    }
    return found;
  }

  it("finds the food logs it knows of (positive pin)", () => {
    const food = domainControls()
      .filter((c) => c.domain === "food")
      .map((c) => `${c.file} ${c.label}`);
    for (const known of [
      "src/pages/History.tsx Log meal",
      "src/components/home/TodayEnergy.tsx Log food",
      "src/components/nutrition/ServingSizeDrawer.tsx Log food",
      "src/components/ManualFoodLogger.tsx Log meal",
      "src/components/food/QuickMealPortionSheet.tsx Log this portion",
      "src/components/food/CopyMealsSheet.tsx Log selected meals",
      "src/components/FoodAnalyzer.tsx Log to",
      "src/pages/RunSummary.tsx Log recovery food",
      "src/pages/Food.tsx Log",
    ])
      expect(food, `the scan no longer finds ${known}`).toContain(known);
  });

  it("finds the run and lift starts it knows of (positive pin)", () => {
    const starts = domainControls()
      .filter((c) => c.domain !== "food")
      .map((c) => `${c.file} ${c.label}`);
    for (const known of [
      "src/pages/History.tsx Start run",
      "src/pages/History.tsx Start lift",
      "src/components/home/RunCTACard.tsx Start run",
      "src/components/home/LiftCTACard.tsx Start workout",
    ])
      expect(starts, `the scan no longer finds ${known}`).toContain(known);
  });

  it("every one of them wears its domain's colour", () => {
    const wrong = domainControls()
      .filter((c) => c.hue !== c.domain)
      .map(
        (c) =>
          `${c.file}:${c.line} "${c.label}" is ${c.hue}, should be ${c.domain}`
      );
    expect(
      wrong,
      `An action takes its domain's colour on every page (DESIGN_GUIDE ` +
        `§14i): logging food is \`nutrition\` / \`nutrition-tinted\`, a ` +
        `run is \`sport\` / \`sport-tinted\`, a lift is \`primary\`.\n` +
        wrong.join("\n")
    ).toEqual([]);
  });
});

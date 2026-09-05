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
  const RAW_BUTTON_BASELINE = 390;
  it("raw <button> elements do not increase (CTAs use the Button primitive)", () => {
    const { total, byFile } = scan(
      (src) => (src.match(/<button\b/g) ?? []).length
    );
    expectRatchet("raw <button>", total, RAW_BUTTON_BASELINE, byFile);
  });

  // font-medium is not on the weight scale (800 hero / 700 heading /
  // 600 pill+button). It keeps appearing as a "slightly bold" reflex.
  const FONT_MEDIUM_BASELINE = 302;
  it("font-medium does not increase (the scale is 800 / 700 / 600)", () => {
    const { total, byFile } = scan((src) =>
      classNameChunks(src).reduce(
        (n, c) => n + (c.match(/\bfont-medium\b/g) ?? []).length,
        0
      )
    );
    expectRatchet("font-medium", total, FONT_MEDIUM_BASELINE, byFile);
  });

  // Ambient animation must respect prefers-reduced-motion: `motion-safe:`
  // is the Tailwind spelling of that promise. `animate-none` is a reset,
  // not an animation, and is excluded.
  const UNGUARDED_ANIMATION_BASELINE = 38;
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

  // The page-title h1 is `text-xl font-extrabold` (H1 tier). Off-scale h1s
  // — the wordmark, a text-h2 hero, a font-bold title — are counted here.
  const OFF_SCALE_H1_BASELINE = 13;
  it("<h1> elements off the page-title scale do not increase", () => {
    const { total, byFile } = scan((src) => {
      let n = 0;
      for (const m of src.matchAll(/<h1\b([^>]*)>/g)) {
        const attrs = m[1];
        const c =
          /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{(?:cn|clsx|twMerge)\(([\s\S]*?)\)\})/.exec(
            attrs
          );
        const cls = c ? (c[1] ?? c[2] ?? c[3] ?? "") : "";
        if (!(/\btext-xl\b/.test(cls) && /\bfont-extrabold\b/.test(cls))) n++;
      }
      return n;
    });
    expectRatchet("off-scale <h1>", total, OFF_SCALE_H1_BASELINE, byFile);
  });
});

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

/** Every .tsx under src (components + pages + features), tests excluded. */
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__" || name === "test")
        continue;
      out.push(...tsxFiles(full));
      continue;
    }
    if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const FILES = tsxFiles(srcRoot);

/** Collect every className string literal/template chunk in a file (handles
 *  multi-line className={`…`} and className="…"). Returns the raw inner text. */
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
  const SWITCH_BASELINE = 3; // PrivacySection + NotificationsSection (burn down in D16)
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
});

describe("D15 · DS invariant — numeric displays use the mono numeral font", () => {
  // Invariant #1 proxy: `tabular-nums` is a NUMERIC-display utility — if a
  // className opts into tabular figures, it's rendering numbers, so it must
  // also carry `font-mono` (the Archivo numeral font; CLAUDE.md). `tabular-nums`
  // WITHOUT `font-mono` is the week-strip-bug shape: aligned columns in the
  // wrong (proportional UI) font.
  const MONO_BASELINE = 22; // burned down from 30 (prominent stat displays fixed); keep lowering as surfaces are touched
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

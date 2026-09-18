/**
 * A run distance must not be formatted inline.
 *
 * The app was km-only, so `${(metres / 1000).toFixed(1)} km` was written by
 * hand wherever a distance appeared — around twenty sites across pages,
 * cards, sheets and chips. Every one of them is invisible to the compiler:
 * unlike the `unit`-taking helpers in `runLabels.ts`, which enumerate their
 * call sites the moment a parameter is added, an inline template string
 * just keeps saying "km" forever.
 *
 * So the compiler can't hold this line and a test has to. The rule is:
 * dividing METRES by 1000 and printing "km" next to it is a display
 * decision, and display decisions go through `runLabels` where the unit is
 * a required argument.
 *
 * WHAT IT MATCHES. A `/ 1000` (or `* 1000`) arithmetic conversion within a
 * few characters of a literal `km`. That deliberately does NOT match the
 * many other `/ 1000` uses in this codebase — kilograms to tonnes, millilitres
 * to litres, thousands-separators on chart axes — because those carry no `km`
 * and are not distances at all.
 *
 * The allow-list is for genuine non-display uses. It is not a place to park
 * a surface you did not want to convert: if a surface should stay metric,
 * say so with `SPLIT_LAP_IS_METRIC` / `SHARE_CARD_IS_METRIC` at the point
 * of use, which reads as a decision rather than an omission.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Files where a metres↔km conversion is DATA, not display — each with the
 * reason. A display site does not belong here.
 */
const NOT_DISPLAY: Record<string, string> = {
  /* Empty, and worth keeping empty. Every metres→km conversion that
     actually PRINTS a distance goes through `runLabels`, and the
     non-display conversions (pace maths, the weekly aggregates' own
     arithmetic, shoe mileage) don't put a literal `km` after it, so they
     never reach the gate. An entry here would need a reason no marker
     constant could express better. */
};

/* WHAT THIS GATE CANNOT SEE, stated because the sentence above reads as
   though it covered this and does not.

   It anchors on ARITHMETIC: a `/ 1000` within a few characters of a
   literal `km`. A quantity this app already stores in KILOMETRES needs no
   arithmetic at the display site, so printing it with a hardcoded `km`
   is invisible here — no `/ 1000` for the pattern to find.

   Three surfaces were doing exactly that with the user's own logged
   distance, and a miles reader saw kilometres on all three: the Weekly
   Review's run lane (`runs.km`, `runs.longestKm`), "Your week so far"
   (`pulse.runs.km`), and the Programme Run tab's "This week" line — the
   last of which converted the PACE on the same line and not the
   distance. All three now go through `storedKmLabel`, and each is pinned
   at its own surface in both units.

   Still outstanding, and a product call rather than a bug: the PRESCRIBED
   distances, `config.targetDistanceKm` in `DayActionSheet`,
   `ProgrammeRunSection`'s template meta, `DayPeekCard`, `RunCTACard`, and
   `RunLaunchCard`'s `distanceKm`. Those are the plan talking rather than
   the log, and the race templates carry named distances ("5K") whose name
   should not convert even though their number should. Decide that before
   widening the pattern, because the widening is only useful once there is
   somewhere for those five to go. */

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (s) => " ".repeat(s.length))
    .replace(/\/\/[^\n]*/g, (s) => " ".repeat(s.length));
}

/**
 * A metres→km conversion FOLLOWED by a literal `km`.
 *
 * Forward-only, and that is the whole subtlety. Matching `km` on either
 * side of the arithmetic looked more thorough and was strictly worse: it
 * flagged eleven sites where `km` is a VARIABLE NAME rather than a unit —
 * `const km = distance / 1000`, `vdotFromRace(km * 1000, …)`, and
 * `funComparisons`'s `unit: 'km'` table — none of which print anything.
 * A gate that cries wolf gets an allow-list entry per false alarm, and an
 * allow-list padded with noise is where a real offender hides.
 *
 * A display writes the number and then the unit, so requiring that order
 * removes every one of those without losing either real site.
 */
const INLINE = /[/*]\s*1000[^\n]{0,40}?\bkm\b/;

interface Hit {
  site: string;
  line: string;
}

/**
 * A LOGGED AGGREGATE printed with a literal unit.
 *
 * The gate above anchors on arithmetic, which a stored-kilometre value
 * does not need — so it cannot see `{runs.km} km`. This one anchors on the
 * FIELD instead, and only on the three names that hold a distance the user
 * actually covered: `.km`, `longestKm`, `totalDistance`. All three are
 * aggregates in kilometres, produced by `weeklyReviewViewModel` and
 * `useRunningStats`, and never a plan's prescription — so there is no
 * legitimate reason for any of them to sit beside a hardcoded unit, and
 * the rule needs no allow-list.
 *
 * Deliberately NOT extended to `targetDistanceKm` / `distanceKm`: those
 * are the plan talking rather than the log, and whether a prescribed
 * distance converts is an open product call (see the note above
 * NOT_DISPLAY). Widening this to them before that call is made would
 * force five allow-list entries, which is how a gate becomes scenery.
 */
/* The `}` is load-bearing. Requiring the interpolation to CLOSE before
   the unit is what separates a printed distance from `tier.km <= km`,
   where `km` is a local rather than a unit — the same false-positive
   family the forward-only rule above exists for. */
const STORED_KM =
  /\b(\.km|longestKm|totalDistance)\b[^\n]{0,40}?\}[^\n]{0,8}?\bkm\b/;

function scanStoredKm(): Hit[] {
  const out: Hit[] = [];
  for (const rel of globSync("src/**/*.{ts,tsx}", { cwd: repoRoot })) {
    if (rel.includes("__tests__") || rel.includes(".test.")) continue;
    const src = stripComments(readFileSync(resolve(repoRoot, rel), "utf8"));
    src.split("\n").forEach((line, i) => {
      if (STORED_KM.test(line))
        out.push({ site: `${rel}:${i + 1}`, line: line.trim() });
    });
  }
  return out;
}

function scan(): Hit[] {
  const out: Hit[] = [];
  for (const rel of globSync("src/**/*.{ts,tsx}", { cwd: repoRoot })) {
    if (rel.includes("__tests__") || rel.includes(".test.")) continue;
    if (rel in NOT_DISPLAY) continue;
    const src = stripComments(readFileSync(resolve(repoRoot, rel), "utf8"));
    src.split("\n").forEach((line, i) => {
      if (INLINE.test(line))
        out.push({ site: `${rel}:${i + 1}`, line: line.trim() });
    });
  }
  return out;
}

describe("run distances are formatted through runLabels, not inline", () => {
  it("the detector actually matches the shape it is meant to catch", () => {
    /* Positive control. The gate is one regex, and a regex that matches
       nothing reports a clean codebase — the exact failure this whole file
       exists to prevent, so prove it fires on the real shapes first. */
    expect(INLINE.test("`${(run.distance / 1000).toFixed(1)} km`")).toBe(true);
    expect(INLINE.test("value={`${(dist / 1000).toFixed(1)} km`}")).toBe(true);
    /* KNOWN BLIND SPOT, stated rather than hidden: an assignment names the
       unit BEFORE the arithmetic — `const km = (metres / 1000).toFixed(2)`
       — and the forward-only rule cannot see it without also matching the
       eleven places where `km` is genuinely a variable. The printed form is
       what ships wrong text to a reader, and that is what this catches; the
       assignment form is only wrong once it reaches a display, where the
       surrounding `km` literal usually shows up anyway. */
    expect(INLINE.test("const km = (distanceMeters / 1000).toFixed(2);")).toBe(
      false
    );
    // And stays quiet on the non-distance uses of the same arithmetic.
    expect(INLINE.test("`${(volumeKg / 1000).toFixed(1)}t`")).toBe(false);
    expect(INLINE.test("(ml / 1000).toFixed(2)")).toBe(false);
    expect(INLINE.test("v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v")).toBe(
      false
    );
    // A converted call site must not read as an offender.
    expect(INLINE.test("distanceLabel(run.distance, unit)")).toBe(false);
  });

  it("no display surface formats a distance by hand", () => {
    const hits = scan().map((h) => `${h.site}  ${h.line.slice(0, 90)}`);
    expect(
      hits,
      `Format run distances with distanceLabel / distanceLabel2 / ` +
        `distanceValue / nearDistanceLabel from src/lib/runLabels.ts — they ` +
        `take the unit as a REQUIRED argument, so a miles reader can't be ` +
        `silently left on km. If a surface must stay metric, mark it at the ` +
        `point of use with SPLIT_LAP_IS_METRIC or ` +
        `SHARE_CARD_IS_METRIC:\n  ` +
        hits.join("\n  ")
    ).toEqual([]);
  });

  it("the stored-kilometre detector matches its own shape", () => {
    // Positive control, for the same reason the one above has one.
    expect(STORED_KM.test("{pulse.runs.km} km")).toBe(true);
    expect(STORED_KM.test("longest {runs.longestKm} km")).toBe(true);
    expect(STORED_KM.test("{thisWeek.totalDistance.toFixed(1)} km")).toBe(true);
    // A converted call site is not an offender.
    expect(STORED_KM.test("storedKmLabel(runs.km, unit, true, 1)")).toBe(false);
    // And the prescribed distances stay out of scope, on purpose.
    expect(STORED_KM.test("`${config.targetDistanceKm} km`")).toBe(false);
    // `km` as a local, not a unit — runScheduler's tier lookup.
    expect(STORED_KM.test("if (tier.km <= km) chosen = tier;")).toBe(false);
  });

  it("no surface prints a logged aggregate with a hardcoded unit", () => {
    const hits = scanStoredKm().map((h) => `${h.site}  ${h.line.slice(0, 90)}`);
    expect(
      hits,
      `These fields hold KILOMETRES the user actually ran. Render them with ` +
        `storedKmLabel(km, unit, true, 1) from src/lib/runLabels.ts so a ` +
        `miles reader sees their own unit — a hardcoded "km" beside one of ` +
        `these shows the metric figure to everyone:\n  ` +
        hits.join("\n  ")
    ).toEqual([]);
  });

  it("the allow-list stays honest (no entry for a vanished file)", () => {
    const missing = Object.keys(NOT_DISPLAY).filter((rel) => {
      try {
        readFileSync(resolve(repoRoot, rel), "utf8");
        return false;
      } catch {
        return true;
      }
    });
    expect(
      missing,
      `NOT_DISPLAY entries naming files that no longer exist`
    ).toEqual([]);
  });

  it("every allow-listed file really does contain the shape", () => {
    /* Otherwise an entry outlives the code that justified it and silently
       exempts whatever is written there next. */
    const inert = Object.keys(NOT_DISPLAY).filter((rel) => {
      const src = stripComments(readFileSync(resolve(repoRoot, rel), "utf8"));
      return !src.split("\n").some((l) => INLINE.test(l));
    });
    expect(
      inert,
      `allow-listed but no longer matching — drop the entry`
    ).toEqual([]);
  });
});

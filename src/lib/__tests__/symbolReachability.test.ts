/**
 * Symbol-level reachability — the half ADR-0008 could not see.
 *
 * `mirrorCrossTestGate` asks whether a MODULE is imported by production
 * code. That catches a whole file nobody requires (the 352-line
 * `scheduledRunCompletion.js` port), but it is blind one level down: a
 * dead export inside a live module reads as reachable, because the module
 * around it is. ADR-0008 records that limitation explicitly. This is the
 * instance it predicted.
 *
 * `runScheduler.ts` exported `scheduleStructuredWeek` and
 * `generateRacePlan` — the V1 schedulers — with ZERO production callers;
 * every plan the app builds goes through the V2 pair via `planBuilder`.
 * They were not merely dead, they were TESTED: `runSchedulerCoverage`
 * swept 240 parameter combinations asserting that every emitted
 * templateId exists in RUN_TEMPLATES. A typo in the V2 generators would
 * have sailed straight through it. Same failure as ADR-0008, one level
 * down, and the module-level gate could not have found it.
 *
 * So: an exported function in a domain root must be called by something
 * outside its own module, or be listed below.
 *
 * Three exemptions are automatic rather than listed, because all three are
 * legible at the declaration:
 *   - `__`-prefixed names   — deliberate test hooks (`__resetFooForTests`)
 *   - `@oracle` modules     — test-only by design (ADR-0008's marker)
 *   - `@oracle` on a single export's JSDoc — the same claim, one level
 *     down. Added 2026-07-25 because triage kept meeting the case the
 *     module-level marker can't express: `scheduleUtils.countByType` is
 *     test-only BY DESIGN (it is how the generateSchedule suite asserts
 *     "lift exposure = lift + both"), but it lives in a module full of
 *     production exports, so marking the file would blind the gate to all
 *     of them. Without this the only options were renaming a
 *     production-shaped pure function to `__countByType`, or pinning it as
 *     an orphan — which is a claim of DEBT, and it isn't debt.
 *
 * NOTE the pinned list is functions ONLY. Exported CONSTANTS used solely
 * by their own module plus a test are a different and legitimate pattern
 * (pinning a threshold), and including them buried the signal — 220
 * entries instead of 47.
 *
 * PRECISION (2026-07-25b). The first version searched raw file text, so a
 * name appearing in a COMMENT counted as a use. That is why it reported
 * `analytics.ts` as mostly reachable when production imports exactly two
 * of its 22 exports — the rest were "used" by prose. Comments are stripped
 * before matching now.
 *
 * The error direction matters and was the safe one: comment matches made
 * the gate UNDER-report (a dead symbol read as live), never over-report,
 * so it could not have failed CI spuriously. A gate that cries wolf gets
 * disabled; one that misses some real cases still ratchets. Worth keeping
 * in mind for the next gate: prefer the miss to the false alarm.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { moduleHeader, docAbove } from "./reachabilityMarkers";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const isTest = (p: string) => /__tests__|\.test\.|\.spec\./.test(p);

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // optional root (scripts/, e2e/) may be absent
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!/node_modules|dist|\.git/.test(e.name)) walk(p, out);
    } else if (/\.(ts|tsx|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Remove block and line comments so prose can't masquerade as a call site.
 * Crude on purpose: it does not parse, so a `//` inside a string literal is
 * over-eaten. That only ever removes a potential match, which pushes toward
 * reporting MORE orphans — visible as a CI failure, never a silent pass.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Roots whose exports must be reachable. */
const DOMAIN_ROOTS = ["src/lib", "src/features", "functions/lib"];
/** Everything that could plausibly consume them. */
const CONSUMER_ROOTS = ["src", "functions", "e2e", "scripts"];

/**
 * Exported functions with no caller outside their own module.
 *
 * DELETE-ONLY as a LIST: entries come off, none go on. But the list is a
 * TRIAGE QUEUE, not a delete list — read each module's header before
 * acting. Unreachable has at least three causes and only one of them is
 * rot:
 *
 *   rot         — the consumer was rewritten and the helper stayed behind
 *                 (`analytics.ts` lost 20 of 22 exports this way). Delete
 *                 it and its tests.
 *   staged      — shipped deliberately ahead of its wiring.
 *                 `raceRunDaysReconcile.ts` says so in its header AND
 *                 notes the bug it fixes is live until then. Deleting that
 *                 throws away tested logic for a real bug.
 *   suppressed  — a feature switched off but kept as cheap optionality.
 *                 `foodTrajectory.ts` is switched off at the call site in
 *                 FoodHeroCard.
 *
 * Both non-rot cases were nearly deleted in one sweep here on the strength
 * of "no consumer" alone. The tell was in the module header both times —
 * so if a header gives no reason, that absence IS the finding: either
 * write the reason down or delete the module.
 *
 * Do not add entries; a new orphan means the export was never needed.
 */
const KNOWN_ORPHAN_EXPORTS = [
  "src/features/partnerStreak/streakEngine.ts:partnerToNudge",
  "src/features/program/raceRunDaysReconcile.ts:areRaceRunDaysStale",
  "src/features/program/raceRunDaysReconcile.ts:honestRaceWeekIndex",
  "src/features/program/raceRunDaysReconcile.ts:raceIsInFuture",
  "src/features/program/raceRunDaysReconcile.ts:raceMinWeeks",
  "src/features/program/run9Migration.ts:migrateRunStateToRun9",
  "src/features/spaces/spaceDefs.ts:upcomingRaceSpaceDefs",
  "src/lib/aiFoodIdentification.ts:isEmptyAiFoodResult",
  "src/lib/analyticsProvider.ts:isAnalyticsActive",
  "src/lib/dataConfidence.ts:makeSuppressionBatch",
  "src/lib/dataConfidence.ts:suppressionCaveatCopy",
  "src/lib/foodTrajectory.ts:computeTrajectory",
  "src/lib/hrZones.ts:zoneDistribution",
  "src/lib/performanceInsights.ts:buildPerformanceInsight",
  "src/lib/runHeroState.ts:shouldShowHeroOverflow",
  "src/lib/runProgrammeViewModel.ts:buildHybridWeekItems",
  "src/lib/shareCard/instagramShare.ts:isInstagramShareAvailable",
  "src/lib/shareCard/statToggles.ts:isStatVisible",
  "src/lib/workoutBurn.ts:estimateRunBurn",
];

function orphanExports(): string[] {
  const files = CONSUMER_ROOTS.flatMap((r) =>
    walk(resolve(repoRoot, r))
  ).filter((p) => !p.includes(`${repoRoot}/functions/node_modules`));
  const consumers = files
    .filter((p) => !isTest(p))
    .map((p) => ({ path: p, text: stripComments(readFileSync(p, "utf8")) }));

  const found: string[] = [];
  for (const file of files) {
    const rel = file.slice(repoRoot.length + 1);
    if (isTest(file) || !DOMAIN_ROOTS.some((r) => rel.startsWith(r))) continue;
    const src = readFileSync(file, "utf8");
    // Header marker → the whole module is test-only by design. Scoped to
    // the header on purpose: a per-symbol @oracle further down claims only
    // that symbol, and must not take the module out of the gate.
    if (/@oracle\b/.test(moduleHeader(src))) continue;

    for (const m of src.matchAll(/^export function ([A-Za-z0-9_]+)/gm)) {
      const name = m[1];
      if (name.startsWith("__")) continue; // deliberate test hook
      // Per-symbol @oracle: test-only by design, in a module that is not.
      if (/@oracle\b/.test(docAbove(src, m.index))) continue;
      const ref = new RegExp(`\\b${name}\\b`, "g");
      const usedElsewhere = consumers.some(
        (c) => c.path !== file && ref.test(c.text)
      );
      if (usedElsewhere) continue;
      // Used inside its own module? Then it's an implementation detail
      // that happens to be exported, not an orphan.
      if ((src.match(ref) ?? []).length > 1) continue;
      found.push(`${rel}:${name}`);
    }
  }
  return found.sort();
}

describe("symbol-level reachability", () => {
  const orphans = orphanExports();

  it("scans a plausible number of modules (guards a broken scan)", () => {
    // If the scan breaks, `orphans` empties and every assertion below
    // passes vacuously — exactly how the module-level gate would have
    // failed silently.
    const files = walk(resolve(repoRoot, "src/lib")).filter((p) => !isTest(p));
    expect(files.length).toBeGreaterThan(100);
  });

  it("no NEW exported function is unreachable from outside its module", () => {
    const fresh = orphans.filter((o) => !KNOWN_ORPHAN_EXPORTS.includes(o));
    expect(
      fresh,
      `These are exported but called by nothing outside their own module. ` +
        `A test covering one proves nothing about production (ADR-0008). ` +
        `Wire it up, or delete it and its tests.`
    ).toEqual([]);
  });

  it("the pinned list stays honest — no entry that is now reachable", () => {
    // The direction that rots quietly: someone wires an orphan up, nobody
    // removes the line, and the list stops describing reality.
    const stale = KNOWN_ORPHAN_EXPORTS.filter((o) => !orphans.includes(o));
    expect(
      stale,
      `These are pinned as orphans but are now reachable (or gone). Remove ` +
        `them from KNOWN_ORPHAN_EXPORTS — the list is delete-only.`
    ).toEqual([]);
  });
});

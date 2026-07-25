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
 * Two exemptions are automatic rather than listed, because both are
 * legible at the call site:
 *   - `__`-prefixed names   — deliberate test hooks (`__resetFooForTests`)
 *   - `@oracle` modules     — test-only by design (ADR-0008's marker)
 *
 * NOTE the pinned list is functions ONLY. Exported CONSTANTS used solely
 * by their own module plus a test are a different and legitimate pattern
 * (pinning a threshold), and including them buried the signal — 220
 * entries instead of 47.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

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

/** Roots whose exports must be reachable. */
const DOMAIN_ROOTS = ["src/lib", "src/features", "functions/lib"];
/** Everything that could plausibly consume them. */
const CONSUMER_ROOTS = ["src", "functions", "e2e", "scripts"];

/**
 * Exported functions with no caller outside their own module.
 *
 * DELETE-ONLY. Wire it up, or delete it and its tests — a test over an
 * unreachable function proves nothing about production, which is the
 * whole point of ADR-0008. Do not add entries; a new orphan means the
 * export was never needed.
 */
const KNOWN_ORPHAN_EXPORTS = [
  "src/features/partnerStreak/streakEngine.ts:partnerToNudge",
  "src/features/program/programEngine.ts:calculateE1RM",
  "src/features/program/programEngine.ts:getProgressionLabel",
  "src/features/program/raceRunDaysReconcile.ts:areRaceRunDaysStale",
  "src/features/program/raceRunDaysReconcile.ts:honestRaceWeekIndex",
  "src/features/program/raceRunDaysReconcile.ts:raceIsInFuture",
  "src/features/program/raceRunDaysReconcile.ts:raceMinWeeks",
  "src/features/program/run9Migration.ts:migrateRunStateToRun9",
  "src/features/program/trainingBlock.ts:blockDocPath",
  "src/lib/aiFoodIdentification.ts:isEmptyAiFoodResult",
  "src/lib/analytics.ts:computeVolume",
  "src/lib/analytics.ts:dailyAdherence",
  "src/lib/analytics.ts:detectFatigue",
  "src/lib/analytics.ts:fourWeekChange",
  "src/lib/analytics.ts:momentumDirection",
  "src/lib/analytics.ts:strengthSlope",
  "src/lib/analytics.ts:volumeWoWChange",
  "src/lib/analytics.ts:weeklyAdherenceScore",
  "src/lib/analyticsProvider.ts:isAnalyticsActive",
  "src/lib/dataConfidence.ts:makeSuppressionBatch",
  "src/lib/dataConfidence.ts:suppressionCaveatCopy",
  "src/lib/errorReporting.ts:clearErrors",
  "src/lib/errorReporting.ts:getRecentErrors",
  "src/lib/funComparisons.ts:getDistanceComparison",
  "src/lib/getBestSetSummary.ts:getBestSetSummary",
  "src/lib/guidedRun.ts:auditGuidedWorkouts",
  "src/lib/hrZones.ts:zoneDistribution",
  "src/lib/momentumCheckin.ts:checkinDocPath",
  "src/lib/nutritionConsistency.ts:commitmentDocPath",
  "src/lib/nutritionInsights.ts:getMacroBalance",
  "src/lib/performanceInsights.ts:buildPerformanceInsight",
  "src/lib/runGuards.ts:canShowFullSummary",
  "src/lib/runHeroState.ts:shouldShowHeroOverflow",
  "src/lib/runProgrammeViewModel.ts:buildHybridWeekItems",
  "src/lib/scheduleUtils.ts:countByType",
  "src/lib/scheduleUtils.ts:getTodaySchedule",
  "src/lib/scheduledRunCompletion.ts:isRaceDayCompletedStrictly",
  "src/lib/shareCard/instagramShare.ts:isInstagramShareAvailable",
  "src/lib/shareCard/statToggles.ts:isStatVisible",
  "src/lib/shareComposer.ts:clearShareDefault",
  "src/lib/shareComposer.ts:getShareDefault",
  "src/lib/workoutBurn.ts:estimateRunBurn",
  "src/lib/workoutTemplates.ts:estimateRestTime",
  "src/lib/workoutTemplates.ts:estimateTotalSets",
  "src/lib/workoutTemplates.ts:getTemplateById",
  "src/lib/workoutTemplates.ts:getTemplatesByCategory",
  "src/lib/workoutTemplates.ts:getTemplatesByDifficulty",
];

function orphanExports(): string[] {
  const files = CONSUMER_ROOTS.flatMap((r) =>
    walk(resolve(repoRoot, r))
  ).filter((p) => !p.includes(`${repoRoot}/functions/node_modules`));
  const consumers = files
    .filter((p) => !isTest(p))
    .map((p) => ({ path: p, text: readFileSync(p, "utf8") }));

  const found: string[] = [];
  for (const file of files) {
    const rel = file.slice(repoRoot.length + 1);
    if (isTest(file) || !DOMAIN_ROOTS.some((r) => rel.startsWith(r))) continue;
    const src = readFileSync(file, "utf8");
    if (/@oracle\b/.test(src)) continue; // test-only by design

    for (const m of src.matchAll(/^export function ([A-Za-z0-9_]+)/gm)) {
      const name = m[1];
      if (name.startsWith("__")) continue; // deliberate test hook
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

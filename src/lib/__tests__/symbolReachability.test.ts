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
 *
 * SCOPE (2026-07-27). `src/hooks` joined DOMAIN_ROOTS. It had been outside
 * the scan for no reason beyond the roots being written before the hook
 * layer grew — and hooks are exactly where a stale export hides, since a
 * live hook keeps its whole module reachable. Adding it turned up ONE
 * orphan across ~75 files: `useUserPRMap._clearPRMapCache`, a "test-only
 * escape hatch" its own sibling suite explicitly declined to use (that
 * suite's header states there is no reset hook). Deleted rather than
 * pinned — a helper whose stated consumer says in writing that it does not
 * consume it is rot, not debt.
 *
 * Note the single underscore: the automatic exemption is `__`, so a
 * one-underscore name reads as production API to this gate. That is the
 * right default — `_foo` is a convention, `__foo` is a declaration — but
 * it is why this survived until the root was added rather than being
 * waved through as a test hook.
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

/**
 * Comments AND quoted strings. A name inside a string literal is not a
 * call, and the case is not hypothetical: `logger.error("useHistoryData
 * error:", e)` made `useHistoryData` look self-used, so the gate filed a
 * genuinely dead export as an implementation detail. Same shape had
 * already been seen on `useBodyweightTrend`.
 *
 * Template literals are deliberately LEFT ALONE. Their `${...}` holes
 * contain real code, so eating a whole template would delete real call
 * sites — a false ALARM, the direction this gate refuses to fail in.
 * Both observed cases were double-quoted log messages, so the narrow
 * rule catches them at no risk.
 *
 * Import specifiers are unaffected: the module path is inside the quotes,
 * the symbol names are outside them.
 */
function stripCommentsAndStrings(src: string): string {
  return stripComments(src)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

/** Roots whose exports must be reachable. */
const DOMAIN_ROOTS = ["src/lib", "src/features", "src/hooks", "functions/lib"];
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
 *
 * The exception is a PRECISION FIX to the scanner, which does not find new
 * orphans so much as stop hiding old ones. The 2026-07-27 string-literal
 * fix surfaced eleven at once: seven were rot and were deleted, four are
 * pinned below with reasons. Read those four as "was always an orphan, the
 * gate just couldn't see it", not as new debt. If you make the scanner
 * sharper again, expect the same and budget for the triage — the entries
 * are cheap, the reading is not.
 */
const KNOWN_ORPHAN_EXPORTS = [
  // Suppressed — kept optionality, and the judgement is not mine: CORE-01
  // (#1596) hardened this function KNOWING it was uncalled ("the live write
  // paths already use the idempotent safeMerge — but safeSave is one call
  // site away from reintroducing duplicates; this closes the trap"). It is
  // the offline-aware CREATE path, deliberately maintained against the day
  // a create-shaped write needs queueing. Surfaced 2026-07-27 when the
  // scanner learned to see `export async function`; its only self-mention
  // is its own error log string.
  "src/lib/offlineQueue.ts:safeSave",

  // Staged seam (2026-08-03): the 13a fine-muscle volume view. The taxonomy
  // split landed per-head judgement via its own 14-group layer rather than
  // wiring this 27-member view, so the fine layer remains what 13a built it
  // as — the attribution-resolution record (how much of a muscle's tally
  // the data can actually resolve), staged for per-fine response modelling
  // once real training data exists. The muscleTaxonomy roll-up invariant
  // still exercises it; the staleness guard evicts this entry when a
  // production consumer arrives.
  "src/features/program/volumeModel.ts:weeklyVolumeByFineMuscle",

  // ── native-injection seams (staged; CLAUDE.md's documented pattern) ──
  // Web ships the real path, native calls the setter from its boot path
  // once the Capacitor plugin lands. CLAUDE.md names the appCheck split as
  // THE reference for "if native parity is deferred, leave the seam".
  "src/lib/appCheck.ts:setNativeAppCheckProvider",
  "src/lib/shareCard/instagramShare.ts:setNativeInstagramProvider",

  // Test-harness accessor with a named future consumer: the web popstate
  // handler (module header's platform scope is "native now, web popstate
  // as a fast-follow"). The provider does NOT use it, despite the doc
  // that used to say so.
  "src/lib/backDismiss.ts:useBackDismissController",

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
  "src/lib/shareCard/instagramShare.ts:isInstagramShareAvailable",
  "src/lib/shareCard/statToggles.ts:isStatVisible",
];

function orphanExports(): string[] {
  const files = CONSUMER_ROOTS.flatMap((r) =>
    walk(resolve(repoRoot, r))
  ).filter((p) => !p.includes(`${repoRoot}/functions/node_modules`));
  const consumers = files
    .filter((p) => !isTest(p))
    .map((p) => ({
      path: p,
      text: stripCommentsAndStrings(readFileSync(p, "utf8")),
    }));

  const found: string[] = [];
  for (const file of files) {
    const rel = file.slice(repoRoot.length + 1);
    if (isTest(file) || !DOMAIN_ROOTS.some((r) => rel.startsWith(r))) continue;
    const src = readFileSync(file, "utf8");
    // Declarations are matched against RAW source (so `@oracle` docs and
    // the `export function` line survive), but the USE counts below run
    // against this — otherwise a module's own prose or log messages vouch
    // for its dead exports.
    const body = stripCommentsAndStrings(src);
    // Header marker → the whole module is test-only by design. Scoped to
    // the header on purpose: a per-symbol @oracle further down claims only
    // that symbol, and must not take the module out of the gate.
    if (/@oracle\b/.test(moduleHeader(src))) continue;

    // `async` included since 2026-07-27. The original pattern matched only
    // `export function`, which silently exempted every `export async
    // function` — 113 declarations across the domain roots at the time, a
    // gap documented nowhere (unlike the constants exclusion above). It was
    // hiding five real orphans, including one whose only "use" was its own
    // log string — the exact false-positive shape the string-stripping fix
    // was written to kill, surviving in the blind spot that fix couldn't
    // reach.
    for (const m of src.matchAll(
      /^export (?:async )?function ([A-Za-z0-9_]+)/gm
    )) {
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
      if ((body.match(ref) ?? []).length > 1) continue;
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

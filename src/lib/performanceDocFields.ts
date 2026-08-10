/**
 * performanceDocFields — the ONE way to read the two weekly-doc fields
 * that were being read through mirrors nothing writes.
 *
 * BOTH bugs below are the same shape: the `PerformanceWeekDoc` type
 * declares optional nested maps (`labels?: { loadBand }`, `flags?:
 * { deloadRecommended }`) alongside the canonical top-level fields.
 * The nested maps were never populated by ANY writer, but they were
 * optional, so reading them type-checked and silently produced
 * `undefined` forever.
 *
 * Why this module exists (2026-08-09 device finding): the band was read
 * three different ways across three surfaces, and the Analytics one was
 * wrong for every user, on every week, since it shipped.
 *
 *   PerformanceHeroCard  `labels?.loadBand ?? loadBand`   ✓
 *   PerformanceIndexChart `labels?.loadBand || loadBand`  ✓
 *   PerformanceTab        `labels?.loadBand`              ✗ always undefined
 *
 * NOTHING writes a `labels` map — not `functions/lib/perfScoring.js`, not
 * `functions/performanceEngine.js`, not the client engine. Every writer
 * emits a TOP-LEVEL `loadBand`. So the Analytics read resolved to
 * `undefined` and `getPlainLanguageSummary` fell through its catch-all
 * else-branch, telling EVERY user "Low training load. Good time to
 * recover or increase intensity." — including a user at PI ≥ 85, whose
 * real band is `overreach` and whose correct guidance is the opposite
 * ("you're pushing hard — consider a lighter session"). Meanwhile the
 * Home hero read the same week correctly, so the two surfaces openly
 * disagreed — the exact drift `performanceSummary.ts`'s own header says
 * must never happen.
 *
 * Resolution order, canonical-first:
 *   1. top-level `loadBand`   — what every writer actually emits
 *   2. `labels.loadBand`      — legacy/never-written mirror, kept as a
 *      read-side courtesy so a doc that somehow carries only the mirror
 *      still resolves
 *   3. derived from PI via `computeLoadBand`
 *
 * Step 3 is not a guess: `computeLoadBand` is a PURE FUNCTION OF PI and
 * is the same function every writer used to produce the stored value, so
 * deriving reproduces it exactly. That makes the resolver TOTAL — there
 * is no "unknown band" state left for a caller to paper over with a
 * wrong default, which is what caused this bug.
 */
import { computeLoadBand } from "./performanceEngine";
import type { LoadBand } from "./performanceTypes";

const VALID: ReadonlySet<string> = new Set<LoadBand>([
  "deload",
  "low",
  "moderate",
  "high",
  "overreach",
]);

/** The minimal doc shape this reads — deliberately structural so both
 *  `PerformanceWeekDoc` and `PerformanceDoc` satisfy it. */
export interface LoadBandSource {
  performanceIndex?: number;
  loadBand?: string;
  labels?: { loadBand?: string };
}

export interface DeloadSource {
  deloadRecommended?: boolean;
  flags?: { deloadRecommended?: boolean };
  signals?: { deloadFlag?: boolean };
}

/**
 * The deload recommendation — SAME drift, second field.
 *
 * `shouldRecommendDeload()` fires on the three states that matter most
 * (PI ≥ 80 with poor recovery; two consecutive weeks ≥ 85; high load with
 * collapsing adherence) and every writer stores it TOP-LEVEL. Every
 * client surface read `flags?.deloadRecommended`, which nothing writes —
 * so the Home hero's deload verb never triggered and the Analytics
 * deload banner has never rendered for anyone. Weekly Review escaped only
 * because it happened to fall back to `signals.deloadFlag`, the mirror
 * `performanceTypes.ts` documents as "mirrors top-level
 * deloadRecommended for client convenience".
 *
 * Unlike the band, this CANNOT be derived (it needs recovery, adherence
 * and the prior week), so the final fallback is `false` — which asserts
 * nothing, rather than inventing a recommendation.
 */
export function resolveDeloadRecommended(
  doc: DeloadSource | null | undefined
): boolean {
  if (typeof doc?.deloadRecommended === "boolean") {
    return doc.deloadRecommended;
  }
  if (typeof doc?.flags?.deloadRecommended === "boolean") {
    return doc.flags.deloadRecommended;
  }
  return doc?.signals?.deloadFlag === true;
}

/** Case-tolerant validation. Every writer emits lowercase, but the copy
 *  layer previously lowercased defensively, so that tolerance is kept
 *  here rather than silently dropped. */
function asBand(raw: unknown): LoadBand | null {
  if (typeof raw !== "string") return null;
  const v = raw.toLowerCase();
  return VALID.has(v) ? (v as LoadBand) : null;
}

export function resolveLoadBand(
  doc: LoadBandSource | null | undefined
): LoadBand {
  // A stored value only wins if it's a REAL band. Garbage / a renamed enum
  // value falls through to the derivation rather than being rendered raw
  // or defaulted to a wrong claim.
  return (
    asBand(doc?.loadBand) ??
    asBand(doc?.labels?.loadBand) ??
    computeLoadBand(
      typeof doc?.performanceIndex === "number" ? doc.performanceIndex : 0
    )
  );
}

/**
 * "Is the weekly read still establishing a baseline?" — one predicate, so
 * Home and Analytics can't disagree about it.
 *
 * They did (2026-08-10, the third Home-vs-Analytics divergence in this
 * doc after `labels.loadBand` and `flags.deloadRecommended`). Analytics
 * gated on `weeks.length < 4` — the count of docs inside its 12-week
 * fetch — under a comment that claimed it "mirrors the Home hero's
 * lifetimeWeeks<4 treatment". It didn't: Home gates on
 * `weeksAvailable < 2 || signals.lifetimeWeeks < 4`.
 *
 * The two measure different things, and split on a real user segment:
 * a LAPSED-AND-RETURNING athlete (a year of history, six months off, two
 * weeks back) has a high `lifetimeWeeks` but almost nothing in the recent
 * window — so Home showed a confident verdict while Analytics said
 * "Establishing your baseline", about the same week.
 *
 * This keeps the CONSERVATIVE reading, which is Home's shipped behaviour
 * and the semantically honest one: the verdict leans on a baseline
 * derived from PRIOR weeks, so it needs both a recent presence to compare
 * against and enough lifetime depth for that baseline to mean anything.
 * A returning athlete's year-old baseline should not license a confident
 * read of their second week back.
 *
 * Note the legacy consequence, deliberately accepted: pre-PI1a docs carry
 * no `signals`, so `normaliseSignals` defaults `lifetimeWeeks` to 0 and
 * those weeks read as establishing. That is the conservative direction
 * (an honest "still learning" instead of a confident wrong verdict), it
 * is what Home already does today, and `normaliseSignals` separately
 * reports those docs via `perf-doc-missing-signals`.
 */
export function isEstablishingBaseline(input: {
  /** Weekly docs actually delivered by the snapshot. */
  weeksAvailable: number;
  /** `signals.lifetimeWeeks` — distinct compute-weeks the engine has seen. */
  lifetimeWeeks: number | undefined;
}): boolean {
  return input.weeksAvailable < 2 || (input.lifetimeWeeks ?? 0) < 4;
}

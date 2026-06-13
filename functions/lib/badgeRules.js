/**
 * Pure server-side milestone badge rules.
 *
 * `functions/` is plain CommonJS and can't import the client catalogue
 * (`src/features/streaks/badges.ts`), so the RUNNING thresholds are mirrored
 * here. PARITY CONTRACT: the ids + intent MUST match `BADGE_DEFINITIONS` and
 * the client descriptions ("Complete a 5K run", "Complete 21.1 km", "Run a
 * sub-5:00/km pace", …) — pinned by functions/__tests__/badgeRules.test.js.
 *
 * Scope: only RUNNING badges that are determinable from a SINGLE run document
 * live here (awarded on `onRunCreated`). Lifetime aggregates (`century_km`,
 * `tonnage_100`), lifting-weight badges, nutrition streaks, and cross-discipline
 * badges need more data / other triggers and are deliberate follow-ups.
 *
 * Why server-side: the client's streak snapshots are WINDOWED (≤400 docs), so
 * a marathon run from two years ago wouldn't be in view — lifetime/historical
 * milestones can't be computed accurately on the client. The activity-create
 * trigger sees the full run doc at creation time, so it's the correct owner
 * (same reason challenge-sync lives here).
 */

// Single-run distance milestones, in METRES. Official race distances (a 21.1 km
// run clears the 21097 m half; a 42.2 km run clears the 42195 m marathon).
const RUN_DISTANCE_MILESTONES = [
  { id: "first_5k", minMeters: 5000 },
  { id: "10k_club", minMeters: 10000 },
  { id: "half_marathon", minMeters: 21097 },
  { id: "marathon", minMeters: 42195 },
];

// "Run a sub-5:00/km pace" — 5:00/km = 300 s/km. Require a real run (≥1 km) so
// a 50 m dash at the isCountable floor can't masquerade as a sub-5 pace.
const SPEED_DEMON_PACE_SEC_PER_KM = 300;
const SPEED_DEMON_MIN_METERS = 1000;

/**
 * The milestone badge ids a single run qualifies for. Distance in metres,
 * duration in seconds (the run doc's `distance` / `duration` fields).
 * Idempotent + side-effect-free — the caller decides which are already earned.
 */
function runMilestoneBadges(distanceMeters, durationSeconds) {
  const d = Number(distanceMeters) || 0;
  const t = Number(durationSeconds) || 0;
  const ids = [];

  for (const m of RUN_DISTANCE_MILESTONES) {
    if (d >= m.minMeters) ids.push(m.id);
  }

  if (d >= SPEED_DEMON_MIN_METERS && t > 0) {
    const paceSecPerKm = t / (d / 1000);
    if (paceSecPerKm < SPEED_DEMON_PACE_SEC_PER_KM) ids.push("speed_demon");
  }

  return ids;
}

// ── Lifetime-aggregate milestones ──────────────────────────────────────────
//
// Unlike the single-run milestones above, these depend on a CUMULATIVE total
// the trigger can't see in one doc — so the caller (onRun/onWorkoutCreated)
// maintains a per-user lifetime counter (idempotently, with a per-source
// marker) and passes the resulting total here. The thresholds match the
// client catalogue's descriptions: "Run 100 km lifetime distance" and "Move
// 100 tonnes total volume".
//
// Awarding is monotonic + idempotent downstream (the badge's `earnedAt` is set
// once), so this can simply return the id whenever the total is at/over the
// line — re-passing an already-crossed total is a harmless no-op award. No
// "crossed this time" detection needed here.
const LIFETIME_RUN_METERS_MILESTONE = 100000; // 100 km
const LIFETIME_LIFT_VOLUME_KG_MILESTONE = 100000; // 100 tonnes

/**
 * Lifetime-aggregate badge ids earned at a given running total.
 *   kind "run"  → century_km    once total run distance ≥ 100 km (metres)
 *   kind "lift" → tonnage_100   once total lift volume   ≥ 100 t  (kg)
 * Returns [] for an unknown kind or a sub-threshold / non-finite total.
 */
function lifetimeMilestoneBadges(kind, total) {
  const v = Number(total) || 0;
  if (kind === "run" && v >= LIFETIME_RUN_METERS_MILESTONE) {
    return ["century_km"];
  }
  if (kind === "lift" && v >= LIFETIME_LIFT_VOLUME_KG_MILESTONE) {
    return ["tonnage_100"];
  }
  return [];
}

module.exports = {
  runMilestoneBadges,
  lifetimeMilestoneBadges,
  RUN_DISTANCE_MILESTONES,
  SPEED_DEMON_PACE_SEC_PER_KM,
  SPEED_DEMON_MIN_METERS,
  LIFETIME_RUN_METERS_MILESTONE,
  LIFETIME_LIFT_VOLUME_KG_MILESTONE,
};

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

module.exports = {
  runMilestoneBadges,
  RUN_DISTANCE_MILESTONES,
  SPEED_DEMON_PACE_SEC_PER_KM,
  SPEED_DEMON_MIN_METERS,
};

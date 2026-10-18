/**
 * Canonical global-challenge definitions — SERVER-OWNED.
 *
 * These were historically built and seeded by the client
 * (`src/features/challenges/useChallenges.ts` → `seedChallenges()`), which
 * meant every authenticated browser could create global `/challenges/{id}`
 * docs. That is app-owned product metadata, not user content — the same
 * lesson the repo already learned for the (since-retired) default
 * crews: system-owned records belong to the privileged
 * Admin SDK, not the client.
 *
 * Crews were STATIC (a fixed set, seeded once). Challenges are NOT: the IDs are
 * time-windowed (`weekly-YYYY-MM-DD`, `monthly-…`, `seasonal-…`, `fastest-5k-…`,
 * `group-goal-…`) and roll every week / month / season. A one-time seed script
 * would therefore seed only the period it ran in and the weekly challenge would
 * silently expire within a week (the client filters `endDate > now`). So the
 * server owner is a *scheduled* rollover function (`rolloverChallenges` in
 * index.js) that idempotently materialises the CURRENT period's docs on a
 * daily cron — this module is the pure definition layer it consumes.
 *
 * Pure + dependency-free + `now`-injected so the rollover logic is unit-testable
 * across week/month/season boundaries without a clock or Firestore. All
 * boundaries are computed in **UTC** (Cloud Functions run in UTC; pinning the
 * anchor avoids the BST-style hour drift documented in CLAUDE.md). `startDate`
 * / `endDate` are plain JS `Date`s; the caller wraps them in a Firestore
 * Timestamp so this file never imports firebase-admin.
 */

/** UTC YYYY-MM-DD for a UTC-midnight Date. */
function ymd(d) {
  return d.toISOString().slice(0, 10);
}

/** UTC midnight of the Monday on or before `now`. */
function weekStartUTC(now) {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  d.setUTCDate(d.getUTCDate() - day + (day === 0 ? -6 : 1));
  return d;
}

function monthStartUTC(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A fixed yearly calendar: one featured goal, renewed every month.
 * Odd-numbered months favour training days, even-numbered months logged
 * training time. These metrics use current-source reconciliation rather than
 * per-activity SUM increments, so edits and same-day sessions stay correct. */
function featuredMonthlyFor(now) {
  const monthName = MONTH_NAMES[now.getUTCMonth()];
  if (now.getUTCMonth() % 2 === 0) {
    return {
      name: `${monthName} Active Days`,
      description:
        "Log a lift or a run. Each date counts once, with room for rest days.",
      metric: "active_days",
      icon: "calendar-days",
      tiers: { bronze: 8, silver: 12, gold: 20 },
    };
  }
  return {
    name: `${monthName} Training Minutes`,
    description: "Your logged running and lifting minutes this month add up.",
    metric: "training_minutes",
    icon: "clock",
    tiers: { bronze: 120, silver: 300, gold: 600 },
  };
}

/** Quarter-based season definition (mirrors the retired client logic). */
function seasonFor(now) {
  const month = now.getUTCMonth();
  if (month >= 2 && month <= 4) {
    return {
      name: "Spring Reset",
      description:
        "Your logged lifting sessions this season count. Rest days are welcome.",
      metric: "workout_count",
      icon: "sprout",
      tiers: { bronze: 8, silver: 20, gold: 36 },
    };
  }
  if (month >= 5 && month <= 7) {
    return {
      name: "Summer Shred",
      description: "Running and lifting both count. Train however you like.",
      metric: "hybrid_score",
      icon: "sun",
      tiers: { bronze: 500, silver: 2000, gold: 5000 },
    };
  }
  if (month >= 8 && month <= 10) {
    return {
      name: "Autumn Push",
      description: "Running and lifting both count, toward one score.",
      metric: "hybrid_score",
      icon: "leaf",
      tiers: { bronze: 500, silver: 2000, gold: 5000 },
    };
  }
  return {
    name: "Winter Bulk",
    description: "Everything you lift this season adds up.",
    metric: "total_volume",
    icon: "snowflake",
    tiers: { bronze: 5000, silver: 25000, gold: 50000 },
  };
}

function seasonStartUTC(now) {
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  if (month >= 2 && month <= 4) return new Date(Date.UTC(year, 2, 1));
  if (month >= 5 && month <= 7) return new Date(Date.UTC(year, 5, 1));
  if (month >= 8 && month <= 10) return new Date(Date.UTC(year, 8, 1));
  return month >= 11
    ? new Date(Date.UTC(year, 11, 1))
    : new Date(Date.UTC(year - 1, 11, 1));
}

function seasonEndUTC(now) {
  const month = now.getUTCMonth();
  const year = now.getUTCFullYear();
  if (month >= 2 && month <= 4) return new Date(Date.UTC(year, 5, 1));
  if (month >= 5 && month <= 7) return new Date(Date.UTC(year, 8, 1));
  if (month >= 8 && month <= 10) return new Date(Date.UTC(year, 11, 1));
  return month >= 11
    ? new Date(Date.UTC(year + 1, 2, 1))
    : new Date(Date.UTC(year, 2, 1));
}

/**
 * The set of global challenge definitions that should exist for the period
 * containing `now`. Each entry's `id` is the deterministic doc id under
 * `/challenges`. Returns plain data — the caller adds `participantCount` /
 * `createdAt` and Timestamp-wraps the dates.
 */
function buildCurrentChallenges(now = new Date()) {
  const weekStart = weekStartUTC(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  const monthStart = monthStartUTC(now);
  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );
  const seasonStart = seasonStartUTC(now);
  const seasonEnd = seasonEndUTC(now);
  const season = seasonFor(now);
  const monthName = MONTH_NAMES[now.getUTCMonth()];
  const featured = featuredMonthlyFor(now);

  return [
    {
      id: `weekly-${ymd(weekStart)}`,
      name: "Weekly Warrior",
      description: "Train this week, Monday to Sunday.",
      type: "weekly",
      metric: "workout_count",
      icon: "trophy",
      tiers: { bronze: 2, silver: 4, gold: 6 },
      startDate: weekStart,
      endDate: weekEnd,
    },
    {
      id: `monthly-${ymd(monthStart)}`,
      name: `${monthName} Mileage`,
      description: "Every run this month adds up.",
      type: "monthly",
      metric: "total_km",
      icon: "footprints",
      tiers: { bronze: 10, silver: 25, gold: 50 },
      startDate: monthStart,
      endDate: monthEnd,
    },
    {
      id: `strength-monthly-${ymd(monthStart)}`,
      name: `${monthName} Strength Builder`,
      description: "Your logged lifting volume this month. Follow your usual plan.",
      type: "monthly",
      metric: "total_volume",
      icon: "dumbbell",
      tiers: { bronze: 5000, silver: 15000, gold: 30000 },
      startDate: monthStart,
      endDate: monthEnd,
    },
    {
      id: `featured-monthly-${ymd(monthStart)}`,
      ...featured,
      type: "monthly",
      startDate: monthStart,
      endDate: monthEnd,
    },
    {
      // SOCIAL S4 (Soc8) — the featured "This month on Tropos" global
      // challenge. A TRUE km+kg HYBRID: hybrid_score = km×100 + kg×0.1,
      // summed server-side from onRunCreated (+km×100) and
      // onWorkoutCreated (+kg×0.1). Solo-viable by design — you compete
      // against the target number, not friends — so it anchors the
      // solo-first Social tab. The solo layout selects it by the
      // `global-monthly-` id prefix. (Same metric as the seasonal Autumn
      // Push, which now also progresses thanks to the Soc8 trigger sync.)
      id: `global-monthly-${ymd(monthStart)}`,
      name: `${monthName} Hybrid Hero`,
      description: "Running and lifting both count. Train however you like.",
      type: "monthly",
      metric: "hybrid_score",
      icon: "trophy",
      tiers: { bronze: 3000, silver: 8000, gold: 15000 },
      startDate: monthStart,
      endDate: monthEnd,
    },
    {
      id: `seasonal-${ymd(seasonStart)}`,
      name: season.name,
      description: season.description,
      type: "seasonal",
      metric: season.metric,
      icon: season.icon,
      tiers: season.tiers,
      startDate: seasonStart,
      endDate: seasonEnd,
    },
    {
      // Pace-based: lower currentValue wins; tiers are pace targets in seconds
      // (gold sub-25min, silver sub-30min, bronze sub-35min for a 5K). The
      // sync path in index.js MIN-updates currentValue for fastest_effort.
      id: `fastest-5k-${ymd(monthStart)}`,
      name: "Fastest 5K",
      description: "Your fastest 5K this month.",
      type: "monthly",
      metric: "fastest_effort",
      icon: "footprints",
      targetDistance: 5000,
      tiers: { bronze: 35 * 60, silver: 30 * 60, gold: 25 * 60 },
      startDate: monthStart,
      endDate: monthEnd,
    },
    {
      // Collective km this month from everyone who opts in. Same total_km sync
      // path as the individual Mileage challenge; the UI differentiates on
      // collectiveTarget. tiers are a stub (= collectiveTarget) so existing
      // tier logic doesn't break.
      id: `group-goal-${ymd(monthStart)}`,
      name: "Together: 1,000 km",
      description: "Every run from everyone this month adds up.",
      type: "monthly",
      metric: "total_km",
      icon: "footprints",
      collectiveTarget: 1000,
      tiers: { bronze: 1000, silver: 1000, gold: 1000 },
      startDate: monthStart,
      endDate: monthEnd,
    },
  ];
}

/**
 * The defs that should exist RIGHT NOW plus the ones the next UTC day needs
 * — deduped by id (identical away from period boundaries).
 *
 * WHY A DAY OF LOOKAHEAD (probe sweep 2026-08-05, verifier-confirmed HIGH):
 * activity is credited by its LOCAL calendar day against these UTC windows,
 * and a UTC-positive user enters the new period hours before UTC does — an
 * NZ runner's local Aug 1 morning run carries date "2026-08-01" while it is
 * still Jul 31 in UTC. The August doc did not exist yet (this rollover runs
 * daily at 00:05 UTC), so `syncChallengeProgress` had nothing to credit and
 * the run was silently dropped from every challenge. Materialising the next
 * period's docs a day early closes that hole for every timezone (the
 * furthest, UTC+14, enters the new period 14h before UTC; the 00:05 UTC run
 * the day before is ~24h ahead).
 *
 * Crediting INTO the early docs stays fail-closed by the existing window
 * predicate: `challengeContainsActivityDate` accepts only activity days
 * inside [startDate, endDate), so a Jul 31 activity can never credit the
 * pre-materialised August challenge. The CLIENT hides not-yet-started
 * challenges via its own local-day window (useChallenges), so the early doc
 * never renders as a second live challenge.
 */
function buildUpcomingChallenges(now = new Date()) {
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const byId = new Map();
  for (const def of [
    ...buildCurrentChallenges(now),
    ...buildCurrentChallenges(tomorrow),
  ]) {
    if (!byId.has(def.id)) byId.set(def.id, def);
  }
  return [...byId.values()];
}

module.exports = {
  buildCurrentChallenges,
  buildUpcomingChallenges,
  // exported for targeted tests
  weekStartUTC,
  monthStartUTC,
  seasonStartUTC,
  seasonEndUTC,
  seasonFor,
  featuredMonthlyFor,
};

/**
 * [push] Pure badge-nudge decision (epic #961, badge sender #968).
 *
 * Server-only, plain JS, pure. Earned badges live in
 * `users/{uid}/streaks/data.badges[]` as `{ id, earnedAt }` (earnedAt is an
 * ISO string or null). This decides which badges are eligible for a push
 * right now: earned within a recency window AND not already pushed.
 *
 * The recency window is the back-spam guard: `pushedBadgeIds` starts empty,
 * so without it the first sweep for an existing user (who may have a dozen
 * historical badges) would treat every one as "new". Gating on a short
 * earned-at window means only genuinely-recent achievements push.
 */

const DEFAULT_WINDOW_DAYS = 2;

/**
 * @param {Array<{id?: string, earnedAt?: string|null}>} badges
 * @param {string[]} pushedBadgeIds  ids already pushed (from pushState)
 * @param {Date} now
 * @param {number} [windowDays]
 * @returns {string[]} ids eligible to push now (recent ∧ earned ∧ not pushed)
 */
function pushableBadgeIds(badges, pushedBadgeIds, now, windowDays = DEFAULT_WINDOW_DAYS) {
  const cutoff = now.getTime() - windowDays * 86400000;
  const pushed = new Set(pushedBadgeIds || []);
  return (badges || [])
    .filter((b) => b && b.id && b.earnedAt && !pushed.has(b.id))
    .filter((b) => {
      const t = Date.parse(b.earnedAt);
      return Number.isFinite(t) && t >= cutoff;
    })
    .map((b) => b.id);
}

module.exports = { pushableBadgeIds, DEFAULT_WINDOW_DAYS };

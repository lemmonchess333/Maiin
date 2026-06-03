/**
 * [push] functions/lib/badgeNudge.js contract tests (epic #961, badge sender #968).
 *
 * Pure decision over the streaks/data.badges[] list: which earned badges are
 * eligible for a push right now — recently earned AND not already pushed. The
 * recency window prevents back-spam of historical badges when an existing user
 * first becomes eligible (pushedBadgeIds starts empty).
 */
import { describe, it, expect } from "vitest";
import { pushableBadgeIds } from "../lib/badgeNudge";

// 2026-06-03T12:00:00Z reference "now".
const NOW = new Date("2026-06-03T12:00:00Z");
const iso = (d) => d.toISOString();
const daysAgo = (n) => iso(new Date(NOW.getTime() - n * 86400000));

describe("pushableBadgeIds", () => {
  it("returns a recently-earned badge that hasn't been pushed", () => {
    const badges = [{ id: "week_warrior", earnedAt: daysAgo(0) }];
    expect(pushableBadgeIds(badges, [], NOW)).toEqual(["week_warrior"]);
  });

  it("excludes badges already pushed", () => {
    const badges = [{ id: "week_warrior", earnedAt: daysAgo(0) }];
    expect(pushableBadgeIds(badges, ["week_warrior"], NOW)).toEqual([]);
  });

  it("excludes unearned badges (earnedAt null)", () => {
    const badges = [
      { id: "month_master", earnedAt: null },
      { id: "first_step", earnedAt: daysAgo(0) },
    ];
    expect(pushableBadgeIds(badges, [], NOW)).toEqual(["first_step"]);
  });

  it("excludes badges earned outside the 2-day window (no back-spam of history)", () => {
    const badges = [
      { id: "old_badge", earnedAt: daysAgo(30) },
      { id: "fresh_badge", earnedAt: daysAgo(1) },
    ];
    expect(pushableBadgeIds(badges, [], NOW)).toEqual(["fresh_badge"]);
  });

  it("respects a custom window", () => {
    const badges = [{ id: "b", earnedAt: daysAgo(5) }];
    expect(pushableBadgeIds(badges, [], NOW, 7)).toEqual(["b"]);
    expect(pushableBadgeIds(badges, [], NOW, 2)).toEqual([]);
  });

  it("returns ALL recent unpushed badges (one push can cover a batch)", () => {
    const badges = [
      { id: "a", earnedAt: daysAgo(0) },
      { id: "b", earnedAt: daysAgo(1) },
      { id: "c", earnedAt: daysAgo(0) },
    ];
    expect(pushableBadgeIds(badges, ["b"], NOW).sort()).toEqual(["a", "c"]);
  });

  it("is defensive against malformed input", () => {
    expect(pushableBadgeIds(null, null, NOW)).toEqual([]);
    expect(pushableBadgeIds(undefined, undefined, NOW)).toEqual([]);
    expect(
      pushableBadgeIds([{ id: "x", earnedAt: "not-a-date" }], [], NOW)
    ).toEqual([]);
    expect(pushableBadgeIds([{ earnedAt: daysAgo(0) }], [], NOW)).toEqual([]); // no id
  });
});

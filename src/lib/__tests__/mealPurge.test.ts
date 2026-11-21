/**
 * How long a deleted meal has left (F5c, STATUS 2026-11-21): whole days,
 * counted up, so a meal deleted a minute ago has 30 and one in its last
 * day has 1; due once its 30 days are up. The server's job keeps the same
 * day (`mealPurge.cross.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { DELETED_MEAL_RETENTION_DAYS, purgeCountdown } from "@/lib/mealPurge";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 21, 12, 0);

describe("purgeCountdown", () => {
  it("keeps a deleted meal for 30 days", () => {
    expect(DELETED_MEAL_RETENTION_DAYS).toBe(30);
  });

  it.each([
    ["just deleted", 0, { kind: "days", days: 30 }],
    ["deleted 12 hours ago", 0.5 * DAY, { kind: "days", days: 30 }],
    ["deleted a day ago", DAY, { kind: "days", days: 29 }],
    ["deleted 29 days ago", 29 * DAY, { kind: "days", days: 1 }],
    ["a millisecond short of 30 days", 30 * DAY - 1, { kind: "days", days: 1 }],
    ["deleted 30 days ago", 30 * DAY, { kind: "due" }],
    ["deleted 45 days ago", 45 * DAY, { kind: "due" }],
  ])("%s", (_, elapsed, expected) => {
    expect(purgeCountdown(NOW - elapsed, NOW)).toEqual(expected);
  });

  it("counts from the meal's own deletedAt, as the server's query does", () => {
    /* Deleted on a phone whose clock ran 5 days ahead. The server finds a
       meal by its `deletedAt`, so it goes 35 days from now, and the page
       says so rather than a 30 that the job would not keep. */
    expect(purgeCountdown(NOW + 5 * DAY, NOW)).toEqual({
      kind: "days",
      days: 35,
    });
  });
});

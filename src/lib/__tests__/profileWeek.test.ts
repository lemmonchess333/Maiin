import { describe, expect, it } from "vitest";
import { profileWeek } from "../profileWeek";
import { activityToFeedItem, createdAtMs } from "../activityFeedItem";
import { startOfLocalWeek } from "../dateHelpers";

const now = new Date();
const monday = startOfLocalWeek(now).getTime();
const item = (
  id: string,
  createdAt: unknown,
  fields: Record<string, unknown> = {}
) =>
  activityToFeedItem(id, { authorId: "a", type: "run", createdAt, ...fields });

describe("profileWeek", () => {
  it("counts from local Monday midnight, not a moment before", () => {
    const week = profileWeek(
      [
        item("in", monday, { distance: 5000 }),
        item("out", monday - 1, { distance: 9000 }),
      ],
      now
    );
    expect(week).toEqual({ sessions: 1, distanceM: 5000, volumeKg: 0 });
  });

  it("adds a brick session to both distance and volume", () => {
    const week = profileWeek(
      [
        item("brick", monday + 1, {
          type: "workout",
          distance: 5030,
          totalVolume: 1240,
        }),
      ],
      now
    );
    expect(week).toEqual({ sessions: 1, distanceM: 5030, volumeKg: 1240 });
  });

  it("a session with neither still counts as a session", () => {
    expect(profileWeek([item("bare", monday + 1)], now)).toEqual({
      sessions: 1,
      distanceM: 0,
      volumeKg: 0,
    });
  });
});

describe("createdAtMs", () => {
  it("reads every shape a post time arrives in", () => {
    expect(createdAtMs(5)).toBe(5);
    expect(createdAtMs(new Date(7))).toBe(7);
    expect(createdAtMs({ toMillis: () => 9 })).toBe(9);
    expect(createdAtMs({ toDate: () => new Date(11) })).toBe(11);
    expect(createdAtMs(undefined)).toBe(0);
  });
});

describe("activityToFeedItem", () => {
  it("carries the post's own fields to the card", () => {
    const fi = activityToFeedItem("p1", {
      authorId: "a",
      authorName: "Maya",
      type: "workout",
      prCount: 2,
      avgPace: 318,
      kudosCount: 3,
    });
    expect(fi).toMatchObject({
      id: "p1",
      activityId: "p1",
      authorName: "Maya",
      type: "workout",
      kudosCount: 3,
    });
    expect(fi.activity).toMatchObject({ id: "p1", prCount: 2, avgPace: 318 });
    expect(fi.authorPhotoURL).toBeUndefined();
  });
});

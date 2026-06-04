import { describe, it, expect } from "vitest";
import {
  pickKudosCandidate,
  localDayKey,
  type KudosFeedItemLike,
} from "@/lib/postCompletionKudos";

const ME = "me-uid";
const NOW = new Date(2026, 5, 4, 19, 0, 0); // local 2026-06-04 19:00

function ts(d: Date) {
  return { toDate: () => d };
}
const todayMorning = new Date(2026, 5, 4, 8, 0, 0);
const yesterday = new Date(2026, 5, 3, 20, 0, 0);

describe("pickKudosCandidate", () => {
  it("returns null on an empty feed (no fabricated social proof)", () => {
    expect(pickKudosCandidate([], ME, NOW)).toBeNull();
  });

  it("picks the most recent activity by someone else, posted today", () => {
    const items: KudosFeedItemLike[] = [
      {
        activityId: "a1",
        authorId: "alex",
        authorName: "Alex",
        type: "run",
        createdAt: ts(todayMorning),
      },
    ];
    const c = pickKudosCandidate(items, ME, NOW);
    expect(c).toEqual({
      activityId: "a1",
      authorId: "alex",
      authorName: "Alex",
      authorPhotoURL: undefined,
      type: "run",
    });
  });

  it("skips the current user's own activity", () => {
    const items: KudosFeedItemLike[] = [
      {
        activityId: "mine",
        authorId: ME,
        authorName: "You",
        createdAt: ts(todayMorning),
      },
      {
        activityId: "a1",
        authorId: "alex",
        authorName: "Alex",
        createdAt: ts(todayMorning),
      },
    ];
    expect(pickKudosCandidate(items, ME, NOW)?.activityId).toBe("a1");
  });

  it("skips activities not posted today", () => {
    const items: KudosFeedItemLike[] = [
      {
        activityId: "old",
        authorId: "sam",
        authorName: "Sam",
        createdAt: ts(yesterday),
      },
    ];
    expect(pickKudosCandidate(items, ME, NOW)).toBeNull();
  });

  it("takes the first (newest-first feed) eligible item", () => {
    const items: KudosFeedItemLike[] = [
      {
        activityId: "newest",
        authorId: "alex",
        authorName: "Alex",
        createdAt: ts(new Date(2026, 5, 4, 18)),
      },
      {
        activityId: "older",
        authorId: "sam",
        authorName: "Sam",
        createdAt: ts(new Date(2026, 5, 4, 9)),
      },
    ];
    expect(pickKudosCandidate(items, ME, NOW)?.activityId).toBe("newest");
  });

  it("requires an activityId and an authorName to kudos", () => {
    const items: KudosFeedItemLike[] = [
      { authorId: "alex", authorName: "Alex", createdAt: ts(todayMorning) }, // no activityId
      {
        activityId: "a2",
        authorId: "sam",
        authorName: "",
        createdAt: ts(todayMorning),
      }, // no name
      {
        activityId: "a3",
        authorId: "kim",
        authorName: "Kim",
        createdAt: ts(todayMorning),
      },
    ];
    expect(pickKudosCandidate(items, ME, NOW)?.activityId).toBe("a3");
  });

  it("accepts Date and epoch-millis createdAt, not just Timestamp", () => {
    const asDate: KudosFeedItemLike[] = [
      {
        activityId: "d",
        authorId: "alex",
        authorName: "Alex",
        createdAt: todayMorning,
      },
    ];
    const asMillis: KudosFeedItemLike[] = [
      {
        activityId: "m",
        authorId: "alex",
        authorName: "Alex",
        createdAt: todayMorning.getTime(),
      },
    ];
    expect(pickKudosCandidate(asDate, ME, NOW)?.activityId).toBe("d");
    expect(pickKudosCandidate(asMillis, ME, NOW)?.activityId).toBe("m");
  });

  it("defaults an unknown type to workout", () => {
    const items: KudosFeedItemLike[] = [
      {
        activityId: "a",
        authorId: "alex",
        authorName: "Alex",
        createdAt: ts(todayMorning),
      },
    ];
    expect(pickKudosCandidate(items, ME, NOW)?.type).toBe("workout");
  });
});

describe("localDayKey", () => {
  it("formats local Y-M-D zero-padded", () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localDayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

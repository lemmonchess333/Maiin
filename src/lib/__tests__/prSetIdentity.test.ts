/**
 * The PRs tab printed every record twice for a user's first 30 days.
 *
 * Two cards per sport — all-time, and best of the last 30 days — are two
 * different facts once a history outgrows the window, and the SAME fact
 * before it does. The rich capture showed the second case: Best pace
 * 5:32 · 23 Aug and Longest run 8.0 km · 8 Sept in both running cards,
 * and three identical lift rows underneath. Every new user lives in that
 * window, so it is not a rare state.
 *
 * The pair of assertions that matters here is match-and-differ. A helper
 * that only ever returned true would pass a duplication test on its own;
 * the divergence cases are what stop the second card being suppressed on
 * a user it still has news for.
 */
import { describe, it, expect } from "vitest";
import { samePRSet, runningPRKey, liftPRKey } from "@/lib/prSetIdentity";

const pace = {
  label: "Best pace",
  value: "5:32 /km",
  date: "23 Aug",
  runId: "run-a",
};
const longest = {
  label: "Longest run",
  value: "8.0 km",
  date: "8 Sept",
  runId: "run-b",
};

const bench = { name: "Bench Press", weight: 80, reps: 8, date: "2026-09-19" };
const row = { name: "Barbell Row", weight: 60, reps: 8, date: "2026-09-19" };

describe("samePRSet — running", () => {
  it("matches when the recent card repeats the all-time card", () => {
    expect(samePRSet([pace, longest], [pace, longest], runningPRKey)).toBe(
      true
    );
  });

  it("matches on CONTENT, not object identity", () => {
    /* The two buckets come out of separate builder passes over two pools,
       so the rows are never the same objects even when they name the same
       records. A reference comparison would report "different" always and
       the duplicate card would never collapse. */
    expect(
      samePRSet([{ ...pace }, { ...longest }], [pace, longest], runningPRKey)
    ).toBe(true);
  });

  it("differs when the recent window holds a better figure", () => {
    const faster = { ...pace, value: "5:10 /km", date: "18 Sept" };
    expect(samePRSet([pace, longest], [faster, longest], runningPRKey)).toBe(
      false
    );
  });

  it("differs when the same figure was set on another day", () => {
    /* Same pace, different run — two records that happen to tie. The
       dates beside them say so, so the cards are not duplicates. */
    expect(
      samePRSet([pace], [{ ...pace, date: "18 Sept" }], runningPRKey)
    ).toBe(false);
  });

  it("differs when the recent card is missing a row", () => {
    expect(samePRSet([pace, longest], [pace], runningPRKey)).toBe(false);
  });

  it("differs when the ranking itself moved", () => {
    /* Same two records, opposite order. Both lists come from one builder,
       so an order change means the ranking moved — a real change. */
    expect(samePRSet([pace, longest], [longest, pace], runningPRKey)).toBe(
      false
    );
  });

  it("an empty recent set is never a match", () => {
    /* "No record in the window" is not "the same records". The caller
       already suppresses the card in that case; answering false keeps
       this helper's verdict about duplication alone, so a caller that
       drops that gate still renders the right card. */
    expect(samePRSet([pace, longest], [], runningPRKey)).toBe(false);
    expect(samePRSet([], [], runningPRKey)).toBe(false);
  });

  it("ignores fields the cards do not put on screen", () => {
    /* `runId` routes the row; it is not part of what the reader compares.
       Two buckets can carry different ids for the same record when the
       same effort was saved twice — the visible fact is still one fact. */
    expect(samePRSet([pace], [{ ...pace, runId: "run-z" }], runningPRKey)).toBe(
      true
    );
  });
});

describe("samePRSet — lifting", () => {
  it("matches when both lists hold the same sets", () => {
    expect(samePRSet([bench, row], [bench, row], liftPRKey)).toBe(true);
  });

  it("differs on a heavier set", () => {
    expect(
      samePRSet([bench, row], [{ ...bench, weight: 85 }, row], liftPRKey)
    ).toBe(false);
  });

  it("differs on the same weight for more reps", () => {
    /* 80 kg x 8 and 80 kg x 10 are different records, and the reps sit on
       the row — a key that dropped them would merge them. */
    expect(samePRSet([bench], [{ ...bench, reps: 10 }], liftPRKey)).toBe(false);
  });

  it("differs when the all-time list is longer", () => {
    /* The ordinary shape of a real history: more lifts all-time than in
       the window. Both cards earn their place. */
    expect(samePRSet([bench, row], [bench], liftPRKey)).toBe(false);
  });
});

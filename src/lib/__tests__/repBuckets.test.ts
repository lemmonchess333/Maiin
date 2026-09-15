import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  REP_BUCKETS,
  listRepBuckets,
  emptyRepBucketNote,
} from "@/lib/repBuckets";

/**
 * The per-exercise "Personal bests by reps" card, seen with a real
 * training history for the first time.
 *
 * It matches EXACTLY — a set counts for a bucket only when its reps
 * equal the bucket — so 1, 3, 5 and 10 are served and 2, 4, 6, 7, 8, 9,
 * 11 and 12 produce nothing. Filmed against the seeded account, whose
 * bench work is eighteen sessions of eights: four em-dashes, under a
 * card reading "Best 1RM 101 kg" that Epley-estimates over EVERY set at
 * any rep count. A confident figure beside four blanks, with nothing on
 * screen to reconcile them.
 *
 * Widening the buckets into ranges is NOT the fix and is deliberately
 * not attempted: filing an eight-rep set under "10RM" claims a
 * performance the lifter never gave — the same false-label shape as the
 * running records. What the card owed was an explanation, and a heading
 * that does not promise ranges it never had.
 */
describe("listRepBuckets", () => {
  it("reads as English, from the constant rather than a copy of it", () => {
    expect(listRepBuckets()).toBe("1, 3, 5 or 10");
    // Built from REP_BUCKETS, so the sentence cannot drift from the row
    // it describes. Adding a bucket must change the copy.
    expect(listRepBuckets([1, 3, 5, 8, 10])).toBe("1, 3, 5, 8 or 10");
  });

  it("degrades for the short cases rather than emitting a stray 'or'", () => {
    expect(listRepBuckets([5])).toBe("5");
    expect(listRepBuckets([3, 5])).toBe("3 or 5");
    expect(listRepBuckets([])).toBe("");
  });
});

describe("emptyRepBucketNote", () => {
  it("says nothing once any bucket has a record", () => {
    // The figures speak for themselves; a note beside them is noise.
    expect(
      emptyRepBucketNote({ hasAnyBucketRecord: true, isBodyweight: false })
    ).toBeNull();
    expect(
      emptyRepBucketNote({ hasAnyBucketRecord: true, isBodyweight: true })
    ).toBeNull();
  });

  it("names the counts that fill the row in, and reconciles the estimate", () => {
    const note = emptyRepBucketNote({
      hasAnyBucketRecord: false,
      isBodyweight: false,
    });
    expect(note).toBe(
      "No sets at 1, 3, 5 or 10 reps yet. The 1RM estimate above reads " +
        "every set, whatever the rep count."
    );
  });

  it("drops the second sentence for bodyweight, which shows no 1RM", () => {
    // That branch's header stat is not an estimate, so the
    // reconciliation would point at a number the reader cannot see.
    const note = emptyRepBucketNote({
      hasAnyBucketRecord: false,
      isBodyweight: true,
    });
    expect(note).toBe("No sets at 1, 3, 5 or 10 reps yet.");
    expect(note).not.toMatch(/1RM/);
  });

  it("keeps the house register", () => {
    const note = emptyRepBucketNote({
      hasAnyBucketRecord: false,
      isBodyweight: false,
    })!;
    expect(note).not.toMatch(/!/);
    // No motivational tail glued onto the explanation.
    expect(note).not.toMatch(/keep|journey|unlock|crush/i);
  });
});

describe("the page renders it", () => {
  /* The helper is pure and the card is inside a route page that needs
     params, auth and Firestore to mount — so this scans for the wiring
     rather than rendering it. Without it every assertion above is a
     claim about a function nothing calls. */
  const page = readFileSync("src/pages/ExerciseHistory.tsx", "utf8");

  it("calls the helper and renders its result", () => {
    expect(page).toMatch(/emptyRepBucketNote\(/);
    expect(page).toMatch(/\{repBucketNote\}/);
  });

  it("no longer promises ranges it never had", () => {
    /* A set counts only when `set.reps === bucket`, so "Rep-range PRs"
       described something the code does not do. */
    expect(page).not.toMatch(/Rep-range PRs/);
    expect(page).toMatch(/Personal bests by reps/);
  });

  it("keeps the exact-match rule this note exists to explain", () => {
    // If the buckets ever become ranges, the note's wording is wrong and
    // this test should be the thing that says so.
    expect(page).toMatch(/set\.reps !== bucket/);
    expect(REP_BUCKETS).toEqual([1, 3, 5, 10]);
  });
});

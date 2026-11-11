/**
 * A corrected lift's post and its moments (Soc15). The PRs on a post were
 * judged as the session finished, against records that live with the app;
 * once the sets are corrected the server cannot judge them again, so the
 * post stops claiming them. What a correction cannot change stays.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { FieldValue } = require("firebase-admin/firestore");
const { correctedPostMoments } = require("../lib/workoutCorrections");

const PR = { kind: "pr", exercise: "Bench press", weightKg: 90, reps: 5 };
const STREAK = { kind: "streak", days: 30 };
const WEEK = { kind: "planWeek", week: 4, weeks: 12 };

describe("correctedPostMoments", () => {
  it("drops the PR moments and the PR count, keeping the rest in order", () => {
    const update = correctedPostMoments({
      prCount: 2,
      moments: [STREAK, PR, WEEK],
    });
    expect(update.moments).toEqual([STREAK, WEEK]);
    expect(update.prCount.isEqual(FieldValue.delete())).toBe(true);
  });

  it("deletes the moments field when only PRs were on it", () => {
    const update = correctedPostMoments({ prCount: 1, moments: [PR] });
    expect(update.moments.isEqual(FieldValue.delete())).toBe(true);
    expect(update.prCount.isEqual(FieldValue.delete())).toBe(true);
  });

  it("leaves a post that claims no PR as it is", () => {
    expect(correctedPostMoments({ moments: [STREAK, WEEK] })).toEqual({});
    // A post from before moments, and a run's.
    expect(correctedPostMoments({ totalVolume: 4200 })).toEqual({});
    expect(correctedPostMoments(undefined)).toEqual({});
  });
});

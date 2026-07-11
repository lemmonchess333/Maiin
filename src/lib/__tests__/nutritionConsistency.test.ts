/**
 * NUTR-CONSISTENCY-01 — pure model pins.
 *
 * The load-bearing pin: nothing shareable carries numbers, calories,
 * macros, meals or weight — the constant status line is the entire
 * social surface. Plus: distinct-day counting inside the week
 * boundary (deleted meals just stop contributing), calm lines at
 * every stage, idempotent weekKey doc path, parse guard.
 */
import { describe, it, expect } from "vitest";
import {
  INTENT_OPTIONS,
  SHARED_MET_TEXT,
  commitmentDocPath,
  deriveProgress,
  parseCommitment,
  targetDaysFor,
} from "../nutritionConsistency";

// 2026-07-06 is a Monday — weekBounds covers Mon..Sun.
const WEEK = "2026-07-06";

describe("intents", () => {
  it("offers exactly the three day-count intents", () => {
    expect(INTENT_OPTIONS.map((o) => o.value)).toEqual([
      "log_3_days",
      "log_5_days",
      "log_daily",
    ]);
    expect(targetDaysFor("log_3_days")).toBe(3);
    expect(targetDaysFor("log_daily")).toBe(7);
  });
});

describe("deriveProgress", () => {
  it("counts DISTINCT in-week meal days only", () => {
    const progress = deriveProgress(
      "log_3_days",
      [
        "2026-07-06",
        "2026-07-06", // duplicate day — one meal day, not two
        "2026-07-08",
        "2026-07-05", // previous week — out
        "2026-07-13", // next week — out
      ],
      WEEK
    );
    expect(progress.done).toBe(2);
    expect(progress.met).toBe(false);
    expect(progress.line).toMatch(/1 more day/);
  });

  it("meets the target and caps done at target", () => {
    const progress = deriveProgress(
      "log_3_days",
      ["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09"],
      WEEK
    );
    expect(progress.met).toBe(true);
    expect(progress.done).toBe(3);
    expect(progress.line).toMatch(/habit working/i);
  });

  it("an empty week gets an inviting line, never a shaming one", () => {
    const progress = deriveProgress("log_5_days", [], WEEK);
    expect(progress.done).toBe(0);
    expect(progress.line).not.toMatch(/fail|behind|only|should|missed/i);
  });

  it("deleted meals simply reduce the day set (no special casing)", () => {
    // Same derivation with the deleted meal's date absent.
    const before = deriveProgress(
      "log_3_days",
      ["2026-07-06", "2026-07-07"],
      WEEK
    );
    const after = deriveProgress("log_3_days", ["2026-07-06"], WEEK);
    expect(before.done).toBe(2);
    expect(after.done).toBe(1);
  });
});

describe("the privacy pin — shared text carries NOTHING quantitative", () => {
  it("is a constant with no digits, calories, macros, meals or weight", () => {
    expect(SHARED_MET_TEXT).not.toMatch(/\d/);
    expect(SHARED_MET_TEXT.toLowerCase()).not.toMatch(
      /calorie|kcal|macro|protein|carb|fat|meal|weight|deficit/
    );
  });
});

describe("doc path + parse", () => {
  it("keys by week (idempotent)", () => {
    expect(commitmentDocPath("u1", WEEK)).toBe(
      `users/u1/nutritionCommitments/${WEEK}`
    );
  });

  it("round-trips valid docs and rejects malformed ones", () => {
    const valid = { weekKey: WEEK, intent: "log_5_days", createdAt: 1 };
    expect(parseCommitment(valid)).toEqual(valid);
    expect(parseCommitment({ ...valid, sharedMet: true })?.sharedMet).toBe(
      true
    );
    expect(parseCommitment(null)).toBeNull();
    expect(parseCommitment({ ...valid, intent: "count_calories" })).toBeNull();
  });
});

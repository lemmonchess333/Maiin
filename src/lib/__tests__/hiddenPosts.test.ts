/**
 * A hidden post's one line on Settings → Hidden posts (App1 Q38): its
 * name, its distance or exercises, and the day it was posted, en-GB, with
 * the year only when it is not this one.
 */
import { describe, expect, it } from "vitest";
import { hiddenPostLine } from "../hiddenPosts";

/* Built from local parts, so the day and the year are the same in every
   time zone CI runs in. */
const NOW = new Date(2026, 10, 13, 12);
const posted = (y: number, m: number, d: number) => ({
  toMillis: () => new Date(y, m, d, 12).getTime(),
});

describe("hiddenPostLine", () => {
  it("names a run, its distance and its day", () => {
    expect(
      hiddenPostLine(
        {
          type: "run",
          activityTitle: "Easy run",
          distance: 5200,
          createdAt: posted(2026, 2, 20),
        },
        "km",
        NOW
      )
    ).toBe("Easy run · 5.2 km · 20 Mar");
  });

  it("gives the distance in the reader's unit", () => {
    expect(
      hiddenPostLine(
        { type: "run", runName: "Long run", distance: 16093.44 },
        "mi",
        NOW
      )
    ).toBe("Long run · 10.0 mi");
  });

  it("names a programme lift by its type, with how many exercises", () => {
    expect(
      hiddenPostLine(
        {
          type: "workout",
          workoutName: "Pull — Lat Focus",
          exerciseCount: 6,
          createdAt: posted(2026, 9, 3),
        },
        "km",
        NOW
      )
    ).toBe("Pull · 6 exercises · 3 Oct");
  });

  it("carries the year for a post from another year", () => {
    expect(
      hiddenPostLine(
        {
          type: "workout",
          workoutName: "Upper A",
          exerciseCount: 1,
          createdAt: posted(2025, 11, 31),
        },
        "km",
        NOW
      )
    ).toBe("Upper A · 1 exercise · 31 Dec 2025");
  });

  it("falls back to Run or Lift, and leaves out a figure it does not have", () => {
    expect(hiddenPostLine({ type: "run", distance: 0 }, "km", NOW)).toBe("Run");
    expect(hiddenPostLine({ type: "workout" }, "km", NOW)).toBe("Lift");
  });
});

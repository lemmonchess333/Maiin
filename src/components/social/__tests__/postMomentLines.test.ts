import { describe, expect, it } from "vitest";
import { postMomentLines } from "../postMomentLines";
import type { PostMoment } from "@/lib/postMoments";

/**
 * A moment in words (Soc15): the kind gives the words, the numbers the
 * figures, in the reader's units, spaced ("90 kg", "21.3 km"), en-GB.
 * Gold only for a best.
 */

const KM_KG = { distanceUnit: "km", liftUnit: "kg" } as const;
const MI_LB = { distanceUnit: "mi", liftUnit: "lbs" } as const;
/** keepTogether's non-breaking spaces, read as plain ones. */
const plain = (s: string | undefined) => s?.replace(/\u00A0/g, " ");

const lines = (moment: PostMoment, units: typeof KM_KG | typeof MI_LB) => {
  const out = postMomentLines(moment, units);
  return {
    ...out,
    detail: out.detail && {
      text: out.detail.text,
      figure: plain(out.detail.figure),
    },
  };
};

describe("postMomentLines", () => {
  it("a PR: its exercise and its set, in the reader's load unit", () => {
    const pr: PostMoment = {
      kind: "pr",
      exercise: "Bench Press",
      weightKg: 90,
      reps: 5,
    };
    expect(lines(pr, KM_KG)).toEqual({
      headline: "New PR",
      detail: { text: "Bench Press", figure: "90 kg × 5" },
      tone: "best",
      icon: "trophy",
    });
    // 90 kg is 198.4 lb.
    expect(lines(pr, MI_LB).detail?.figure).toBe("198.4 lb × 5");
  });

  it("a kettlebell PR reads in whole bells in lb", () => {
    const out = postMomentLines(
      { kind: "pr", exercise: "Kettlebell Swing", weightKg: 16, reps: 20 },
      { ...MI_LB, exerciseIdOf: () => "kettlebell-swing" }
    );
    expect(plain(out.detail?.figure)).toBe("35 lb × 20");
  });

  it("the run moments, in the reader's distance unit", () => {
    expect(lines({ kind: "longestRun", meters: 21300 }, KM_KG)).toEqual({
      headline: "Longest run yet",
      detail: { text: undefined, figure: "21.3 km" },
      tone: "best",
      icon: "medal",
    });
    expect(
      lines({ kind: "longestRun", meters: 21300 }, MI_LB).detail?.figure
    ).toBe("13.2 mi");
    expect(
      lines({ kind: "fastestEffort", meters: 5000, seconds: 1361 }, MI_LB)
    ).toEqual({
      headline: "Fastest 5K",
      detail: { text: undefined, figure: "22:41" },
      tone: "best",
      icon: "trophy",
    });
    expect(
      lines({ kind: "fastestEffort", meters: 10000, seconds: 3725 }, KM_KG)
        .detail?.figure
    ).toBe("1:02:05");
  });

  it("a first distance is named as a race is, in any unit", () => {
    const named = (meters: 5000 | 10000 | 21097 | 42195) =>
      lines({ kind: "firstDistance", meters }, MI_LB).headline;
    expect(named(5000)).toBe("First 5K");
    expect(named(10000)).toBe("First 10K");
    expect(named(21097)).toBe("First half marathon");
    expect(named(42195)).toBe("First marathon");
  });

  it("the milestones, in the brand purple rather than gold", () => {
    for (const [moment, headline, icon] of [
      [{ kind: "streak", days: 30 }, "30-day streak", "flame"],
      [{ kind: "planWeek", week: 4, weeks: 12 }, "Week 4 of 12 done", "flag"],
      [{ kind: "planComplete" }, "Programme complete", "medal"],
    ] as const) {
      expect(lines(moment, KM_KG)).toEqual({
        headline,
        tone: "milestone",
        icon,
      });
    }
  });

  it("a first session in its sport's colour, as the finish screen draws it", () => {
    expect(lines({ kind: "firstSession" }, KM_KG)).toEqual({
      headline: "First session on Tropos",
      tone: "sport",
      icon: "flag",
    });
  });
});

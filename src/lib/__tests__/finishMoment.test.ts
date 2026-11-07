import { describe, expect, it } from "vitest";
import {
  finishKicker,
  finishRegister,
  rewardLine,
  summaryLine,
  type RewardLineContext,
} from "@/lib/finishMoment";
import type { PostMoment } from "@/lib/postMoments";

const pr = (exercise: string, weightKg: number, reps: number): PostMoment => ({
  kind: "pr",
  exercise,
  weightKg,
  reps,
});

const kg: RewardLineContext = {
  distanceUnit: "km",
  loadIn: (weightKg) => weightKg,
  loadUnit: "kg",
};

/* The figure keeps its words together with no-break spaces; the
   sentence is compared as it reads. */
const text = (line: { before: string; figure: string; after: string }) =>
  `${line.before}${line.figure}${line.after}`.replace(/\u00A0/g, " ");

describe("finishRegister: which sessions get the full-screen reward (§14m rule 29)", () => {
  it("gives a routine session the calm summary", () => {
    expect(finishRegister([], "lift")).toEqual({ register: "summary" });
    expect(finishRegister(undefined, "run")).toEqual({ register: "summary" });
  });

  it("keeps a plan's week done on the summary: it is not one of the four", () => {
    expect(
      finishRegister([{ kind: "planWeek", week: 3, weeks: 8 }], "lift")
    ).toEqual({ register: "summary" });
  });

  it("rewards a new best in gold, with confetti", () => {
    expect(finishRegister([pr("Barbell Row", 35, 8)], "lift")).toEqual({
      register: "reward",
      moment: pr("Barbell Row", 35, 8),
      tone: "achievement",
      confetti: true,
    });
    for (const moment of [
      { kind: "fastestEffort", meters: 5000, seconds: 1500 },
      { kind: "longestRun", meters: 12400 },
      { kind: "firstDistance", meters: 10000 },
    ] as PostMoment[]) {
      expect(finishRegister([moment], "run")).toMatchObject({
        register: "reward",
        tone: "achievement",
        confetti: true,
      });
    }
  });

  it("rewards a streak milestone in the flame's purple, with no confetti (rule 32)", () => {
    expect(finishRegister([{ kind: "streak", days: 7 }], "run")).toEqual({
      register: "reward",
      moment: { kind: "streak", days: 7 },
      tone: "lifting",
      confetti: false,
    });
  });

  it("rewards a first session and a finished plan in the sport's own colour, with confetti", () => {
    expect(finishRegister([{ kind: "firstSession" }], "lift")).toMatchObject({
      tone: "lifting",
      confetti: true,
    });
    expect(finishRegister([{ kind: "firstSession" }], "run")).toMatchObject({
      tone: "running",
      confetti: true,
    });
    expect(finishRegister([{ kind: "planComplete" }], "lift")).toMatchObject({
      tone: "lifting",
      confetti: true,
    });
  });

  it("leads with the most significant moment, as the post orders them", () => {
    expect(
      finishRegister(
        [pr("Squat", 100, 5), { kind: "streak", days: 30 }],
        "lift"
      )
    ).toMatchObject({ moment: { kind: "streak", days: 30 } });
    expect(
      finishRegister(
        [{ kind: "planWeek", week: 8, weeks: 8 }, pr("Squat", 100, 5)],
        "lift"
      )
    ).toMatchObject({ moment: { kind: "pr" } });
  });

  it("ignores a moment the rules would refuse", () => {
    expect(
      finishRegister(
        [{ kind: "pr", exercise: "", weightKg: -1, reps: 0 }] as PostMoment[],
        "lift"
      )
    ).toEqual({ register: "summary" });
  });
});

describe("rewardLine: you, what you did, the number and its comparison (house voice)", () => {
  it("says the mockup's line for a row that beat its best by a plate", () => {
    const line = rewardLine(pr("Barbell Row", 35, 8), {
      ...kg,
      prBefore: { weightKg: 32.5, reps: 8 },
    });
    expect(text(line)).toBe("You rowed 35 kg × 8, a new best by 2.5 kg.");
    expect(line.figure).toBe("35 kg × 8");
  });

  it("counts reps when the load held and the reps rose", () => {
    expect(
      text(
        rewardLine(pr("Back Squat", 100, 6), {
          ...kg,
          prBefore: { weightKg: 100, reps: 5 },
        })
      )
    ).toBe("You squatted 100 kg × 6, a new best by 1 rep.");
  });

  it("names a lift its verb doesn't, and says what it was up from otherwise", () => {
    expect(
      text(
        rewardLine(pr("Leg Press", 120, 10), {
          ...kg,
          prBefore: { weightKg: 140, reps: 6 },
        })
      )
    ).toBe("You lifted 120 kg × 10 on Leg Press, a new best (was 140 kg × 6).");
    expect(text(rewardLine(pr("Leg Press", 120, 10), kg))).toBe(
      "You lifted 120 kg × 10 on Leg Press, a new best."
    );
  });

  it("writes the load in the lifter's unit", () => {
    const lb: RewardLineContext = {
      distanceUnit: "mi",
      loadIn: (weightKg) => Math.round(weightKg * 2.20462 * 2) / 2,
      loadUnit: "lb",
      prBefore: { weightKg: 60, reps: 5 },
    };
    expect(text(rewardLine(pr("Bench Press", 62.5, 5), lb))).toBe(
      "You benched 138 lb × 5, a new best by 5.5 lb."
    );
  });

  it("words the run's bests in the runner's unit", () => {
    expect(text(rewardLine({ kind: "longestRun", meters: 12400 }, kg))).toBe(
      "You ran 12.4 km, your longest run yet."
    );
    expect(
      text(
        rewardLine(
          { kind: "fastestEffort", meters: 5000, seconds: 1450 },
          { ...kg, fastestBefore: 1482 }
        )
      )
    ).toBe("You ran 5K in 24:10, your fastest by 0:32.");
    expect(
      text(
        rewardLine({ kind: "fastestEffort", meters: 1000, seconds: 290 }, kg)
      )
    ).toBe("You ran 1K in 4:50, your fastest yet.");
    expect(text(rewardLine({ kind: "firstDistance", meters: 10000 }, kg))).toBe(
      "You ran your first 10K!"
    );
  });

  it("gives a streak its next milestone", () => {
    expect(text(rewardLine({ kind: "streak", days: 7 }, kg))).toBe(
      "You've trained 7 days in a row. 14 is next."
    );
    expect(text(rewardLine({ kind: "streak", days: 365 }, kg))).toBe(
      "You've trained 365 days in a row."
    );
  });

  it("names a first by its sport, with the screen's one exclamation mark", () => {
    expect(
      text(rewardLine({ kind: "firstSession" }, { ...kg, sport: "lift" }))
    ).toBe("You finished your first workout!");
    expect(
      text(rewardLine({ kind: "firstSession" }, { ...kg, sport: "run" }))
    ).toBe("You finished your first run!");
    expect(text(rewardLine({ kind: "planComplete" }, kg))).toBe(
      "You finished the last week of your plan."
    );
  });

  it("never carries more than one exclamation mark, and never cheers", () => {
    const moments: PostMoment[] = [
      pr("Barbell Row", 35, 8),
      { kind: "longestRun", meters: 12400 },
      { kind: "firstDistance", meters: 5000 },
      { kind: "fastestEffort", meters: 10000, seconds: 3000 },
      { kind: "streak", days: 30 },
      { kind: "planComplete" },
      { kind: "firstSession" },
    ];
    for (const moment of moments) {
      const words = text(rewardLine(moment, kg));
      expect(words.split("!").length - 1).toBeLessThanOrEqual(1);
      expect(words).toMatch(/^You/);
      expect(words).not.toMatch(/crush|amazing|awesome|beast|smash/i);
    }
  });
});

describe("summaryLine: a routine session's one quiet line", () => {
  it("says a plan's week done with its number", () => {
    expect(summaryLine([{ kind: "planWeek", week: 3, weeks: 8 }])).toBe(
      "You finished week 3 of 8."
    );
  });

  it("says nothing without one", () => {
    expect(summaryLine([])).toBeNull();
  });
});

describe("finishKicker: the date and the time it ran, en-GB and 24-hour", () => {
  it("writes the day and the start and end times", () => {
    const start = new Date(2026, 10, 7, 7, 42);
    const end = new Date(2026, 10, 7, 8, 23);
    expect(finishKicker(start.getTime(), end.getTime())).toBe(
      "Sat 7 Nov · 07:42–08:23"
    );
  });

  it("writes the day alone without a start", () => {
    expect(
      finishKicker(undefined, new Date(2026, 10, 7, 8, 23).getTime())
    ).toBe("Sat 7 Nov");
  });
});

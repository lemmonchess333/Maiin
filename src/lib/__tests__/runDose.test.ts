import { describe, expect, it } from "vitest";
import { plannedSessionMinutes, runDoseLine, runMinutesLine } from "../runDose";
import { RUN_TEMPLATES } from "../workoutTemplates";

const template = (id: string) => RUN_TEMPLATES.find((t) => t.id === id)!;

/* Run21 (5): a timed run states its time; a distance run's minutes come
   from the easy pace of a confirmed benchmark, else the distance alone. */
describe("a run's dose", () => {
  it("is a timed run's own time", () => {
    expect(runDoseLine(template("easy_40"), null)).toBe("40 min");
    expect(runDoseLine(template("tempo_20"), 400)).toBe("30 min");
    expect(runDoseLine(template("run_walk_1"), null)).toBe("29 min");
  });

  it("is a long run's distance alone without a confirmed pace", () => {
    // Long 15K's 80 minutes assume about 5:20 /km: no one's minutes but
    // that runner's.
    expect(runDoseLine(template("long_15k"), null)).toBe("15 km");
    expect(runDoseLine(template("long_15k"), undefined)).toBe("15 km");
    expect(runMinutesLine(template("long_15k"), null)).toBeNull();
  });

  it("gives a long run its minutes at the runner's own easy pace, to the nearest five", () => {
    // 15 km at 6:40 /km is 100 minutes; at 7:30 /km, 112.5, so 115.
    expect(runDoseLine(template("long_15k"), 400)).toBe(
      "15 km · about 100 min"
    );
    expect(runDoseLine(template("long_15k"), 450)).toBe(
      "15 km · about 115 min"
    );
    expect(runMinutesLine(template("long_6k"), 450)).toBe("about 45 min");
  });

  /* Deep dive D15: the template's minutes assume repeats of about
     3:40 /km and 90 seconds between them. */
  it("gives an interval session its minutes at the runner's own interval pace", () => {
    // 4 × 1 km at 4:00 with 3 minutes between: 10 + 16 + 9 + 5 = 40.
    expect(runDoseLine(template("4x1k"), null, 240)).toBe("about 40 min");
    // At 6:37, with 4½ minutes between: 10 + 26.5 + 13.5 + 5, so 55.
    expect(runDoseLine(template("4x1k"), null, 397)).toBe("about 55 min");
    // 8 × 400 m at 3:45 /km, a minute between: 10 + 12 + 7 + 5, so 35.
    expect(runMinutesLine(template("8x400"), null, 225)).toBe("about 35 min");
  });

  it("is an interval session's own minutes without a confirmed pace", () => {
    expect(runDoseLine(template("4x1k"), 400)).toBe("34 min");
    expect(runDoseLine(template("4x1k"), 400, null)).toBe("34 min");
  });

  it("times only interval sessions by the interval pace", () => {
    expect(runDoseLine(template("easy_40"), null, 240)).toBe("40 min");
    expect(runDoseLine(template("long_15k"), 400, 240)).toBe(
      "15 km · about 100 min"
    );
  });

  it("is a race's distance, whatever the pace", () => {
    expect(runDoseLine(template("10k_race"), 400)).toBe("10 km");
    expect(runMinutesLine(template("10k_race"), 400)).toBeNull();
  });

  it("names every template's dose in the house's spaced units", () => {
    for (const t of RUN_TEMPLATES) {
      for (const pace of [null, 420]) {
        const dose = runDoseLine(t, pace, pace && 300);
        expect(dose, t.id).toMatch(/^(\d+(\.\d+)? km|(about )?\d+ min)/);
        expect(dose, t.id).not.toMatch(/\d(km|min)\b/);
      }
    }
  });
});

/* Pgm8 (E8): a hot day's swap offers an easy run of the session's minutes,
   the number its cards state. */
describe("plannedSessionMinutes", () => {
  it("is a tempo's own minutes", () => {
    expect(plannedSessionMinutes(template("tempo_30"))).toBe(45);
    expect(runMinutesLine(template("tempo_30"), null)).toBe("45 min");
  });

  it("is an interval session's minutes at the runner's interval pace, as its cards say", () => {
    expect(plannedSessionMinutes(template("4x1k"), 240)).toBe(40);
    expect(runMinutesLine(template("4x1k"), null, 240)).toBe("about 40 min");
    expect(plannedSessionMinutes(template("8x400"), 225)).toBe(35);
  });

  it("is the template's minutes without a confirmed interval pace", () => {
    expect(plannedSessionMinutes(template("4x1k"), null)).toBe(
      template("4x1k").estimatedDuration
    );
    expect(plannedSessionMinutes(template("time_trial_5k"))).toBe(
      template("time_trial_5k").estimatedDuration
    );
  });
});

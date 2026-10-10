import { describe, expect, it } from "vitest";
import { runDoseLine, runMinutesLine } from "../runDose";
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

  it("is a race's distance, whatever the pace", () => {
    expect(runDoseLine(template("10k_race"), 400)).toBe("10 km");
    expect(runMinutesLine(template("10k_race"), 400)).toBeNull();
  });

  it("names every template's dose in the house's spaced units", () => {
    for (const t of RUN_TEMPLATES) {
      for (const pace of [null, 420]) {
        const dose = runDoseLine(t, pace);
        expect(dose, t.id).toMatch(/^(\d+(\.\d+)? km|\d+ min)/);
        expect(dose, t.id).not.toMatch(/\d(km|min)\b/);
      }
    }
  });
});

/**
 * Heat (heatAdjustment.ts): the T+DP rule of thumb's table, where hot and
 * extreme start, what an adjustment eases and by how much, the heart-rate
 * ceiling, and the words. Saturated air keeps the dew point at the air
 * temperature, so its sum is 3.6 × T + 64 °F whatever Magnus's constants:
 * the boundaries below are exact.
 */
import { describe, it, expect } from "vitest";
import {
  dewPointC,
  easeBand,
  easePace,
  heatAdjustedLine,
  heatAdjustmentFor,
  heatEasedPaceTable,
  heatEasedRaceTarget,
  heatHeartRateCeiling,
  heatHeartRateCue,
  heatHeartRateCueDue,
  heatLevel,
  heatLine,
  heatSlowdown,
  heatSlowVerdictLine,
  heatSwapLine,
  isHeatAdjustable,
  isHotDay,
  isQualitySession,
  slowdownLabel,
  tdpSumF,
  EXTREME_HEAT_LINE,
  HEAT_ADJUST,
  HEAT_CLEAR,
  HEAT_FEEL_VERDICT_LINE,
  HEAT_HR_CUE_GAP_MS,
  HEAT_LONG_SWAP,
  HEAT_SWAP_START,
  HEAT_SWAP_SWITCH,
  TDP_TABLE,
} from "../heatAdjustment";
import { paceTableFromFitness } from "../runPaces";

/** Saturated air at this temperature: a T+DP sum of 3.6 × T + 64 °F. */
const saturated = (temperature: number) => ({ temperature, humidity: 100 });

describe("dewPointC", () => {
  it("matches known Magnus values", () => {
    expect(dewPointC(30, 70)).toBeCloseTo(23.9, 1);
    expect(dewPointC(10, 50)).toBeCloseTo(0.0, 1);
    expect(dewPointC(20, 100)).toBeCloseTo(20, 1);
  });
});

describe("tdpSumF", () => {
  it("adds the air temperature and the dew point, both in °F", () => {
    expect(tdpSumF(saturated(20))).toBeCloseTo(136, 6);
    expect(tdpSumF({ temperature: 32, humidity: 70 })).toBeCloseTo(168.1, 1);
  });

  it("is none for weather that can't be read", () => {
    expect(tdpSumF(null)).toBeNull();
    expect(tdpSumF({ temperature: Number.NaN, humidity: 70 })).toBeNull();
  });
});

describe("the T+DP table (Hadley's rule of thumb)", () => {
  it("reads each band's slowdown, its top included", () => {
    const at = (sum: number) => slowdownLabel(heatSlowdown(sum)!);
    expect(heatSlowdown(100)).toEqual({ from: 0, to: 0 });
    expect(at(110)).toBe("0–0.5%");
    expect(at(110.1)).toBe("0.5–1%");
    expect(at(130)).toBe("1–2%");
    expect(at(130.1)).toBe("2–3%");
    expect(at(141.5)).toBe("3–4.5%");
    expect(at(155)).toBe("4.5–6%");
    expect(at(168)).toBe("6–8%");
    expect(at(180)).toBe("8–10%");
  });

  it("gives no number past 180 °F, where hard running isn't recommended", () => {
    expect(heatSlowdown(180.1)).toBeNull();
    expect(heatSlowdown(200)).toBeNull();
  });

  it("only ever grows with the sum", () => {
    for (let i = 1; i < TDP_TABLE.length; i++) {
      expect(TDP_TABLE[i].from).toBe(TDP_TABLE[i - 1].to);
      expect(TDP_TABLE[i].to).toBeGreaterThan(TDP_TABLE[i].from);
    }
  });
});

describe("heatLevel", () => {
  it("is hot just over 130 °F, and nothing just under", () => {
    expect(heatLevel(saturated(18.3))).toBe("none"); // 129.9 °F
    expect(heatLevel(saturated(18.4))).toBe("hot"); // 130.2 °F
    expect(heatLevel({ temperature: 25, humidity: 43 })).toBe("none"); // 129.8 °F
    expect(heatLevel({ temperature: 25, humidity: 44 })).toBe("hot"); // 130.4 °F
  });

  it("is extreme just over 180 °F", () => {
    expect(heatLevel(saturated(32.2))).toBe("hot"); // 179.9 °F
    expect(heatLevel(saturated(32.3))).toBe("extreme"); // 180.3 °F
  });

  it("is nothing when the weather can't be read", () => {
    expect(heatLevel(null)).toBe("none");
    expect(isHotDay(undefined)).toBe(false);
    expect(isHotDay(saturated(25))).toBe(true);
  });
});

describe("heatAdjustmentFor", () => {
  it("offers nothing on a mild day", () => {
    expect(
      heatAdjustmentFor({ weather: saturated(18.3), sessionType: "tempo" })
    ).toBeNull();
  });

  it("offers the band's slowdown just over the threshold, the smallest it offers", () => {
    expect(
      heatAdjustmentFor({ weather: saturated(18.4), sessionType: "tempo" })
    ).toEqual({ from: 0.02, to: 0.03 });
  });

  it("offers the table's last band at its cap, and effort only past it", () => {
    expect(
      heatAdjustmentFor({ weather: saturated(32.2), sessionType: "easy" })
    ).toEqual({ from: 0.08, to: 0.1 });
    expect(
      heatAdjustmentFor({ weather: saturated(32.3), sessionType: "easy" })
    ).toEqual({ from: 0.08, to: 0.1, effortOnly: true });
  });

  it("offers it to a tempo, intervals, an easy and a long run, never a race", () => {
    for (const type of ["tempo", "intervals", "easy", "long"]) {
      expect(isHeatAdjustable(type)).toBe(true);
      expect(
        heatAdjustmentFor({ weather: saturated(25), sessionType: type })
      ).not.toBeNull();
    }
    expect(
      heatAdjustmentFor({ weather: saturated(25), sessionType: "race" })
    ).toBeNull();
    expect(isQualitySession("easy")).toBe(false);
    expect(isQualitySession("intervals")).toBe(true);
  });

  it("adds a heart-rate ceiling where heart rate is live and the max is measured", () => {
    const hot = saturated(25);
    expect(
      heatAdjustmentFor({
        weather: hot,
        sessionType: "tempo",
        measuredMaxHr: 190,
        hrLive: true,
      })?.hrCeiling
    ).toBe(171);
    expect(
      heatAdjustmentFor({
        weather: hot,
        sessionType: "easy",
        measuredMaxHr: 190,
        hrLive: true,
      })?.hrCeiling
    ).toBe(133);
    // No live source, no measured max, or short repeats: paces stay.
    expect(
      heatAdjustmentFor({
        weather: hot,
        sessionType: "tempo",
        measuredMaxHr: 190,
        hrLive: false,
      })
    ).not.toHaveProperty("hrCeiling");
    expect(
      heatAdjustmentFor({
        weather: hot,
        sessionType: "tempo",
        measuredMaxHr: null,
        hrLive: true,
      })
    ).not.toHaveProperty("hrCeiling");
    expect(
      heatAdjustmentFor({
        weather: hot,
        sessionType: "intervals",
        measuredMaxHr: 190,
        hrLive: true,
      })
    ).not.toHaveProperty("hrCeiling");
  });
});

describe("heatHeartRateCeiling", () => {
  it("is the top of the session's own zone", () => {
    const at = (sessionType: string) =>
      heatHeartRateCeiling({ sessionType, measuredMaxHr: 200, hrLive: true });
    expect(at("easy")).toBe(140); // Z2 top, 70%
    expect(at("long")).toBe(140);
    expect(at("tempo")).toBe(180); // Z4 top, 90%
    expect(at("intervals")).toBeNull();
    expect(at("race")).toBeNull();
  });
});

describe("easing", () => {
  const twoToThree = { from: 0.02, to: 0.03 };

  it("eases a band's fast edge by the low share and its slow edge by the high one", () => {
    expect(easeBand([300, 320], twoToThree)).toEqual([306, 330]);
  });

  it("eases one pace by the middle of the range", () => {
    expect(easePace(300, twoToThree)).toBe(308);
  });

  it("eases every band and race pace of a table, and leaves the stored one alone", () => {
    const table = paceTableFromFitness({
      benchmark: { distanceM: 5000, timeS: 1500 },
      vdot: null,
    })!;
    const before = structuredClone(table);
    const eased = heatEasedPaceTable(table, twoToThree)!;
    expect(table).toEqual(before);
    expect(eased.vdot).toBe(table.vdot);
    for (const key of [
      "easy",
      "marathon",
      "threshold",
      "interval",
      "repetition",
    ] as const) {
      expect(eased[key]).toEqual(easeBand(table[key], twoToThree));
      expect(eased[key][0]).toBeGreaterThan(table[key][0]);
    }
    expect(eased.race["5k"]).toBe(easePace(table.race["5k"], twoToThree));
  });

  it("gives no table on an extreme day, which runs by effort", () => {
    const table = paceTableFromFitness({
      benchmark: { distanceM: 5000, timeS: 1500 },
      vdot: null,
    });
    expect(
      heatEasedPaceTable(table, { from: 0.08, to: 0.1, effortOnly: true })
    ).toBeNull();
    expect(heatEasedPaceTable(null, twoToThree)).toBeNull();
  });

  it("eases a race goal's time by the middle of the range", () => {
    const goal = { distance: "10k" as const, targetTimeS: 3000 };
    expect(heatEasedRaceTarget(goal, twoToThree)?.targetTimeS).toBe(3075);
    expect(
      heatEasedRaceTarget(goal, { ...twoToThree, effortOnly: true })
    ).toBeNull();
  });
});

describe("the words", () => {
  it("names the slowdown as a rule of thumb, a range and no single pace", () => {
    const line = heatLine(saturated(20))!; // 136 °F
    expect(line).toBe(
      "By a common rule of thumb, this heat slows the same effort by 2–3%."
    );
    expect(line).not.toMatch(/\/km|\d:\d\d/);
    expect(heatLine(saturated(18.3))).toBeNull();
  });

  it("advises against running outside on an extreme day, and leaves the run to the runner", () => {
    expect(heatLine(saturated(33))).toBe(EXTREME_HEAT_LINE);
    expect(EXTREME_HEAT_LINE).toMatch(/isn’t advised/);
    expect(EXTREME_HEAT_LINE).toMatch(/If you go/);
  });

  it("says what an adjustment set", () => {
    const adj = { from: 0.02, to: 0.03 };
    expect(
      heatAdjustedLine(adj, { kind: "range", pace: "5:06–5:09 /km" })
    ).toBe("Adjusted for heat: work at 5:06–5:09 /km.");
    expect(heatAdjustedLine(adj, { kind: "easyLimit", pace: "6:12 /km" })).toBe(
      "Adjusted for heat: keep easy running slower than 6:12 /km."
    );
    expect(
      heatAdjustedLine(
        { ...adj, effortOnly: true },
        { kind: "range", pace: "x" }
      )
    ).toBe("Adjusted for heat: no pace targets, so run by feel.");
    expect(heatAdjustedLine({ ...adj, hrCeiling: 171 }, { kind: "none" })).toBe(
      "Adjusted for heat: keep your heart rate under 171 bpm."
    );
  });

  it("offers the swap in the session's own minutes", () => {
    expect(heatSwapLine(45)).toBe("Or run easy for the same 45 min.");
    expect(heatSwapLine(37.6)).toBe("Or run easy for the same 38 min.");
  });

  it("names every button as a verb and its object, short", () => {
    for (const label of [
      HEAT_ADJUST,
      HEAT_CLEAR,
      HEAT_SWAP_START,
      HEAT_SWAP_SWITCH,
      HEAT_LONG_SWAP,
    ]) {
      expect(label.length).toBeLessThanOrEqual(20);
      expect(label.split(" ").length).toBeLessThanOrEqual(4);
    }
  });

  it("never calls a hot day's run slow afterwards", () => {
    const line = heatSlowVerdictLine("5:40 /km");
    expect(line).toBe(
      "Slower in the heat today: 5:40 /km. That’s expected, and it still counts."
    );
    for (const words of [line, HEAT_FEEL_VERDICT_LINE]) {
      expect(words).not.toMatch(/\bslow\b|miss|fail|bad|behind/i);
    }
  });
});

describe("the heart-rate ceiling's cue", () => {
  const now = 1_000_000;

  it("speaks over the ceiling, and not at or under it", () => {
    const due = (bpm: number | null) =>
      heatHeartRateCueDue({ bpm, ceiling: 171, now, lastSpokeAt: null });
    expect(due(172)).toBe(true);
    expect(due(171)).toBe(false);
    expect(due(150)).toBe(false);
    expect(due(null)).toBe(false);
    expect(
      heatHeartRateCueDue({ bpm: 180, ceiling: null, now, lastSpokeAt: null })
    ).toBe(false);
  });

  it("waits a minute and a half before speaking again", () => {
    const due = (lastSpokeAt: number) =>
      heatHeartRateCueDue({ bpm: 180, ceiling: 171, now, lastSpokeAt });
    expect(due(now - HEAT_HR_CUE_GAP_MS + 1)).toBe(false);
    expect(due(now - HEAT_HR_CUE_GAP_MS)).toBe(true);
    expect(heatHeartRateCue(171)).toBe(
      "Heart rate over 171. Ease off in the heat."
    );
  });
});

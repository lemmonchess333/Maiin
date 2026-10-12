/**
 * What a set is called on the workout screen. A three-set warm-up ramp
 * used to take the first numbers, so a three-set exercise asked for
 * "Set 4 of 6"; the sets that count are now numbered among themselves.
 */
import { describe, expect, it } from "vitest";
import {
  SET_TYPE_COPY,
  SET_TYPE_ORDER,
  asSetType,
  countedSets,
  setBadge,
  setCounts,
  setName,
  setOrdinal,
} from "../setLabels";
import {
  isSetEligibleForProgression,
  isSetEligibleForStrengthPr,
} from "../sessionSetPolicy";
import { toCompletionSetLogs } from "../warmupRamp";

const set = (type: string, completed = false) => ({ type, completed });
const ramp = [
  set("warmup", true),
  set("warmup"),
  set("warmup"),
  set("working"),
  set("working"),
  set("dropset"),
];

describe("set names", () => {
  it("numbers the sets that count among themselves", () => {
    expect(ramp.map((_, i) => setName(ramp, i))).toEqual([
      "Warm-up 1",
      "Warm-up 2",
      "Warm-up 3",
      "Set 1",
      "Set 2",
      "Set 3",
    ]);
  });

  it("shows a working set's number and every other type's letter", () => {
    expect(ramp.map((_, i) => setBadge(ramp, i))).toEqual([
      "W",
      "W",
      "W",
      "1",
      "2",
      "D",
    ]);
    expect(setBadge([set("failure")], 0)).toBe("F");
  });

  it("counts within the kind of set being logged", () => {
    expect(setCounts(ramp, 1)).toEqual({ total: 3, done: 1 });
    expect(setCounts(ramp, 4)).toEqual({ total: 3, done: 0 });
    expect(setOrdinal(ramp, 5)).toBe(3);
  });

  it("leaves warm-ups out of the sets that count", () => {
    expect(countedSets(ramp)).toHaveLength(3);
  });

  it("reads an unknown type as a working set", () => {
    expect(asSetType("superset")).toBe("working");
    expect(setBadge([set("superset")], 0)).toBe("1");
  });
});

describe("the menu says what each type does", () => {
  it("has words for every type", () => {
    expect(Object.keys(SET_TYPE_COPY).sort()).toEqual(
      [...SET_TYPE_ORDER].sort()
    );
  });

  it("matches what the session does with each type", () => {
    /* The sentences restate sessionSetPolicy; if a rule changes, the
       words must change with it. */
    expect(SET_TYPE_COPY.working.detail).toContain("bests");
    expect(isSetEligibleForStrengthPr("working", "reps")).toBe(true);
    expect(SET_TYPE_COPY.working.detail).toContain("next weights");
    expect(isSetEligibleForProgression("working")).toBe(true);

    expect(SET_TYPE_COPY.dropset.detail).toContain("not your next weights");
    expect(isSetEligibleForProgression("dropset")).toBe(false);

    expect(SET_TYPE_COPY.warmup.detail).toContain("not saved");
    expect(isSetEligibleForStrengthPr("warmup", "reps")).toBe(false);
    const saved = toCompletionSetLogs([
      [
        { weight: 20, reps: 10, completed: true, type: "warmup" },
        { weight: 60, reps: 8, completed: true, type: "working" },
      ],
    ]);
    expect(saved[0].map((entry) => entry.type)).toEqual(["working"]);
  });
});

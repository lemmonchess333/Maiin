import { describe, it, expect } from "vitest";
import {
  collectiveRunners,
  collectiveTotal,
  showsCollectiveGoal,
} from "../collectiveGoal";

/* The community goal reads the server's total off its own doc: every saved
   run in the month, joined or not, in whole metres. Together shows it only
   once someone has moved it: a goal at "0 of 1,000 km" over an empty bar
   reads as an empty room. */
describe("showsCollectiveGoal", () => {
  it("hides a goal nobody has added to", () => {
    expect(showsCollectiveGoal({ collectiveTarget: 1000 })).toBe(false);
    expect(
      showsCollectiveGoal({ collectiveTarget: 1000, collectiveMeters: 0 })
    ).toBe(false);
    expect(showsCollectiveGoal(undefined)).toBe(false);
  });

  it("shows it from the first run, whoever ran it", () => {
    expect(
      showsCollectiveGoal({ collectiveTarget: 1000, collectiveMeters: 400 })
    ).toBe(true);
  });

  it("never shows a goal with no target", () => {
    expect(showsCollectiveGoal({ collectiveMeters: 5000 })).toBe(false);
    expect(
      showsCollectiveGoal({ collectiveTarget: 0, collectiveMeters: 5000 })
    ).toBe(false);
  });
});

describe("collectiveTotal", () => {
  it("is the server's metres in kilometres", () => {
    expect(collectiveTotal({ collectiveMeters: 400500 })).toBe(400.5);
  });

  it("is 0 for a missing or broken figure", () => {
    expect(collectiveTotal({})).toBe(0);
    expect(collectiveTotal()).toBe(0);
    expect(collectiveTotal({ collectiveMeters: -20 })).toBe(0);
    expect(
      collectiveTotal({ collectiveMeters: "12" as unknown as number })
    ).toBe(0.012);
    expect(
      collectiveTotal({ collectiveMeters: "x" as unknown as number })
    ).toBe(0);
  });
});

describe("collectiveRunners", () => {
  it("is the server's count of people", () => {
    expect(collectiveRunners({ collectiveRunners: 7 })).toBe(7);
    expect(collectiveRunners({})).toBe(0);
    expect(collectiveRunners({ collectiveRunners: -1 })).toBe(0);
    expect(collectiveRunners({ collectiveRunners: 1.5 })).toBe(0);
  });
});

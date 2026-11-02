import { describe, it, expect } from "vitest";
import { collectiveTotal, showsCollectiveGoal } from "../collectiveGoal";

/* Together shows the community goal only once someone has moved it: a
   goal at "0 of 1,000 km" over an empty bar reads as an empty room. */
describe("showsCollectiveGoal", () => {
  it("hides a goal nobody has added to", () => {
    expect(showsCollectiveGoal(1000, [])).toBe(false);
    expect(showsCollectiveGoal(1000)).toBe(false);
    expect(
      showsCollectiveGoal(1000, [{ currentValue: 0 }, { currentValue: 0 }])
    ).toBe(false);
  });

  it("shows it from the first contribution", () => {
    expect(showsCollectiveGoal(1000, [{ currentValue: 0.4 }])).toBe(true);
    expect(
      showsCollectiveGoal(1000, [{ currentValue: 0 }, { currentValue: 12 }])
    ).toBe(true);
  });

  it("never shows a goal with no target", () => {
    expect(showsCollectiveGoal(undefined, [{ currentValue: 5 }])).toBe(false);
    expect(showsCollectiveGoal(0, [{ currentValue: 5 }])).toBe(false);
  });
});

describe("collectiveTotal", () => {
  it("adds every loaded figure, a missing one as nothing", () => {
    expect(
      collectiveTotal([
        { currentValue: 300 },
        { currentValue: 100.5 },
        { currentValue: undefined as unknown as number },
      ])
    ).toBe(400.5);
    expect(collectiveTotal()).toBe(0);
  });
});

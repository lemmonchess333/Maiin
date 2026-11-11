import { describe, it, expect } from "vitest";
import {
  arcEndPoint,
  nextFlight,
  wheelOnScreen,
  type FlightInput,
  type FlightSeen,
} from "../foodFlight";

const TODAY = "2026-11-11";

function input(over: Partial<FlightInput> = {}): FlightInput {
  return {
    day: TODAY,
    isToday: true,
    ready: true,
    ids: ["a", "b"],
    calories: 900,
    reducedMotion: false,
    ...over,
  };
}

const seenToday = (ids = ["a", "b"], calories = 900): FlightSeen => ({
  day: TODAY,
  ids: new Set(ids),
  calories,
});

/**
 * When a logged food flies to the wheel (Food11 call 6). The limits are
 * the lock's, one test each.
 */
describe("nextFlight", () => {
  it("owes nothing while the day's meals are loading, and remembers nothing", () => {
    expect(nextFlight(null, input({ ready: false }))).toEqual({
      seen: null,
      flight: null,
    });
  });

  it("owes nothing for what is there when the day comes on screen", () => {
    const { seen, flight } = nextFlight(null, input());
    expect(flight).toBeNull();
    expect(seen).toEqual(seenToday());
  });

  it("flies the new meal on a log, from where the arc ended", () => {
    const { seen, flight } = nextFlight(
      seenToday(),
      input({ ids: ["a", "b", "c"], calories: 1440 })
    );
    expect(flight).toEqual({ mealId: "c", fromCalories: 900 });
    expect(seen).toEqual(seenToday(["a", "b", "c"], 1440));
  });

  it("flies once for a log of several foods", () => {
    const { flight } = nextFlight(
      seenToday(),
      input({ ids: ["a", "b", "c", "d", "e"], calories: 2100 })
    );
    expect(flight).toEqual({ mealId: "c", fromCalories: 900 });
  });

  it("does not fly on an edit: the same meals, other calories", () => {
    const { seen, flight } = nextFlight(seenToday(), input({ calories: 1010 }));
    expect(flight).toBeNull();
    expect(seen!.calories).toBe(1010);
  });

  it("does not fly on a delete", () => {
    const { seen, flight } = nextFlight(
      seenToday(),
      input({ ids: ["a"], calories: 400 })
    );
    expect(flight).toBeNull();
    // The meal is still remembered, so its undo is not a log.
    expect([...seen!.ids].sort()).toEqual(["a", "b"]);
  });

  it("does not fly when an undo brings a deleted meal back", () => {
    const afterDelete = nextFlight(
      seenToday(),
      input({ ids: ["a"], calories: 400 })
    ).seen;
    const { flight } = nextFlight(afterDelete, input());
    expect(flight).toBeNull();
  });

  it("does not fly on a day that is not today", () => {
    const yesterday = "2026-11-10";
    const seen: FlightSeen = { ...seenToday(), day: yesterday };
    const { flight, seen: next } = nextFlight(
      seen,
      input({
        day: yesterday,
        isToday: false,
        ids: ["a", "b", "c"],
        calories: 1440,
      })
    );
    expect(flight).toBeNull();
    // Seen all the same, so nothing is owed for it later.
    expect(next!.ids.has("c")).toBe(true);
  });

  it("does not fly when the day on screen changes to one with other meals", () => {
    const { flight, seen } = nextFlight(
      seenToday(),
      input({ day: "2026-11-10", isToday: false, ids: ["x", "y"] })
    );
    expect(flight).toBeNull();
    expect(seen!.day).toBe("2026-11-10");
  });

  it("does not fly under Reduce Motion, and still takes the meal as seen", () => {
    const { flight, seen } = nextFlight(
      seenToday(),
      input({ ids: ["a", "b", "c"], calories: 1440, reducedMotion: true })
    );
    expect(flight).toBeNull();
    expect(seen!.ids.has("c")).toBe(true);
  });

  it("hands back the same record when nothing moved", () => {
    const seen = seenToday();
    expect(nextFlight(seen, input()).seen).toBe(seen);
  });
});

describe("arcEndPoint", () => {
  // A 264px wheel at the top left of the screen: its centre is 132,132
  // and the arc's line runs 122.1px from it (74 of the box's 80).
  const wheel = { left: 0, top: 0, width: 264, height: 264 };
  const r = 132 * (74 / 80);

  it("is twelve o'clock with nothing logged", () => {
    const p = arcEndPoint(wheel, 0, 2200);
    expect(p.x).toBeCloseTo(132, 5);
    expect(p.y).toBeCloseTo(132 - r, 5);
  });

  it("is three o'clock a quarter of the way round", () => {
    const p = arcEndPoint(wheel, 550, 2200);
    expect(p.x).toBeCloseTo(132 + r, 5);
    expect(p.y).toBeCloseTo(132, 5);
  });

  it("is six o'clock at half the target", () => {
    const p = arcEndPoint(wheel, 1100, 2200);
    expect(p.x).toBeCloseTo(132, 5);
    expect(p.y).toBeCloseTo(132 + r, 5);
  });

  it("is back at twelve at the target and past it", () => {
    for (const calories of [2200, 3000]) {
      const p = arcEndPoint(wheel, calories, 2200);
      expect(p.x).toBeCloseTo(132, 5);
      expect(p.y).toBeCloseTo(132 - r, 5);
    }
  });

  it("follows the wheel wherever it is on screen, at any size", () => {
    const p = arcEndPoint(
      { left: 28, top: 92, width: 104, height: 104 },
      550,
      2200
    );
    expect(p.x).toBeCloseTo(28 + 52 + 52 * (74 / 80), 5);
    expect(p.y).toBeCloseTo(92 + 52, 5);
  });
});

describe("wheelOnScreen", () => {
  const at = (top: number) => ({ left: 0, top, width: 264, height: 264 });

  it("is on screen when any of it shows", () => {
    expect(wheelOnScreen(at(92), 852)).toBe(true);
    expect(wheelOnScreen(at(-200), 852)).toBe(true);
    expect(wheelOnScreen(at(800), 852)).toBe(true);
  });

  it("is off screen once scrolled past, or below the fold", () => {
    expect(wheelOnScreen(at(-264), 852)).toBe(false);
    expect(wheelOnScreen(at(852), 852)).toBe(false);
  });

  it("is off screen when it has no size, as when it is not drawn", () => {
    expect(wheelOnScreen({ left: 0, top: 92, width: 0, height: 0 }, 852)).toBe(
      false
    );
  });
});

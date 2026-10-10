import { describe, it, expect } from "vitest";
import { mulberry32 } from "../prng";

/* Every seeded suite, the simulator and the season seed script draw from
   this one function. The first draws are pinned so a change to it can't
   silently move every seeded run's inputs. */
describe("mulberry32 — the one seeded generator", () => {
  it.each([
    [
      1,
      [
        0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
        0.9810509674716741,
      ],
    ],
    [
      42,
      [
        0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
        0.6697340414393693,
      ],
    ],
    [
      20260928,
      [
        0.9410575465299189, 0.21826664870604873, 0.6791353551670909,
        0.3669168702326715,
      ],
    ],
  ])("draws the pinned sequence for seed %i", (seed, expected) => {
    const rand = mulberry32(seed);
    expect(Array.from({ length: 4 }, () => rand())).toEqual(expected);
  });

  it("draws the same sequence from the same seed, always in [0, 1)", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 10_000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

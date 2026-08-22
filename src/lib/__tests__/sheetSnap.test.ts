import { describe, it, expect } from "vitest";
import { projectAndSnap } from "../sheetSnap";

/* A THREE-snap model, kept deliberately after D24 dropped the run sheet
   to two snaps: `projectAndSnap` is length-agnostic and these cases pin
   the momentum maths at N=3, which a 2-snap-only suite could not. Top
   grows downward, velocity is +down. */
const TOPS = [700, 480, 72]; // collapsed, mid, expanded (px)

describe("projectAndSnap", () => {
  it("snaps to the nearest snap when released at rest", () => {
    expect(projectAndSnap(80, 0, TOPS)).toBe(2); // near expanded
    expect(projectAndSnap(470, 0, TOPS)).toBe(1); // near mid
    expect(projectAndSnap(690, 0, TOPS)).toBe(0); // near collapsed
  });

  it("a fast downward flick throws toward a more-collapsed snap", () => {
    // Released near expanded (top 72) but flicked hard DOWN → projects past mid
    expect(projectAndSnap(72, 4000, TOPS)).not.toBe(2);
  });

  it("a fast upward flick throws toward a more-expanded snap", () => {
    // Released near collapsed (top 700) but flicked hard UP → projects up
    expect(projectAndSnap(700, -4000, TOPS)).not.toBe(0);
  });

  it("a gentle drag past the midpoint snaps to the closer neighbour", () => {
    // Dragged from expanded down to 260 (closer to mid 480 than expanded 72?)
    // 260 is 188 from expanded, 220 from mid → still nearest expanded at rest
    expect(projectAndSnap(260, 0, TOPS)).toBe(2);
    // …but with a little downward velocity it tips to mid
    expect(projectAndSnap(260, 2000, TOPS)).toBe(1);
  });

  it("clamps to an end snap rather than overshooting", () => {
    // Huge downward velocity from collapsed stays at collapsed (no idx 3)
    expect(projectAndSnap(700, 9000, TOPS)).toBe(0);
  });
});

describe("projectAndSnap — the run sheet's ACTUAL two-snap config (D24)", () => {
  /* SNAPS = [0.13, 0.91] at an 852px viewport → tops [741, 77]. The dead
     0.4 middle detent is gone; a release anywhere between the two ends
     must resolve to one of them, never hover. */
  const TWO = [741, 77];

  it("resolves the whole travel to exactly the two detents", () => {
    for (let top = 77; top <= 741; top += 83) {
      const idx = projectAndSnap(top, 0, TWO);
      expect([0, 1]).toContain(idx);
    }
    expect(projectAndSnap(700, 0, TWO)).toBe(0);
    expect(projectAndSnap(120, 0, TWO)).toBe(1);
  });

  it("a downward flick from expanded lands compact — there is no middle to catch it", () => {
    expect(projectAndSnap(77, 4000, TWO)).toBe(0);
  });
});

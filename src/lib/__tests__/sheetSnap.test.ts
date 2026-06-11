import { describe, it, expect } from "vitest";
import { projectAndSnap } from "../sheetSnap";

/* snapTops model the run sheet: idx 0 = collapsed (large top), idx 2 =
   expanded (small top). Top grows downward, velocity is +down. */
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

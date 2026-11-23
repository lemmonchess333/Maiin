import { describe, it, expect } from "vitest";
import { distance, contrast } from "../colourVision";

/* The values DS10 was measured with (colorspacious, Machado 2009 at
   severity 100, CIEDE2000; /tmp/work/cvd-table.txt in the colour study),
   so the copy here agrees with the study it enforces. */
describe("colourVision agrees with the DS10 study's measurements", () => {
  it.each([
    ["#7B72E9", "#D4637A", 30.9, 40.1, 25.4],
    ["#D9884E", "#52A3BD", 41.8, 41.9, 36.8],
    ["#D4637A", "#D9884E", 26.9, 14.8, 23.4],
    ["#7B72E9", "#52A3BD", 22.9, 13.9, 16.8],
  ])("%s against %s", (a, b, normal, deutan, protan) => {
    expect(distance(a, b, "normal")).toBeCloseTo(normal, 0);
    expect(distance(a, b, "deutan")).toBeCloseTo(deutan, 0);
    expect(distance(a, b, "protan")).toBeCloseTo(protan, 0);
  });

  it("measures WCAG contrast", () => {
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2);
  });
});

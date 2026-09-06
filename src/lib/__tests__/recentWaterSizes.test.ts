// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { recentWaterSizes, rememberWaterSize } from "../recentWaterSizes";
import { remove, scopedKey } from "../localStore";
beforeEach(() => {
  for (const uid of ["water-a", "water-b"])
    remove(scopedKey("tropos-water-recent-sizes", uid));
});
it("remembers the last three distinct sizes and isolates accounts", () => {
  for (const size of [250, 500, 750, 500, 300])
    rememberWaterSize("water-a", size);
  expect(recentWaterSizes("water-a")).toEqual([300, 500, 750]);
  expect(recentWaterSizes("water-b")).toEqual([]);
  expect(recentWaterSizes(null)).toEqual([]);
});
it("ignores invalid amounts", () => {
  for (const size of [0, -1, NaN, Infinity, 1.5, 999999])
    rememberWaterSize("water-a", size);
  expect(recentWaterSizes("water-a")).toEqual([]);
});

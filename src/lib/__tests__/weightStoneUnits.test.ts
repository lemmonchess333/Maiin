import { expect, it } from "vitest";
import {
  formatWeightInUnit,
  formatStonePounds,
  kgToStonePounds,
  stonePoundsToKg,
  lbToKg,
  kgToLb,
} from "../weightUnits";
import { weighInProfileMirror } from "../bodyweightLogs";
it.each([90, 125.4, 175, 180, 243.8])(
  "round-trips %s lb through kg, stone and the profile mirror",
  (pounds) => {
    const kg = lbToKg(pounds);
    const parts = kgToStonePounds(kg);
    expect(kgToLb(stonePoundsToKg(parts.stone, parts.pounds)).toFixed(1)).toBe(
      pounds.toFixed(1)
    );
    expect(
      formatWeightInUnit(weighInProfileMirror(null, kg)!.weightKg, "lbs")
    ).toBe(pounds.toFixed(1));
  }
);
it("formats stone with the remaining pounds and carries at fourteen", () => {
  expect(formatStonePounds(lbToKg(175))).toBe("12 st 7 lb");
  expect(formatStonePounds(lbToKg(181.96))).toBe("13 st 0 lb");
});

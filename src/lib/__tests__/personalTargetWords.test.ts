import { describe, it, expect } from "vitest";
import {
  personalTargetWords,
  PERSONAL_TARGET_CLOSE_KCAL,
} from "../personalTargetWords";
import { group } from "@/test/localeGrouping";

describe("personalTargetWords (whole-app grill Q49, Q71, Q87)", () => {
  it("names the target and how far it is from the one followed now", () => {
    const less = personalTargetWords(2340, 2500, false);
    expect(less.line).toBe(
      `${group(2340)} kcal a day, from your meals and weigh-ins: 160 less than your target now.`
    );
    const more = personalTargetWords(2700, 2500, false);
    expect(more.line).toMatch(/200 more than your target now\.$/);
  });

  it("says close when it is within the margin, and offers only the upkeep", () => {
    const close = personalTargetWords(
      2500 + PERSONAL_TARGET_CLOSE_KCAL - 1,
      2500,
      false
    );
    expect(close.line).toMatch(/close to your target now\.$/);
    expect(close.pro).toBe("Pro keeps it up to date as your body changes.");
  });

  it("says Pro switches today when the first weekly step reaches it", () => {
    expect(personalTargetWords(2350, 2500, false).pro).toBe(
      "Pro switches you to it today and keeps it up to date."
    );
  });

  it("says the weekly limit when the first step cannot reach it", () => {
    expect(personalTargetWords(2100, 2500, false).pro).toBe(
      "Pro moves you to it, at most 150 kcal a week, and keeps it up to date."
    );
  });

  it("names the free week only when the trial is on offer", () => {
    expect(personalTargetWords(2100, 2500, true).pro).toMatch(
      / The first 7 days are free\.$/
    );
    expect(personalTargetWords(2100, 2500, false).pro).not.toMatch(/free/);
  });
});

/**
 * isSnoozed — the pure core of the snoozeable dismissal
 * (home-declutter 6b: the post-trial Pro strip hides for 30 days per
 * dismissal, uid-scoped, then resurfaces).
 */
import { describe, it, expect } from "vitest";
import { isSnoozed } from "../useSnoozeDismiss";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

describe("isSnoozed", () => {
  it("no stored value → not snoozed", () => {
    expect(isSnoozed(null, NOW, 30)).toBe(false);
    expect(isSnoozed("", NOW, 30)).toBe(false);
  });

  it("a dismissal inside the window snoozes", () => {
    expect(isSnoozed(String(NOW - 1 * DAY), NOW, 30)).toBe(true);
    expect(isSnoozed(String(NOW - 29 * DAY), NOW, 30)).toBe(true);
  });

  it("the surface resurfaces once the window lapses", () => {
    expect(isSnoozed(String(NOW - 30 * DAY), NOW, 30)).toBe(false);
    expect(isSnoozed(String(NOW - 400 * DAY), NOW, 30)).toBe(false);
  });

  it("malformed or future-dated values fail open (surface shows)", () => {
    expect(isSnoozed("not-a-number", NOW, 30)).toBe(false);
    expect(isSnoozed("-5", NOW, 30)).toBe(false);
    expect(isSnoozed(String(NOW + DAY), NOW, 30)).toBe(false);
  });
});

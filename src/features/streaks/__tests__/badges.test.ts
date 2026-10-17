import { describe, it, expect } from "vitest";
import {
  BADGE_DEFINITIONS,
  TIER_COLORS,
  CATEGORY_LABELS,
  initBadges,
  badgeDescription,
  type BadgeTier,
} from "../badges";

describe("badges", () => {
  it("has all tier colors defined", () => {
    const tiers: BadgeTier[] = ["bronze", "silver", "gold", "platinum"];
    for (const tier of tiers) {
      expect(TIER_COLORS[tier]).toBeDefined();
      expect(TIER_COLORS[tier]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("has all category labels defined", () => {
    const categories = [
      "consistency",
      "lifting",
      "running",
      "nutrition",
      "hybrid",
    ] as const;
    for (const cat of categories) {
      expect(CATEGORY_LABELS[cat]).toBeDefined();
      expect(typeof CATEGORY_LABELS[cat]).toBe("string");
    }
  });

  it("has unique badge IDs", () => {
    const ids = BADGE_DEFINITIONS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all badges have required fields", () => {
    for (const badge of BADGE_DEFINITIONS) {
      expect(badge.id).toBeTruthy();
      expect(badge.name).toBeTruthy();
      expect(badge.description).toBeTruthy();
      expect(badge.icon).toBeTruthy();
      expect(badge.lucideIcon).toBeTruthy();
      expect(["bronze", "silver", "gold", "platinum"]).toContain(badge.tier);
      expect([
        "consistency",
        "lifting",
        "running",
        "nutrition",
        "hybrid",
      ]).toContain(badge.category);
    }
  });

  it("initBadges returns all badges with null earnedAt", () => {
    const badges = initBadges();
    expect(badges.length).toBe(BADGE_DEFINITIONS.length);
    for (const badge of badges) {
      expect(badge.earnedAt).toBeNull();
    }
  });

  it("has badges in every category", () => {
    const categories = new Set(BADGE_DEFINITIONS.map((b) => b.category));
    expect(categories.size).toBe(5);
    expect(categories.has("consistency")).toBe(true);
    expect(categories.has("lifting")).toBe(true);
    expect(categories.has("running")).toBe(true);
    expect(categories.has("nutrition")).toBe(true);
    expect(categories.has("hybrid")).toBe(true);
  });

  it("has badges in every tier", () => {
    const tiers = new Set(BADGE_DEFINITIONS.map((b) => b.tier));
    expect(tiers.size).toBe(4);
  });
});

/* Lift18: the plate clubs in an lb lifter's plates. The thresholds stay
   60/100/140 kg, and each lb figure is at or above its kg one. */
describe("badgeDescription", () => {
  const byId = (id: string) => BADGE_DEFINITIONS.find((b) => b.id === id)!;
  it("names the lb plate clubs for an lb lifter", () => {
    expect(badgeDescription(byId("plate_club"), "lbs")).toBe(
      "Lift 135 lb on any compound"
    );
    expect(badgeDescription(byId("two_plate"), "lbs")).toBe(
      "Lift 225 lb on any compound"
    );
    expect(badgeDescription(byId("three_plate"), "lbs")).toBe(
      "Lift 315 lb on any compound"
    );
  });

  it("never asks an lb lifter for less than the badge needs", () => {
    for (const [lb, kg] of [
      [135, 60],
      [225, 100],
      [315, 140],
    ])
      expect(lb / 2.20462).toBeGreaterThanOrEqual(kg);
  });

  it("is the kg copy for a kg lifter, and for every other badge", () => {
    expect(badgeDescription(byId("plate_club"), "kg")).toBe(
      "Lift 60 kg on any compound"
    );
    const other = BADGE_DEFINITIONS.find((b) => b.id === "first_pr")!;
    expect(badgeDescription(other, "lbs")).toBe(other.description);
  });
});

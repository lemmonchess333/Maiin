import { describe, it, expect } from "vitest";
import { getCardColour } from "../performanceColour";
import { THEME } from "../theme";

describe("getCardColour", () => {
  describe("amber branch (Backing off verb)", () => {
    it("returns amber + zero glow when deloadRecommended is true at moderate PI", () => {
      const result = getCardColour(60, "moderate", true);
      expect(result).toEqual({ hue: THEME.amber, glowIntensity: 0 });
    });

    it("returns amber + zero glow when loadBand is overreach without deloadRecommended", () => {
      const result = getCardColour(90, "overreach", false);
      expect(result).toEqual({ hue: THEME.amber, glowIntensity: 0 });
    });

    it("returns amber + zero glow when both overreach AND deloadRecommended", () => {
      const result = getCardColour(95, "overreach", true);
      expect(result).toEqual({ hue: THEME.amber, glowIntensity: 0 });
    });

    it("deload-recommended at high PI suppresses glow even though score is high", () => {
      // PI 80 + deload-recommended → "Backing off" verb per PI1.
      // Without the deload override the colour would be brand + glow ~0.636.
      const result = getCardColour(80, "high", true);
      expect(result).toEqual({ hue: THEME.amber, glowIntensity: 0 });
    });
  });

  describe("brand purple branch + continuous glow", () => {
    it("PI=45 (Cruising entry): brand + glow 0", () => {
      const result = getCardColour(45, "moderate", false);
      expect(result.hue).toBe(THEME.brand);
      expect(result.glowIntensity).toBe(0);
    });

    it("PI=100 (peak before overreach): brand + glow 1", () => {
      const result = getCardColour(100, "high", false);
      expect(result.hue).toBe(THEME.brand);
      expect(result.glowIntensity).toBe(1);
    });

    it("PI=72.5 (midpoint 45..100): brand + glow ~0.5", () => {
      const result = getCardColour(72.5, "high", false);
      expect(result.hue).toBe(THEME.brand);
      expect(result.glowIntensity).toBeCloseTo(0.5);
    });

    it("glow is 0 below PI=45 (Recovering and Building bands)", () => {
      expect(getCardColour(0, "deload", false).glowIntensity).toBe(0);
      expect(getCardColour(20, "deload", false).glowIntensity).toBe(0);
      expect(getCardColour(35, "low", false).glowIntensity).toBe(0);
      expect(getCardColour(44, "low", false).glowIntensity).toBe(0);
    });

    it("stroke stays brand purple for Recovering and Building bands (no amber for low scores)", () => {
      expect(getCardColour(15, "deload", false).hue).toBe(THEME.brand);
      expect(getCardColour(35, "low", false).hue).toBe(THEME.brand);
    });
  });

  describe("verb-band glow mapping per PI1 spec", () => {
    it("Cruising upper bound (PI 69): glow ~0.436", () => {
      const result = getCardColour(69, "moderate", false);
      expect(result.hue).toBe(THEME.brand);
      expect(result.glowIntensity).toBeCloseTo((69 - 45) / 55);
    });

    it("Sharpening lower bound (PI 70): glow ~0.454", () => {
      const result = getCardColour(70, "high", false);
      expect(result.hue).toBe(THEME.brand);
      expect(result.glowIntensity).toBeCloseTo((70 - 45) / 55);
    });

    it("Sharpening upper bound (PI 84): glow ~0.709", () => {
      const result = getCardColour(84, "high", false);
      expect(result.hue).toBe(THEME.brand);
      expect(result.glowIntensity).toBeCloseTo((84 - 45) / 55);
    });
  });

  describe("defensive clamping", () => {
    it("clamps PI > 100 to glow 1", () => {
      expect(getCardColour(110, "high", false).glowIntensity).toBe(1);
    });

    it("clamps negative PI to glow 0", () => {
      expect(getCardColour(-10, "deload", false).glowIntensity).toBe(0);
    });
  });
});

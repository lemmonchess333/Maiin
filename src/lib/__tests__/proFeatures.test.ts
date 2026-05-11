/**
 * proFeatures — typed registry contract tests.
 *
 * Pins the invariants the paywall flow depends on:
 *   - Every key has a label / title / tagline (no empty strings)
 *   - getProFeature returns the matching config for known keys
 *   - getProFeature returns null for undefined (so ProModal can
 *     fall through to its generic hero)
 *   - sourceLabel matches the registry key so analytics dashboards
 *     can map between the two without translation
 */
import { describe, it, expect } from "vitest";
import {
  PRO_FEATURES,
  getProFeature,
  type ProFeatureKey,
} from "../proFeatures";

describe("PRO_FEATURES — registry shape", () => {
  it("contains all the keys the app references", () => {
    const required: ProFeatureKey[] = [
      "performance_engine",
      "ai_food_logging",
      "ai_coaching",
      "adaptive_macros",
      "adaptive_tdee",
      "advanced_insights",
    ];
    for (const key of required) {
      expect(PRO_FEATURES[key]).toBeDefined();
    }
  });

  it("every entry has a non-empty label, title, tagline, sourceLabel", () => {
    for (const config of Object.values(PRO_FEATURES)) {
      expect(config.label.length).toBeGreaterThan(0);
      expect(config.title.length).toBeGreaterThan(0);
      expect(config.tagline.length).toBeGreaterThan(0);
      expect(config.sourceLabel.length).toBeGreaterThan(0);
    }
  });

  it("each entry's `key` field matches its registry index", () => {
    for (const [registryKey, config] of Object.entries(PRO_FEATURES)) {
      expect(config.key).toBe(registryKey);
    }
  });

  it("sourceLabel matches the registry key (1:1 mapping for analytics)", () => {
    for (const [registryKey, config] of Object.entries(PRO_FEATURES)) {
      expect(config.sourceLabel).toBe(registryKey);
    }
  });
});

describe("getProFeature", () => {
  it("returns the matching config for a known key", () => {
    const result = getProFeature("performance_engine");
    expect(result?.key).toBe("performance_engine");
    expect(result?.label).toBe("Performance Engine");
  });

  it("returns null for undefined (ProModal fall-through path)", () => {
    expect(getProFeature(undefined)).toBeNull();
  });
});

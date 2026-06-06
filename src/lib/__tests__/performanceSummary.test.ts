/**
 * Tests for `getPlainLanguageSummary` — the Performance Index
 * card's headline + body copy generator.
 *
 * Pins the three signal axes (PI tier × load band × delta) and
 * the ±5pt delta noise floor.
 */
import { describe, it, expect } from "vitest";
import { getPlainLanguageSummary } from "../performanceSummary";

describe("getPlainLanguageSummary — establishing baseline (cold-start)", () => {
  it("overrides headline + body when establishing, ignoring pi/band", () => {
    const s = getPlainLanguageSummary(45, "moderate", 12, true);
    expect(s.headline).toBe("Establishing your baseline");
    expect(s.body).toContain("Keep logging");
    // The confident "Moderate load" verdict must NOT leak through.
    expect(s.headline).not.toContain("Moderate");
    // No delta trend sentence in the establishing copy.
    expect(s.body).not.toContain("pts");
  });

  it("defaults to the normal (non-establishing) copy when the flag is omitted", () => {
    expect(getPlainLanguageSummary(85, "high", null).headline).toBe(
      "Strong week — your training is on track"
    );
  });
});

describe("getPlainLanguageSummary — headline tiers (PI)", () => {
  it("PI 80+ → Strong week", () => {
    expect(getPlainLanguageSummary(85, "moderate", null).headline).toBe(
      "Strong week — your training is on track"
    );
  });

  it("PI 60-79 → Solid week", () => {
    expect(getPlainLanguageSummary(65, "moderate", null).headline).toBe(
      "Solid week — keep the cadence"
    );
  });

  it("PI 40-59 → Moderate load", () => {
    expect(getPlainLanguageSummary(45, "moderate", null).headline).toBe(
      "Moderate load — room to push or hold"
    );
  });

  it("PI < 40 → Light week", () => {
    expect(getPlainLanguageSummary(25, "moderate", null).headline).toBe(
      "Light week — focus on recovery or ramp up"
    );
  });

  it("boundary at PI=80 belongs to Strong tier (>= 80)", () => {
    expect(getPlainLanguageSummary(80, "moderate", null).headline).toBe(
      "Strong week — your training is on track"
    );
  });

  it("boundary at PI=60 belongs to Solid tier", () => {
    expect(getPlainLanguageSummary(60, "moderate", null).headline).toBe(
      "Solid week — keep the cadence"
    );
  });

  it("boundary at PI=40 belongs to Moderate tier", () => {
    expect(getPlainLanguageSummary(40, "moderate", null).headline).toBe(
      "Moderate load — room to push or hold"
    );
  });

  it("boundary at PI=39 falls into Light tier", () => {
    expect(getPlainLanguageSummary(39, "moderate", null).headline).toBe(
      "Light week — focus on recovery or ramp up"
    );
  });
});

describe("getPlainLanguageSummary — body by load band", () => {
  it("'overreach' surfaces the recovery message", () => {
    expect(getPlainLanguageSummary(50, "overreach", null).body).toContain(
      "pushing hard"
    );
  });

  it("'high' surfaces the keep-fuelling message", () => {
    expect(getPlainLanguageSummary(50, "high", null).body).toContain(
      "High training load"
    );
  });

  it("'moderate' surfaces the balanced-workload message", () => {
    expect(getPlainLanguageSummary(50, "moderate", null).body).toContain(
      "Balanced load"
    );
  });

  it("'low' surfaces the low-load message", () => {
    expect(getPlainLanguageSummary(50, "low", null).body).toContain(
      "Low training load"
    );
  });

  it("unknown band falls through to the low-load message", () => {
    /* The else-branch acts as the default. */
    expect(getPlainLanguageSummary(50, "deload", null).body).toContain(
      "Low training load"
    );
  });

  it("undefined band falls through to the low-load message", () => {
    expect(getPlainLanguageSummary(50, undefined, null).body).toContain(
      "Low training load"
    );
  });

  it("band matching is case-insensitive (loadBand is normalised lowercase)", () => {
    expect(getPlainLanguageSummary(50, "Overreach", null).body).toContain(
      "pushing hard"
    );
    expect(getPlainLanguageSummary(50, "HIGH", null).body).toContain(
      "High training load"
    );
  });
});

describe("getPlainLanguageSummary — delta trend sentence", () => {
  it("null delta produces no trend sentence", () => {
    const body = getPlainLanguageSummary(50, "moderate", null).body;
    expect(body).not.toMatch(/Trending|pts from last week/);
  });

  it("sub-5pt positive delta is suppressed (noise floor)", () => {
    /* +5 and -5 are at the threshold; the guard is `> 5`, so 5
       itself does NOT surface a trend sentence. */
    const body = getPlainLanguageSummary(50, "moderate", 5).body;
    expect(body).not.toMatch(/Trending|pts from last week/);
  });

  it("sub-5pt negative delta is suppressed (noise floor)", () => {
    const body = getPlainLanguageSummary(50, "moderate", -5).body;
    expect(body).not.toMatch(/Trending|pts from last week/);
  });

  it("positive delta > 5pt surfaces 'Trending up' with the integer points", () => {
    const body = getPlainLanguageSummary(50, "moderate", 8).body;
    expect(body).toContain("Trending up 8 pts from last week");
  });

  it("negative delta > 5pt surfaces 'Down' with the absolute integer points", () => {
    const body = getPlainLanguageSummary(50, "moderate", -12).body;
    expect(body).toContain("Down 12 pts from last week");
  });
});

/**
 * Tests for `getPlainLanguageSummary` — the Performance Index
 * card's headline + body copy generator.
 *
 * Pins the three signal axes (PI tier × load band × delta) and
 * the ±5pt delta noise floor.
 */
import { describe, it, expect } from "vitest";
import { getPlainLanguageSummary } from "../performanceSummary";
import { computeLoadBand } from "../performanceEngine";

describe("getPlainLanguageSummary — establishing baseline (cold-start)", () => {
  it("overrides headline + body when establishing, ignoring pi/band", () => {
    const s = getPlainLanguageSummary(45, "moderate", true);
    expect(s.headline).toBe("Establishing your baseline");
    expect(s.body).toContain("Keep logging");
    // The confident "Moderate load" verdict must NOT leak through.
    expect(s.headline).not.toContain("Moderate");
    // No delta trend sentence in the establishing copy.
    expect(s.body).not.toContain("pts");
  });

  it("defaults to the normal (non-establishing) copy when the flag is omitted", () => {
    expect(getPlainLanguageSummary(85, "high").headline).toBe("Strong week");
  });
});

describe("getPlainLanguageSummary — headline tiers (PI)", () => {
  it("PI 80+ → Strong week", () => {
    expect(getPlainLanguageSummary(85, "moderate").headline).toBe(
      "Strong week"
    );
  });

  it("PI 60-79 → Solid week", () => {
    expect(getPlainLanguageSummary(65, "moderate").headline).toBe("Solid week");
  });

  it("PI 40-59 → Moderate week", () => {
    expect(getPlainLanguageSummary(45, "moderate").headline).toBe(
      "Moderate week"
    );
  });

  it("PI < 40 → Light week", () => {
    expect(getPlainLanguageSummary(25, "moderate").headline).toBe("Light week");
  });

  it("boundary at PI=80 belongs to Strong tier (>= 80)", () => {
    expect(getPlainLanguageSummary(80, "moderate").headline).toBe(
      "Strong week"
    );
  });

  it("boundary at PI=60 belongs to Solid tier", () => {
    expect(getPlainLanguageSummary(60, "moderate").headline).toBe("Solid week");
  });

  it("boundary at PI=40 belongs to Moderate tier", () => {
    expect(getPlainLanguageSummary(40, "moderate").headline).toBe(
      "Moderate week"
    );
  });

  it("boundary at PI=39 falls into Light tier", () => {
    expect(getPlainLanguageSummary(39, "moderate").headline).toBe("Light week");
  });
});

describe("getPlainLanguageSummary — body by load band", () => {
  it("overreach overrides a high-score celebration", () => {
    const result = getPlainLanguageSummary(92, "overreach");
    expect(result.headline).toMatch(/Backing off/);
    expect(result.headline).not.toMatch(/on track/);
    expect(result.body).toContain("pushing hard");
  });

  it("a recommended deload overrides even a moderate composite load", () => {
    const result = getPlainLanguageSummary(62, "moderate", false, true);
    expect(result.headline).toMatch(/Backing off/);
    expect(result.body).toContain("lighter week");
    expect(result.body).not.toContain("Balanced load");
  });

  it("baseline establishment still takes priority over a deload verdict", () => {
    const result = getPlainLanguageSummary(92, "overreach", true, true);
    expect(result.headline).toBe("Establishing your baseline");
    expect(result.body).not.toContain("pts");
  });
  it("'overreach' surfaces the recovery message", () => {
    expect(getPlainLanguageSummary(50, "overreach").body).toContain(
      "pushing hard"
    );
  });

  it("high, moderate and low say nothing: no advice, no filler", () => {
    /* They said "High training load. Keep nutrition and sleep on point."
       and the like: the band restated in a coaching voice, with sleep
       advice the app has no data for. The page shows what the week held
       beneath the verdict instead (PerformanceWeekBreakdown). */
    for (const band of ["high", "moderate", "low"] as const) {
      expect(getPlainLanguageSummary(50, band).body, band).toBe("");
    }
  });

  it("never mentions sleep, which the app does not record", () => {
    for (let pi = 0; pi <= 100; pi += 5) {
      for (const deload of [false, true]) {
        const { body } = getPlainLanguageSummary(
          pi,
          computeLoadBand(pi),
          false,
          deload
        );
        expect(body).not.toMatch(/sleep/i);
      }
    }
  });

  it("'deload' gets its OWN message, not the low-load one", () => {
    /* Pre-fix `deload` fell into the catch-all low-load branch, which
       ends "…or increase intensity" — wrong advice during planned
       recovery. The engine can't distinguish a planned deload from
       inactivity, so the copy covers both without prescribing. */
    const body = getPlainLanguageSummary(20, "deload").body;
    expect(body).toContain("Very light week");
    expect(body).not.toContain("Low training load");
  });

  /* The two tests that used to live here — "unknown band falls through to
     the low-load message" and "undefined band falls through…" — PINNED THE
     BUG. They documented the catch-all else-branch as intended behaviour,
     which is why the Analytics call site could read a field nothing writes
     (`labels?.loadBand`) for its whole life without a single test failing.
     The band parameter is now the closed `LoadBand` type resolved by
     `resolveLoadBand`, so "no band" is unrepresentable here; validation and
     case-tolerance are pinned in performanceDocFields.test.ts instead. */

  it("headline and body never contradict, across the whole PI range", () => {
    /* The device report that surfaced the bug showed "Solid week — keep the
       cadence" over "Low training load… increase intensity" on the SAME
       card. Because the band is a pure function of PI, the pairing is
       deterministic — walk the range and assert the two halves agree. */
    for (let pi = 0; pi <= 100; pi++) {
      const band = computeLoadBand(pi);
      const { headline, body } = getPlainLanguageSummary(pi, band);
      // A week the headline calls Strong/Solid must never be described as
      // low or very light load.
      if (/Strong week|Solid week/.test(headline)) {
        expect(body, `PI ${pi}`).not.toMatch(/Very light/);
      }
      // A week the headline calls Light must never be described as high.
      if (/Light week/.test(headline)) {
        expect(body, `PI ${pi}`).not.toMatch(/pushing hard/);
      }
    }
  });
});

describe("getPlainLanguageSummary — no week-on-week sentence", () => {
  it("leaves the change to the chip beside the headline", () => {
    /* It appended "Trending up 8 pts from last week." under a chip that
       already read "+8 pts", and "last week" was yesterday's rolling week
       until the series was made weekly (performanceSeries.ts). */
    for (const band of [
      "overreach",
      "high",
      "moderate",
      "low",
      "deload",
    ] as const) {
      const { body } = getPlainLanguageSummary(50, band);
      expect(body).not.toMatch(/pts|last week|Trending/);
    }
  });
});

/**
 * resolveLoadBand — the canonical load-band read.
 *
 * The load-bearing test here is MIRROR PARITY (ADR-0008 / CLAUDE.md's #1
 * recurring mistake): the reader is asserted against a doc shaped exactly
 * as the WRITERS emit, not against a fixture invented for the reader. The
 * absence of that test is precisely why `PerformanceTab` could read
 * `labels?.loadBand` — a field no writer produces — for its entire life
 * while every suite stayed green.
 */
import { describe, it, expect } from "vitest";
import {
  resolveLoadBand,
  resolveDeloadRecommended,
  isEstablishingBaseline,
} from "../performanceDocFields";
import { computeLoadBand } from "../performanceEngine";

describe("resolveLoadBand — mirror parity with the writers", () => {
  it("reads the TOP-LEVEL loadBand every writer actually emits", () => {
    /* This is the real shape: `functions/lib/perfScoring.js` and
       `src/lib/performanceEngine.ts` both spread a partial containing a
       top-level `loadBand` and NO `labels` map. A reader that only
       understands `labels.loadBand` resolves undefined on this doc — the
       shipped bug. */
    const writerShaped = {
      weekKey: "2026-08-02",
      performanceIndex: 77,
      loadBand: "high",
    };
    expect(resolveLoadBand(writerShaped)).toBe("high");
    expect("labels" in writerShaped).toBe(false);
  });

  it("agrees with computeLoadBand across the PI range for writer-shaped docs", () => {
    for (let pi = 0; pi <= 100; pi++) {
      const band = computeLoadBand(pi);
      expect(resolveLoadBand({ performanceIndex: pi, loadBand: band })).toBe(
        band
      );
    }
  });
});

describe("resolveLoadBand — fallbacks", () => {
  it("falls back to the legacy labels mirror when only it is present", () => {
    expect(
      resolveLoadBand({ performanceIndex: 50, labels: { loadBand: "overreach" } })
    ).toBe("overreach");
  });

  it("prefers the canonical top-level field over the legacy mirror", () => {
    expect(
      resolveLoadBand({
        performanceIndex: 50,
        loadBand: "high",
        labels: { loadBand: "low" },
      })
    ).toBe("high");
  });

  it("DERIVES from PI when no band is stored — never a wrong default", () => {
    /* The old copy layer turned a missing band into a confident "Low
       training load". Deriving is not a guess: computeLoadBand is a pure
       function of PI and is the same function the writer used. */
    expect(resolveLoadBand({ performanceIndex: 90 })).toBe("overreach");
    expect(resolveLoadBand({ performanceIndex: 77 })).toBe("high");
    expect(resolveLoadBand({ performanceIndex: 50 })).toBe("moderate");
    expect(resolveLoadBand({ performanceIndex: 30 })).toBe("low");
    expect(resolveLoadBand({ performanceIndex: 10 })).toBe("deload");
  });

  it("rejects garbage bands and derives instead of rendering them raw", () => {
    expect(resolveLoadBand({ performanceIndex: 77, loadBand: "banana" })).toBe(
      "high"
    );
    expect(resolveLoadBand({ performanceIndex: 77, loadBand: "" })).toBe("high");
  });

  it("tolerates legacy casing", () => {
    expect(resolveLoadBand({ performanceIndex: 50, loadBand: "HIGH" })).toBe(
      "high"
    );
    expect(
      resolveLoadBand({ performanceIndex: 50, loadBand: "Overreach" })
    ).toBe("overreach");
  });

  it("is total — null / undefined / empty docs still yield a band", () => {
    expect(resolveLoadBand(null)).toBe("deload");
    expect(resolveLoadBand(undefined)).toBe("deload");
    expect(resolveLoadBand({})).toBe("deload");
  });
});

describe("resolveDeloadRecommended — the same drift, second field", () => {
  it("reads the TOP-LEVEL flag every writer emits", () => {
    /* Writer-shaped again: `shouldRecommendDeload()`'s result is spread
       top-level with no `flags` map. Reading `flags?.deloadRecommended`
       resolved undefined on this doc, which is why the Analytics deload
       banner never rendered and the Home hero's deload verb never fired. */
    const writerShaped = {
      weekKey: "2026-08-02",
      performanceIndex: 88,
      deloadRecommended: true,
    };
    expect(resolveDeloadRecommended(writerShaped)).toBe(true);
    expect("flags" in writerShaped).toBe(false);
  });

  it("honours an explicit false — never upgrades it to true", () => {
    expect(resolveDeloadRecommended({ deloadRecommended: false })).toBe(false);
    expect(
      resolveDeloadRecommended({
        deloadRecommended: false,
        signals: { deloadFlag: true },
      })
    ).toBe(false);
  });

  it("falls back to the legacy flags map, then the signals mirror", () => {
    expect(
      resolveDeloadRecommended({ flags: { deloadRecommended: true } })
    ).toBe(true);
    // The accident that kept Weekly Review working.
    expect(resolveDeloadRecommended({ signals: { deloadFlag: true } })).toBe(
      true
    );
  });

  it("defaults to false — a recommendation is never invented", () => {
    /* Unlike the band, this cannot be derived (it needs recovery,
       adherence and the prior week), so absence must assert nothing. */
    expect(resolveDeloadRecommended({})).toBe(false);
    expect(resolveDeloadRecommended(null)).toBe(false);
    expect(resolveDeloadRecommended(undefined)).toBe(false);
  });
});

describe("isEstablishingBaseline — one gate for Home and Analytics", () => {
  it("the lapsed-and-returning athlete reads as establishing", () => {
    /* The divergence this predicate closes. A year of history, six months
       off, two weeks back: lifetime depth is high but the recent window is
       nearly empty. Analytics' old `weeks.length < 4` said establishing;
       Home's lifetimeWeeks<4 said confident. CLAUDE.md names this segment
       explicitly ("lapsed-and-returning users ... a real user segment").
       The baseline is derived from PRIOR weeks, so a year-old baseline
       must not license a confident read of week two back. */
    expect(
      isEstablishingBaseline({ weeksAvailable: 1, lifetimeWeeks: 52 })
    ).toBe(true);
  });

  it("a genuinely established athlete reads confident", () => {
    expect(
      isEstablishingBaseline({ weeksAvailable: 12, lifetimeWeeks: 30 })
    ).toBe(false);
  });

  it("needs BOTH recent presence and lifetime depth", () => {
    // Plenty of recent weeks, but the engine has barely seen this user.
    expect(
      isEstablishingBaseline({ weeksAvailable: 8, lifetimeWeeks: 3 })
    ).toBe(true);
    // Deep history, but only one week delivered.
    expect(
      isEstablishingBaseline({ weeksAvailable: 1, lifetimeWeeks: 30 })
    ).toBe(true);
  });

  it("boundaries: 2 weeks available and 4 lifetime weeks are the thresholds", () => {
    expect(
      isEstablishingBaseline({ weeksAvailable: 2, lifetimeWeeks: 4 })
    ).toBe(false);
    expect(
      isEstablishingBaseline({ weeksAvailable: 2, lifetimeWeeks: 3 })
    ).toBe(true);
  });

  it("a missing lifetimeWeeks reads as establishing, not confident", () => {
    /* Legacy pre-PI1a docs carry no `signals`; normaliseSignals defaults
       lifetimeWeeks to 0. Erring toward "still learning" is the honest
       direction and matches what Home already shipped. */
    expect(
      isEstablishingBaseline({ weeksAvailable: 12, lifetimeWeeks: undefined })
    ).toBe(true);
  });
});

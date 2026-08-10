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
  MAX_LIFETIME_WEEKS,
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
      resolveLoadBand({
        performanceIndex: 50,
        labels: { loadBand: "overreach" },
      })
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
    expect(resolveLoadBand({ performanceIndex: 77, loadBand: "" })).toBe(
      "high"
    );
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
  /**
   * Every `lifetimeWeeks` below is in 0..MAX_LIFETIME_WEEKS, because that
   * is the entire set the writer can produce.
   *
   * This block used to assert the confident path with `lifetimeWeeks: 52`
   * and `30`. Neither is reachable: the server sets the field to
   * `baselineAgg.activeWeeks`, a Set of 7-day bucket indices inside a
   * 28-day window. So the tests described a user who cannot exist, and
   * the only production route to `false` was a perfect 4 — which is why
   * a perfect-attendance gate passed review as "fewer than four weeks of
   * history". Same failure as PR #1775's `templateId === "race"`: the
   * accept path was fiction and only the rejections were honest.
   */
  it("the writer cannot exceed MAX_LIFETIME_WEEKS — the pin that keeps these fixtures real", () => {
    // Derived from the range, not restated: if the baseline window ever
    // widens, this is the line that has to be revisited first.
    expect(MAX_LIFETIME_WEEKS).toBe(4);
    for (let w = 0; w <= MAX_LIFETIME_WEEKS; w += 1) {
      expect(
        isEstablishingBaseline({ docsAvailable: 12, lifetimeWeeks: w })
      ).toBe(w < 3);
    }
  });

  it("the lapsed-and-returning athlete reads as establishing", () => {
    /* The divergence this predicate closes. Six months off, two weeks
       back: the baseline window holds two active weeks, so the read is
       still forming. CLAUDE.md names this segment explicitly. Note the
       fixture now uses 2 rather than 52 — a returning athlete's DEPTH
       does not survive in this field at all, which is precisely why the
       recent window is the thing being measured. */
    expect(isEstablishingBaseline({ docsAvailable: 1, lifetimeWeeks: 2 })).toBe(
      true
    );
  });

  it("a genuinely established athlete reads confident", () => {
    expect(
      isEstablishingBaseline({ docsAvailable: 12, lifetimeWeeks: 4 })
    ).toBe(false);
  });

  it("ONE missed week does not brand a regular a beginner", () => {
    /* The reported defect. At the old `< 4` this returned true — and kept
       returning true forever, because the window always rolls. A rest
       week, a holiday, or a week of flu permanently pinned the user to
       "Establishing your baseline" and suppressed every figure on the
       tab. Three of four active weeks is a real baseline. */
    expect(
      isEstablishingBaseline({ docsAvailable: 12, lifetimeWeeks: 3 })
    ).toBe(false);
  });

  it("needs BOTH recent presence and baseline depth", () => {
    // Plenty of docs, but the baseline window is nearly empty.
    expect(isEstablishingBaseline({ docsAvailable: 8, lifetimeWeeks: 1 })).toBe(
      true
    );
    // Full baseline, but the engine has only ever computed once.
    expect(isEstablishingBaseline({ docsAvailable: 1, lifetimeWeeks: 4 })).toBe(
      true
    );
  });

  it("boundaries: 2 docs and 3 active baseline weeks are the thresholds", () => {
    expect(isEstablishingBaseline({ docsAvailable: 2, lifetimeWeeks: 3 })).toBe(
      false
    );
    expect(isEstablishingBaseline({ docsAvailable: 2, lifetimeWeeks: 2 })).toBe(
      true
    );
    expect(isEstablishingBaseline({ docsAvailable: 1, lifetimeWeeks: 3 })).toBe(
      true
    );
  });

  it("a missing lifetimeWeeks reads as establishing, not confident", () => {
    /* Legacy pre-PI1a docs carry no `signals`; normaliseSignals defaults
       lifetimeWeeks to 0. Erring toward "still learning" is the honest
       direction and matches what Home already shipped. */
    expect(
      isEstablishingBaseline({ docsAvailable: 12, lifetimeWeeks: undefined })
    ).toBe(true);
  });
});

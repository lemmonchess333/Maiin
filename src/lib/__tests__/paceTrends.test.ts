import { describe, it, expect } from "vitest";
import { calculatePaceTrend } from "../paceTrends";

// ── Helpers ──────────────────────────────────

function makeRun(avgPace: number, distance: number, daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return { avgPace, distance, completedAt: d };
}

/**
 * Generate N comparable runs at a given pace and distance,
 * spread out over consecutive days starting from daysAgo.
 */
function generateRuns(n: number, avgPace: number, distance: number, startDaysAgo: number) {
  return Array.from({ length: n }, (_, i) =>
    makeRun(avgPace, distance, startDaysAgo + i)
  );
}

// ── calculatePaceTrend ───────────────────────

describe("calculatePaceTrend", () => {
  describe("no-data scenarios", () => {
    it("returns no-data when currentRun has zero pace", () => {
      const current = makeRun(0, 5000, 0);
      const allRuns = generateRuns(10, 300, 5000, 1);
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("no-data");
      expect(result.label).toBe("");
    });

    it("returns no-data when currentRun has zero distance", () => {
      const current = makeRun(300, 0, 0);
      const allRuns = generateRuns(10, 300, 5000, 1);
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("no-data");
    });

    it("returns no-data when currentRun has negative pace", () => {
      const current = makeRun(-10, 5000, 0);
      const result = calculatePaceTrend(current, []);
      expect(result.trend).toBe("no-data");
    });

    it("returns no-data when fewer than 8 comparable runs exist", () => {
      const current = makeRun(300, 5000, 0);
      const allRuns = generateRuns(7, 310, 5000, 1);
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("no-data");
    });

    it("returns no-data when comparable runs have different distances (>20%)", () => {
      const current = makeRun(300, 5000, 0);
      // All runs are 10km — ratio = 10000/5000 = 2.0, outside 0.8–1.2
      const allRuns = generateRuns(10, 300, 10000, 1);
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("no-data");
    });

    it("excludes the current run from comparable runs by timestamp", () => {
      const current = makeRun(300, 5000, 0);
      // Include 7 comparable + the current run itself = only 7 valid comparable
      const allRuns = [
        current, // same timestamp, excluded
        ...generateRuns(7, 310, 5000, 1),
      ];
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("no-data"); // only 7 comparable, needs 8
    });

    it("excludes runs with zero pace from comparables", () => {
      const current = makeRun(300, 5000, 0);
      const validRuns = generateRuns(7, 310, 5000, 1);
      const invalidRuns = generateRuns(3, 0, 5000, 10); // zero pace
      const result = calculatePaceTrend(current, [...validRuns, ...invalidRuns]);
      expect(result.trend).toBe("no-data"); // only 7 valid comparable
    });
  });

  describe("PR detection", () => {
    it("returns pr when current pace is faster than all comparable runs", () => {
      const current = makeRun(280, 5000, 0);
      const allRuns = generateRuns(10, 300, 5000, 1); // all at 300 s/km
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("pr");
      expect(result.label).toBe("PR!");
      expect(result.color).toBe("#f59e0b");
    });

    it("returns pr when barely beating the best", () => {
      const current = makeRun(299, 5000, 0);
      const allRuns = generateRuns(10, 300, 5000, 1);
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("pr");
    });
  });

  describe("improving detection", () => {
    it("returns improving when pace is faster than recent average by >2%", () => {
      const current = makeRun(290, 5000, 0);
      // Recent 3 runs (most recent by date = lowest daysAgo) average 310
      // Best all-time is 300 (so not a PR since 290 < 300... wait, 290 < 300 → PR)
      // Need best to be faster than current
      const olderRuns = generateRuns(7, 320, 5000, 10);
      const recentRuns = generateRuns(3, 310, 5000, 1);
      // Add one run faster than current to prevent PR
      const bestRun = makeRun(280, 5000, 20);
      const allRuns = [bestRun, ...olderRuns, ...recentRuns];
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("improving");
      expect(result.label).toBe("Faster");
      expect(result.color).toBe("#2dd4bf");
    });
  });

  describe("consistent detection", () => {
    it("returns consistent when pace is within 2% of recent average", () => {
      const current = makeRun(305, 5000, 0);
      // Recent 3 avg = 300, 2% of 300 = 6, so 305 is within 300*1.02=306
      // But best = 280 so not PR. 305 < 300*0.98=294? No. 305 <= 300*1.02=306? Yes → consistent
      const olderRuns = generateRuns(7, 310, 5000, 10);
      const recentRuns = generateRuns(3, 300, 5000, 1);
      const bestRun = makeRun(280, 5000, 20);
      const allRuns = [bestRun, ...olderRuns, ...recentRuns];
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("consistent");
      expect(result.label).toBe("Steady");
      expect(result.color).toBe("#7B72E9");
    });

    it("returns consistent when pace matches recent average exactly", () => {
      const current = makeRun(300, 5000, 0);
      const olderRuns = generateRuns(7, 310, 5000, 10);
      const recentRuns = generateRuns(3, 300, 5000, 1);
      const bestRun = makeRun(280, 5000, 20);
      const allRuns = [bestRun, ...olderRuns, ...recentRuns];
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("consistent");
    });
  });

  describe("slower (no badge)", () => {
    it("returns no-data when pace is slower than recent average by >2%", () => {
      const current = makeRun(330, 5000, 0);
      // Recent avg = 300, 330 > 300*1.02=306 → no badge
      const olderRuns = generateRuns(7, 310, 5000, 10);
      const recentRuns = generateRuns(3, 300, 5000, 1);
      const bestRun = makeRun(280, 5000, 20);
      const allRuns = [bestRun, ...olderRuns, ...recentRuns];
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("no-data");
      expect(result.label).toBe("");
    });
  });

  describe("distance tolerance", () => {
    it("includes runs within 20% distance as comparable", () => {
      const current = makeRun(290, 5000, 0);
      // 5000 * 0.8 = 4000; 5000 * 1.2 = 6000 → 4500 is within range
      const allRuns = generateRuns(10, 300, 4500, 1);
      // bestPace = 300, current = 290 < 300 → PR
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("pr");
    });

    it("excludes runs outside 20% distance tolerance", () => {
      const current = makeRun(290, 5000, 0);
      // 5000 * 0.8 = 4000; 3900 is outside range
      const allRuns = generateRuns(10, 300, 3900, 1);
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("no-data");
    });
  });

  describe("source / validity matrix (Sprint 1)", () => {
    /* Trust cleanup: paceTrends now mirrors the Sprint 1 pace
       eligibility matrix so a treadmill 2km / 5:17 record can't
       fake an outdoor PR badge against historical outdoor runs. */
    it("treadmill current run returns no-data (typed distance, not GPS-verified)", () => {
      const current = {
        ...makeRun(158, 2000, 0),
        activityType: "treadmill" as const,
      };
      const allRuns = generateRuns(10, 300, 2000, 1); // outdoor outdoor outdoor
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("no-data");
    });

    it("manual current run returns no-data (GPS never locked)", () => {
      const current = {
        ...makeRun(158, 2000, 0),
        activityType: "manual" as const,
      };
      const allRuns = generateRuns(10, 300, 2000, 1);
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("no-data");
    });

    it("isInvalid current run returns no-data", () => {
      const current = {
        ...makeRun(280, 5000, 0),
        isInvalid: true,
      };
      const allRuns = generateRuns(10, 300, 5000, 1);
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("no-data");
    });

    it("savedAnyway current run returns no-data", () => {
      const current = {
        ...makeRun(280, 5000, 0),
        savedAnyway: true,
      };
      const allRuns = generateRuns(10, 300, 5000, 1);
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("no-data");
    });

    it("treadmill comparables don't poison an outdoor PR check", () => {
      /* If a user did one fast outdoor run after 9 slow treadmill
         entries, the treadmill records shouldn't make the outdoor
         run look like a PR — they're not eligible comparables. So
         with only treadmill comparables the outdoor candidate gets
         no-data (not enough eligible comparables). */
      const current = makeRun(280, 5000, 0); // outdoor (no activityType set, defaults to outdoor)
      const treadmillComparables = generateRuns(10, 300, 5000, 1).map(r => ({
        ...r,
        activityType: "treadmill" as const,
      }));
      const result = calculatePaceTrend(current, treadmillComparables);
      expect(result.trend).toBe("no-data");
    });

    it("invalid comparables are excluded from the comparable pool", () => {
      const current = makeRun(280, 5000, 0);
      const invalidPool = generateRuns(10, 300, 5000, 1).map(r => ({
        ...r,
        isInvalid: true,
      }));
      const result = calculatePaceTrend(current, invalidPool);
      expect(result.trend).toBe("no-data");
    });

    it("explicit outdoor activityType still produces a trend", () => {
      /* Mirror of the back-compat case but with activityType
         explicitly set — pins that passing the field through
         doesn't accidentally break the outdoor path. Current
         290s/km is faster than every comparable (300s/km) so the
         outdoor path correctly produces a PR. */
      const current = {
        ...makeRun(290, 5000, 0),
        activityType: "easy" as const,
      };
      const allRuns = generateRuns(10, 300, 5000, 1).map(r => ({
        ...r,
        activityType: "easy" as const,
      }));
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("pr");
    });

    it("missing activityType still produces a trend (legacy compat)", () => {
      /* Pre-Sprint-1 callers and existing tests don't set
         activityType. The eligibility helper treats a missing
         field as outdoor so legacy data and tests continue to
         work. */
      const current = makeRun(290, 5000, 0);
      const allRuns = generateRuns(10, 300, 5000, 1);
      const result = calculatePaceTrend(current, allRuns);
      expect(result.trend).toBe("pr");
    });
  });
});

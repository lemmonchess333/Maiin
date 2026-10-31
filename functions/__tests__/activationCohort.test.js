import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cohort = require("../lib/activationCohort.js");

function configDb(data, { fail = false } = {}) {
  const get = vi.fn(async () => {
    if (fail) throw new Error("unavailable");
    return { exists: data !== undefined, data: () => data };
  });
  return { doc: () => ({ get }), get };
}

beforeEach(() => {
  cohort.resetCacheForTests();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("the server-assigned activation cohort", () => {
  it("puts about a tenth of accounts in the comparison group, the same each time", () => {
    const uids = Array.from({ length: 20000 }, (_, i) => `uid-${i}`);
    const share =
      uids.filter((uid) => cohort.inComparisonGroup(uid)).length / uids.length;
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.12);
    for (const uid of uids.slice(0, 50))
      expect(cohort.inComparisonGroup(uid)).toBe(cohort.inComparisonGroup(uid));
  });

  it("stamps v2, the comparison group's legacy journey, or nothing for an older client", async () => {
    const db = configDb({});
    const v2 = "uid-1";
    const comparison = Array.from({ length: 200 }, (_, i) => `uid-${i}`).find(
      (uid) => cohort.inComparisonGroup(uid)
    );
    expect(cohort.inComparisonGroup(v2)).toBe(false);
    expect(await cohort.journeyFor(db, v2, 2)).toBe(2);
    expect(await cohort.journeyFor(db, comparison, 2)).toBe(1);
    expect(await cohort.journeyFor(db, v2, undefined)).toBeNull();
  });

  it("turns v2 off only for an explicit false, and keeps it on if unread", async () => {
    expect(
      await cohort.v2Enabled(configDb({ activationJourneyV2Enabled: false }))
    ).toBe(false);
    for (const data of [
      undefined,
      {},
      { activationJourneyV2Enabled: "false" },
    ]) {
      cohort.resetCacheForTests();
      expect(await cohort.v2Enabled(configDb(data))).toBe(true);
    }
    cohort.resetCacheForTests();
    expect(await cohort.v2Enabled(configDb({}, { fail: true }))).toBe(true);
    cohort.resetCacheForTests();
    expect(
      await cohort.journeyFor(
        configDb({ activationJourneyV2Enabled: false }),
        "uid-1",
        2
      )
    ).toBe(1);
  });

  it("takes the comparison share from config: 0 ends it, a malformed one keeps a tenth", async () => {
    const comparison = Array.from({ length: 200 }, (_, i) => `uid-${i}`).find(
      (uid) => cohort.inComparisonGroup(uid)
    );
    expect(
      await cohort.journeyFor(
        configDb({ activationComparisonPercent: 0 }),
        comparison,
        2
      )
    ).toBe(2);
    for (const percent of [-1, 101, 12.5, "0", null]) {
      cohort.resetCacheForTests();
      expect(
        await cohort.journeyFor(
          configDb({ activationComparisonPercent: percent }),
          comparison,
          2
        )
      ).toBe(1);
    }
    cohort.resetCacheForTests();
    const everyone = await cohort.journeyConfig(
      configDb({ activationComparisonPercent: 100 })
    );
    expect(everyone.comparisonPercent).toBe(100);
    expect(cohort.inComparisonGroup("uid-1", 100)).toBe(true);
  });

  it("reads the switch at most once a minute", async () => {
    const db = configDb({ activationJourneyV2Enabled: false });
    await cohort.v2Enabled(db, 1_000);
    await cohort.v2Enabled(db, 30_000);
    expect(db.get).toHaveBeenCalledTimes(1);
    await cohort.v2Enabled(db, 62_000);
    expect(db.get).toHaveBeenCalledTimes(2);
  });
});

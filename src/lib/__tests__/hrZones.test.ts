import { describe, it, expect } from "vitest";
import {
  maxHrFromAge,
  hrZones,
  zoneForHr,
  targetZoneForRun,
  zoneShortLabel,
  ZONE_NAMES,
  summarizeHeartRate,
  watchReadingSetAside,
  easyHeartRateCeiling,
  type HeartRateSample,
  heartRateCoverageBand,
  ZONE_COVERAGE_MIN,
} from "../hrZones";

describe("zoneShortLabel", () => {
  it("is the zone and its range in one item, without the zone's name", () => {
    const easy = hrZones(186).find((z) => z.zone === 2)!;
    expect(zoneShortLabel(easy)).toBe(`Z2 ${easy.minBpm}–${easy.maxBpm} bpm`);
    expect(zoneShortLabel(easy)).not.toContain(easy.name);
  });
});

describe("maxHrFromAge — Tanaka 208 − 0.7·age", () => {
  it("computes a sensible max for a typical age", () => {
    expect(maxHrFromAge(30)).toBe(187); // 208 − 21 = 187
    expect(maxHrFromAge(40)).toBe(180); // 208 − 28 = 180
    expect(maxHrFromAge(20)).toBe(194); // 208 − 14 = 194
  });

  it("returns 0 for nonsensical ages (guards the divide-by/render)", () => {
    expect(maxHrFromAge(0)).toBe(0);
    expect(maxHrFromAge(-5)).toBe(0);
    expect(maxHrFromAge(200)).toBe(0);
    expect(maxHrFromAge(NaN)).toBe(0);
    expect(maxHrFromAge(Infinity)).toBe(0);
  });
});

describe("hrZones — five bands for a max HR", () => {
  it("returns five named zones with ascending bpm bands", () => {
    const z = hrZones(200);
    expect(z).toHaveLength(5);
    expect(z.map((b) => b.zone)).toEqual([1, 2, 3, 4, 5]);
    expect(z.map((b) => b.name)).toEqual([
      ZONE_NAMES[1],
      ZONE_NAMES[2],
      ZONE_NAMES[3],
      ZONE_NAMES[4],
      ZONE_NAMES[5],
    ]);
    // 50–60 / 60–70 / … / 90–100 % of 200
    expect(z[0]).toMatchObject({ minBpm: 100, maxBpm: 120 });
    expect(z[3]).toMatchObject({ minBpm: 160, maxBpm: 180 });
    expect(z[4]).toMatchObject({ minBpm: 180, maxBpm: 200 });
  });

  it("returns [] for an invalid max HR", () => {
    expect(hrZones(0)).toEqual([]);
    expect(hrZones(-10)).toEqual([]);
    expect(hrZones(NaN)).toEqual([]);
  });
});

describe("zoneForHr — bucket a single reading", () => {
  it("buckets by %HRmax with inclusive-lower boundaries", () => {
    const max = 200;
    expect(zoneForHr(90, max)).toBe(0); // 45% — below Z1
    expect(zoneForHr(100, max)).toBe(1); // 50% — Z1 floor
    expect(zoneForHr(119, max)).toBe(1);
    expect(zoneForHr(120, max)).toBe(2); // 60% — Z2 floor
    expect(zoneForHr(140, max)).toBe(3); // 70%
    expect(zoneForHr(160, max)).toBe(4); // 80%
    expect(zoneForHr(180, max)).toBe(5); // 90%
  });

  it("reads Z5 (not 'off the top') above the estimated max", () => {
    expect(zoneForHr(210, 200)).toBe(5);
  });

  it("returns 0 for invalid inputs", () => {
    expect(zoneForHr(0, 200)).toBe(0);
    expect(zoneForHr(150, 0)).toBe(0);
    expect(zoneForHr(NaN, 200)).toBe(0);
  });
});

describe("zone names — Run21's effort words (E1)", () => {
  it("names each zone by how it feels, not its physiology", () => {
    expect(ZONE_NAMES).toEqual({
      1: "Recovery",
      2: "Easy",
      3: "Steady",
      4: "Comfortably hard",
      5: "Hard",
    });
    expect(Object.values(ZONE_NAMES).join(" ")).not.toMatch(
      /aerobic|threshold|max/i
    );
  });
});

describe("targetZoneForRun — a race's zone follows its distance (E1)", () => {
  // A 5K or 10K is raced at 90% of max heart rate or more, a half or a
  // marathon at about 80–89% (running-evidence §5.0b, Daniels).
  it("a 5K or 10K in zone 5, a half or marathon in zone 4", () => {
    expect(targetZoneForRun("race", 200, 5)?.zone).toBe(5);
    expect(targetZoneForRun("race", 200, 10)?.zone).toBe(5);
    expect(targetZoneForRun("race", 200, 21.1)?.zone).toBe(4);
    expect(targetZoneForRun("race", 200, 42.2)?.zone).toBe(4);
  });

  it("a race of no known distance keeps zone 4, and other runs ignore it", () => {
    expect(targetZoneForRun("race", 200)?.zone).toBe(4);
    expect(targetZoneForRun("easy", 200, 5)?.zone).toBe(2);
  });
});

describe("targetZoneForRun — intensity → prescribed zone", () => {
  it("maps each intensity to the coaching-conventional zone", () => {
    const max = 200;
    expect(targetZoneForRun("recovery", max)?.zone).toBe(1);
    expect(targetZoneForRun("easy", max)?.zone).toBe(2);
    expect(targetZoneForRun("long", max)?.zone).toBe(2);
    expect(targetZoneForRun("tempo", max)?.zone).toBe(4);
    expect(targetZoneForRun("intervals", max)?.zone).toBe(5);
    expect(targetZoneForRun("race", max)?.zone).toBe(4);
  });

  it("returns the full band (bpm + name) for the zone", () => {
    const band = targetZoneForRun("easy", 200);
    expect(band).toMatchObject({ zone: 2, minBpm: 120, maxBpm: 140 });
    expect(band?.name).toBe(ZONE_NAMES[2]);
  });

  it("returns null when max HR is unknown", () => {
    expect(targetZoneForRun("easy", 0)).toBeNull();
    expect(targetZoneForRun("tempo", NaN)).toBeNull();
  });
});

describe("summarizeHeartRate — elapsed time rather than sample counts", () => {
  const watch = (bpm: number, at: number, id?: string) => ({
    bpm,
    at,
    id,
    source: "apple-watch" as const,
  });

  it("weights readings by time, caps missing gaps, and excludes paused time", () => {
    const result = summarizeHeartRate(
      [
        watch(120, 0, "a"),
        watch(140, 5_000, "b"),
        watch(140, 5_000, "b"), // retransmission
        watch(180, 50_000, "c"), // first 30 seconds of the gap are missing
        watch(160, 110_000, "d"), // reading during a pause
      ],
      [
        { startMs: 0, endMs: 60_000 },
        { startMs: 120_000, endMs: 180_000 },
      ],
      200
    );
    expect(result).toMatchObject({
      averageBpm: 150,
      maxBpm: 180,
      coveredSeconds: 30,
      movingSeconds: 120,
      coverage: 0.25,
      zoneSeconds: [0, 5, 15, 0, 10],
      belowZoneSeconds: 0,
    });
  });

  it("uses the phone timer as a coverage denominator after process recovery", () => {
    const result = summarizeHeartRate(
      [watch(130, 1_000)],
      [{ startMs: 0, endMs: 16_000 }],
      200,
      60
    );
    expect(result?.coveredSeconds).toBe(15);
    expect(result?.movingSeconds).toBe(60);
    expect(result?.coverage).toBe(0.25);
    expect(result?.zoneSeconds).toEqual([0, 15, 0, 0, 0]);
  });

  it("declines a summary without valid in-run coverage", () => {
    expect(
      summarizeHeartRate(
        [watch(130, 20_000)],
        [{ startMs: 0, endMs: 10_000 }],
        200
      )
    ).toBeNull();
  });

  it("retains average and highest bpm when maximum heart rate is unknown", () => {
    const result = summarizeHeartRate(
      [watch(130, 0), watch(140, 5_000)],
      [{ startMs: 0, endMs: 10_000 }],
      0
    );
    expect(result).toMatchObject({
      averageBpm: 135,
      maxBpm: 140,
      coverage: 1,
      maxHr: 0,
      zoneSeconds: [0, 0, 0, 0, 0],
    });
  });
});

/* Connected training proposal, heart-rate rule 5: time in zone is time,
   not a count of readings. A Watch reads about every five seconds and a
   strap every second, so a run that changes source mid-way is where a
   count goes wrong. */
describe("summarizeHeartRate — time in zone across cadences and sources", () => {
  const reading = (
    bpm: number,
    at: number,
    source: HeartRateSample["source"]
  ): HeartRateSample => ({ bpm, at, source, id: `${source}:${at}` });

  // Two minutes of Watch readings every 5 s in Zone 2 (125 bpm of 200),
  // then a minute of strap readings every second in Zone 3 (145 bpm).
  const watchThenStrap: HeartRateSample[] = [
    ...Array.from({ length: 24 }, (_, i) =>
      reading(125, i * 5_000, "apple-watch")
    ),
    ...Array.from({ length: 60 }, (_, i) =>
      reading(145, 120_000 + i * 1_000, "bluetooth")
    ),
  ];
  const moving = [{ startMs: 0, endMs: 180_000 }];

  it("counts two minutes in Zone 2 and one in Zone 3, not 24 readings and 60", () => {
    const summary = summarizeHeartRate(watchThenStrap, moving, 200);
    expect(summary?.zoneSeconds).toEqual([0, 120, 60, 0, 0]);
    expect(summary?.coverage).toBe(1);
    // A count of readings would have put 60 of 84 (71%) in Zone 3.
    const zone3Share = summary!.zoneSeconds[2] / summary!.coveredSeconds;
    expect(zone3Share).toBeCloseTo(1 / 3);
    // The average is by time too: (125 x 120 + 145 x 60) / 180.
    expect(summary?.averageBpm).toBe(132);
  });

  it("names the source that covered most of the run", () => {
    expect(summarizeHeartRate(watchThenStrap, moving, 200)?.source).toBe(
      "apple-watch"
    );
    const strapOnly = watchThenStrap.filter((s) => s.source === "bluetooth");
    expect(
      summarizeHeartRate(strapOnly, [{ startMs: 120_000, endMs: 180_000 }], 200)
        ?.source
    ).toBe("bluetooth");
  });

  it("reads the sensor while it is fresh and the Watch around it", () => {
    // The Watch every 5 s at 150 for 90 s; the strap every second at 140
    // from 30 s to 59 s.
    const both: HeartRateSample[] = [
      ...Array.from({ length: 19 }, (_, i) =>
        reading(150, i * 5_000, "apple-watch")
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        reading(140, 30_000 + i * 1_000, "bluetooth")
      ),
    ];
    const summary = summarizeHeartRate(
      both,
      [{ startMs: 0, endMs: 90_000 }],
      200
    );
    // 0-30 s Watch, 30-74 s strap (its last reading held 15 s, the Watch's
    // 60, 65 and 70 set aside), 75-90 s Watch: 45 s at 150, 44 s at 140,
    // and the second from 74 s to 75 s uncovered.
    expect(summary?.coveredSeconds).toBe(89);
    expect(summary?.averageBpm).toBe(145);
    expect(summary?.zoneSeconds).toEqual([0, 0, 89, 0, 0]);
  });
});

describe("watchReadingSetAside — one reading at a time", () => {
  it("sets a Watch reading aside within 15 s of a sensor reading, and keeps it after", () => {
    expect(watchReadingSetAside(1_000, 1_000)).toBe(true);
    expect(watchReadingSetAside(15_999, 1_000)).toBe(true);
    expect(watchReadingSetAside(16_000, 1_000)).toBe(false);
  });

  it("keeps a Watch reading with no sensor reading, or one older than it", () => {
    expect(watchReadingSetAside(5_000, null)).toBe(false);
    expect(watchReadingSetAside(5_000, 6_000)).toBe(false);
  });
});

describe("easyHeartRateCeiling — the top of Zone 2", () => {
  it("is the band Train's run card shows for an easy run", () => {
    expect(easyHeartRateCeiling(187)).toBe(131);
    expect(easyHeartRateCeiling(187)).toBe(
      targetZoneForRun("easy", 187)?.maxBpm
    );
    expect(easyHeartRateCeiling(200)).toBe(140);
  });

  it("is 0 when the max is unknown", () => {
    expect(easyHeartRateCeiling(0)).toBe(0);
    expect(easyHeartRateCeiling(Number.NaN)).toBe(0);
  });
});

describe("heartRateCoverageBand — how much of a Watch run was measured", () => {
  it("is none, partial below the zone threshold, or full", () => {
    expect(heartRateCoverageBand(null)).toBe("none");
    expect(heartRateCoverageBand({ coverage: 0 })).toBe("none");
    expect(heartRateCoverageBand({ coverage: Number.NaN })).toBe("none");
    expect(heartRateCoverageBand({ coverage: 0.49 })).toBe("partial");
    // The summary card shows time in zone from exactly this share.
    expect(heartRateCoverageBand({ coverage: ZONE_COVERAGE_MIN })).toBe("full");
    expect(heartRateCoverageBand({ coverage: 1 })).toBe("full");
  });
});

/**
 * Segments in the app (Run26 call 3, src/lib/segments.ts): an effort's
 * place among your own, the maker's stretch and its map taps, the stored
 * shapes read at the boundary, the board as the viewer reads it, and the
 * run finish's places (Run30 call 1).
 */
import { describe, it, expect } from "vitest";
import {
  boardRows,
  defaultStretch,
  metresAlong,
  moveNearerEnd,
  nearestPointIndex,
  ownRank,
  parseBoardEntry,
  parseEffort,
  parseSegment,
  rankWords,
  segmentPlacingSentence,
  segmentPlacings,
  segmentRejection,
  type Segment,
  type SegmentEffort,
} from "@/lib/segments";

const effort = (
  id: string,
  elapsedSeconds: number,
  startedAtMs = 1
): SegmentEffort => ({
  id,
  segmentId: "s1",
  runId: `run-${id}`,
  lap: 1,
  elapsedSeconds,
  startedAtMs,
  day: "2026-11-10",
});

/** Points east of a spot in south London, `step` metres apart. */
function trace(count: number, step = 100) {
  const lat = 51.4433;
  const mPerDegLon =
    (Math.PI / 180) * 6371000 * Math.cos((lat * Math.PI) / 180);
  return Array.from({ length: count }, (_, i) => ({
    lat,
    lon: -0.1517 + (i * step) / mPerDegLon,
  }));
}

describe("an effort among your own", () => {
  const own = [effort("a", 260), effort("b", 250), effort("c", 270)];

  it("ranks fastest first", () => {
    expect(ownRank(own[1], own)).toBe(1);
    expect(ownRank(own[0], own)).toBe(2);
    expect(ownRank(own[2], own)).toBe(3);
  });

  it("puts the earlier of two equal times first", () => {
    const tied = [effort("late", 250, 2000), effort("early", 250, 1000)];
    expect(ownRank(tied[1], tied)).toBe(1);
    expect(ownRank(tied[0], tied)).toBe(2);
  });

  it("says the place in words", () => {
    expect(rankWords(1, 1)).toBe("Your first time");
    expect(rankWords(1, 3)).toBe("Your best");
    expect(rankWords(2, 3)).toBe("Your 2nd best");
    expect(rankWords(3, 9)).toBe("Your 3rd best");
    expect(rankWords(4, 9)).toBe("Your 4th best");
    expect(rankWords(11, 20)).toBe("Your 11th best");
    expect(rankWords(21, 30)).toBe("Your 21st best");
    expect(rankWords(22, 30)).toBe("Your 22nd best");
  });
});

describe("the maker's stretch", () => {
  it("opens on the first kilometre, or the whole of a shorter run", () => {
    // Points 120 m apart: the ninth is the first past 1,000 m (1,080 m).
    expect(defaultStretch(trace(30, 120))).toEqual({ from: 0, to: 9 });
    expect(defaultStretch(trace(5))).toEqual({ from: 0, to: 4 });
  });

  it("measures along the run, adding nothing across a gap", () => {
    const points = trace(4);
    const along = metresAlong([
      ...points.slice(0, 2),
      { ...points[2], breakBefore: true },
      points[3],
    ]);
    expect(along[1]).toBeCloseTo(100, 6);
    expect(along[2]).toBeCloseTo(100, 6);
    expect(along[3]).toBeCloseTo(200, 6);
  });

  it("finds the saved point nearest a tap, and moves the nearer end to it", () => {
    const points = trace(30);
    expect(
      nearestPointIndex(points, { ...points[7], lat: points[7].lat + 1e-5 })
    ).toBe(7);
    expect(moveNearerEnd({ from: 5, to: 20 }, 8)).toEqual({ from: 8, to: 20 });
    expect(moveNearerEnd({ from: 5, to: 20 }, 25)).toEqual({ from: 5, to: 25 });
    // Never past the other end.
    expect(moveNearerEnd({ from: 5, to: 6 }, 6)).toEqual({ from: 5, to: 6 });
  });
});

describe("the stored shapes", () => {
  it("reads a segment, and refuses one without a name, length or line", () => {
    const points = trace(3);
    expect(
      parseSegment("s1", { name: " Hill ", lengthMeters: 800, points })
    ).toEqual({ id: "s1", name: "Hill", lengthMeters: 800, points });
    expect(
      parseSegment("s1", { name: "", lengthMeters: 800, points })
    ).toBeNull();
    expect(parseSegment("s1", { name: "Hill", points })).toBeNull();
    expect(
      parseSegment("s1", { name: "Hill", lengthMeters: 800, points: [] })
    ).toBeNull();
  });

  it("reads an effort as the server writes it", () => {
    expect(
      parseEffort("r1_s1_2", {
        uid: "u",
        segmentId: "s1",
        runId: "r1",
        lap: 2,
        elapsedSeconds: 250,
        startedAtMs: 5,
        day: "2026-11-10",
        start: { lat: 1, lon: 2 },
      })
    ).toEqual({
      id: "r1_s1_2",
      segmentId: "s1",
      runId: "r1",
      lap: 2,
      elapsedSeconds: 250,
      startedAtMs: 5,
      day: "2026-11-10",
    });
    expect(parseEffort("x", { segmentId: "s1", runId: "r1" })).toBeNull();
  });

  it("reads a board row, and drops one without a time", () => {
    expect(
      parseBoardEntry({ uid: "b", name: "Bea", elapsedSeconds: 240 })
    ).toMatchObject({ uid: "b", name: "Bea", photoURL: null, day: null });
    expect(parseBoardEntry({ uid: "b" })).toBeNull();
  });
});

describe("the board as the viewer reads it", () => {
  const entries = [
    {
      uid: "bea",
      name: "Bea",
      photoURL: null,
      elapsedSeconds: 240,
      day: "2026-11-09",
      activityId: "p1",
    },
    {
      uid: "cal",
      name: null,
      photoURL: null,
      elapsedSeconds: 300,
      day: null,
      activityId: null,
    },
  ];

  it("places the viewer's own best among the people they follow", () => {
    const rows = boardRows(entries, effort("mine", 260), "me", new Set());
    expect(rows.map((r) => [r.name, r.elapsedSeconds, r.href])).toEqual([
      ["Bea", 240, "/activity/p1"],
      ["You", 260, "/run/run-mine"],
      ["Runner", 300, null],
    ]);
  });

  it("puts the viewer first on a tie, and leaves out anyone blocked since the read", () => {
    const rows = boardRows(
      entries,
      effort("mine", 240),
      "me",
      new Set(["cal"])
    );
    expect(rows.map((r) => r.uid)).toEqual(["me", "bea"]);
  });
});

describe("a refusal in the server's words", () => {
  it("passes on the server's sentence for the refusals it words", () => {
    expect(
      segmentRejection({
        code: "functions/failed-precondition",
        message: "A segment needs to be at least 400 m.",
      })
    ).toBe("A segment needs to be at least 400 m.");
    expect(
      segmentRejection({
        code: "functions/resource-exhausted",
        message: "Too many segments made in the last hour. Try again later.",
      })
    ).toBe("Too many segments made in the last hour. Try again later.");
  });

  it("gives the caller's own words for anything else", () => {
    expect(
      segmentRejection({ code: "functions/internal", message: "INTERNAL" })
    ).toBeNull();
    expect(segmentRejection(new Error("network"))).toBeNull();
  });
});

/* Run30 call 1: the run finish's places, by Run29's rule for distances. */
describe("a run's segment places on the finish", () => {
  const seg = (id: string, name = id): Segment => ({
    id,
    name,
    lengthMeters: 1200,
    points: [],
  });
  const at = (
    id: string,
    segmentId: string,
    elapsedSeconds: number,
    startedAtMs: number
  ): SegmentEffort => ({
    ...effort(id, elapsedSeconds, startedAtMs),
    segmentId,
  });

  it("places an effort among your efforts up to it, with your best before it", () => {
    const now = at("now", "s1", 217, 500);
    const own = [at("a", "s1", 209, 100), at("b", "s1", 230, 200), now];
    expect(segmentPlacings([{ effort: now, segment: seg("s1"), own }])).toEqual(
      [
        {
          segmentId: "s1",
          name: "s1",
          lengthMeters: 1200,
          seconds: 217,
          place: 2,
          bestSeconds: 209,
        },
      ]
    );
  });

  it("shows nothing for the first effort on a segment", () => {
    const now = at("now", "s1", 217, 500);
    expect(
      segmentPlacings([{ effort: now, segment: seg("s1"), own: [now] }])
    ).toEqual([]);
  });

  it("leaves out a place past 3rd, and keeps an equal earlier time ahead", () => {
    const now = at("now", "s1", 220, 500);
    const own = [
      at("a", "s1", 200, 100),
      at("b", "s1", 210, 200),
      at("c", "s1", 220, 300),
      now,
    ];
    expect(
      segmentPlacings([{ effort: now, segment: seg("s1"), own }])
    ).toEqual([]);
  });

  it("is moved by no effort that started after it", () => {
    // A run synced late but run later is not ahead of this one.
    const now = at("now", "s1", 230, 500);
    const own = [at("a", "s1", 240, 100), now, at("later", "s1", 200, 900)];
    expect(
      segmentPlacings([{ effort: now, segment: seg("s1"), own }])[0]
    ).toMatchObject({ place: 1, bestSeconds: 240 });
  });

  it("lists a segment once, its better placed lap, and orders by place", () => {
    const lap1 = at("l1", "s1", 230, 500);
    const lap2 = at("l2", "s1", 205, 700);
    const other = at("o", "s2", 300, 600);
    const own1 = [at("a", "s1", 210, 100), lap1, lap2];
    const own2 = [at("b", "s2", 280, 100), other];
    const placings = segmentPlacings([
      { effort: lap1, segment: seg("s1", "Hill Road"), own: own1 },
      { effort: other, segment: seg("s2", "River path"), own: own2 },
      { effort: lap2, segment: seg("s1", "Hill Road"), own: own1 },
    ]);
    expect(placings.map((p) => [p.name, p.place, p.seconds])).toEqual([
      ["Hill Road", 1, 205],
      ["River path", 2, 300],
    ]);
  });

  it("says the first listed in one sentence", () => {
    const now = at("now", "s1", 217, 500);
    const placings = segmentPlacings([
      {
        effort: now,
        segment: seg("s1", "Hill Road"),
        own: [at("a", "s1", 209, 100), now],
      },
    ]);
    expect(segmentPlacingSentence(placings)).toBe(
      "Ran Hill Road in 3:37, your 2nd best."
    );
    expect(segmentPlacingSentence([])).toBeNull();
  });
});

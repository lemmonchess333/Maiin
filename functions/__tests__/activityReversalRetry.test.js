/**
 * A deleted session's reversal must FAIL when it does not land, so the
 * delete trigger is delivered again (failurePolicy). Both reversals caught
 * and logged their own errors, and the source document is gone by the time
 * they run, so nothing ever re-fired: a contended transaction left the
 * deleted session's challenge credit, tier and lifetime total standing for
 * good. The integration suite (`integration/activityDeleteReversal.test.js`)
 * covers success and redelivery against the emulator; this covers failure,
 * with the memory store failing one commit or read on purpose.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { markerDocId } = require("../lib/challengeMarkers");
const {
  reverseChallengeProgressForSource,
  reverseLifetimeStat,
} = require("../lib/activityReversal");

const UID = "reverser";
const SOURCE = "workout-1";
const JOINED = 1_700_000_000_000;

function participant(challengeId) {
  return `challenges/${challengeId}/participants/${UID}`;
}
function marker(challengeId) {
  return `${participant(challengeId)}/applied/${markerDocId(JOINED, SOURCE, "unused")}`;
}

/** Two challenges this workout credited 100 kg in, each with a marker. */
function seededChallenges() {
  const seed = {};
  for (const id of ["vol-a", "vol-b"]) {
    seed[`challenges/${id}`] = { metric: "total_volume", tiers: {} };
    seed[participant(id)] = { joinedAt: JOINED, currentValue: 300 };
    seed[marker(id)] = { metric: "total_volume", incrementBy: 100 };
  }
  return seed;
}

afterEach(() => vi.restoreAllMocks());

describe("reverseChallengeProgressForSource — failure is reported", () => {
  it("reverses the other challenges, then throws for the one that failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = memoryFirestore(seededChallenges());
    db.failures.set(`set:${participant("vol-a")}`, new Error("ABORTED"));

    await expect(
      reverseChallengeProgressForSource(db, UID, SOURCE)
    ).rejects.toThrow(/vol-a/);

    // The failure stranded nothing else.
    expect(db.data.get(participant("vol-b")).currentValue).toBe(200);
    expect(db.data.has(marker("vol-b"))).toBe(false);
    // And left the failed one exactly as it was, marker included, so the
    // retry has something to reverse.
    expect(db.data.get(participant("vol-a")).currentValue).toBe(300);
    expect(db.data.has(marker("vol-a"))).toBe(true);
  });

  it("a retry reverses only what did not land", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = memoryFirestore(seededChallenges());
    db.failures.set(`set:${participant("vol-a")}`, new Error("ABORTED"));
    await reverseChallengeProgressForSource(db, UID, SOURCE).catch(() => {});

    db.failures.clear();
    await reverseChallengeProgressForSource(db, UID, SOURCE);

    expect(db.data.get(participant("vol-a")).currentValue).toBe(200);
    expect(db.data.get(participant("vol-b")).currentValue).toBe(200);
    expect(db.data.has(marker("vol-a"))).toBe(false);
  });

  it("throws when the challenges cannot be read", async () => {
    const db = memoryFirestore(seededChallenges());
    db.failures.set("query:challenges", new Error("UNAVAILABLE"));
    await expect(
      reverseChallengeProgressForSource(db, UID, SOURCE)
    ).rejects.toThrow("UNAVAILABLE");
    expect(db.data.get(participant("vol-a")).currentValue).toBe(300);
  });

  it("resolves when nothing failed", async () => {
    const db = memoryFirestore(seededChallenges());
    await expect(
      reverseChallengeProgressForSource(db, UID, SOURCE)
    ).resolves.toBeUndefined();
  });
});

describe("reverseLifetimeStat — failure is reported", () => {
  const TOTALS = `users/${UID}/lifetime/totals`;
  const MARKER = `users/${UID}/lifetime/applied_lift_${SOURCE}`;
  const seed = () => ({
    [TOTALS]: { liftVolumeKg: 5000 },
    [MARKER]: { kind: "lift", sourceId: SOURCE, appliedValue: 1200 },
  });

  it("throws when the transaction does not commit, and keeps the marker", async () => {
    const db = memoryFirestore(seed());
    db.failures.set(`update:${TOTALS}`, new Error("ABORTED"));
    await expect(
      reverseLifetimeStat(db, UID, "lift", SOURCE, 0)
    ).rejects.toThrow("ABORTED");
    expect(db.data.get(TOTALS).liftVolumeKg).toBe(5000);
    expect(db.data.has(MARKER)).toBe(true);
  });

  it("applies once across a failure and a retry", async () => {
    const db = memoryFirestore(seed());
    db.failures.set(`update:${TOTALS}`, new Error("ABORTED"));
    await reverseLifetimeStat(db, UID, "lift", SOURCE, 0).catch(() => {});
    db.failures.clear();
    await reverseLifetimeStat(db, UID, "lift", SOURCE, 0);
    await reverseLifetimeStat(db, UID, "lift", SOURCE, 0);
    expect(db.data.get(TOTALS).liftVolumeKg).toBe(3800);
    expect(db.data.has(MARKER)).toBe(false);
  });
});

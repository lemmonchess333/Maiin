// @vitest-environment jsdom — needs DOM/storage APIs; the rest of this directory runs in the fast node environment (audit batch 2).
/**
 * Phase B3 standalone verification — runResumeStorage schema +
 * cutoff + version + corruption semantics. Pins the recoverability
 * contract before any wiring in useRunTimer / useGPS / Run.tsx
 * depends on it.
 *
 * No React, no hooks. Pure localStorage round-trip.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  readStoredRun,
  writeStoredRun,
  clearStoredRun,
  runResumeKey,
  runResumeChunkKey,
  LEGACY_RUN_RESUME_KEY,
  RUN_RESUME_MAX_AGE_MS,
  RUN_RESUME_SCHEMA_VERSION,
  type StoredRun,
} from "../runResumeStorage";
import { freeformPlanMetadata } from "../runPlanMetadata";
import type { RunConfig } from "@/components/run/RunSetupModal";

const UID = "user-A";
/** The uid-scoped key under test — derived, not hardcoded. */
const RUN_RESUME_KEY = runResumeKey(UID);

function makeSnapshot(overrides: Partial<StoredRun> = {}): StoredRun {
  const config: RunConfig = {
    activityType: "easy",
    autoPause: true,
    audioCues: true,
    audioCueFrequency: "every_km",
    paceAlerts: true,
    voiceRate: 0.9,
    displayStats: ["pace", "distance", "time", "calories"],
    target: { type: "none" },
    planMetadata: freeformPlanMetadata("freeform"),
  };
  return {
    v: RUN_RESUME_SCHEMA_VERSION,
    config,
    startedAt: 1_000_000,
    accumulatedSeconds: 120,
    isRunning: true,
    points: [],
    lastWriteAt: 2_000_000,
    phase: "active",
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("writeStoredRun + readStoredRun — round-trip", () => {
  it("writes and reads back an identical snapshot", () => {
    // Bedrock: the JSON serialisation preserves every field the
    // resume flow reads on the way back in.
    const now = 2_000_000;
    const snap = makeSnapshot({ lastWriteAt: now });
    expect(writeStoredRun(UID, snap)).toBe(true);
    const restored = readStoredRun(UID, now);
    expect(restored).not.toBeNull();
    expect(restored).toEqual(snap);
  });

  it("preserves the GPS points buffer through the round-trip", () => {
    // Defensive: points are arrays of objects with numeric
    // timestamps. JSON.stringify rounds nothing but pin the
    // exact shape so a future schema tweak surfaces here.
    const now = 2_000_000;
    const snap = makeSnapshot({
      lastWriteAt: now,
      points: [
        {
          lat: 51.5,
          lon: -0.12,
          timestamp: now - 60_000,
          altitude: 10,
          accuracy: 5,
          speed: null,
          rawLat: 51.5,
          rawLon: -0.12,
        },
        {
          lat: 51.501,
          lon: -0.121,
          timestamp: now - 30_000,
          altitude: 11,
          accuracy: 5,
          speed: null,
          rawLat: 51.501,
          rawLon: -0.121,
        },
      ],
    });
    writeStoredRun(UID, snap);
    const restored = readStoredRun(UID, now);
    expect(restored?.points).toHaveLength(2);
    expect(restored?.points[0].lat).toBe(51.5);
    expect(restored?.points[1].timestamp).toBe(now - 30_000);
  });

  it("preserves planMetadata through the round-trip (Phase B1 carry)", () => {
    // The resumed run must keep its plan adherence — the stored
    // config carries Phase B1's planMetadata block.
    const config: RunConfig = {
      activityType: "tempo",
      autoPause: true,
      audioCues: true,
      audioCueFrequency: "every_km",
      paceAlerts: true,
      voiceRate: 0.9,
      displayStats: ["pace", "distance", "time", "calories"],
      target: { type: "pace", value: 270 },
      planMetadata: {
        planMode: "race_prep",
        planSource: "today_plan",
        plannedRunDayIndex: 2,
        plannedTemplateId: "tempo_20",
        plannedTemplateType: "tempo",
        actualTemplateId: "tempo_20",
        matchedPlanExact: true,
        matchedPlanType: true,
        offPlan: false,
        planWeekIndex: 3,
        planTotalWeeks: 8,
        scheduledRunId: null,
      },
    };
    const now = 2_000_000;
    writeStoredRun(UID, makeSnapshot({ config, lastWriteAt: now }));
    const restored = readStoredRun(UID, now);
    expect(restored?.config.planMetadata.plannedTemplateId).toBe("tempo_20");
    expect(restored?.config.planMetadata.matchedPlanExact).toBe(true);
  });
});

describe("readStoredRun — discard conditions", () => {
  it("returns null when nothing is stored", () => {
    expect(readStoredRun(UID, Date.now())).toBeNull();
  });

  it("discards entries older than the 6h cutoff", () => {
    // lastWriteAt is now-7h; cutoff is 6h → silently dropped AND
    // cleared (subsequent reads see nothing).
    const now = 100_000_000;
    const sevenHoursAgo = now - 7 * 60 * 60 * 1000;
    writeStoredRun(UID, makeSnapshot({ lastWriteAt: sevenHoursAgo }));
    expect(readStoredRun(UID, now)).toBeNull();
    // Defensive: a second read with a younger `now` shouldn't
    // resurrect the entry — read() should have cleared it.
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
  });

  it("accepts entries inside the 6h cutoff", () => {
    const now = 100_000_000;
    const fiveHoursAgo = now - 5 * 60 * 60 * 1000;
    writeStoredRun(UID, makeSnapshot({ lastWriteAt: fiveHoursAgo }));
    expect(readStoredRun(UID, now)).not.toBeNull();
  });

  it("accepts an entry at exactly the cutoff boundary", () => {
    // The check is `> MAX_AGE`, strict, so a tick at the boundary
    // is still accepted. Pin so a refactor doesn't make this
    // inclusive-strict drift.
    const now = 100_000_000;
    const exactlyCutoff = now - RUN_RESUME_MAX_AGE_MS;
    writeStoredRun(UID, makeSnapshot({ lastWriteAt: exactlyCutoff }));
    expect(readStoredRun(UID, now)).not.toBeNull();
  });

  it("discards entries with a different schema version", () => {
    // Hand-craft a meta-shaped entry with the OLD v:1 (single-blob
    // layout) and confirm it silently discards — this is the RUN-06
    // format migration in action (no migration script needed).
    localStorage.setItem(
      RUN_RESUME_KEY,
      JSON.stringify({
        ...makeSnapshot(),
        v: 1,
        pointCount: 0,
        chunkCount: 0,
      })
    );
    expect(readStoredRun(UID, Date.now())).toBeNull();
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
  });

  it("discards corrupt JSON without throwing", () => {
    // Storage was poisoned by another tab / extension / bug. The
    // read path must not propagate the parse error to the live
    // run — it just clears and reports nothing to resume.
    localStorage.setItem(RUN_RESUME_KEY, "not-valid-json{");
    expect(readStoredRun(UID, Date.now())).toBeNull();
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
  });

  it("discards a missing-required-field entry without throwing", () => {
    // Defensive: a hand-edited or partially-written entry might
    // pass JSON.parse but fail the shape check. Don't crash.
    localStorage.setItem(
      RUN_RESUME_KEY,
      JSON.stringify({ v: 1, partial: true })
    );
    expect(readStoredRun(UID, Date.now())).toBeNull();
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
  });

  it("discards entries with an invalid phase value", () => {
    // Phase is restricted to 'active' | 'paused'. A stored
    // 'waiting' or 'finished' would be a write-side bug.
    localStorage.setItem(
      RUN_RESUME_KEY,
      JSON.stringify({
        ...makeSnapshot(),
        phase: "finished",
        pointCount: 0,
        chunkCount: 0,
      })
    );
    expect(readStoredRun(UID, Date.now())).toBeNull();
  });
});

// ─── RUN-06: bounded / incremental chunked persistence ───────────────

/** Build `n` distinct GPS points so chunk boundaries are testable. */
function makePoints(n: number): StoredRun["points"] {
  return Array.from({ length: n }, (_, i) => ({
    lat: 51.5 + i * 1e-5,
    lon: -0.12 + i * 1e-5,
    timestamp: 1_000_000 + i * 1000,
    altitude: 10,
    accuracy: 5,
    speed: null,
    rawLat: 51.5 + i * 1e-5,
    rawLon: -0.12 + i * 1e-5,
  }));
}

describe("RUN-06 chunked persistence", () => {
  it("round-trips a trail spanning multiple chunks", () => {
    const now = 2_000_000;
    // 600 points > 2× CHUNK_SIZE (250) → 3 chunks.
    const snap = makeSnapshot({ lastWriteAt: now, points: makePoints(600) });
    expect(writeStoredRun(UID, snap)).toBe(true);
    // Meta records the split.
    const meta = JSON.parse(localStorage.getItem(RUN_RESUME_KEY)!);
    expect(meta.pointCount).toBe(600);
    expect(meta.chunkCount).toBe(3);
    const restored = readStoredRun(UID, now);
    expect(restored?.points).toHaveLength(600);
    expect(restored?.points[0].timestamp).toBe(1_000_000);
    expect(restored?.points[599].timestamp).toBe(1_000_000 + 599 * 1000);
  });

  it("an incremental append does NOT rewrite sealed chunks", () => {
    const now = 2_000_000;
    // First write: 300 points (chunk 0 sealed [0..249], chunk 1 partial).
    writeStoredRun(
      UID,
      makeSnapshot({ lastWriteAt: now, points: makePoints(300) })
    );
    const setSpy = vi.spyOn(Storage.prototype, "setItem");
    // Second write: same run (same startedAt), 305 points.
    writeStoredRun(
      UID,
      makeSnapshot({ lastWriteAt: now, points: makePoints(305) })
    );
    const writtenKeys = setSpy.mock.calls.map((c) => c[0] as string);
    setSpy.mockRestore();
    // Chunk 0 (sealed) must NOT be rewritten; the current partial
    // chunk 1 and the meta ARE.
    expect(writtenKeys).not.toContain(runResumeChunkKey(UID, 0));
    expect(writtenKeys).toContain(runResumeChunkKey(UID, 1));
    expect(writtenKeys).toContain(RUN_RESUME_KEY);
    // …and the append is still correct on read-back.
    expect(readStoredRun(UID, now)?.points).toHaveLength(305);
  });

  it("a fresh run (new startedAt) wipes the previous run's chunks", () => {
    const now = 2_000_000;
    writeStoredRun(
      UID,
      makeSnapshot({ lastWriteAt: now, startedAt: 1, points: makePoints(600) })
    );
    // A different run reuses the key with fewer points.
    writeStoredRun(
      UID,
      makeSnapshot({ lastWriteAt: now, startedAt: 2, points: makePoints(10) })
    );
    // The old run's chunk 2 must be gone (new run only has chunk 0).
    expect(localStorage.getItem(runResumeChunkKey(UID, 2))).toBeNull();
    expect(localStorage.getItem(runResumeChunkKey(UID, 1))).toBeNull();
    const restored = readStoredRun(UID, now);
    expect(restored?.points).toHaveLength(10);
    expect(restored?.startedAt).toBe(2);
  });

  it("discards the whole run when a points chunk is missing", () => {
    const now = 2_000_000;
    writeStoredRun(
      UID,
      makeSnapshot({ lastWriteAt: now, points: makePoints(600) })
    );
    // Simulate a torn / evicted chunk.
    localStorage.removeItem(runResumeChunkKey(UID, 1));
    expect(readStoredRun(UID, now)).toBeNull();
    // …and the discard cleaned up meta + remaining chunks.
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
    expect(localStorage.getItem(runResumeChunkKey(UID, 0))).toBeNull();
    expect(localStorage.getItem(runResumeChunkKey(UID, 2))).toBeNull();
  });

  it("clearStoredRun removes every chunk, not just the meta", () => {
    const now = 2_000_000;
    writeStoredRun(
      UID,
      makeSnapshot({ lastWriteAt: now, points: makePoints(600) })
    );
    clearStoredRun(UID);
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
    for (let i = 0; i < 3; i++) {
      expect(localStorage.getItem(runResumeChunkKey(UID, i))).toBeNull();
    }
  });
});

describe("clearStoredRun", () => {
  it("removes a stored entry", () => {
    writeStoredRun(UID, makeSnapshot());
    expect(localStorage.getItem(RUN_RESUME_KEY)).not.toBeNull();
    clearStoredRun(UID);
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
  });

  it("is a no-op when no entry exists", () => {
    expect(() => clearStoredRun(UID)).not.toThrow();
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
  });

  it("is idempotent on repeated calls", () => {
    writeStoredRun(UID, makeSnapshot());
    clearStoredRun(UID);
    clearStoredRun(UID);
    clearStoredRun(UID);
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
  });
});

describe("writeStoredRun — failure modes", () => {
  it("returns false when localStorage.setItem throws (quota / private mode)", () => {
    // Force setItem to throw. The function must not propagate.
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceeded");
    };
    try {
      const result = writeStoredRun(UID, makeSnapshot());
      expect(result).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe("readStoredRun — getItem throw guard", () => {
  it("returns null when localStorage.getItem throws", () => {
    // Some quota-throttled browsers throw on getItem under
    // pressure. Pin the silent-null path.
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("Storage error");
    };
    try {
      expect(readStoredRun(UID, Date.now())).toBeNull();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

// ─── Cross-account leak defence (uid scoping + legacy migration) ──────

describe("uid scoping — cross-account leak defence", () => {
  it("writes under a uid-scoped key, not the legacy global key", () => {
    // The whole point of the fix: a snapshot must land at
    // `<prefix>:<uid>`, never the un-scoped global key that account B
    // would also read on a shared device.
    writeStoredRun(UID, makeSnapshot());
    expect(localStorage.getItem(runResumeKey(UID))).not.toBeNull();
    expect(localStorage.getItem(LEGACY_RUN_RESUME_KEY)).toBeNull();
  });

  it("scopes keys per uid — distinct users get distinct keys", () => {
    expect(runResumeKey("user-A")).not.toBe(runResumeKey("user-B"));
    expect(runResumeKey("user-A")).toContain("user-A");
  });

  it("never returns user A's snapshot when reading as user B", () => {
    // The HIGH finding: user B must not be offered user A's GPS trail.
    const now = 2_000_000;
    writeStoredRun("user-A", makeSnapshot({ lastWriteAt: now }));
    expect(readStoredRun("user-B", now)).toBeNull();
    // ...and user A still reads their own snapshot back.
    expect(readStoredRun("user-A", now)).not.toBeNull();
  });

  it("clearStoredRun only clears the given uid's entry", () => {
    const now = 2_000_000;
    writeStoredRun("user-A", makeSnapshot({ lastWriteAt: now }));
    writeStoredRun("user-B", makeSnapshot({ lastWriteAt: now }));
    clearStoredRun("user-A");
    expect(readStoredRun("user-A", now)).toBeNull();
    // user-B's entry is untouched.
    expect(readStoredRun("user-B", now)).not.toBeNull();
  });

  it("drops the legacy un-scoped key on the first read", () => {
    // A pre-scoping snapshot sitting at the global key must be purged
    // on the next read so it can never surface under the wrong account.
    localStorage.setItem(LEGACY_RUN_RESUME_KEY, JSON.stringify(makeSnapshot()));
    // Reading (even with no scoped entry for this uid) drops the legacy key.
    expect(readStoredRun(UID, 2_000_000)).toBeNull();
    expect(localStorage.getItem(LEGACY_RUN_RESUME_KEY)).toBeNull();
  });

  it("writeStoredRun / clearStoredRun no-op without a uid", () => {
    // Defensive: a missing uid (signed-out edge) must never write to or
    // clear a global key.
    expect(writeStoredRun("", makeSnapshot())).toBe(false);
    expect(() => clearStoredRun("")).not.toThrow();
    expect(localStorage.getItem(LEGACY_RUN_RESUME_KEY)).toBeNull();
  });
});

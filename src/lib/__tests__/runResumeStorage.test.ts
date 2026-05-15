/**
 * Phase B3 standalone verification — runResumeStorage schema +
 * cutoff + version + corruption semantics. Pins the recoverability
 * contract before any wiring in useRunTimer / useGPS / Run.tsx
 * depends on it.
 *
 * No React, no hooks. Pure localStorage round-trip.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readStoredRun,
  writeStoredRun,
  clearStoredRun,
  RUN_RESUME_KEY,
  RUN_RESUME_MAX_AGE_MS,
  RUN_RESUME_SCHEMA_VERSION,
  type StoredRun,
} from "../runResumeStorage";
import { freeformPlanMetadata } from "../runPlanMetadata";
import type { RunConfig } from "@/components/run/RunSetupModal";

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
    expect(writeStoredRun(snap)).toBe(true);
    const restored = readStoredRun(now);
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
        { lat: 51.5, lon: -0.12, timestamp: now - 60_000, altitude: 10, accuracy: 5, speed: null, rawLat: 51.5, rawLon: -0.12 },
        { lat: 51.501, lon: -0.121, timestamp: now - 30_000, altitude: 11, accuracy: 5, speed: null, rawLat: 51.501, rawLon: -0.121 },
      ],
    });
    writeStoredRun(snap);
    const restored = readStoredRun(now);
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
    writeStoredRun(makeSnapshot({ config, lastWriteAt: now }));
    const restored = readStoredRun(now);
    expect(restored?.config.planMetadata.plannedTemplateId).toBe("tempo_20");
    expect(restored?.config.planMetadata.matchedPlanExact).toBe(true);
  });
});

describe("readStoredRun — discard conditions", () => {
  it("returns null when nothing is stored", () => {
    expect(readStoredRun(Date.now())).toBeNull();
  });

  it("discards entries older than the 6h cutoff", () => {
    // lastWriteAt is now-7h; cutoff is 6h → silently dropped AND
    // cleared (subsequent reads see nothing).
    const now = 100_000_000;
    const sevenHoursAgo = now - 7 * 60 * 60 * 1000;
    writeStoredRun(makeSnapshot({ lastWriteAt: sevenHoursAgo }));
    expect(readStoredRun(now)).toBeNull();
    // Defensive: a second read with a younger `now` shouldn't
    // resurrect the entry — read() should have cleared it.
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
  });

  it("accepts entries inside the 6h cutoff", () => {
    const now = 100_000_000;
    const fiveHoursAgo = now - 5 * 60 * 60 * 1000;
    writeStoredRun(makeSnapshot({ lastWriteAt: fiveHoursAgo }));
    expect(readStoredRun(now)).not.toBeNull();
  });

  it("accepts an entry at exactly the cutoff boundary", () => {
    // The check is `> MAX_AGE`, strict, so a tick at the boundary
    // is still accepted. Pin so a refactor doesn't make this
    // inclusive-strict drift.
    const now = 100_000_000;
    const exactlyCutoff = now - RUN_RESUME_MAX_AGE_MS;
    writeStoredRun(makeSnapshot({ lastWriteAt: exactlyCutoff }));
    expect(readStoredRun(now)).not.toBeNull();
  });

  it("discards entries with a different schema version", () => {
    // Hand-craft a v: 0 entry (older schema) and confirm it
    // silently discards. Bump the SCHEMA_VERSION const next time
    // we ship an incompatible change.
    localStorage.setItem(
      RUN_RESUME_KEY,
      JSON.stringify({
        ...makeSnapshot(),
        v: 0,
      }),
    );
    expect(readStoredRun(Date.now())).toBeNull();
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
  });

  it("discards corrupt JSON without throwing", () => {
    // Storage was poisoned by another tab / extension / bug. The
    // read path must not propagate the parse error to the live
    // run — it just clears and reports nothing to resume.
    localStorage.setItem(RUN_RESUME_KEY, "not-valid-json{");
    expect(readStoredRun(Date.now())).toBeNull();
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
  });

  it("discards a missing-required-field entry without throwing", () => {
    // Defensive: a hand-edited or partially-written entry might
    // pass JSON.parse but fail the shape check. Don't crash.
    localStorage.setItem(
      RUN_RESUME_KEY,
      JSON.stringify({ v: 1, partial: true }),
    );
    expect(readStoredRun(Date.now())).toBeNull();
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
  });

  it("discards entries with an invalid phase value", () => {
    // Phase is restricted to 'active' | 'paused'. A stored
    // 'waiting' or 'finished' would be a write-side bug.
    localStorage.setItem(
      RUN_RESUME_KEY,
      JSON.stringify({ ...makeSnapshot(), phase: "finished" }),
    );
    expect(readStoredRun(Date.now())).toBeNull();
  });
});

describe("clearStoredRun", () => {
  it("removes a stored entry", () => {
    writeStoredRun(makeSnapshot());
    expect(localStorage.getItem(RUN_RESUME_KEY)).not.toBeNull();
    clearStoredRun();
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
  });

  it("is a no-op when no entry exists", () => {
    expect(() => clearStoredRun()).not.toThrow();
    expect(localStorage.getItem(RUN_RESUME_KEY)).toBeNull();
  });

  it("is idempotent on repeated calls", () => {
    writeStoredRun(makeSnapshot());
    clearStoredRun();
    clearStoredRun();
    clearStoredRun();
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
      const result = writeStoredRun(makeSnapshot());
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
      expect(readStoredRun(Date.now())).toBeNull();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

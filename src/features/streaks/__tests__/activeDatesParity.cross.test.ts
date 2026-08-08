/**
 * Cross-test: the streak-nudge cron's active-date derivation
 * (functions/lib/activeDates.js) must agree with the client's
 * computeActiveDateSet (ADR-0008 — running copies against each other).
 *
 * The seam: the client's active-date set decides what the STREAK shows;
 * the server's re-derivation decides whether the streak NUDGE thinks
 * today is active. If they disagree, the nudge skips a user whose real
 * streak is about to break (server over-counts) or nags a user who
 * already trained (server under-counts). The mirror was declared in
 * prose since #961 and never pinned — and the eligibility half had
 * already drifted: the server counted EVERY run doc while the client
 * drops isInvalid / savedAnyway / sub-threshold runs at its snapshot
 * boundary, so one junk record silenced the nudge on exactly the night
 * it mattered (fixed alongside this pin).
 *
 * Both sides are fed the SAME raw docs: the client applies its snapshot
 * boundary (isVolumeEligible filter, Timestamp rows) then
 * computeActiveDateSet; the server gets plain rows + the device's own
 * timezone, mirroring index.js's mapping. Equality must hold in
 * whatever timezone the test host runs.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { computeActiveDateSet } from "../useStreaks";
import { isVolumeEligible } from "@/lib/runStatsEligibility";

const require_ = createRequire(import.meta.url);
const { activeDateKeysFromLogs } = require_(
  "../../../../functions/lib/activeDates"
) as {
  activeDateKeysFromLogs: (
    logs: {
      workouts?: { date?: string }[];
      runs?: {
        completedAtMs?: number;
        isInvalid?: boolean;
        savedAnyway?: boolean;
        distance?: number;
        duration?: number;
      }[];
      meals?: { date?: string; items?: unknown[] }[];
    },
    timezone: string | null | undefined
  ) => string[];
};

const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Raw run docs as Firestore holds them (epoch ms + eligibility fields). */
interface RawRun {
  ms: number;
  isInvalid?: boolean;
  savedAnyway?: boolean;
  distance?: number;
  duration?: number;
}

/** The client's snapshot boundary: eligibility filter, Timestamp-like rows. */
function clientSet(
  workouts: { date: string }[],
  rawRuns: RawRun[],
  meals: { date: string; items: unknown[] }[]
): string[] {
  const rows = rawRuns
    .filter((r) => isVolumeEligible(r))
    .map((r) => ({
      completedAt: { toDate: () => new Date(r.ms) },
    }));
  return Array.from(
    computeActiveDateSet(
      workouts,
      rows as unknown as Parameters<typeof computeActiveDateSet>[1],
      meals
    )
  ).sort();
}

/** The server's mapping, exactly as maybeSendStreakNudge builds it. */
function serverSet(
  workouts: { date: string }[],
  rawRuns: RawRun[],
  meals: { date: string; items: unknown[] }[]
): string[] {
  return activeDateKeysFromLogs(
    {
      workouts,
      runs: rawRuns.map((r) => ({
        completedAtMs: r.ms,
        isInvalid: r.isInvalid,
        savedAnyway: r.savedAnyway,
        distance: r.distance,
        duration: r.duration,
      })),
      meals,
    },
    deviceTz
  ).sort();
}

const NOON = Date.parse("2026-06-01T12:00:00Z");
const GOOD = { distance: 5000, duration: 1800 };

describe("client active-date set ≡ server streak-nudge derivation", () => {
  it("agrees on a mixed journey: workouts, eligible + junk runs, real + draft meals", () => {
    const workouts = [{ date: "2026-06-01" }, { date: "" }];
    const runs: RawRun[] = [
      { ms: NOON, ...GOOD },
      { ms: NOON + 86_400_000, ...GOOD, isInvalid: true },
      { ms: NOON + 86_400_000, ...GOOD, savedAnyway: true },
      { ms: NOON + 2 * 86_400_000, distance: 20, duration: 1800 }, // sub-50m
      { ms: NOON + 2 * 86_400_000, distance: 5000, duration: 2 }, // sub-30s
      { ms: NOON + 3 * 86_400_000, ...GOOD },
    ];
    const meals = [
      { date: "2026-06-05", items: [{ x: 1 }] },
      { date: "2026-06-06", items: [] }, // draft — neither side counts it
    ];

    const client = clientSet(workouts, runs, meals);
    const server = serverSet(workouts, runs, meals);
    expect(server).toEqual(client);
    // Anchor the equality on a positive: the junk-run days must be ABSENT
    // from both, not just "equal" (two wrong sets can agree).
    expect(client).toContain("2026-06-05");
    for (const day of client) {
      expect(["2026-06-02", "2026-06-03"]).not.toContain(day);
    }
  });

  it("a day contributed ONLY by a junk run is inactive on both sides", () => {
    // The drifted case: pre-fix the server counted this run and the
    // nudge skipped the user; the client never counted it.
    const runs: RawRun[] = [{ ms: NOON, ...GOOD, savedAnyway: true }];
    expect(clientSet([], runs, [])).toEqual([]);
    expect(serverSet([], runs, [])).toEqual([]);
  });

  it("agrees on empty input", () => {
    expect(serverSet([], [], [])).toEqual(clientSet([], [], []));
  });
});

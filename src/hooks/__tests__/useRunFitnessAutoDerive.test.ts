import { describe, it, expect, vi } from "vitest";
import { resolveAutoDerive } from "../useRunFitnessAutoDerive";
import { parseSavedRun, type SavedRun } from "@/lib/savedRuns";
import { manualRunFitness, trainingBands, vdotFromRace } from "@/lib/runPaces";

/* Every run here is written as the app saves it (`runDocument`'s fields)
   and read back by the app's own parser, so the tests hold what the hook
   sees in production. */
const dayKey = (day: number) => `2026-08-${String(day).padStart(2, "0")}`;

const savedRun = (
  id: string,
  run: {
    activityType: string;
    km: number;
    minutes: number;
    day: number;
    workPortion?: { seconds: number; meters: number } | null;
    segments?: Record<string, unknown>[];
  }
): SavedRun => {
  const parsed = parseSavedRun(id, {
    distance: run.km * 1000,
    duration: run.minutes * 60,
    avgPace: (run.minutes * 60) / run.km,
    completedAt: new Date(`${dayKey(run.day)}T08:00:00Z`),
    date: dayKey(run.day),
    activityType: run.activityType,
    runConfig: {
      activityType: run.activityType,
      ...(run.segments ? { segments: run.segments } : {}),
    },
    workPortion: run.workPortion ?? null,
    isInvalid: false,
    savedAnyway: false,
  });
  if (!parsed) throw new Error(`${id} did not read back`);
  return parsed;
};

const easy = (day: number, km = 5, minutes = 30) =>
  savedRun(`easy-${String(day)}`, { activityType: "easy", km, minutes, day });
const race = (day: number, km = 5, minutes = 24) =>
  savedRun(`race-${String(day)}`, { activityType: "race", km, minutes, day });

/** tempo_20 as the run screen sets it out: a 5-minute warm-up, the
 *  20-minute tempo block, a 5-minute cool-down. */
const tempoSegments = (pinnedPace?: number) => [
  { type: "warmup", target: { kind: "duration", seconds: 300 } },
  {
    type: "moderate",
    target: { kind: "duration", seconds: 1200 },
    ...(pinnedPace ? { paceTarget: pinnedPace, pacePinned: true } : {}),
  },
  { type: "cooldown", target: { kind: "duration", seconds: 300 } },
];
/** The pace a VDOT of 40 prescribes a tempo: the middle of its threshold
 *  band, as `resolveSessionPaces("tempo")` sets it. */
const [tFast, tSlow] = trainingBands(40).threshold;
const TEMPO_PACE_40 = Math.round((tFast + tSlow) / 2);
/** A tempo held at that pace for `workMinutes`, with the warm-up and
 *  cool-down jogged at 7:00 /km. */
const tempo = (
  day: number,
  opts: {
    workMinutes?: number;
    recorded?: boolean;
    pinnedPace?: number;
  } = {}
) => {
  const workSeconds = (opts.workMinutes ?? 20) * 60;
  const workMeters = (workSeconds / TEMPO_PACE_40) * 1000;
  const jogMeters = (600 / 420) * 1000;
  return savedRun(`tempo-${String(day)}`, {
    activityType: "tempo",
    km: (workMeters + jogMeters) / 1000,
    minutes: (workSeconds + 600) / 60,
    day,
    workPortion:
      opts.recorded === false
        ? null
        : { seconds: workSeconds, meters: workMeters },
    segments: tempoSegments(opts.pinnedPace),
  });
};

/** Mounts the hook over `runs` and a profile holding `runFitness`; returns
 *  the profile writer it was given. */
const derive = async (runs: SavedRun[], runFitness?: unknown) => {
  vi.resetModules();
  const updateProfile = vi.fn().mockResolvedValue({ ok: true });
  vi.doMock("@/lib/auth", () => ({
    useAuth: () => ({
      profile: { uid: "u-1", runFitness: runFitness ?? null },
      updateProfile,
    }),
  }));
  vi.doMock("../useRunningStats", () => ({
    useRunningStats: () => ({ loading: false, runs }),
  }));
  const { useRunFitnessAutoDerive: hook } =
    await import("../useRunFitnessAutoDerive");
  const { renderHook, act } = await import("@testing-library/react");
  renderHook(() => hook());
  await act(async () => {});
  vi.doUnmock("@/lib/auth");
  vi.doUnmock("../useRunningStats");
  vi.resetModules();
  return updateProfile;
};
const written = (updateProfile: ReturnType<typeof vi.fn>) =>
  (updateProfile.mock.calls[0][0] as { runFitness: Record<string, unknown> })
    .runFitness;

const NOW = new Date("2026-08-20T09:00:00Z");

describe("resolveAutoDerive", () => {
  it("derives nothing with no effort in the window", () => {
    expect(resolveAutoDerive(null, [easy(1), easy(3)], NOW)).toBeNull();
    expect(resolveAutoDerive(undefined, [], NOW)).toBeNull();
  });

  it("takes the effort implying the highest VDOT, with its provenance (RUN-EV-08)", () => {
    const next = resolveAutoDerive(
      null,
      [race(2, 5, 25), tempo(4), race(6, 10, 48)],
      NOW
    );
    // The 10K in 48:00 is VDOT 41.9: over the 5K in 25:00 (38.3) and the
    // tempo held at VDOT 40's tempo pace.
    expect(next?.effort).toMatchObject({ kind: "race", id: "race-6" });
    expect(next?.runFitness).toEqual({
      benchmark: { distanceM: 10000, timeS: 2880 },
      vdot: Math.round(vdotFromRace(10000, 2880) * 10) / 10,
      source: "derived",
      updatedAt: "2026-08-20T09:00:00.000Z",
      pendingConfirmation: true,
      sourceRunId: "race-6",
      sourceRunAt: "2026-08-06T08:00:00.000Z",
    });
  });

  it("never replaces a benchmark the person set, however good the race", () => {
    const setup = manualRunFitness(
      { benchmark: { distanceM: 5000, timeS: 1650 }, vdot: 34.4 },
      new Date("2026-07-01T09:00:00Z")
    );
    expect(resolveAutoDerive(setup, [race(9, 5, 19)], NOW)).toBeNull();
    expect(resolveAutoDerive(null, [race(9, 5, 19)], NOW)).not.toBeNull();
  });
});

describe("useRunFitnessAutoDerive — the write (RUN-EV-08 two-tier consent)", () => {
  it("writes the derived benchmark PENDING, with provenance", async () => {
    const updateProfile = await derive([
      race(1, 5, 25),
      race(2, 5, 20),
      race(3, 5, 25),
    ]);
    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(written(updateProfile)).toMatchObject({
      benchmark: { distanceM: 5000, timeS: 1200 },
      source: "derived",
      pendingConfirmation: true,
      sourceRunId: "race-2",
      sourceRunAt: "2026-08-02T08:00:00.000Z",
    });
  });

  /* Run20 (5): a run-walk's time includes its walks, so it measures no
     one's running. A new runner's first weeks are all run-walk, and three
     of them made a benchmark of their walking pace. A run-walk session is
     saved as the easy run it is, so since Pgm8 R1 it is no effort. */
  it("derives nothing from a run-walk", async () => {
    const runWalks = [1, 3, 5].map((day) =>
      savedRun(`run-walk-${String(day)}`, {
        activityType: "easy",
        km: 3.3,
        minutes: 30,
        day,
      })
    );
    expect(await derive(runWalks)).not.toHaveBeenCalled();
    expect(await derive([...runWalks, race(7, 5, 34)])).toHaveBeenCalledTimes(
      1
    );
  });
});

/* Pgm8 R1 (owner-delegated, 2026-10-11): the derived benchmark comes from
   efforts only (a race, a time trial, a tempo's work segments), never from
   easy runs. The simulator's F17: the best of a runner's first easy runs,
   read as a race, put the benchmark 6.7–9.7 VDOT under the runner, and the
   run summary, which reads a pending benchmark at once, then told them to
   slow down on most easy and long runs. */
describe("Pgm8 R1: the benchmark comes from efforts only", () => {
  it("derives nothing from easy runs, however many, and a race among them sets it", async () => {
    const easyRuns = [easy(1), easy(3, 6, 33), easy(5, 8, 46), easy(7, 5, 27)];
    expect(await derive(easyRuns)).not.toHaveBeenCalled();

    const updateProfile = await derive([...easyRuns, race(9)]);
    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(written(updateProfile)).toMatchObject({
      benchmark: { distanceM: 5000, timeS: 1440 },
      sourceRunId: "race-9",
    });
  });

  it("derives nothing from long runs, intervals or free runs", async () => {
    const others = [
      savedRun("long", { activityType: "long", km: 15, minutes: 95, day: 1 }),
      savedRun("intervals", {
        activityType: "intervals",
        km: 7,
        minutes: 40,
        day: 3,
        workPortion: { seconds: 1200, meters: 5000 },
      }),
      savedRun("free", { activityType: "freerun", km: 6, minutes: 30, day: 5 }),
    ];
    expect(await derive(others)).not.toHaveBeenCalled();
    expect(await derive([...others, tempo(7)])).toHaveBeenCalledTimes(1);
  });

  it("takes one race as the benchmark: pending, with the race as its source", async () => {
    const updateProfile = await derive([race(4, 10, 50)]);
    expect(updateProfile).toHaveBeenCalledTimes(1);
    expect(written(updateProfile)).toMatchObject({
      benchmark: { distanceM: 10000, timeS: 3000 },
      vdot: Math.round(vdotFromRace(10000, 3000) * 10) / 10,
      source: "derived",
      pendingConfirmation: true,
      sourceRunId: "race-4",
      sourceRunAt: "2026-08-04T08:00:00.000Z",
    });
  });

  it("reads a tempo by its work segments, as threshold pace, not the whole run as a race", async () => {
    const updateProfile = await derive([tempo(6)]);
    expect(updateProfile).toHaveBeenCalledTimes(1);
    const fitness = written(updateProfile);
    // A tempo is no race, so it stores no race result: the VDOT is what
    // the tempo implies, and the predictions come from it.
    expect(fitness.benchmark).toBeNull();
    // A tempo held at the pace VDOT 40 prescribes gives VDOT 40 back.
    expect(Math.abs((fitness.vdot as number) - 40)).toBeLessThanOrEqual(0.15);
    expect(fitness).toMatchObject({
      source: "derived",
      pendingConfirmation: true,
      sourceRunId: "tempo-6",
    });
  });

  it("derives nothing from a tempo with no record of its work segments", async () => {
    expect(
      await derive([tempo(6, { recorded: false })])
    ).not.toHaveBeenCalled();
    expect(await derive([tempo(6)])).toHaveBeenCalledTimes(1);
  });

  it("derives nothing from a goal-pace tempo: its pace was the plan's goal, not the runner's", async () => {
    expect(
      await derive([tempo(6, { pinnedPace: TEMPO_PACE_40 })])
    ).not.toHaveBeenCalled();
    expect(await derive([tempo(6)])).toHaveBeenCalledTimes(1);
  });

  it("derives nothing from a tempo cut well short", async () => {
    expect(await derive([tempo(6, { workMinutes: 5 })])).not.toHaveBeenCalled();
    expect(await derive([tempo(6, { workMinutes: 20 })])).toHaveBeenCalledTimes(
      1
    );
  });

  it("never overwrites the recent race time entered at setup", async () => {
    const setup = manualRunFitness(
      { benchmark: { distanceM: 5000, timeS: 1650 }, vdot: 34.4 },
      new Date("2026-07-01T09:00:00Z")
    );
    expect(await derive([race(9, 5, 21)], setup)).not.toHaveBeenCalled();
    expect(await derive([race(9, 5, 21)])).toHaveBeenCalledTimes(1);
  });

  /* A benchmark the old rule derived and the person hasn't accepted is
     measurement-only (RUN-EV-08), so it follows the rule like a new one:
     re-derived from the efforts, or cleared when there are none. One they
     accepted is theirs. */
  describe("a pending benchmark the old rule derived from an easy run", () => {
    const fromEasy = (pendingConfirmation: boolean) => ({
      benchmark: { distanceM: 5000, timeS: 1800 },
      vdot: 30.9,
      source: "derived",
      updatedAt: "2026-08-02T09:00:00.000Z",
      pendingConfirmation,
      sourceRunId: "easy-1",
      sourceRunAt: "2026-08-01T08:00:00.000Z",
    });

    it("is derived again from the efforts", async () => {
      const updateProfile = await derive(
        [easy(1), easy(3), race(9)],
        fromEasy(true)
      );
      expect(updateProfile).toHaveBeenCalledTimes(1);
      expect(written(updateProfile)).toMatchObject({
        benchmark: { distanceM: 5000, timeS: 1440 },
        pendingConfirmation: true,
        sourceRunId: "race-9",
      });
    });

    it("is cleared when there is no effort to derive one from", async () => {
      const updateProfile = await derive([easy(1), easy(3)], fromEasy(true));
      expect(updateProfile).toHaveBeenCalledTimes(1);
      expect(updateProfile.mock.calls[0][0]).toEqual({ runFitness: null });
    });

    it("stays once the person has accepted it", async () => {
      expect(
        await derive([easy(1), easy(3), race(9)], fromEasy(false))
      ).not.toHaveBeenCalled();
      expect(
        await derive([easy(1), easy(3), race(9)], fromEasy(true))
      ).toHaveBeenCalledTimes(1);
    });

    it("stays when its run is out of the window: no run, no evidence", async () => {
      expect(
        await derive([easy(3), race(9)], fromEasy(true))
      ).not.toHaveBeenCalled();
      expect(
        await derive([easy(1), easy(3), race(9)], fromEasy(true))
      ).toHaveBeenCalledTimes(1);
    });
  });

  it("derives again a pending benchmark the old rule read from a tempo's whole run", async () => {
    const run = tempo(6);
    const wholeRun = {
      benchmark: { distanceM: run.distance, timeS: run.duration },
      vdot: Math.round(vdotFromRace(run.distance, run.duration) * 10) / 10,
      source: "derived",
      updatedAt: "2026-08-07T09:00:00.000Z",
      pendingConfirmation: true,
      sourceRunId: "tempo-6",
      sourceRunAt: "2026-08-06T08:00:00.000Z",
    };
    const updateProfile = await derive([easy(1), run], wholeRun);
    expect(updateProfile).toHaveBeenCalledTimes(1);
    const fitness = written(updateProfile);
    expect(fitness.benchmark).toBeNull();
    expect(Math.abs((fitness.vdot as number) - 40)).toBeLessThanOrEqual(0.15);
    // The whole run, read as a race, was nearly 7 VDOT under it.
    expect((fitness.vdot as number) - wholeRun.vdot).toBeGreaterThan(4);
  });

  it("leaves a pending benchmark the efforts rule set", async () => {
    const fromRace = {
      benchmark: { distanceM: 5000, timeS: 1440 },
      vdot: Math.round(vdotFromRace(5000, 1440) * 10) / 10,
      source: "derived",
      updatedAt: "2026-08-10T09:00:00.000Z",
      pendingConfirmation: true,
      sourceRunId: "race-9",
      sourceRunAt: "2026-08-09T08:00:00.000Z",
    };
    expect(
      await derive([easy(1), race(9), race(11, 5, 22)], fromRace)
    ).not.toHaveBeenCalled();
    // The same benchmark, had the old rule set it from the easy run.
    expect(
      await derive([easy(1), race(9), race(11, 5, 22)], {
        ...fromRace,
        sourceRunId: "easy-1",
      })
    ).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi } from "vitest";
import { resolveAutoDeriveBenchmark } from "../useRunFitnessAutoDerive";

const runs = [
  { distanceM: 5000, durationS: 1500 }, // 25:00 5K
  { distanceM: 5000, durationS: 1200 }, // 20:00 5K — best
  { distanceM: 10000, durationS: 3000 }, // 50:00 10K
];

describe("resolveAutoDeriveBenchmark", () => {
  it("returns null when the user already has fitness set", () => {
    expect(resolveAutoDeriveBenchmark(true, runs)).toBeNull();
  });

  it("returns null with fewer than 3 eligible runs", () => {
    expect(resolveAutoDeriveBenchmark(false, runs.slice(0, 2))).toBeNull();
  });

  it("derives the best-effort benchmark from enough eligible runs", () => {
    expect(resolveAutoDeriveBenchmark(false, runs)).toEqual({
      distanceM: 5000,
      timeS: 1200,
    });
  });

  it("returns null when none of the runs are representative (all < 2km)", () => {
    expect(
      resolveAutoDeriveBenchmark(false, [
        { distanceM: 800, durationS: 200 },
        { distanceM: 1000, durationS: 300 },
        { distanceM: 1500, durationS: 400 },
      ])
    ).toBeNull();
  });

  it("carries the winning run's provenance through (RUN-EV-08)", () => {
    const withIds = runs.map((r, i) => ({
      ...r,
      id: `run-${i}`,
      completedAt: new Date(`2026-08-0${i + 1}T08:00:00Z`),
    }));
    expect(resolveAutoDeriveBenchmark(false, withIds)).toMatchObject({
      distanceM: 5000,
      timeS: 1200,
      sourceRunId: "run-1",
      sourceRunAt: "2026-08-02T08:00:00.000Z",
    });
  });
});

describe("useRunFitnessAutoDerive — the write (RUN-EV-08 two-tier consent)", () => {
  it("writes the derived benchmark PENDING, with provenance", async () => {
    vi.resetModules();
    const updateProfile = vi.fn().mockResolvedValue({ ok: true });
    vi.doMock("@/lib/auth", () => ({
      useAuth: () => ({
        profile: { uid: "u-1", runFitness: undefined },
        updateProfile,
      }),
    }));
    vi.doMock("../useRunningStats", () => ({
      useRunningStats: () => ({
        loading: false,
        runs: [0, 1, 2].map((i) => ({
          id: `run-${i}`,
          distance: 5000,
          duration: i === 1 ? 1200 : 1500,
          avgPace: 4,
          elevationGain: 0,
          calories: 0,
          activityType: "freerun",
          completedAt: new Date(`2026-08-0${i + 1}T08:00:00Z`),
          isOutdoor: true,
        })),
      }),
    }));
    vi.doMock("@/lib/runStatsEligibility", () => ({
      isPaceEligible: () => true,
    }));
    const { useRunFitnessAutoDerive: hook } =
      await import("../useRunFitnessAutoDerive");
    const { renderHook, waitFor } = await import("@testing-library/react");
    renderHook(() => hook());
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    const patch = updateProfile.mock.calls[0][0] as {
      runFitness: Record<string, unknown>;
    };
    expect(patch.runFitness).toMatchObject({
      benchmark: { distanceM: 5000, timeS: 1200 },
      source: "derived",
      pendingConfirmation: true,
      sourceRunId: "run-1",
      sourceRunAt: "2026-08-02T08:00:00.000Z",
    });
    vi.doUnmock("@/lib/auth");
    vi.doUnmock("../useRunningStats");
    vi.doUnmock("@/lib/runStatsEligibility");
    vi.resetModules();
  });

  /* Run20 (5): a run-walk's time includes its walks, so it measures no
     one's running. A new runner's first weeks are all run-walk, and three
     of them made a benchmark of their walking pace. */
  describe("leaves out a run-walk", () => {
    const run = (i: number, duration: number, templateId?: string) => ({
      id: `run-${i}`,
      distance: 5000,
      duration,
      avgPace: duration / 5,
      elevationGain: 0,
      calories: 0,
      activityType: "freerun",
      completedAt: new Date(`2026-08-0${i + 1}T08:00:00Z`),
      isOutdoor: true,
      ...(templateId ? { templateId } : {}),
    });
    const derive = async (runs: ReturnType<typeof run>[]) => {
      vi.resetModules();
      const updateProfile = vi.fn().mockResolvedValue({ ok: true });
      vi.doMock("@/lib/auth", () => ({
        useAuth: () => ({
          profile: { uid: "u-1", runFitness: undefined },
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

    it("deriving from the runs around it", async () => {
      const updateProfile = await derive([
        run(0, 1500),
        run(1, 1100, "run_walk_4"),
        run(2, 1400),
        run(3, 1450),
      ]);
      expect(updateProfile).toHaveBeenCalledTimes(1);
      expect(updateProfile.mock.calls[0][0]).toMatchObject({
        runFitness: {
          benchmark: { distanceM: 5000, timeS: 1400 },
          sourceRunId: "run-2",
        },
      });
    });

    it("deriving nothing from run-walks alone", async () => {
      const updateProfile = await derive([
        run(0, 2100, "run_walk_1"),
        run(1, 2000, "run_walk_2"),
        run(2, 1900, "run_walk_3"),
      ]);
      expect(updateProfile).not.toHaveBeenCalled();
    });
  });
});

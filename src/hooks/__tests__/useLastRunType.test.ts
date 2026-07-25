/**
 * useLastRunType — the RunTilePicker's "Repeat <type>" memory.
 *
 * Cheap to test now the seam exists (ADR-0009): one `getDocs` over a seeded
 * runs collection. It was exempt from the coverage gate purely because the
 * setup used to cost ~50 lines of bespoke stubbing.
 *
 * Worth covering because the repeat offer is a claim about the user's
 * history. Showing "Repeat tempo" to someone whose last two runs weren't
 * both tempo is a small lie on a launch surface, and the rule that prevents
 * it has three separate ways to say no: eligibility, agreement, and the
 * direct-launch whitelist.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: {} }),
}));

import { useLastRunType } from "../useLastRunType";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
} from "@/test/firestoreHarness";

/** `completedAt` drives the newest-first ordering the hook relies on. */
function run(
  completedAt: number,
  activityType: string,
  over: Record<string, unknown> = {}
) {
  return { completedAt, activityType, distance: 5000, duration: 1500, ...over };
}

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  mockUser = { uid: "u1" };
});

describe("useLastRunType", () => {
  it("offers the repeat when the two most recent runs agree", async () => {
    seedFirestore({
      "users/u1/runs/r3": run(300, "tempo"),
      "users/u1/runs/r2": run(200, "tempo"),
      "users/u1/runs/r1": run(100, "easy"),
    });
    const { result } = renderHook(() => useLastRunType());
    await waitFor(() => expect(result.current).toBe("tempo"));
  });

  it("offers nothing when the two most recent runs DISAGREE", async () => {
    // The rule is about a habit, not a single session.
    seedFirestore({
      "users/u1/runs/r2": run(200, "tempo"),
      "users/u1/runs/r1": run(100, "easy"),
    });
    const { result } = renderHook(() => useLastRunType());
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("needs two runs — one is not a habit", async () => {
    seedFirestore({ "users/u1/runs/r1": run(100, "tempo") });
    const { result } = renderHook(() => useLastRunType());
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("skips ineligible runs when picking the two most recent", async () => {
    // A GPS-glitch save sits between two real tempo runs. Ignoring
    // eligibility would compare tempo against the glitch and offer nothing
    // — the user loses their repeat row because of a bad save.
    seedFirestore({
      "users/u1/runs/r3": run(300, "tempo"),
      "users/u1/runs/bogus": run(250, "easy", {
        distance: 40000,
        duration: 8,
        isInvalid: true,
      }),
      "users/u1/runs/r1": run(100, "tempo"),
    });
    const { result } = renderHook(() => useLastRunType());
    await waitFor(() => expect(result.current).toBe("tempo"));
  });

  it("offers nothing for a type the picker can't launch directly", async () => {
    // Only easy/tempo/long/freerun have a direct-launch tile; offering
    // "Repeat intervals" would point at a tile that doesn't exist.
    seedFirestore({
      "users/u1/runs/r2": run(200, "intervals"),
      "users/u1/runs/r1": run(100, "intervals"),
    });
    const { result } = renderHook(() => useLastRunType());
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("stays silent when the read fails", async () => {
    // Failure must not surface on a launch surface — the picker simply
    // renders without the repeat row.
    seedFirestore({
      "users/u1/runs/r2": run(200, "tempo"),
      "users/u1/runs/r1": run(100, "tempo"),
    });
    failNextFirestore("getDocs", { path: "users/u1/runs" });
    const { result } = renderHook(() => useLastRunType());
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("offers nothing when signed out", async () => {
    mockUser = null;
    const { result } = renderHook(() => useLastRunType());
    await waitFor(() => expect(result.current).toBeNull());
  });
});

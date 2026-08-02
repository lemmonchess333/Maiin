/**
 * useLastRunType — the RunTilePicker's "Repeat <type>" memory.
 *
 * Cheap to test now the seam exists (ADR-0009): one `getDocs` over a seeded
 * runs collection. It was exempt from the coverage gate purely because the
 * setup used to cost ~50 lines of bespoke stubbing.
 *
 * The "offers nothing" cases were VACUOUS until 2026-07-26. `repeatType`
 * starts null, so `await waitFor(() => expect(result.current).toBeNull())`
 * passed on its first poll from the initial state, before the read had
 * resolved. Mutating the hook to set "easy" AFTER the read — i.e. offering
 * a repeat row to every user, including signed-out ones — left 5 of the 7
 * tests green. They now release the read explicitly first (see
 * `renderAfterRead`), so the assertion is about the settled state.
 *
 * Worth covering because the repeat offer is a claim about the user's
 * history. Showing "Repeat tempo" to someone whose last two runs weren't
 * both tempo is a small lie on a launch surface, and the rule that prevents
 * it has three separate ways to say no: eligibility, agreement, and the
 * direct-launch whitelist.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: {} }),
  useUid: () => ({ user: mockUser, profile: {} }).user?.uid ?? null,
}));

import { useLastRunType } from "../useLastRunType";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
  deferReads,
  pendingReads,
  releaseRead,
} from "@/test/firestoreHarness";

const RUNS = "users/u1/runs";

/**
 * Render and wait until the hook's read has actually LANDED.
 *
 * The hook exposes only `repeatType`, which starts null — so
 * `await waitFor(() => expect(result.current).toBeNull())` is satisfied
 * on the first poll by the INITIAL state and returns before the read
 * resolves. Every "offers nothing" case was therefore vacuous: a hook
 * that wrongly offered a repeat to everyone, after the read, passed all
 * five of them. (Verified by mutation — see the header.)
 *
 * Holding the read and releasing it explicitly makes "nothing was
 * offered" an assertion about the settled state rather than the initial
 * one. It is the positive anchor this hook has no loading flag to give.
 */
async function renderAfterRead() {
  deferReads();
  const rendered = renderHook(() => useLastRunType());
  await waitFor(() => expect(pendingReads()).toEqual([RUNS]));
  await act(async () => {
    expect(releaseRead()).toBe(true);
  });
  return rendered;
}

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
    const { result } = await renderAfterRead();
    expect(result.current).toBeNull();
  });

  it("needs two runs — one is not a habit", async () => {
    seedFirestore({ "users/u1/runs/r1": run(100, "tempo") });
    const { result } = await renderAfterRead();
    expect(result.current).toBeNull();
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
    const { result } = await renderAfterRead();
    expect(result.current).toBeNull();
  });

  it("stays silent when the read fails", async () => {
    // Failure must not surface on a launch surface — the picker simply
    // renders without the repeat row.
    seedFirestore({
      "users/u1/runs/r2": run(200, "tempo"),
      "users/u1/runs/r1": run(100, "tempo"),
    });
    failNextFirestore("getDocs", { path: "users/u1/runs" });
    // No read to release — `failNextFirestore` throws at the SDK entry,
    // before the deferral. Not vacuous for the same reason: the async
    // mutation that fooled the others never reaches its setState here.
    const { result } = renderHook(() => useLastRunType());
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("offers nothing when signed out", async () => {
    mockUser = null;
    // No read is issued at all when signed out, so there is nothing to
    // anchor on — and nothing that could set a late wrong value either.
    const { result } = renderHook(() => useLastRunType());
    await waitFor(() => expect(result.current).toBeNull());
  });
});

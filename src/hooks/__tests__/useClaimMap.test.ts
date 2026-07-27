/**
 * PR-J chunk B3a — useClaimMap hook tests.
 *
 * The hook is mostly plumbing — the heavy lifting (date window,
 * quality bucket, single-claim walk) lives in `computeClaims` and
 * is exhaustively covered by:
 *   - functions/__tests__/scheduledRunCompletion.test.js (29 tests)
 *   - src/lib/__tests__/scheduledRunCompletion.cross.test.ts (parity)
 *
 * So this file pins ONLY hook-level behaviour:
 *   - subscription lifecycle (no user → empty, user → onSnapshot)
 *   - downstream wiring: snapshot rows reach computeClaims
 *   - Q3 P90: unclaimedByDate shares the same memo / excludes
 *     claimed savedRunIds
 *   - dateAnchor override (test hook for midnight-rollover effects)
 *
 * MIGRATED off the inline SDK factory 2026-07-26 (ADR-0009: one fake).
 * The old version stubbed `onSnapshot` to capture its callback and then
 * `pumpSnapshot()`d fabricated docs straight into it, so the suite fed
 * the hook rather than the hook reading a store. Runs are now real
 * documents under `users/u1/runs`, delivered by the fake's own
 * subscription — which means the `orderBy("createdAt", "desc")` in the
 * query is exercised rather than bypassed, and "no user ⇒ no
 * subscription" can be asserted against the read log instead of against
 * the stub's own array.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";
import {
  seedFirestore,
  resetFirestore,
  readLog,
  flushSnapshots,
} from "@/test/firestoreHarness";

const mockUser: { uid: string } | null = { uid: "u1" };
let currentUser: { uid: string } | null = mockUser;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: currentUser }),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore");

interface ProgramStateLike {
  runDays?: Array<Record<string, unknown>>;
  manualCompletions?: Record<string, unknown>;
}
let mockProgramState: ProgramStateLike | null = null;

vi.mock("@/features/program/useProgram", () => ({
  useProgram: () => ({ programState: mockProgramState }),
}));

import { useClaimMap } from "../useClaimMap";

const RUNS = "users/u1/runs";

/** Seed saved-run documents the hook's own subscription will deliver. */
function seedRuns(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  const tree: Record<string, Record<string, unknown>> = {};
  for (const d of docs) tree[`${RUNS}/${d.id}`] = d.data;
  seedFirestore(tree);
}

/** How many times the hook subscribed to the runs collection. */
const runSubscriptions = () =>
  readLog().filter((r) => r.op === "onSnapshot" && r.path === RUNS).length;

describe("useClaimMap", () => {
  beforeEach(() => {
    resetFirestore();
    currentUser = mockUser;
    mockProgramState = null;
  });

  /**
   * Race day must complete on a race-templated run REGARDLESS of pace.
   * You can pace a friend, have a bad day, or run it as a fun run — it is
   * still the race, and gating on pace is how a genuine race day gets
   * left incomplete.
   *
   * This went unreachable in two independent ways at once, and the
   * fixtures below are deliberately production-shaped so neither can come
   * back:
   *   - `runDay.templateId` is `5k_race`, never the literal "race";
   *   - the saved doc carries `actualTemplateId`, NOT a plain `templateId`
   *     (RunSummary writes no such field), so the adapter's value was
   *     undefined for every real run.
   * An easy `avgPace` is used so the short-circuit is the ONLY thing that
   * can complete the slot — with it broken, the pace-bucket check rejects.
   */
  it("completes race day on a race-templated run at an EASY pace", async () => {
    mockProgramState = {
      runDays: [
        {
          id: "rd-race",
          date: "2026-05-26",
          dayIndex: 2,
          templateId: "5k_race", // real id — never the literal "race"
          type: "race",
          status: "planned",
        },
      ],
    };
    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    await act(async () => {
      seedRuns([
        {
          id: "run-race",
          data: {
            date: "2026-05-26",
            distance: 5000,
            duration: 1800,
            avgPace: 360, // 6:00/km — "easy" bucket, not quality
            actualTemplateId: "5k_race", // the field docs actually carry
            completedAt: { seconds: 1780000000 },
          },
        },
      ]);
      await flushSnapshots();
    });

    expect(result.current.claimMap.get("rd-race")?.claimedSavedRunId).toBe(
      "run-race"
    );
  });

  it("returns empty result and skips subscription when there is no user", () => {
    currentUser = null;
    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    expect(runSubscriptions()).toBe(0);
    expect(result.current.claimMap.size).toBe(0);
    expect(result.current.unclaimedByDate.size).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it("subscribes once and derives the claim map from snapshot + programState", async () => {
    mockProgramState = {
      runDays: [
        {
          id: "rd-1",
          date: "2026-05-26",
          dayIndex: 2,
          templateId: "easy-5k",
          type: "easy",
          status: "planned",
        },
      ],
      manualCompletions: {},
    };

    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    expect(runSubscriptions()).toBe(1);

    await act(async () => {
      seedRuns([
        {
          id: "saved-1",
          data: {
            date: "2026-05-26",
            distance: 5000,
            avgPace: 330,
            templateId: "easy-5k",
            createdAt: Timestamp.fromMillis(1716700000_000),
          },
        },
      ]);
      await flushSnapshots();
    });

    const claim = result.current.claimMap.get("rd-1");
    expect(claim?.claimedSavedRunId).toBe("saved-1");
    expect(result.current.unclaimedByDate.size).toBe(0);
  });

  it("returns unclaimed saved runs keyed by date when no slot matches (Q3 P90)", async () => {
    // Plan has nothing on this date — the saved run can't claim a slot.
    mockProgramState = { runDays: [], manualCompletions: {} };

    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    await act(async () => {
      seedRuns([
        {
          id: "extra-1",
          data: {
            date: "2026-05-26",
            distance: 8000,
            avgPace: 300,
            templateId: "freerun",
            createdAt: Timestamp.fromMillis(1716700000_000),
          },
        },
      ]);
      await flushSnapshots();
    });

    const extras = result.current.unclaimedByDate.get("2026-05-26");
    expect(extras).toHaveLength(1);
    expect(extras?.[0].id).toBe("extra-1");
    expect(result.current.claimMap.size).toBe(0);
  });

  it("propagates manualCompletions into the claim map without a saved-run match", async () => {
    mockProgramState = {
      runDays: [
        {
          id: "rd-2",
          date: "2026-05-20",
          dayIndex: 3,
          templateId: "easy-5k",
          type: "easy",
          status: "planned",
        },
      ],
      manualCompletions: {
        "rd-2": { runDayId: "rd-2", completedAt: 1716000000_000 },
      },
    };

    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    await act(async () => {
      seedRuns([]);
    });

    const claim = result.current.claimMap.get("rd-2");
    expect(claim?.manualCompleted).toBe(true);
    expect(claim?.claimedSavedRunId).toBeUndefined();
  });

  it("uses dateAnchor override so callers can drive midnight-rollover behaviour", () => {
    mockProgramState = { runDays: [], manualCompletions: {} };
    const { result: r1 } = renderHook(() => useClaimMap("2026-05-26"));
    expect(r1.current.today).toBe("2026-05-26");

    const { result: r2 } = renderHook(() => useClaimMap("2026-06-01"));
    expect(r2.current.today).toBe("2026-06-01");
  });
});

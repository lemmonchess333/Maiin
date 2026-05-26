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
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Timestamp } from "firebase/firestore";

const mockUser: { uid: string } | null = { uid: "u1" };
let currentUser: { uid: string } | null = mockUser;

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: currentUser }),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

const snapshotListeners: Array<
  (snap: {
    docs: Array<{ id: string; data: () => Record<string, unknown> }>;
  }) => void
> = [];
const unsubscribeCalls: Array<() => void> = [];

vi.mock("firebase/firestore", async () => {
  const actual =
    await vi.importActual<typeof import("firebase/firestore")>(
      "firebase/firestore"
    );
  return {
    ...actual,
    collection: vi.fn(),
    query: vi.fn((c: unknown) => c),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(
      (
        _q: unknown,
        onNext: (snap: {
          docs: Array<{ id: string; data: () => Record<string, unknown> }>;
        }) => void
      ) => {
        snapshotListeners.push(onNext);
        const unsub = vi.fn();
        unsubscribeCalls.push(unsub);
        return unsub;
      }
    ),
  };
});

interface ProgramStateLike {
  runDays?: Array<Record<string, unknown>>;
  manualCompletions?: Record<string, unknown>;
}
let mockProgramState: ProgramStateLike | null = null;

vi.mock("@/features/program/useProgram", () => ({
  useProgram: () => ({ programState: mockProgramState }),
}));

import { useClaimMap } from "../useClaimMap";

function pumpSnapshot(
  docs: Array<{ id: string; data: Record<string, unknown> }>
) {
  snapshotListeners.forEach((l) =>
    l({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) })
  );
}

describe("useClaimMap", () => {
  beforeEach(() => {
    snapshotListeners.length = 0;
    unsubscribeCalls.length = 0;
    currentUser = mockUser;
    mockProgramState = null;
  });

  it("returns empty result and skips subscription when there is no user", () => {
    currentUser = null;
    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    expect(snapshotListeners).toHaveLength(0);
    expect(result.current.claimMap.size).toBe(0);
    expect(result.current.unclaimedByDate.size).toBe(0);
    expect(result.current.loading).toBe(false);
  });

  it("subscribes once and derives the claim map from snapshot + programState", () => {
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
    expect(snapshotListeners).toHaveLength(1);

    act(() => {
      pumpSnapshot([
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
    });

    const claim = result.current.claimMap.get("rd-1");
    expect(claim?.claimedSavedRunId).toBe("saved-1");
    expect(result.current.unclaimedByDate.size).toBe(0);
  });

  it("returns unclaimed saved runs keyed by date when no slot matches (Q3 P90)", () => {
    // Plan has nothing on this date — the saved run can't claim a slot.
    mockProgramState = { runDays: [], manualCompletions: {} };

    const { result } = renderHook(() => useClaimMap("2026-05-26"));
    act(() => {
      pumpSnapshot([
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
    });

    const extras = result.current.unclaimedByDate.get("2026-05-26");
    expect(extras).toHaveLength(1);
    expect(extras?.[0].id).toBe("extra-1");
    expect(result.current.claimMap.size).toBe(0);
  });

  it("propagates manualCompletions into the claim map without a saved-run match", () => {
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
    act(() => {
      pumpSnapshot([]);
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

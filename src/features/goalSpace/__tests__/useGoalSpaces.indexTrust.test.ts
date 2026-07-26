import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// CIRCLE-INDEX-TRUST-01: a superseded / late reload must not overwrite
// newer state. We control the two-stage read's promise timing so an
// OLDER reload resolves AFTER a newer one, and assert it's dropped.
//
// MIGRATED off the inline SDK factory 2026-07-26 (ADR-0009: one fake).
// The queue classified this as an "ordinary migration"; it is actually a
// DEFERRED-READS case — it holds `getDocs` open to force the ordering —
// so it was blocked on the same fake capability as the account-switch
// suites and only became migratable once `deferReads` shipped.
//
// The old version handed out a resolver per `getDocs` call and let each
// test invent that call's result (`journeyResolvers[1](["B"])`). Nothing
// tied a reload's answer to any stored data, so "reload #1 saw A, reload
// #2 saw B" was asserted by construction rather than produced. Here the
// store is reseeded between the two reloads and the fake snapshots at
// ISSUE time, so each reload genuinely fetched what was there when it
// started — which is the situation the generation guard exists for.
//
// Scope note: `goalSpaceTypes` stays mocked. This migration is about
// removing the second Firestore implementation, not about widening the
// suite into the parser.

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/firestoreWrite", () => ({ addDocGuarded: vi.fn() }));
vi.mock("@/lib/dateHelpers", () => ({ localWeekKey: () => "2026-07-12" }));
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn()),
}));
vi.mock("firebase/firestore");

vi.mock("../goalSpaceTypes", () => ({
  parseGoalSpace: (d: { id: string; ownerId: string; createdAt: number }) => ({
    id: d.id,
    ownerId: d.ownerId,
    createdAt: d.createdAt,
  }),
  parseGoalSpaceEvent: () => null,
  checkEventPayload: () => ({ ok: true }),
}));

import { useGoalSpaces } from "../useGoalSpaces";
import {
  seedFirestore,
  resetFirestore,
  deferReads,
  resumeReads,
  pendingReads,
  releaseRead,
} from "@/test/firestoreHarness";

const JOURNEYS = "users/me/journeys";

/** Point the single journey link at one space, and make sure that space
 *  exists. `id` is also the doc id, so the fake's paths read literally. */
function linkTo(id: string) {
  seedFirestore({
    [`${JOURNEYS}/link1`]: { goalSpaceId: id },
    [`goalSpaces/${id}`]: { id, ownerId: "me", createdAt: 1 },
  });
}

describe("useGoalSpaces — CIRCLE-INDEX-TRUST-01 generation guard", () => {
  beforeEach(() => {
    resetFirestore();
  });
  afterEach(() => {
    resetFirestore();
  });

  it("a late (superseded) reload does not overwrite the newer result", async () => {
    linkTo("A");
    deferReads();

    const { result } = renderHook(() => useGoalSpaces("me"));

    // The mount effect fired reload #1. Its journeys read is held, and
    // was snapshotted while the link still pointed at "A".
    await waitFor(() => expect(pendingReads()).toEqual([JOURNEYS]));

    // The circle set changes under us, then a newer reload starts.
    linkTo("B");
    act(() => {
      void result.current.reload();
    });
    await waitFor(() => expect(pendingReads()).toEqual([JOURNEYS, JOURNEYS]));

    // Stop holding NEW reads — the per-space `getDoc` stage each reload
    // runs after its journeys read should resolve normally. Only the two
    // already-held journeys reads stay under test control, which is
    // where the ordering being tested actually lives.
    resumeReads();

    // Resolve the NEWER reload first. POSITIVE anchor: the assertion
    // below is a negative, and would pass at t=0 against the initial
    // empty state if nothing had landed first.
    await act(async () => {
      expect(releaseRead(1)).toBe(true);
    });
    await waitFor(() =>
      expect(result.current.circles.map((c) => c.space.id)).toEqual(["B"])
    );

    // Now the OLDER reload completes late, carrying "A" — the generation
    // guard must drop it, leaving "B" in place.
    await act(async () => {
      expect(releaseRead(0)).toBe(true);
    });
    expect(result.current.circles.map((c) => c.space.id)).toEqual(["B"]);
  });
});

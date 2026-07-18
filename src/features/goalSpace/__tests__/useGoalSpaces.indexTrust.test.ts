import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// CIRCLE-INDEX-TRUST-01: a superseded / late reload must not overwrite
// newer state. We control the two-stage read's promise timing so an
// OLDER reload resolves AFTER a newer one, and assert it's dropped.

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/firestoreWrite", () => ({ addDocGuarded: vi.fn() }));
vi.mock("@/lib/dateHelpers", () => ({ localWeekKey: () => "2026-07-12" }));
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn(() => vi.fn()),
}));

// getDocs (journeys) — hand out a resolver per call so tests order them.
const journeyResolvers: Array<(docs: string[]) => void> = [];
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, _c: string, id: string) => ({ id })),
  getDoc: vi.fn(async (ref: { id: string }) => ({
    exists: () => true,
    data: () => ({ id: ref.id, ownerId: "me", createdAt: 1 }),
  })),
  getDocs: vi.fn(
    () =>
      new Promise((resolve) => {
        journeyResolvers.push((ids: string[]) =>
          resolve({
            docs: ids.map((id) => ({ data: () => ({ goalSpaceId: id }) })),
          })
        );
      })
  ),
  getFunctions: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

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

describe("useGoalSpaces — CIRCLE-INDEX-TRUST-01 generation guard", () => {
  beforeEach(() => {
    journeyResolvers.length = 0;
  });

  it("a late (superseded) reload does not overwrite the newer result", async () => {
    const { result } = renderHook(() => useGoalSpaces("me"));

    // The mount effect fired reload #1 → journeyResolvers[0] is waiting.
    await waitFor(() => expect(journeyResolvers.length).toBe(1));

    // Kick a newer reload #2 → journeyResolvers[1].
    act(() => {
      void result.current.reload();
    });
    await waitFor(() => expect(journeyResolvers.length).toBe(2));

    // Resolve the NEWER reload first with circle "B".
    await act(async () => {
      journeyResolvers[1](["B"]);
    });
    await waitFor(() =>
      expect(result.current.circles.map((c) => c.space.id)).toEqual(["B"])
    );

    // Now the OLDER reload completes late with circle "A" — it must be
    // dropped, leaving "B" in place.
    await act(async () => {
      journeyResolvers[0](["A"]);
      await Promise.resolve();
    });
    expect(result.current.circles.map((c) => c.space.id)).toEqual(["B"]);
  });
});

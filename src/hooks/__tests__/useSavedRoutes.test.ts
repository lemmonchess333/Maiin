/**
 * useSavedRoutes — the run-setup route picker's list of the owner's saved
 * routes (users/{uid}/savedRoutes).
 *
 * Driven through the one Firestore fake (ADR-0009): `listSavedRoutes` is a
 * plain `getDocs`, so `deferReads` can hold it and choose the order two
 * accounts' answers land in.
 *
 * What is pinned is account ownership. A route is a trace of where someone
 * runs, so the picker must never offer one account's routes to another: not
 * after a sign-out, not while the next account's list is loading, and not
 * when the previous account's list answers late. Each absence below is
 * asserted after a positive has landed (the first account's list), so none
 * of them can pass from the empty initial state.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockUid: string | null = "u1";
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mockUid ? { uid: mockUid } : null,
    profile: mockUid ? { uid: mockUid } : null,
  }),
  useUid: () => mockUid,
}));

import { useSavedRoutes } from "../useSavedRoutes";
import { coordsToPoints } from "@/lib/savedRoutes";
import {
  seedFirestore,
  resetFirestore,
  failNextFirestore,
  deferReads,
  resumeReads,
  pendingReads,
  releaseRead,
} from "@/test/firestoreHarness";
import { Timestamp } from "firebase/firestore";

function route(name: string, createdAtMs: number) {
  return {
    name,
    distanceMeters: 1200,
    source: "run",
    coords: [0, 51, 0.01, 51.01],
    createdAt: Timestamp.fromMillis(createdAtMs),
  };
}

const names = (routes: { name: string }[]) => routes.map((r) => r.name);

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  mockUid = "u1";
  seedFirestore({
    "users/u1/savedRoutes/a": route("Canal loop", 2000),
    "users/u2/savedRoutes/b": route("Park laps", 1000),
  });
});

describe("useSavedRoutes", () => {
  it("lists the signed-in account's routes", async () => {
    const { result } = renderHook(() => useSavedRoutes());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(names(result.current.routes)).toEqual(["Canal loop"]);
    expect(result.current.error).toBe(false);
  });

  it("save refreshes the list with the new route", async () => {
    const { result } = renderHook(() => useSavedRoutes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.save({
        name: "Hill repeats",
        source: "run",
        points: coordsToPoints([0, 51, 0.01, 51.01]),
      });
    });
    expect(saved).toBe(true);
    expect(names(result.current.routes)).toContain("Hill repeats");
    expect(result.current.loading).toBe(false);
  });

  it("a failed reload keeps the routes already shown and reports it", async () => {
    const { result } = renderHook(() => useSavedRoutes());
    await waitFor(() =>
      expect(names(result.current.routes)).toEqual(["Canal loop"])
    );

    failNextFirestore("getDocs", { path: "users/u1/savedRoutes" });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.error).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(names(result.current.routes)).toEqual(["Canal loop"]);
  });
});

describe("useSavedRoutes — account ownership", () => {
  it("drops the routes on sign-out", async () => {
    const { result, rerender } = renderHook(() => useSavedRoutes());
    await waitFor(() =>
      expect(names(result.current.routes)).toEqual(["Canal loop"])
    );

    mockUid = null;
    rerender();
    expect(result.current.routes).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("never offers account A's routes to account B while B's list loads", async () => {
    const { result, rerender } = renderHook(() => useSavedRoutes());
    await waitFor(() =>
      expect(names(result.current.routes)).toEqual(["Canal loop"])
    );

    deferReads();
    mockUid = "u2";
    rerender();
    await waitFor(() =>
      expect(pendingReads()).toEqual(["users/u2/savedRoutes"])
    );
    expect(result.current.routes).toEqual([]);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      expect(releaseRead()).toBe(true);
    });
    expect(names(result.current.routes)).toEqual(["Park laps"]);
    expect(result.current.loading).toBe(false);
  });

  it("A's list answering late never replaces B's", async () => {
    deferReads();
    const { result, rerender } = renderHook(() => useSavedRoutes());
    await waitFor(() =>
      expect(pendingReads()).toEqual(["users/u1/savedRoutes"])
    );

    mockUid = "u2";
    rerender();
    await waitFor(() =>
      expect(pendingReads()).toEqual([
        "users/u1/savedRoutes",
        "users/u2/savedRoutes",
      ])
    );
    resumeReads();

    // B answers first, then A answers LATE — the leak interleaving.
    await act(async () => {
      expect(releaseRead(1)).toBe(true);
    });
    expect(names(result.current.routes)).toEqual(["Park laps"]);
    await act(async () => {
      expect(releaseRead(0)).toBe(true);
    });
    expect(names(result.current.routes)).toEqual(["Park laps"]);
    expect(result.current.loading).toBe(false);
  });
});

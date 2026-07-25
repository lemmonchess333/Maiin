/**
 * usePrivacyZones — the persistence wrapper around GPS privacy zones.
 *
 * The geometry (does this point fall inside a zone?) is pure and already
 * pinned in `privacyZones.test.ts`. What was uncovered is everything around
 * it: the live list, the defaults applied to sparse documents, and the two
 * writes.
 *
 * Worth covering because the defaults are a safety property. A zone whose
 * `radiusMeters` is missing falls back to 500m — if that fallback ever
 * became 0, the zone would silently stop hiding anything while still
 * appearing in the user's list as protection they think they have.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

let mockUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: {} }),
}));

import { usePrivacyZones } from "../usePrivacyZones";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  allPaths,
  flushSnapshots,
  failNextFirestore,
} from "@/test/firestoreHarness";

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
  mockUser = { uid: "u1" };
});

describe("reading zones", () => {
  it("lists the user's zones", async () => {
    seedFirestore({
      "users/u1/privacyZones/home": {
        name: "Home",
        lat: 51.5,
        lon: -0.12,
        radiusMeters: 300,
      },
    });
    const { result } = renderHook(() => usePrivacyZones());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.zones).toEqual([
      { id: "home", name: "Home", lat: 51.5, lon: -0.12, radiusMeters: 300 },
    ]);
  });

  it("defaults a sparse document to a REAL radius, never zero", async () => {
    // A 0m radius would hide nothing while still appearing in the list as
    // protection the user believes they have.
    seedFirestore({ "users/u1/privacyZones/z1": { lat: 51.5, lon: -0.12 } });
    const { result } = renderHook(() => usePrivacyZones());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.zones[0]).toMatchObject({
      name: "Zone",
      radiusMeters: 500,
    });
  });

  it("is LIVE — a zone added elsewhere appears", async () => {
    const { result } = renderHook(() => usePrivacyZones());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.zones).toHaveLength(0);

    seedFirestore({
      "users/u1/privacyZones/new": { name: "Gym", lat: 1, lon: 2 },
    });
    await flushSnapshots();

    expect(result.current.zones).toHaveLength(1);
  });

  it("stops loading when the subscription errors", async () => {
    failNextFirestore("onSnapshot", { times: 5 });
    const { result } = renderHook(() => usePrivacyZones());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.zones).toEqual([]);
  });
});

describe("writing zones", () => {
  it("adds a zone under the user's collection", async () => {
    const { result } = renderHook(() => usePrivacyZones());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addZone({
        name: "Home",
        lat: 51.5,
        lon: -0.12,
        radiusMeters: 400,
      });
    });

    const [path] = allPaths();
    expect(path).toMatch(/^users\/u1\/privacyZones\//);
    expect(readDoc(path)).toMatchObject({ name: "Home", radiusMeters: 400 });
  });

  it("removes a zone", async () => {
    seedFirestore({
      "users/u1/privacyZones/z1": { name: "Home", lat: 1, lon: 2 },
      "users/u1/privacyZones/z2": { name: "Gym", lat: 3, lon: 4 },
    });
    const { result } = renderHook(() => usePrivacyZones());
    await waitFor(() => expect(result.current.zones).toHaveLength(2));

    await act(async () => {
      await result.current.removeZone("z1");
    });
    await flushSnapshots();

    expect(result.current.zones.map((z) => z.id)).toEqual(["z2"]);
  });

  it("writes nothing when signed out", async () => {
    mockUser = null;
    const { result } = renderHook(() => usePrivacyZones());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addZone({
        name: "Home",
        lat: 1,
        lon: 2,
        radiusMeters: 400,
      });
    });

    expect(allPaths()).toEqual([]);
  });
});

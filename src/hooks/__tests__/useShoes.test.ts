/**
 * useShoes — third exemplar of the ADR-0009 Firestore seam, picked for the
 * shape the other two don't cover: a mutation-heavy hook whose writes go
 * through the guarded wrappers (`addDocGuarded` / `updateDocGuarded`) and a
 * reconciler that reads a whole collection and commits an atomic batch.
 *
 * The reconciler is the reason it's worth testing: it exists because shoe
 * mileage silently stayed at zero for every run started from the default
 * shoe, and it applies the same run-eligibility gate the rest of the app
 * uses. Both of those are rules about DATA, so a stub that returns a fixed
 * array cannot check them — you need a store you can seed and then read
 * back.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, functions: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), log: vi.fn(), info: vi.fn() },
}));

// Hoisted: useShoes keys its subscription on `user` by identity.
const mockUser = { uid: "u1" };
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockUser, profile: {} }),
}));

import { useShoes } from "../useShoes";
import {
  seedFirestore,
  resetFirestore,
  readDoc,
  flushSnapshots,
  failNextFirestore,
} from "@/test/firestoreHarness";

function shoe(name: string, over: Record<string, unknown> = {}) {
  return {
    name,
    brand: "Brand",
    totalKm: 0,
    maxKm: 600,
    isDefault: false,
    retired: false,
    alert85Shown: false,
    alert100Shown: false,
    ...over,
  };
}

async function mounted() {
  const { result } = renderHook(() => useShoes());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

beforeEach(() => {
  resetFirestore();
  vi.clearAllMocks();
});

describe("loading", () => {
  it("sorts retired shoes to the bottom and defaults missing fields", async () => {
    seedFirestore({
      "users/u1/shoes/old": shoe("Old", { retired: true }),
      "users/u1/shoes/new": { name: "New" }, // sparse legacy doc
    });
    const result = await mounted();

    expect(result.current.shoes.map((s) => s.id)).toEqual(["new", "old"]);
    expect(result.current.shoes[0]).toMatchObject({ maxKm: 600, totalKm: 0 });
    expect(result.current.activeShoes.map((s) => s.id)).toEqual(["new"]);
  });

  it("prefers the flagged default", async () => {
    seedFirestore({
      "users/u1/shoes/a": shoe("A"),
      "users/u1/shoes/b": shoe("B", { isDefault: true }),
    });
    const result = await mounted();
    expect(result.current.defaultShoe?.id).toBe("b");
  });

  it("falls back to the first ACTIVE shoe when none is flagged", async () => {
    // Racks reach this state by retiring the shoe that held the flag.
    seedFirestore({
      "users/u1/shoes/retired": shoe("Retired", { retired: true }),
      "users/u1/shoes/a": shoe("A"),
    });
    const result = await mounted();
    expect(result.current.defaultShoe?.id).toBe("a");
  });

  it("surfaces a subscription error instead of an empty rack", async () => {
    failNextFirestore("onSnapshot", { times: 10 });
    const result = await mounted();
    expect(result.current.error).not.toBeNull();
    expect(result.current.shoes).toEqual([]);
  });
});

describe("addShoe", () => {
  it("makes the FIRST active shoe the default, and later ones not", async () => {
    const result = await mounted();

    await act(async () => {
      await result.current.addShoe("First", "Nike", 800);
    });
    await flushSnapshots();
    expect(result.current.shoes).toHaveLength(1);
    expect(result.current.shoes[0]).toMatchObject({
      name: "First",
      maxKm: 800,
      isDefault: true,
    });

    await act(async () => {
      await result.current.addShoe("Second", "Asics");
    });
    await flushSnapshots();
    expect(
      result.current.shoes.find((s) => s.name === "Second")?.isDefault
    ).toBe(false);
  });

  it("treats a rack of only retired shoes as empty for the default rule", async () => {
    seedFirestore({ "users/u1/shoes/old": shoe("Old", { retired: true }) });
    const result = await mounted();

    await act(async () => {
      await result.current.addShoe("Fresh", "Nike");
    });
    await flushSnapshots();

    expect(
      result.current.shoes.find((s) => s.name === "Fresh")?.isDefault
    ).toBe(true);
  });
});

describe("setDefault / retireShoe", () => {
  it("moves the flag, leaving exactly one default", async () => {
    seedFirestore({
      "users/u1/shoes/a": shoe("A", { isDefault: true }),
      "users/u1/shoes/b": shoe("B"),
    });
    const result = await mounted();

    await act(async () => {
      await result.current.setDefault("b");
    });
    await flushSnapshots();

    expect(
      result.current.shoes.filter((s) => s.isDefault).map((s) => s.id)
    ).toEqual(["b"]);
  });

  it("clears the default flag when retiring, so it can't linger", async () => {
    seedFirestore({ "users/u1/shoes/a": shoe("A", { isDefault: true }) });
    const result = await mounted();

    await act(async () => {
      await result.current.retireShoe("a");
    });

    expect(readDoc("users/u1/shoes/a")).toMatchObject({
      retired: true,
      isDefault: false,
    });
  });
});

describe("updateMileage", () => {
  it("accrues to one decimal and fires each threshold once", async () => {
    seedFirestore({
      "users/u1/shoes/a": shoe("A", { totalKm: 480, maxKm: 600 }),
    });
    const result = await mounted();

    let alert: string | null | undefined;
    await act(async () => {
      alert = await result.current.updateMileage("a", 10.25); // 490.25 → 81.7%
    });
    expect(alert).toBeNull();
    expect(readDoc("users/u1/shoes/a")).toMatchObject({ totalKm: 490.3 });

    await flushSnapshots();
    await act(async () => {
      alert = await result.current.updateMileage("a", 30); // 520.3 → 86.7%
    });
    expect(alert).toBe("warning");

    // Crossing 85% again must NOT re-alert — the flag is now set.
    await flushSnapshots();
    await act(async () => {
      alert = await result.current.updateMileage("a", 10);
    });
    expect(alert).toBeNull();

    await flushSnapshots();
    await act(async () => {
      alert = await result.current.updateMileage("a", 100); // past maxKm
    });
    expect(alert).toBe("replace");
  });
});

describe("reconcileMileageFromRuns", () => {
  it("rebuilds totals from run history, attributing legacy runs to the default", async () => {
    seedFirestore({
      "users/u1/shoes/a": shoe("A", { isDefault: true, totalKm: 999 }),
      "users/u1/shoes/b": shoe("B", { totalKm: 999 }),
      // Explicit top-level shoeId
      "users/u1/runs/r1": { distance: 5000, duration: 1500, shoeId: "b" },
      // Legacy nested config
      "users/u1/runs/r2": {
        distance: 10000,
        duration: 3000,
        runConfig: { shoeId: "b" },
      },
      // No shoe recorded at all — falls back to the CURRENT default.
      "users/u1/runs/r3": { distance: 3000, duration: 900 },
    });
    const result = await mounted();

    let summary: { updated: number; totalRuns: number } | undefined;
    await act(async () => {
      summary = await result.current.reconcileMileageFromRuns();
    });

    expect(summary).toEqual({ updated: 2, totalRuns: 3 });
    expect(readDoc("users/u1/shoes/b")).toMatchObject({ totalKm: 15 });
    expect(readDoc("users/u1/shoes/a")).toMatchObject({ totalKm: 3 });
  });

  it("excludes invalid and saved-anyway runs from the rebuild", async () => {
    // The bug this gate exists for: a fat-fingered 20km/0:08 save inflating
    // a shoe past its replacement threshold.
    seedFirestore({
      "users/u1/shoes/a": shoe("A", { isDefault: true }),
      "users/u1/runs/good": { distance: 5000, duration: 1500, shoeId: "a" },
      "users/u1/runs/bogus": {
        distance: 20000,
        duration: 8,
        shoeId: "a",
        isInvalid: true,
        savedAnyway: true,
      },
    });
    const result = await mounted();

    await act(async () => {
      await result.current.reconcileMileageFromRuns();
    });

    expect(readDoc("users/u1/shoes/a")).toMatchObject({
      totalKm: 5,
      alert85Shown: false,
      alert100Shown: false,
    });
  });

  it("resets alert flags to match the rebuilt total", async () => {
    seedFirestore({
      "users/u1/shoes/a": shoe("A", {
        isDefault: true,
        maxKm: 100,
        alert85Shown: true,
        alert100Shown: true,
      }),
      "users/u1/runs/r1": { distance: 20000, duration: 6000, shoeId: "a" },
    });
    const result = await mounted();

    await act(async () => {
      await result.current.reconcileMileageFromRuns();
    });

    // 20km of a 100km shoe — both alerts must clear, or the replacement
    // toast can never fire again after a correction.
    expect(readDoc("users/u1/shoes/a")).toMatchObject({
      totalKm: 20,
      alert85Shown: false,
      alert100Shown: false,
    });
  });

  it("leaves retired shoes untouched — history is preserved", async () => {
    seedFirestore({
      "users/u1/shoes/a": shoe("A", { isDefault: true }),
      "users/u1/shoes/old": shoe("Old", { retired: true, totalKm: 742.5 }),
      "users/u1/runs/r1": { distance: 5000, duration: 1500, shoeId: "old" },
    });
    const result = await mounted();

    await act(async () => {
      await result.current.reconcileMileageFromRuns();
    });

    expect(readDoc("users/u1/shoes/old")).toMatchObject({ totalKm: 742.5 });
  });
});

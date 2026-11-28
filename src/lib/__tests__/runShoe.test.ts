import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  resetFirestore,
  seedFirestore,
  readDoc,
} from "@/test/firestoreHarness";
import { assignRunShoe } from "../runShoe";
import type { Shoe } from "@/hooks/useShoes";

const queueMocks = vi.hoisted(() => ({
  pending: [] as { id: string }[],
  queueDurableWrite: vi.fn(),
  flushQueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/offlineQueue", () => ({
  pendingDocumentWrites: () => queueMocks.pending,
  queueDurableWrite: (...args: unknown[]) =>
    queueMocks.queueDurableWrite(...args),
  flushQueue: (...args: unknown[]) => queueMocks.flushQueue(...args),
}));

function makeShoe(overrides: Partial<Shoe> & { id: string }): Shoe {
  return {
    name: "Pegasus",
    brand: "Nike",
    totalKm: 100,
    maxKm: 600,
    isDefault: false,
    retired: false,
    addedAt: new Date("2026-01-01T00:00:00Z"),
    alert85Shown: false,
    alert100Shown: false,
    ...overrides,
  };
}

beforeEach(() => {
  resetFirestore();
  queueMocks.pending = [];
  vi.clearAllMocks();
});

describe("assignRunShoe", () => {
  it("assigns a shoe to an unassigned run and increments its mileage", async () => {
    const pegasus = makeShoe({ id: "s1", name: "Pegasus", totalKm: 120 });
    seedFirestore({
      "users/u1/runs/r1": { distance: 10_000, shoeId: null },
      "users/u1/shoes/s1": {
        name: "Pegasus",
        totalKm: 120,
        maxKm: 600,
        retired: false,
      },
    });

    const alert = await assignRunShoe("u1", "r1", {
      previousShoeId: null,
      nextShoeId: "s1",
      distanceMeters: 10_000,
      volumeEligible: true,
      shoes: [pegasus],
    });

    expect(alert).toBeNull();
    expect(readDoc("users/u1/runs/r1")?.shoeId).toBe("s1");
    expect(readDoc("users/u1/shoes/s1")?.totalKm).toBe(130);
  });

  it("transfers mileage cleanly when switching from one active shoe to another", async () => {
    const s1 = makeShoe({ id: "s1", name: "Pegasus", totalKm: 50 });
    const s2 = makeShoe({ id: "s2", name: "Vaporfly", totalKm: 20 });
    seedFirestore({
      "users/u1/runs/r1": { distance: 12_500, shoeId: "s1" },
      "users/u1/shoes/s1": { name: "Pegasus", totalKm: 50, maxKm: 600 },
      "users/u1/shoes/s2": { name: "Vaporfly", totalKm: 20, maxKm: 500 },
    });

    await assignRunShoe("u1", "r1", {
      previousShoeId: "s1",
      nextShoeId: "s2",
      distanceMeters: 12_500,
      volumeEligible: true,
      shoes: [s1, s2],
    });

    expect(readDoc("users/u1/runs/r1")?.shoeId).toBe("s2");
    expect(readDoc("users/u1/shoes/s1")?.totalKm).toBe(37.5);
    expect(readDoc("users/u1/shoes/s2")?.totalKm).toBe(32.5);
  });

  it("returns warning and replace alerts when crossing 85% and 100% thresholds", async () => {
    const sWarn = makeShoe({
      id: "sw",
      totalKm: 505,
      maxKm: 600,
      alert85Shown: false,
    });
    const sRep = makeShoe({
      id: "sr",
      totalKm: 595,
      maxKm: 600,
      alert85Shown: true,
      alert100Shown: false,
    });
    seedFirestore({
      "users/u1/runs/r1": { distance: 10_000, shoeId: null },
      "users/u1/runs/r2": { distance: 10_000, shoeId: null },
      "users/u1/shoes/sw": { totalKm: 505, maxKm: 600, alert85Shown: false },
      "users/u1/shoes/sr": {
        totalKm: 595,
        maxKm: 600,
        alert85Shown: true,
        alert100Shown: false,
      },
    });

    const a1 = await assignRunShoe("u1", "r1", {
      previousShoeId: null,
      nextShoeId: "sw",
      distanceMeters: 10_000,
      volumeEligible: true,
      shoes: [sWarn],
    });
    expect(a1).toBe("warning");
    expect(readDoc("users/u1/shoes/sw")?.alert85Shown).toBe(true);

    const a2 = await assignRunShoe("u1", "r2", {
      previousShoeId: null,
      nextShoeId: "sr",
      distanceMeters: 10_000,
      volumeEligible: true,
      shoes: [sRep],
    });
    expect(a2).toBe("replace");
    expect(readDoc("users/u1/shoes/sr")?.alert100Shown).toBe(true);
  });

  it("leaves retired shoes untouched and skips mileage when run is not volume-eligible", async () => {
    const retired = makeShoe({ id: "old", totalKm: 650, retired: true });
    const active = makeShoe({ id: "new", totalKm: 10 });
    seedFirestore({
      "users/u1/runs/r1": { distance: 5_000, shoeId: "old" },
      "users/u1/shoes/old": { totalKm: 650, retired: true },
      "users/u1/shoes/new": { totalKm: 10, retired: false },
    });

    await assignRunShoe("u1", "r1", {
      previousShoeId: "old",
      nextShoeId: "new",
      distanceMeters: 5_000,
      volumeEligible: false,
      shoes: [retired, active],
    });

    expect(readDoc("users/u1/runs/r1")?.shoeId).toBe("new");
    expect(readDoc("users/u1/shoes/old")?.totalKm).toBe(650);
    expect(readDoc("users/u1/shoes/new")?.totalKm).toBe(10);
  });

  it("queues the shoe update when the run is still pending in the offline queue", async () => {
    queueMocks.pending = [{ id: "r-offline" }];

    const alert = await assignRunShoe("u1", "r-offline", {
      previousShoeId: null,
      nextShoeId: "s1",
      distanceMeters: 5_000,
      volumeEligible: true,
      shoes: [makeShoe({ id: "s1" })],
    });

    expect(alert).toBeNull();
    expect(queueMocks.queueDurableWrite).toHaveBeenCalledWith(
      "u1",
      "users/u1/runs",
      "r-offline",
      { shoeId: "s1" },
      true
    );
  });
});

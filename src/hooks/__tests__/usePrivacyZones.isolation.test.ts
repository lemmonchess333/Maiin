import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as firestore from "firebase/firestore";
import type {
  DocumentData,
  Query,
  QuerySnapshot,
  SnapshotListenOptions,
} from "firebase/firestore";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));
const mock = vi.hoisted(() => ({ uid: "first" }));
vi.mock("@/lib/auth", () => ({ useUid: () => mock.uid }));
import { resetFirestore, seedFirestore } from "@/test/firestoreHarness";
import { usePrivacyZones } from "../usePrivacyZones";

const originalOnSnapshot = firestore.onSnapshot;
type Delivery = {
  snapshot: QuerySnapshot<DocumentData>;
  next: (snapshot: QuerySnapshot<DocumentData>) => void;
};
let deliveries: Delivery[] = [];
let optionsSeen: SnapshotListenOptions[] = [];
beforeEach(() => {
  resetFirestore();
  mock.uid = "first";
  deliveries = [];
  optionsSeen = [];
  // Keep real harness query/snapshot/unsubscribe behavior; delay only delivery
  // to reproduce a callback already queued at the account switch boundary.
  vi.spyOn(firestore, "onSnapshot").mockImplementation(((
    query: Query<DocumentData>,
    options: SnapshotListenOptions,
    next: (snapshot: QuerySnapshot<DocumentData>) => void,
    error: (error: Error) => void
  ) => {
    optionsSeen.push(options);
    return originalOnSnapshot(
      query,
      options,
      (snapshot) => deliveries.push({ snapshot, next }),
      error
    );
  }) as typeof firestore.onSnapshot);
});
afterEach(() => vi.restoreAllMocks());

function deliver(
  index: number,
  metadata = { fromCache: false, hasPendingWrites: false }
) {
  const { snapshot, next } = deliveries[index];
  // Metadata is the only test override; documents come from the shared store.
  act(() => next(Object.assign(snapshot, { metadata })));
}

it("withholds old-account zones and ignores its queued late snapshot", () => {
  seedFirestore({
    "users/first/privacyZones/home": { name: "First home", lat: 51.5, lon: 0 },
    "users/second/privacyZones/home": { name: "Second home", lat: 52, lon: 1 },
  });
  const { result, rerender } = renderHook(() => usePrivacyZones());
  expect(deliveries).toHaveLength(1);
  deliver(0);
  expect(result.current.zones[0].name).toBe("First home");
  mock.uid = "second";
  rerender();
  expect(deliveries).toHaveLength(2);
  expect(result.current.loading).toBe(true);
  expect(result.current.zones).toEqual([]);
  deliver(1);
  expect(result.current.zones[0].name).toBe("Second home");
  deliver(0);
  expect(result.current.zones[0].name).toBe("Second home");
  expect(result.current.loading).toBe(false);
});

it("empty local cache never clears the gate before server zones arrive", async () => {
  const { result } = renderHook(() => usePrivacyZones());
  expect(optionsSeen[0]).toEqual({ includeMetadataChanges: true });
  deliver(0, { fromCache: true, hasPendingWrites: false });
  expect(result.current.loading).toBe(true);
  await act(async () => {
    seedFirestore({
      "users/first/privacyZones/home": {
        name: "Server home",
        lat: 51.5,
        lon: 0,
      },
    });
  });
  expect(deliveries.length).toBeGreaterThan(1);
  deliver(deliveries.length - 1);
  expect(result.current.loading).toBe(false);
  expect(result.current.zones[0].name).toBe("Server home");
});

it("offline cache and unacknowledged changes keep coordinate sharing gated", () => {
  seedFirestore({
    "users/first/privacyZones/home": { name: "Cached home", lat: 51.5, lon: 0 },
  });
  const { result } = renderHook(() => usePrivacyZones());
  deliver(0, { fromCache: true, hasPendingWrites: false });
  expect(result.current.zones[0].name).toBe("Cached home");
  expect(result.current.loading).toBe(true);
  deliver(0, { fromCache: false, hasPendingWrites: true });
  expect(result.current.loading).toBe(true);
  deliver(0);
  expect(result.current.loading).toBe(false);
});

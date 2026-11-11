/**
 * A finished run's history (readRunHistory): its post claims a first or a
 * best only from the whole history. A failed read, or one answered offline
 * from this phone's cache, may miss older runs, and was read as no history
 * at all: a seasoned runner's half marathon, saved with poor signal, posted
 * as "First half marathon".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { readRunHistory } from "../savedRuns";
import {
  failNextFirestore,
  resetFirestore,
  seedFirestore,
} from "@/test/firestoreHarness";
import { savedRunDoc } from "@/test/sessionFixtures";

const online = (value: boolean) =>
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => value,
  });

beforeEach(() => {
  resetFirestore();
  online(true);
  seedFirestore({
    "users/runner/runs/old": savedRunDoc("2026-06-03", { distance: 21_100 }),
  });
});
afterEach(() => online(true));

describe("readRunHistory", () => {
  it("is the whole history online", async () => {
    const read = await readRunHistory("runner");
    expect(read.known).toBe(true);
    expect(read.runs.map((r) => r.id)).toEqual(["old"]);
  });

  it("is not known when the read fails, rather than an empty history", async () => {
    failNextFirestore("getDocs");
    const read = await readRunHistory("runner");
    expect(read).toEqual({ runs: [], known: false });
  });

  it("is not known offline, where the cache may miss older runs", async () => {
    online(false);
    const read = await readRunHistory("runner");
    expect(read.known).toBe(false);
  });
});

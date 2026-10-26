// @vitest-environment jsdom
/**
 * The boot half of clearing a signed-out account's Firestore copy
 * (firestoreCacheClear.ts): firebase.ts clears the persistent cache when,
 * and only when, the last sign-out marked it, and takes the mark so the
 * clear happens once. Driven through the one fake (ADR-0009), which counts
 * the clear requests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("firebase/firestore");
vi.mock("firebase/storage", () => ({
  getStorage: vi.fn(() => ({})),
  connectStorageEmulator: vi.fn(),
}));
vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(() => ({})),
  connectFunctionsEmulator: vi.fn(),
}));
vi.mock("../firebaseApp", () => ({
  app: {},
  auth: {},
  firebaseConfig: { storageBucket: "bucket" },
}));

const MARK = "tropos.clear-firestore-cache";

/** A fresh module body, as a page load runs it. Returns how many clears
 *  that boot asked for, read from the same fresh fake it used. */
async function boot(): Promise<number> {
  vi.resetModules();
  await import("../firebase");
  const { persistenceClears } = await import("@/test/firestoreHarness");
  return persistenceClears();
}

beforeEach(() => localStorage.clear());

describe("firebase.ts at boot", () => {
  it("clears the cache the last sign-out marked, once", async () => {
    localStorage.setItem(MARK, "1");
    expect(await boot()).toBe(1);
    expect(localStorage.getItem(MARK)).toBeNull();
    // The next page load finds no mark.
    expect(await boot()).toBe(0);
  });

  it("clears nothing without a mark", async () => {
    expect(await boot()).toBe(0);
  });
});

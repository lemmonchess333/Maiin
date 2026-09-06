// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: { uid: "a" } } }));
import { auth } from "@/lib/firebase";
import { resetFirestore, readDoc, seedFirestore } from "@/test/firestoreHarness";
import { localDateString } from "../dateHelpers";
import { queueWeightEntry, flushQueuedWeights } from "../weightQueue";
const date = localDateString();
const path = `users/a/bodyweightLogs/${date}`;
beforeEach(() => { resetFirestore(); localStorage.clear(); vi.restoreAllMocks(); Object.assign(auth.currentUser!, { uid: "a" }); });
describe("queued weight entries", () => {
  it("accepts save and Undo offline, then restores the exact previous date entry", async () => {
    seedFirestore({ [path]: { date, weight: 80, source: "manual" } });
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const undo = queueWeightEntry("a", date, 78.412);
    await undo();
    expect(readDoc(path)?.weight).toBe(80);
    online.mockReturnValue(true);
    await flushQueuedWeights("a");
    expect(readDoc(path)).toEqual({ date, weight: 80, source: "manual" });
  });
  it("removes a newly created date on Undo and isolates accounts", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const undo = queueWeightEntry("a", date, 81);
    await undo();
    Object.assign(auth.currentUser!, { uid: "b" });
    online.mockReturnValue(true);
    await flushQueuedWeights("a");
    expect(readDoc(path)).toBeUndefined();
    Object.assign(auth.currentUser!, { uid: "a" });
    await flushQueuedWeights("a");
    expect(readDoc(path)).toBeUndefined();
  });
  it("never undoes a newer weight saved on another device", async () => {
    const undo = queueWeightEntry("a", date, 81);
    await flushQueuedWeights("a");
    seedFirestore({ [path]: { date, weight: 82, editId: "another-device", source: "manual" } });
    await undo();
    await flushQueuedWeights("a");
    expect(readDoc(path)?.weight).toBe(82);
  });
  it("rejects unavailable local storage before saying saved", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(() => queueWeightEntry("a", date, 81)).toThrow("Couldn't save on this phone");
    expect(readDoc(path)).toBeUndefined();
  });
});

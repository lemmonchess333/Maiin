// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: { uid: "a" } } }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/errorReporting", () => ({ captureError: vi.fn() }));
import { Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { resetFirestore, readDoc, failNextFirestore } from "@/test/firestoreHarness";
import { createMealEntry, undoMealEntries } from "../mealEntry";
import { flushQueue, pendingDocumentWrites, queueDurableWrite } from "../offlineQueue";
import { saveQuickMeal } from "../quickMealEntry";

beforeEach(() => { resetFirestore(); localStorage.clear(); vi.restoreAllMocks(); Object.assign(auth.currentUser!, { uid: "a" }); });
const path = "users/a/meals";
const data = { date: "2026-09-06", foodName: "Oats", totalCalories: 420, createdAt: Timestamp.fromMillis(1788710400000) };
describe("durable meal logging", () => {
  it("accepts an offline add and Undo without waiting for server acknowledgement", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const entry = await createMealEntry("a", data);
    expect(pendingDocumentWrites("a", path)[0].id).toBe(entry.id);
    await undoMealEntries("a", [entry.id]);
    expect(pendingDocumentWrites("a", path)).toHaveLength(2);
    online.mockReturnValue(true);
    await flushQueue(db, "a");
    expect(readDoc(`${path}/${entry.id}`)?.deletedAt).toBeTruthy();
    expect(readDoc(`${path}/${entry.id}`)?.createdAt).toEqual(data.createdAt);
  });
  it("keeps create before Undo after a failed flush and isolates accounts", async () => {
    queueDurableWrite("a", path, "meal", data);
    queueDurableWrite("a", path, "meal", { deletedAt: Timestamp.now() }, true);
    Object.assign(auth.currentUser!, { uid: "b" });
    expect(await flushQueue(db, "a")).toBe(0);
    expect(readDoc(`${path}/meal`)).toBeUndefined();
    Object.assign(auth.currentUser!, { uid: "a" });
    failNextFirestore("commit", { code: "unavailable" });
    expect(await flushQueue(db, "a")).toBe(0);
    expect(pendingDocumentWrites("a", path)).toHaveLength(2);
    await flushQueue(db, "a");
    expect(readDoc(`${path}/meal`)?.deletedAt).toBeTruthy();
  });
  it("a replayed create does not overwrite subsequent diary edits", async () => {
    const entry = await createMealEntry("a", data);
    await flushQueue(db, "a");
    queueDurableWrite("a", path, entry.id, { totalCalories: 500 }, true);
    await flushQueue(db, "a");
    queueDurableWrite("a", path, entry.id, data);
    await flushQueue(db, "a");
    expect(readDoc(`${path}/${entry.id}`)?.totalCalories).toBe(500);
  });
  it("refuses unavailable storage rather than claiming a saved meal", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await expect(createMealEntry("a", data)).rejects.toThrow("Couldn't save on this phone");
    expect(pendingDocumentWrites("a", path)).toEqual([]);
  });
  it("examples cannot create meal documents even if their handler is called", async () => {
    await expect(saveQuickMeal("a", { key: "oats", name: "Oats", cal: 420, pro: 20, carb: 50, fat: 15, portionSize: "1 serving", example: true }, data.date)).rejects.toThrow("Describe your own meal");
    expect(pendingDocumentWrites("a", path)).toEqual([]);
  });
});

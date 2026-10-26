// @vitest-environment jsdom — reads and writes session storage.
/**
 * The meal typed on Food and not yet logged, kept for the visit so a tab
 * switch does not throw it away (`foodDraft`). It belongs to its day and
 * its account.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepFoodDraft, keptFoodDraft } from "../foodDraft";

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("Food's typed meal", () => {
  it("comes back on the day it was typed, for its account", () => {
    keepFoodDraft("user-A", "2 eggs and toast", "2026-10-24");
    expect(keptFoodDraft("user-A", "2026-10-24")).toBe("2 eggs and toast");
    // Never logged against another day, nor offered to another account.
    expect(keptFoodDraft("user-A", "2026-10-23")).toBe("");
    expect(keptFoodDraft("user-B", "2026-10-24")).toBe("");
  });

  it("is dropped when the box is emptied", () => {
    keepFoodDraft("user-A", "2 eggs", "2026-10-24");
    keepFoodDraft("user-A", "", "2026-10-24");
    expect(keptFoodDraft("user-A", "2026-10-24")).toBe("");
  });
});

describe("Food's typed meal where storage refuses", () => {
  it("starts the box empty rather than throwing", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(keptFoodDraft("user-A", "2026-10-24")).toBe("");
    expect(() => keepFoodDraft("user-A", "2 eggs", "2026-10-24")).not.toThrow();
  });
});

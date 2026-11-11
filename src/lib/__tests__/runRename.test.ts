// @vitest-environment jsdom
/**
 * Renaming a saved run from its page (`runRename.ts`): the run keeps the
 * name, trimmed and cut as the finish screen cuts it, and a run still in
 * the offline queue gets the name behind its save. Driven through the one
 * Firestore fake (ADR-0009).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("firebase/firestore");

import {
  resetFirestore,
  seedFirestore,
  readDoc,
} from "@/test/firestoreHarness";
import { renameRun, runRenameValue } from "@/lib/runRename";
import { pendingDocumentWrites, queueDurableWrite } from "@/lib/offlineQueue";

/** A run as the finish screen saves it. */
const SAVED_RUN = {
  date: "2026-10-03",
  distance: 5000,
  duration: 1500,
  name: "Morning run",
  activityType: "freerun",
};

beforeEach(() => {
  resetFirestore();
  localStorage.clear();
  seedFirestore({ "users/u1/runs/r-1": SAVED_RUN });
});

describe("renameRun", () => {
  it("saves the new name on the run, and nothing else", async () => {
    expect(await renameRun("u1", "r-1", "  Parkrun with Sam ")).toBe(
      "Parkrun with Sam"
    );
    expect(readDoc("users/u1/runs/r-1")).toEqual({
      ...SAVED_RUN,
      name: "Parkrun with Sam",
    });
  });

  it("cuts a long name where the finish screen does", async () => {
    await renameRun("u1", "r-1", "x".repeat(120));
    expect(readDoc("users/u1/runs/r-1")?.name).toBe("x".repeat(80));
  });

  it("refuses an empty name and leaves the run as it was", async () => {
    await expect(renameRun("u1", "r-1", "   ")).rejects.toThrow();
    expect(readDoc("users/u1/runs/r-1")?.name).toBe("Morning run");
  });

  it("queues the name behind a run that is still waiting to save", async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    try {
      queueDurableWrite("u1", "users/u1/runs", "r-2", {
        ...SAVED_RUN,
        name: "Evening run",
      });
      await renameRun("u1", "r-2", "Hills");
      const entries = pendingDocumentWrites("u1", "users/u1/runs").filter(
        (entry) => entry.id === "r-2"
      );
      expect(entries.at(-1)).toMatchObject({
        merge: true,
        data: { name: "Hills" },
      });
      // Nothing went to the server for a document it does not have yet.
      expect(readDoc("users/u1/runs/r-2")).toBeUndefined();
    } finally {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        value: true,
      });
    }
  });
});

describe("runRenameValue", () => {
  it("is null when nothing is left after trimming", () => {
    expect(runRenameValue("  ")).toBeNull();
    expect(runRenameValue(" Tempo ")).toBe("Tempo");
  });
});

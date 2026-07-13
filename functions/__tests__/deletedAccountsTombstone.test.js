/**
 * Unit tests for the deletedAccounts tombstone module (packet 10).
 *
 * The #1602 write-freeze rules/guards consult deletedAccounts/{uid}; this
 * module is the production writer + the expiry-aware server-side read gate.
 * Pins the minimal privacy-safe shape, the 90-day TTL, and the fail-closed
 * "missing/malformed expiry = live" semantics.
 */
import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  TOMBSTONE_RETENTION_MS,
  makeTombstone,
  writeTombstone,
  isTombstoned,
} = require("../lib/deletedAccountsTombstone");

describe("makeTombstone", () => {
  it("returns only uid, deletedAt, expiresAt, and source", () => {
    const record = makeTombstone({ uid: "u1", now: 1000 });
    expect(Object.keys(record).sort()).toEqual([
      "deletedAt",
      "expiresAt",
      "source",
      "uid",
    ]);
    expect(record.uid).toBe("u1");
    expect(record.source).toBe("accountDeletion");
  });

  it("sets expiresAt exactly TOMBSTONE_RETENTION_MS after now", () => {
    const now = 1_700_000_000_000;
    const record = makeTombstone({ uid: "u1", now });
    expect(record.deletedAt.getTime()).toBe(now);
    expect(record.expiresAt.getTime()).toBe(now + TOMBSTONE_RETENTION_MS);
  });

  it("rejects a missing/empty uid", () => {
    expect(() => makeTombstone({ uid: "", now: 1000 })).toThrow(
      /uid is required/
    );
    expect(() => makeTombstone({ now: 1000 })).toThrow(/uid is required/);
  });

  it("rejects a non-finite now", () => {
    expect(() => makeTombstone({ uid: "u1", now: NaN })).toThrow(
      /finite millisecond/
    );
  });
});

describe("writeTombstone", () => {
  it("writes exactly one document at deletedAccounts/{uid}", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const doc = vi.fn().mockReturnValue({ set });
    const collection = vi.fn().mockReturnValue({ doc });
    const firestore = { collection };

    const record = await writeTombstone({ firestore, uid: "u1", now: 1000 });

    expect(collection).toHaveBeenCalledExactlyOnceWith("deletedAccounts");
    expect(doc).toHaveBeenCalledExactlyOnceWith("u1");
    expect(set).toHaveBeenCalledExactlyOnceWith(record);
    expect(record.uid).toBe("u1");
    expect(record.source).toBe("accountDeletion");
  });

  it("requires a Firestore handle", async () => {
    await expect(
      writeTombstone({ firestore: "not-a-handle", uid: "u1" })
    ).rejects.toThrow(/firestore handle required/);
  });
});

describe("isTombstoned (server-side, expiry-aware)", () => {
  function fsWith(snap) {
    const get = vi.fn().mockResolvedValue(snap);
    return { collection: () => ({ doc: () => ({ get }) }) };
  }

  it("returns false when no tombstone exists", async () => {
    const fs = fsWith({ exists: false, data: () => null });
    expect(await isTombstoned(fs, "u1", 1000)).toBe(false);
  });

  it("returns true when a tombstone has no expiry (fail-closed)", async () => {
    const fs = fsWith({ exists: true, data: () => ({ uid: "u1" }) });
    expect(await isTombstoned(fs, "u1", 1000)).toBe(true);
  });

  it("returns true when the expiry is malformed (NaN, fail-closed)", async () => {
    const fs = fsWith({
      exists: true,
      data: () => ({ uid: "u1", expiresAt: "not-a-date" }),
    });
    expect(await isTombstoned(fs, "u1", 1000)).toBe(true);
  });

  it("returns true for a future expiry", async () => {
    const fs = fsWith({
      exists: true,
      data: () => ({ uid: "u1", expiresAt: new Date(5000) }),
    });
    expect(await isTombstoned(fs, "u1", 1000)).toBe(true);
  });

  it("returns false for an already-expired tombstone", async () => {
    const fs = fsWith({
      exists: true,
      data: () => ({ uid: "u1", expiresAt: new Date(500) }),
    });
    expect(await isTombstoned(fs, "u1", 1000)).toBe(false);
  });
});

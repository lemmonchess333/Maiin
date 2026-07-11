/**
 * BODY-VAULT-01 — Progress Vault model pins.
 *
 *   - grouping: stored check-ins claim their photos; every unclaimed photo
 *     renders as a single-photo LEGACY entry (read adapter — no migration)
 *   - dangling photo references are dropped; a check-in with no surviving
 *     photo disappears rather than rendering empty
 *   - ordering: newest date first, stored check-ins before legacy entries
 *     on the same date
 *   - sanitization: note clamped to CHECKIN_NOTE_MAX, unknown/empty slots
 *     dropped, photo-less or malformed-date input rejected (null)
 */
import { describe, it, expect } from "vitest";
import {
  CHECKIN_NOTE_MAX,
  groupVaultEntries,
  sanitizeCheckInInput,
  type ProgressCheckIn,
  type VaultPhoto,
} from "../progressVault";

const photo = (id: string, date: string): VaultPhoto => ({
  id,
  date,
  storagePath: `progress-photos/u1/${id}.enc`,
  iv: [1, 2, 3],
});

const checkIn = (
  id: string,
  date: string,
  photoIds: ProgressCheckIn["photoIds"],
  note?: string
): ProgressCheckIn => ({ id, date, photoIds, ...(note ? { note } : {}) });

describe("groupVaultEntries", () => {
  it("groups referenced photos under their check-in and leaves the rest as legacy", () => {
    const photos = [
      photo("p-front", "2026-07-01"),
      photo("p-side", "2026-07-01"),
      photo("p-old", "2026-06-01"),
    ];
    const entries = groupVaultEntries(
      [checkIn("c1", "2026-07-01", { front: "p-front", side: "p-side" }, "hi")],
      photos
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      key: "c1",
      checkInId: "c1",
      date: "2026-07-01",
      note: "hi",
      legacy: false,
    });
    expect(entries[0].slots.map((s) => s.slot)).toEqual(["front", "side"]);
    expect(entries[1]).toMatchObject({
      key: "legacy:p-old",
      date: "2026-06-01",
      legacy: true,
    });
    expect(entries[1].checkInId).toBeUndefined();
  });

  it("drops dangling photo references, and drops a check-in whose photos are all gone", () => {
    const entries = groupVaultEntries(
      [
        checkIn("c-partial", "2026-07-02", {
          front: "p-here",
          back: "p-gone",
        }),
        checkIn("c-empty", "2026-07-03", { front: "p-also-gone" }),
      ],
      [photo("p-here", "2026-07-02")]
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe("c-partial");
    expect(entries[0].slots).toEqual([{ slot: "front", photoId: "p-here" }]);
  });

  it("sorts newest date first, stored before legacy on the same date", () => {
    const entries = groupVaultEntries(
      [checkIn("c1", "2026-07-01", { front: "p1" })],
      [
        photo("p1", "2026-07-01"),
        photo("p-legacy-same-day", "2026-07-01"),
        photo("p-newer", "2026-07-05"),
      ]
    );
    expect(entries.map((e) => e.key)).toEqual([
      "legacy:p-newer",
      "c1",
      "legacy:p-legacy-same-day",
    ]);
  });

  it("slots always render in front→side→back order regardless of stored map order", () => {
    const [entry] = groupVaultEntries(
      [checkIn("c1", "2026-07-01", { back: "p-b", front: "p-f", side: "p-s" })],
      [
        photo("p-f", "2026-07-01"),
        photo("p-s", "2026-07-01"),
        photo("p-b", "2026-07-01"),
      ]
    );
    expect(entry.slots.map((s) => s.slot)).toEqual(["front", "side", "back"]);
  });
});

describe("sanitizeCheckInInput", () => {
  it("clamps the note and drops empty slots", () => {
    const clean = sanitizeCheckInInput({
      date: "2026-07-01",
      note: "x".repeat(CHECKIN_NOTE_MAX + 50),
      photoIds: { front: "p1", side: "  ", back: undefined },
    });
    expect(clean).not.toBeNull();
    expect(clean!.note!.length).toBe(CHECKIN_NOTE_MAX);
    expect(clean!.photoIds).toEqual({ front: "p1" });
  });

  it("omits an empty note rather than writing an empty string", () => {
    const clean = sanitizeCheckInInput({
      date: "2026-07-01",
      note: "   ",
      photoIds: { front: "p1" },
    });
    expect(clean).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(clean, "note")).toBe(false);
  });

  it("rejects a check-in with no photos (null — an empty check-in is not a thing)", () => {
    expect(
      sanitizeCheckInInput({ date: "2026-07-01", photoIds: {} })
    ).toBeNull();
    expect(
      sanitizeCheckInInput({ date: "2026-07-01", photoIds: { front: " " } })
    ).toBeNull();
  });

  it("rejects a malformed date", () => {
    expect(
      sanitizeCheckInInput({ date: "1 July 2026", photoIds: { front: "p1" } })
    ).toBeNull();
    expect(
      sanitizeCheckInInput({ date: "2026-7-1", photoIds: { front: "p1" } })
    ).toBeNull();
  });
});

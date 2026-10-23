import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.GCLOUD_PROJECT ||= "tropos-unit-test";
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const deletion = require("../lib/accountDeletionLocks");
const { onPublicProfileWritten } = require("../index");
const db = require("firebase-admin").firestore();
const UID = "profile-moderation-author";
const PATH = `users/${UID}/public/profile`;
const BAD_NAME = "shit head";
let firestore;

beforeEach(() => {
  firestore = memoryFirestore();
  vi.spyOn(db, "runTransaction").mockImplementation(firestore.runTransaction);
  vi.spyOn(deletion, "shouldSystemWriteProceed").mockResolvedValue(true);
});

afterEach(() => vi.restoreAllMocks());

// A trigger snapshot describes the write that produced it, even after a
// later edit or deletion changed the live document. Keep it immutable.
function deliver(name = BAD_NAME) {
  const ref = firestore.doc(PATH);
  return onPublicProfileWritten.run(
    {
      before: { exists: true, data: () => ({ displayName: "Sam" }) },
      after: {
        exists: true,
        ref: {
          ...ref,
          update: (values) => firestore.data.has(PATH)
            ? ref.update(values)
            : Promise.reject(Object.assign(new Error("Document not found"), { code: 5 })),
        },
        data: () => ({ displayName: name, displayNameLower: name.toLowerCase() }),
      },
    },
    { params: { uid: UID, docId: "profile" } }
  );
}

describe("public-profile name moderation", () => {
  it("preserves a later clean name when an older refused-name event arrives", async () => {
    const current = {
      displayName: "Maya Chen",
      displayNameLower: "maya chen",
      currentStreak: 4,
    };
    firestore.data.set(PATH, current);

    await deliver();

    expect(firestore.data.get(PATH)).toEqual(current);
    expect(firestore.operations).toEqual([]);
  });

  it("clears a currently refused name while preserving other profile fields", async () => {
    firestore.data.set(PATH, {
      displayName: BAD_NAME,
      displayNameLower: BAD_NAME,
      currentStreak: 4,
    });

    await deliver();

    expect(firestore.data.get(PATH)).toEqual({
      displayName: null,
      displayNameLower: null,
      currentStreak: 4,
    });
  });

  it("also clears a newer refused name rather than requiring snapshot equality", async () => {
    firestore.data.set(PATH, {
      displayName: "shit face",
      displayNameLower: "shit face",
    });

    await deliver();

    expect(firestore.data.get(PATH)).toEqual({ displayName: null, displayNameLower: null });
  });

  it("does not recreate a profile deleted before the trigger runs", async () => {
    await deliver();

    expect(firestore.data.has(PATH)).toBe(false);
    expect(firestore.operations).toEqual([]);
  });

  it("preserves a name the user already cleared", async () => {
    firestore.data.set(PATH, { displayName: null, displayNameLower: null });

    await deliver();

    expect(firestore.data.get(PATH)).toEqual({ displayName: null, displayNameLower: null });
    expect(firestore.operations).toEqual([]);
  });

  it("propagates transaction failures for the retry-enabled trigger and recovers on redelivery", async () => {
    const current = { displayName: BAD_NAME, displayNameLower: BAD_NAME };
    firestore.data.set(PATH, current);
    const unavailable = Object.assign(new Error("Firestore temporarily unavailable"), { code: 14 });
    vi.mocked(db.runTransaction).mockRejectedValueOnce(unavailable);

    await expect(deliver()).rejects.toBe(unavailable);
    expect(firestore.data.get(PATH)).toEqual(current);
    await deliver();
    expect(firestore.data.get(PATH)).toEqual({ displayName: null, displayNameLower: null });
  });

  it("keeps the existing deletion guard before any transaction", async () => {
    firestore.data.set(PATH, { displayName: BAD_NAME });
    vi.mocked(deletion.shouldSystemWriteProceed).mockResolvedValue(false);

    await deliver();

    expect(db.runTransaction).not.toHaveBeenCalled();
    expect(firestore.operations).toEqual([]);
  });
});

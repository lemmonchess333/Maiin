/**
 * The name and photo a Circle shows for a member.
 *
 * Starting or joining a Circle copies the person's name and photo onto
 * their member document, which every member reads, and the "joined" event
 * that write makes tells the others "<name> joined your circle". The copy
 * is the public profile's, never the private user document's: the rules
 * let a person write anything to their own user document, and nothing
 * filters it. The name is cut to the shared display-name length and
 * treated as none when the word filter refuses it, by the rule
 * identityResync carries a new name here with; the photo is kept only when
 * a public profile may show it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "demo-tropos";

const admin = require("firebase-admin");
const rateLimiter = require("../rateLimiter");
const accountDeletionLocks = require("../lib/accountDeletionLocks");
const restriction = require("../lib/restriction");
const socialFanout = require("../lib/socialFanout");
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { MAX_DISPLAY_NAME_LENGTH } = require("../profileSanitizer");
const { wantedIdentity } = require("../lib/identityResync");
const membership = require("../lib/goalSpaceMembership");
const index = require("../index");

const REFUSED = "shit head";
const OWN_PHOTO =
  "https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.firebasestorage.app/o/profile-photos%2Fme%2Favatar.jpg?alt=media";
const FOREIGN_PHOTO = "https://example.com/anything.jpg";

const realIsRateLimited = rateLimiter.isRateLimited;
const realActorLock = accountDeletionLocks.assertCallableActorNotDeleting;
const realAssertNotRestricted = restriction.assertNotRestricted;

function useMemoryFirestore(seed = {}) {
  const db = memoryFirestore(seed);
  const ns = Object.assign(() => db, admin.firestore, {
    FieldValue: {
      serverTimestamp: () => "SERVER_TS",
      increment: (n) => ({ increment: n }),
    },
  });
  Object.defineProperty(admin, "firestore", {
    value: ns,
    configurable: true,
    writable: true,
  });
  return db;
}

beforeEach(() => {
  accountDeletionLocks.assertCallableActorNotDeleting = async () => {};
  restriction.assertNotRestricted = async () => {};
  rateLimiter.isRateLimited = async () => false;
});

afterEach(() => {
  delete admin.firestore;
  rateLimiter.isRateLimited = realIsRateLimited;
  accountDeletionLocks.assertCallableActorNotDeleting = realActorLock;
  restriction.assertNotRestricted = realAssertNotRestricted;
  vi.restoreAllMocks();
});

let ids = 0;
const makeId = () => `id-${ids++}`;

async function createdMember({ displayName, photoURL }) {
  const firestore = memoryFirestore();
  const { spaceId } = await membership.createGoalSpace({
    firestore,
    uid: "me",
    displayName,
    photoURL,
    input: { type: "strength_block", title: "8-week block" },
    now: 1_000,
    makeId,
  });
  return firestore.data.get(`goalSpaces/${spaceId}/members/me`);
}

describe("memberDoc — what a Circle copies", () => {
  it("keeps a public name and a photo a profile may show", async () => {
    const member = await createdMember({
      displayName: "  Maya  ",
      photoURL: OWN_PHOTO,
    });
    expect(member.displayName).toBe("Maya");
    expect(member.photoURL).toBe(OWN_PHOTO);
  });

  it("cuts a long name to the shared display-name length", async () => {
    const member = await createdMember({
      displayName: "x".repeat(200),
      photoURL: null,
    });
    expect(member.displayName).toBe("x".repeat(MAX_DISPLAY_NAME_LENGTH));
  });

  it("treats a name the word filter refuses as none", async () => {
    for (const displayName of [REFUSED, "", "   ", undefined, 42]) {
      const member = await createdMember({ displayName, photoURL: null });
      expect(member.displayName).toBe("Member");
    }
  });

  it("drops a photo a public profile may not show", async () => {
    for (const photoURL of [FOREIGN_PHOTO, "javascript:alert(1)", 7]) {
      const member = await createdMember({ displayName: "Maya", photoURL });
      expect(member.photoURL).toBeNull();
    }
  });

  it("holds a name and photo to the same rule identityResync carries them by", async () => {
    for (const displayName of ["Maya", ` ${"y".repeat(80)} `, REFUSED, ""]) {
      for (const photoURL of [OWN_PHOTO, FOREIGN_PHOTO]) {
        const member = await createdMember({ displayName, photoURL });
        const carried = wantedIdentity(
          { displayName, photoURL },
          { fields: { name: true, photo: true }, restricted: false }
        );
        expect(member.displayName).toBe(carried.name ?? "Member");
        expect(member.photoURL).toBe(carried.photo);
      }
    }
  });
});

describe("the Circle callables read the public profile", () => {
  const privateAndPublic = (publicProfile) => ({
    "users/me": { displayName: REFUSED, photoURL: FOREIGN_PHOTO },
    ...(publicProfile ? { "users/me/public/profile": publicProfile } : {}),
  });
  const ME = { auth: { uid: "me" } };

  it("createGoalSpace copies the public name and photo, not the user document's", async () => {
    const db = useMemoryFirestore(
      privateAndPublic({ displayName: "Maya", photoURL: OWN_PHOTO })
    );
    const { spaceId } = await index.createGoalSpace.run(
      { type: "strength_block", title: "8-week block" },
      ME
    );
    expect(db.data.get(`goalSpaces/${spaceId}/members/me`)).toMatchObject({
      displayName: "Maya",
      photoURL: OWN_PHOTO,
    });
  });

  it("joinGoalSpace copies the public name, and Member when it is refused or missing", async () => {
    for (const [publicProfile, expected] of [
      [{ displayName: "Maya", photoURL: OWN_PHOTO }, "Maya"],
      [{ displayName: REFUSED }, "Member"],
      [null, "Member"],
    ]) {
      const db = useMemoryFirestore({
        ...privateAndPublic(publicProfile),
        "goalSpaces/S": {
          ownerId: "owner",
          active: true,
          memberCount: 1,
          maxMembers: 8,
          inviteCode: "CODE2345",
          inviteCodeExpiresAt: Date.now() + 86_400_000,
          type: "strength_block",
          title: "8-week block",
        },
        "goalSpaces/S/members/owner": { uid: "owner", role: "owner" },
      });
      await index.joinGoalSpace.run(
        { spaceId: "S", inviteCode: "CODE2345" },
        ME
      );
      const member = db.data.get("goalSpaces/S/members/me");
      expect(member.displayName).toBe(expected);
      expect(member.photoURL).toBe(publicProfile?.photoURL ?? null);
    }
  });
});

describe("onGoalSpaceEventCreated — the name in the other members' trays", () => {
  const SPACE = "circle-1";
  let firestore;
  const db = require("firebase-admin").firestore();

  async function deliverJoinedEventWithAuthorName(displayName) {
    firestore = memoryFirestore({
      [`goalSpaces/${SPACE}/members/author`]: { uid: "author", displayName },
      [`goalSpaces/${SPACE}/members/other`]: {
        uid: "other",
        displayName: "Sam",
      },
      [`goalSpaces/${SPACE}/events/e1`]: {
        uid: "author",
        kind: "joined",
        text: null,
        createdAt: 1,
      },
    });
    vi.spyOn(db, "collection").mockImplementation(firestore.collection);
    vi.spyOn(db, "doc").mockImplementation(firestore.doc);
    vi.spyOn(db, "runTransaction").mockImplementation(firestore.runTransaction);
    vi.spyOn(
      accountDeletionLocks,
      "shouldSystemWriteProceed"
    ).mockResolvedValue(true);
    const notify = vi
      .spyOn(socialFanout, "createNotification")
      .mockResolvedValue({});
    const snap = await firestore.doc(`goalSpaces/${SPACE}/events/e1`).get();
    const data = snap.data();
    await index.onGoalSpaceEventCreated.run(
      { ...snap, data: () => data },
      { eventId: "delivery-1", params: { spaceId: SPACE, eventId: "e1" } }
    );
    expect(notify).toHaveBeenCalledTimes(1);
    return notify.mock.calls[0][0].data;
  }

  it("names the member as their member document does", async () => {
    expect(await deliverJoinedEventWithAuthorName("Maya")).toEqual({
      type: "circle_joined",
      fromName: "Maya",
    });
  });

  it("never carries a refused name, even on a member document that holds one", async () => {
    expect((await deliverJoinedEventWithAuthorName(REFUSED)).fromName).toBe(
      "A Circle member"
    );
  });

  it("cuts an overlong name to the shared display-name length", async () => {
    expect(
      (await deliverJoinedEventWithAuthorName("z".repeat(300))).fromName
    ).toBe("z".repeat(MAX_DISPLAY_NAME_LENGTH));
  });
});

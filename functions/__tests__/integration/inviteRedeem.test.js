/**
 * Integration: invites through the real callables, against the Auth and
 * Firestore emulators.
 *
 * Driven here, not only in memory (inviteCodes.test.js holds each check),
 * because the parts worth holding meet only in the running callables: the
 * account's age read from Auth, the server timestamps on the four edges,
 * the inviter's notification and its switch, onFollowerCreated staying
 * quiet about a follow an invite made, a refusal's reason in its details,
 * a restricted caller refused before anything is read, and the signed-out
 * lookup answering without an account.
 *
 * Gated on FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST — skips
 * in an ordinary unit run.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const EMULATORS =
  process.env.FIRESTORE_EMULATOR_HOST &&
  process.env.FIREBASE_AUTH_EMULATOR_HOST;
const suite = EMULATORS ? describe : describe.skip;

let admin;
let db;
let fns;

const MAYA = "invite-maya";
const SAM = "invite-sam";
const LEE = "invite-lee";
const PEOPLE = [MAYA, SAM, LEE];
const as = (uid) => ({ auth: { uid, token: {} } });
const anonymous = (ip = "198.51.100.1") => ({ rawRequest: { ip } });

beforeAll(async () => {
  if (!EMULATORS) return;
  fns = require("../../index");
  admin = require("firebase-admin");
  db = admin.firestore();
  for (const uid of PEOPLE) {
    try {
      await admin.auth().createUser({ uid });
    } catch (err) {
      if (err && err.code !== "auth/uid-already-exists") throw err;
    }
  }
}, 30_000);

async function wipe() {
  for (const uid of PEOPLE) {
    const codes = await db
      .collection("inviteCodes")
      .where("uid", "==", uid)
      .get();
    await Promise.all(codes.docs.map((d) => d.ref.delete()));
    for (const parent of ["following", "followers", "followRequests"]) {
      await db.recursiveDelete(db.doc(`${parent}/${uid}`));
    }
    await db.recursiveDelete(db.doc(`notifications/${uid}`));
    await db.recursiveDelete(db.doc(`users/${uid}`));
    await db.doc(`globalRestrictedUids/${uid}`).delete();
    await db.doc(`blocks/${uid}/users/${MAYA}`).delete();
    await db.doc(`blocks/${MAYA}/users/${uid}`).delete();
    for (const action of ["inviteCode", "inviteRedeem", "inviteRedeemDay"]) {
      await db.doc(`rateLimits/${uid}_${action}`).delete();
    }
  }
  const lookups = await db.collection("rateLimits").get();
  await Promise.all(
    lookups.docs
      .filter((d) => d.id.startsWith("invitelookup_"))
      .map((d) => d.ref.delete())
  );
}

async function seedPerson(uid, name, extra = {}) {
  await db.doc(`users/${uid}`).set({ displayName: name, ...extra });
  await db.doc(`users/${uid}/public/profile`).set({ displayName: name });
}

/** The refusal's reason, from the callable's details. */
async function refusal(promise) {
  try {
    await promise;
    return null;
  } catch (err) {
    return (err.details && err.details.reason) || err.code;
  }
}

suite("joining from an invite", () => {
  let code;

  beforeEach(async () => {
    await wipe();
    await seedPerson(MAYA, "Maya Patel");
    await seedPerson(SAM, "Sam");
    await seedPerson(LEE, "Lee");
    ({ code } = await fns.getInviteCode.run({}, as(MAYA)));
  }, 30_000);

  it("gives a person one code, the same each time", async () => {
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    await expect(fns.getInviteCode.run({}, as(MAYA))).resolves.toEqual({
      code,
    });
    expect((await db.doc(`inviteCodes/${code}`).get()).data().uid).toBe(MAYA);
    expect((await db.doc(`users/${MAYA}`).get()).data().inviteCode).toBe(code);
  });

  it("follows both ways and tells the inviter, not as a follow", async () => {
    const result = await fns.redeemInvite.run({ code }, as(SAM));
    expect(result).toEqual({ inviterName: "Maya Patel", alreadyJoined: false });

    for (const path of [
      `following/${SAM}/users/${MAYA}`,
      `followers/${MAYA}/users/${SAM}`,
      `following/${MAYA}/users/${SAM}`,
      `followers/${SAM}/users/${MAYA}`,
    ]) {
      const edge = (await db.doc(path).get()).data();
      expect(edge.fromInvite, path).toBe(true);
      expect(typeof edge.followedAt.toMillis, path).toBe("function");
    }
    expect((await db.doc(`users/${SAM}`).get()).data().invitedAt).toBeTruthy();

    // The triggers on the two new follower edges, as Firestore would run
    // them, with Maya's New followers switch on: still no follow notice.
    await db
      .doc(`users/${MAYA}`)
      .set({ notificationPreferences: { follows: true } }, { merge: true });
    for (const [uid, followerUid] of [
      [MAYA, SAM],
      [SAM, MAYA],
    ]) {
      const ref = db.doc(`followers/${uid}/users/${followerUid}`);
      await fns.onFollowerCreated.run(await ref.get(), {
        params: { uid, followerUid },
      });
    }

    const mayas = (
      await db.collection(`notifications/${MAYA}/items`).get()
    ).docs.map((d) => ({ id: d.id, ...d.data() }));
    expect(mayas).toHaveLength(1);
    expect(mayas[0]).toMatchObject({
      id: `invite_joined_${SAM}`,
      type: "invite_joined",
      fromUserId: SAM,
      message: "Sam joined from your invite. You follow each other now",
    });
    expect((await db.collection(`notifications/${SAM}/items`).get()).size).toBe(
      0
    );
  });

  it("sends no notice to an inviter who switched invites off", async () => {
    await db
      .doc(`users/${MAYA}`)
      .set({ notificationPreferences: { invites: false } }, { merge: true });
    await fns.redeemInvite.run({ code }, as(SAM));
    expect(
      (await db.collection(`notifications/${MAYA}/items`).get()).size
    ).toBe(0);
    expect((await db.doc(`following/${MAYA}/users/${SAM}`).get()).exists).toBe(
      true
    );
  });

  it("answers a repeat as the first, and refuses a second invite", async () => {
    await fns.redeemInvite.run({ code }, as(SAM));
    await expect(fns.redeemInvite.run({ code }, as(SAM))).resolves.toEqual({
      inviterName: "Maya Patel",
      alreadyJoined: true,
    });
    const { code: lees } = await fns.getInviteCode.run({}, as(LEE));
    expect(await refusal(fns.redeemInvite.run({ code: lees }, as(SAM)))).toBe(
      "already-invited"
    );
  });

  it("refuses the caller's own code and an unknown one, with a reason", async () => {
    expect(await refusal(fns.redeemInvite.run({ code }, as(MAYA)))).toBe(
      "own-code"
    );
    expect(
      await refusal(fns.redeemInvite.run({ code: "A2B3C4D5" }, as(SAM)))
    ).toBe("code-not-found");
  });

  it("says nothing of a block, and refuses a restricted caller", async () => {
    await db.doc(`blocks/${MAYA}/users/${SAM}`).set({ blockedAt: new Date() });
    expect(await refusal(fns.redeemInvite.run({ code }, as(SAM)))).toBe(
      "code-not-found"
    );
    await db.doc(`globalRestrictedUids/${LEE}`).set({ uid: LEE });
    expect(await refusal(fns.redeemInvite.run({ code }, as(LEE)))).toBe(
      "account-restricted"
    );
    expect(await refusal(fns.getInviteCode.run({}, as(LEE)))).toBe(
      "account-restricted"
    );
  });

  it("names the inviter's first name to a signed-out caller, and no more", async () => {
    await expect(
      fns.lookupInvite.run({ code: code.toLowerCase() }, anonymous())
    ).resolves.toEqual({ inviter: { firstName: "Maya" } });
    await expect(
      fns.lookupInvite.run({ code: "A2B3C4D5" }, anonymous())
    ).resolves.toEqual({ inviter: null });
    await db.doc(`globalRestrictedUids/${MAYA}`).set({ uid: MAYA });
    await expect(fns.lookupInvite.run({ code }, anonymous())).resolves.toEqual({
      inviter: null,
    });
  });

  it("stops answering one address after its hourly allowance", async () => {
    const ip = "198.51.100.77";
    for (let i = 0; i < 20; i++) {
      await fns.lookupInvite.run({ code }, anonymous(ip));
    }
    await expect(
      fns.lookupInvite.run({ code }, anonymous(ip))
    ).resolves.toEqual({ inviter: null });
    await expect(
      fns.lookupInvite.run({ code }, anonymous("198.51.100.78"))
    ).resolves.toEqual({ inviter: { firstName: "Maya" } });
  }, 30_000);
});

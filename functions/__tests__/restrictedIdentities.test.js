/**
 * A restriction that outlives deleting the account (S4e, STATUS
 * 2026-10-20): deletion keeps a restricted account's hashed sign-in
 * identities, a new account carrying one is restricted, Lift forgets them.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const ids = require("../lib/restrictedIdentities");
const { computeBillingHash } = require("../lib/billingIdentityHash");

const SECRET = "test-secret-0123456789abcdef";
const NOW = Date.UTC(2026, 9, 20, 12);
const quiet = { warn: () => {}, info: () => {} };

const GOOGLE_USER = {
  uid: "old-uid",
  email: " Troll@Example.com ",
  providerData: [
    { providerId: "google.com", uid: "google-sub-1" },
    { providerId: "password", uid: "troll@example.com" },
  ],
};
const fakeAuth = (users) => ({
  getUser: async (uid) => {
    if (users[uid]) return users[uid];
    const err = new Error("no user");
    err.code = "auth/user-not-found";
    throw err;
  },
});
const key = (kind, value) => computeBillingHash(kind, value, SECRET);
const kept = (firestore) =>
  [...firestore.data.keys()].filter((p) =>
    p.startsWith("restrictedIdentities/")
  );

let previous;
beforeEach(() => {
  previous = process.env.BILLING_HMAC_SECRET;
  process.env.BILLING_HMAC_SECRET = SECRET;
});
afterEach(() => {
  if (previous === undefined) delete process.env.BILLING_HMAC_SECRET;
  else process.env.BILLING_HMAC_SECRET = previous;
});

describe("identitiesOf", () => {
  it("is the email, as typed in any case, and the Google and Apple subjects", () => {
    expect(
      ids.identitiesOf({
        email: " A@B.com",
        providerData: [
          { providerId: "apple.com", uid: "apple-sub" },
          { providerId: "google.com", uid: "google-sub" },
          { providerId: "password", uid: "a@b.com" },
        ],
      })
    ).toEqual([
      ["restriction-email", "a@b.com"],
      ["restriction-apple.com", "apple-sub"],
      ["restriction-google.com", "google-sub"],
    ]);
  });
});

describe("keepRestrictedIdentities", () => {
  it("keeps nothing for an account that is not restricted", async () => {
    const firestore = memoryFirestore({});
    const n = await ids.keepRestrictedIdentities({
      firestore,
      auth: fakeAuth({ "old-uid": GOOGLE_USER }),
      uid: "old-uid",
      now: NOW,
      logger: quiet,
    });
    expect(n).toBe(0);
    expect(kept(firestore)).toEqual([]);
  });

  it("keeps a restricted account's hashed identities for 13 months, and nothing else", async () => {
    const firestore = memoryFirestore({
      "globalRestrictedUids/old-uid": { uid: "old-uid" },
    });
    await ids.keepRestrictedIdentities({
      firestore,
      auth: fakeAuth({ "old-uid": GOOGLE_USER }),
      uid: "old-uid",
      now: NOW,
      logger: quiet,
    });
    expect(kept(firestore).sort()).toEqual(
      [
        `restrictedIdentities/${key("restriction-email", "troll@example.com")}`,
        `restrictedIdentities/${key("restriction-google.com", "google-sub-1")}`,
      ].sort()
    );
    const row = firestore.data.get(
      `restrictedIdentities/${key("restriction-email", "troll@example.com")}`
    );
    expect(Object.keys(row).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "reason",
    ]);
    expect(row.expiresAt.toISOString()).toBe("2027-11-20T12:00:00.000Z");
    expect(JSON.stringify([...firestore.data.values()])).not.toMatch(/troll/i);
  });

  it("without the secret keeps nothing and lets deletion go on", async () => {
    delete process.env.BILLING_HMAC_SECRET;
    const firestore = memoryFirestore({
      "globalRestrictedUids/old-uid": { uid: "old-uid" },
    });
    const warnings = [];
    const n = await ids.keepRestrictedIdentities({
      firestore,
      auth: fakeAuth({ "old-uid": GOOGLE_USER }),
      uid: "old-uid",
      now: NOW,
      logger: { ...quiet, warn: (event) => warnings.push(event) },
    });
    expect(n).toBe(0);
    expect(kept(firestore)).toEqual([]);
    expect(warnings).toEqual([
      "deleteAccount.restricted_identities_unavailable",
    ]);
  });
});

describe("carryRestriction", () => {
  const seededWith = async () => {
    const firestore = memoryFirestore({
      "globalRestrictedUids/old-uid": { uid: "old-uid" },
    });
    await ids.keepRestrictedIdentities({
      firestore,
      auth: fakeAuth({ "old-uid": GOOGLE_USER }),
      uid: "old-uid",
      now: NOW,
      logger: quiet,
    });
    return firestore;
  };

  it("restricts a new account signed in with the same Google account", async () => {
    const firestore = await seededWith();
    const carried = await ids.carryRestriction({
      firestore,
      userRecord: {
        uid: "new-uid",
        email: "someone-else@example.com",
        providerData: [{ providerId: "google.com", uid: "google-sub-1" }],
      },
      now: NOW + 60_000,
      logger: quiet,
    });
    expect(carried).toBe(true);
    expect(firestore.data.get("globalRestrictedUids/new-uid")).toMatchObject({
      uid: "new-uid",
      carriedFromDeletedAccount: true,
      lastActionedReport: null,
    });
  });

  it("restricts a new account signed up with the same email, in any case", async () => {
    const firestore = await seededWith();
    expect(
      await ids.carryRestriction({
        firestore,
        userRecord: {
          uid: "new-uid",
          email: "TROLL@example.com",
          providerData: [],
        },
        now: NOW,
        logger: quiet,
      })
    ).toBe(true);
  });

  it("leaves everyone else alone, and a kept identity past its 13 months", async () => {
    const firestore = await seededWith();
    expect(
      await ids.carryRestriction({
        firestore,
        userRecord: {
          uid: "stranger",
          email: "new@example.com",
          providerData: [],
        },
        now: NOW,
        logger: quiet,
      })
    ).toBe(false);
    expect(
      await ids.carryRestriction({
        firestore,
        userRecord: {
          uid: "late",
          email: "troll@example.com",
          providerData: [],
        },
        now: Date.UTC(2027, 11, 1),
        logger: quiet,
      })
    ).toBe(false);
    expect(firestore.data.has("globalRestrictedUids/stranger")).toBe(false);
    expect(firestore.data.has("globalRestrictedUids/late")).toBe(false);
  });
});

describe("forgetRestrictedIdentities", () => {
  it("Lift forgets the identities the account carries", async () => {
    const firestore = memoryFirestore({
      "globalRestrictedUids/old-uid": { uid: "old-uid" },
    });
    await ids.keepRestrictedIdentities({
      firestore,
      auth: fakeAuth({ "old-uid": GOOGLE_USER }),
      uid: "old-uid",
      now: NOW,
      logger: quiet,
    });
    await ids.forgetRestrictedIdentities({
      firestore,
      auth: fakeAuth({ "new-uid": { ...GOOGLE_USER, uid: "new-uid" } }),
      uid: "new-uid",
      logger: quiet,
    });
    expect(kept(firestore)).toEqual([]);
  });
});

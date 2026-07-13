import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const own = require("../lib/pushTokenOwnership");
const crypto = require("crypto");

const SERVER_TS = "SERVER_TS";
const REVOKE_EXP = "REVOKE_EXP";
const BIND_A = "bind-aaaaaaaaaaaaaa1";
const BIND_B = "bind-bbbbbbbbbbbbbb2";
const TOKEN = "fcm-token-abcdefghijklmnop"; // ≥20 chars
const hashOf = (t) => crypto.createHash("sha256").update(t).digest("hex");

// ---------------------------------------------------------------------------
// In-memory Firestore fake: doc/collection/collectionGroup/getAll/runTransaction
// ---------------------------------------------------------------------------
function makeFirestore(seed = {}) {
  const store = new Map(Object.entries(seed).map(([k, v]) => [k, { ...v }]));

  const snap = (path) => {
    const exists = store.has(path);
    const data = exists ? store.get(path) : undefined;
    return {
      exists,
      ref: { path, id: path.split("/").pop() },
      data: () => (exists ? { ...data } : undefined),
      get: (field) => (exists ? data[field] : undefined),
    };
  };

  const runQuery = (matches, wheres, limit) => {
    const docs = [];
    for (const [path, data] of store.entries()) {
      if (!matches(path)) continue;
      if (wheres.every(([f, , v]) => data[f] === v)) docs.push(snap(path));
      if (limit && docs.length >= limit) break;
    }
    return { docs, size: docs.length, empty: docs.length === 0 };
  };

  const collectionQuery = (basePath) => {
    const wheres = [];
    let lim = null;
    const matches = (p) => {
      if (!p.startsWith(basePath + "/")) return false;
      return !p.slice(basePath.length + 1).includes("/");
    };
    const q = {
      _query: true,
      where: (f, op, v) => (wheres.push([f, op, v]), q),
      limit: (n) => ((lim = n), q),
      doc: (id) => fs.doc(basePath + "/" + id),
      get: async () => runQuery(matches, wheres, lim),
      _run: () => runQuery(matches, wheres, lim),
    };
    return q;
  };

  const groupQuery = (name) => {
    const wheres = [];
    let lim = null;
    const matches = (p) => {
      const seg = p.split("/");
      return seg.length >= 2 && seg[seg.length - 2] === name;
    };
    const q = {
      _query: true,
      where: (f, op, v) => (wheres.push([f, op, v]), q),
      limit: (n) => ((lim = n), q),
      get: async () => runQuery(matches, wheres, lim),
      _run: () => runQuery(matches, wheres, lim),
    };
    return q;
  };

  const fs = {
    doc: (path) => ({
      path,
      id: path.split("/").pop(),
      get: async () => snap(path),
    }),
    collection: (path) => collectionQuery(path),
    collectionGroup: (name) => groupQuery(name),
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    runTransaction: async (fn) => {
      const writes = [];
      const tx = {
        get: async (ref) => (ref && ref._query ? ref._run() : snap(ref.path)),
        set: (ref, data, options) =>
          writes.push({ op: "set", path: ref.path, data, options }),
        update: (ref, data) =>
          writes.push({ op: "update", path: ref.path, data }),
        delete: (ref) => writes.push({ op: "delete", path: ref.path }),
      };
      const result = await fn(tx);
      for (const w of writes) {
        if (w.op === "delete") store.delete(w.path);
        else if (w.op === "set") {
          store.set(
            w.path,
            w.options && w.options.merge
              ? { ...(store.get(w.path) || {}), ...w.data }
              : { ...w.data }
          );
        } else if (w.op === "update") {
          store.set(w.path, { ...(store.get(w.path) || {}), ...w.data });
        }
      }
      return result;
    },
    __store: store,
  };
  return fs;
}

const claimed = (uid, bindingId, extra = {}) => ({
  uid,
  tokenHash: hashOf(TOKEN),
  ownershipVersion: 2,
  status: "claimed",
  bindingId,
  revokedBindings: [],
  ...extra,
});
const deviceDoc = (bindingId, extra = {}) => ({
  token: TOKEN,
  tokenHash: hashOf(TOKEN),
  platform: "web",
  ownershipVersion: 2,
  bindingId,
  ...extra,
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
describe("pushTokenOwnership — validation helpers", () => {
  it("assertToken accepts a bounded token incl. punctuation; rejects short/oversize/untrimmed", () => {
    expect(own.assertToken("a".repeat(20))).toBe("a".repeat(20));
    expect(own.assertToken("tok:with/punct.-_" + "x".repeat(10))).toBeTruthy();
    expect(() => own.assertToken("short")).toThrow(own.PushTokenOwnershipError);
    expect(() => own.assertToken("x".repeat(4097))).toThrow();
    expect(() => own.assertToken(" " + "x".repeat(25))).toThrow();
    expect(() => own.assertToken(123)).toThrow();
  });

  it("assertBindingId enforces the /^[A-Za-z0-9_-]{16,128}$/ shape", () => {
    expect(own.assertBindingId(BIND_A)).toBe(BIND_A);
    expect(() => own.assertBindingId("short")).toThrow();
    expect(() => own.assertBindingId("has spaces bindingid")).toThrow();
    expect(() => own.assertBindingId("x".repeat(129))).toThrow();
  });

  it("tokenHash is a deterministic 64-hex sha256", () => {
    expect(own.tokenHash(TOKEN)).toBe(hashOf(TOKEN));
    expect(own.tokenHash(TOKEN)).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// claimToken
// ---------------------------------------------------------------------------
describe("pushTokenOwnership.claimToken", () => {
  const hash = hashOf(TOKEN);

  it("transfers ownership A→B: retires A's device, leaves only B's hash-keyed doc + claim", async () => {
    const fs = makeFirestore({
      [`fcmTokenClaims/${hash}`]: claimed("A", BIND_A),
      [`users/A/devices/${hash}`]: deviceDoc(BIND_A),
    });
    await own.claimToken({
      firestore: fs,
      uid: "B",
      token: TOKEN,
      platform: "web",
      bindingId: BIND_B,
      serverTimestamp: SERVER_TS,
    });
    expect(fs.__store.has(`users/A/devices/${hash}`)).toBe(false);
    expect(fs.__store.get(`users/B/devices/${hash}`).bindingId).toBe(BIND_B);
    expect(fs.__store.get(`fcmTokenClaims/${hash}`)).toMatchObject({
      uid: "B",
      status: "claimed",
      bindingId: BIND_B,
    });
  });

  it("removes a legacy raw-token device doc via the collection-group query", async () => {
    const fs = makeFirestore({
      // v1 doc keyed by the raw token (not the hash), no ownershipVersion:2
      [`users/A/devices/${TOKEN}`]: { token: TOKEN, platform: "web" },
    });
    await own.claimToken({
      firestore: fs,
      uid: "B",
      token: TOKEN,
      platform: "web",
      bindingId: BIND_B,
      serverTimestamp: SERVER_TS,
    });
    expect(fs.__store.has(`users/A/devices/${TOKEN}`)).toBe(false);
    expect(fs.__store.has(`users/B/devices/${hash}`)).toBe(true);
  });

  it("rejects while an account deletion is active; writes nothing", async () => {
    const fs = makeFirestore({
      "accountDeletionRequests/B": { status: "running" },
    });
    await expect(
      own.claimToken({
        firestore: fs,
        uid: "B",
        token: TOKEN,
        platform: "web",
        bindingId: BIND_B,
        serverTimestamp: SERVER_TS,
      })
    ).rejects.toBeTruthy();
    expect(fs.__store.has(`users/B/devices/${hash}`)).toBe(false);
    expect(fs.__store.has(`fcmTokenClaims/${hash}`)).toBe(false);
  });

  it("rejects a binding id already under a live revocation fence", async () => {
    const fs = makeFirestore({
      [`fcmTokenClaims/${hash}`]: {
        uid: "B",
        ownershipVersion: 2,
        status: "revoked",
        bindingId: BIND_B,
        revokedBindings: [
          { bindingId: BIND_B, expiresAtMs: Date.now() + 60_000 },
        ],
      },
    });
    await expect(
      own.claimToken({
        firestore: fs,
        uid: "B",
        token: TOKEN,
        platform: "web",
        bindingId: BIND_B,
        serverTimestamp: SERVER_TS,
      })
    ).rejects.toMatchObject({ code: "push-token-binding-revoked" });
  });

  it("rejects a 21st distinct active device (cap) and a capped query result", async () => {
    const seed = {};
    for (let i = 0; i < 20; i += 1) {
      // Distinct tokens so they count as active devices, not duplicates of the
      // token being claimed (which would be retired instead of counted).
      seed[`users/A/devices/hash${i}`] = deviceDoc(BIND_A, {
        tokenHash: `hash${i}`,
        token: `distinct-token-${i}-xxxxxxxxxx`,
      });
    }
    const fs = makeFirestore(seed);
    await expect(
      own.claimToken({
        firestore: fs,
        uid: "A",
        token: TOKEN, // 21st distinct hash
        platform: "web",
        bindingId: BIND_A,
        serverTimestamp: SERVER_TS,
      })
    ).rejects.toMatchObject({ code: "too-many-active-push-devices" });
  });

  it("refuses to mutate ownership while a send lease is live (§4a)", async () => {
    const fs = makeFirestore({
      [`fcmTokenClaims/${hash}`]: claimed("A", BIND_A, {
        sendLease: {
          uid: "A",
          bindingId: BIND_A,
          leaseId: "lease-aaaaaaaaaaaa1",
          expiresAtMs: Date.now() + 20_000,
        },
      }),
      [`users/A/devices/${hash}`]: deviceDoc(BIND_A),
    });
    await expect(
      own.claimToken({
        firestore: fs,
        uid: "B",
        token: TOKEN,
        platform: "web",
        bindingId: BIND_B,
        serverTimestamp: SERVER_TS,
      })
    ).rejects.toMatchObject({ code: "push-token-send-in-progress" });
  });
});

// ---------------------------------------------------------------------------
// releaseTokenIfOwned
// ---------------------------------------------------------------------------
describe("pushTokenOwnership.releaseTokenIfOwned", () => {
  const hash = hashOf(TOKEN);

  it("owned release deletes the device and revokes the claim with a fence", async () => {
    const fs = makeFirestore({
      [`fcmTokenClaims/${hash}`]: claimed("A", BIND_A),
      [`users/A/devices/${hash}`]: deviceDoc(BIND_A),
    });
    const res = await own.releaseTokenIfOwned({
      firestore: fs,
      uid: "A",
      token: TOKEN,
      bindingId: BIND_A,
      serverTimestamp: SERVER_TS,
      revocationExpiresAt: REVOKE_EXP,
    });
    expect(res.released).toBe(true);
    expect(fs.__store.has(`users/A/devices/${hash}`)).toBe(false);
    expect(fs.__store.get(`fcmTokenClaims/${hash}`)).toMatchObject({
      status: "revoked",
      revocationExpiresAt: REVOKE_EXP,
    });
  });

  it("A releasing after B owns the claim does not delete B's device/claim", async () => {
    const fs = makeFirestore({
      [`fcmTokenClaims/${hash}`]: claimed("B", BIND_B),
      [`users/B/devices/${hash}`]: deviceDoc(BIND_B),
    });
    const res = await own.releaseTokenIfOwned({
      firestore: fs,
      uid: "A",
      token: TOKEN,
      bindingId: BIND_A,
      serverTimestamp: SERVER_TS,
      revocationExpiresAt: REVOKE_EXP,
    });
    expect(res.released).toBe(false);
    expect(fs.__store.has(`users/B/devices/${hash}`)).toBe(true);
    expect(fs.__store.get(`fcmTokenClaims/${hash}`)).toMatchObject({
      uid: "B",
      status: "claimed",
    });
  });

  it("rejects a new distinct revocation once 64 live fences exist", async () => {
    const revokedBindings = [];
    for (let i = 0; i < 64; i += 1) {
      revokedBindings.push({
        bindingId: `bind-fence-${String(i).padStart(10, "0")}`,
        expiresAtMs: Date.now() + 60_000,
      });
    }
    const fs = makeFirestore({
      [`fcmTokenClaims/${hash}`]: {
        uid: "A",
        ownershipVersion: 2,
        status: "revoked",
        bindingId: BIND_A,
        revokedBindings,
      },
    });
    await expect(
      own.releaseTokenIfOwned({
        firestore: fs,
        uid: "A",
        token: TOKEN,
        bindingId: BIND_B, // a 65th distinct binding
        serverTimestamp: SERVER_TS,
        revocationExpiresAt: REVOKE_EXP,
      })
    ).rejects.toMatchObject({ code: "too-many-push-token-revocations" });
  });
});

// ---------------------------------------------------------------------------
// send leases + deletion cleanup
// ---------------------------------------------------------------------------
describe("pushTokenOwnership — send leases", () => {
  const hash = hashOf(TOKEN);

  it("acquires a lease only for the canonical owner + binding, and blocks a second lease", async () => {
    const fs = makeFirestore({
      [`fcmTokenClaims/${hash}`]: claimed("A", BIND_A),
    });
    const lease = await own.acquireSendLease({
      firestore: fs,
      uid: "A",
      tokenHash: hash,
      bindingId: BIND_A,
      serverTimestamp: SERVER_TS,
    });
    expect(lease).toMatchObject({ tokenHash: hash, bindingId: BIND_A });
    // a second acquire while one is live returns null
    const second = await own.acquireSendLease({
      firestore: fs,
      uid: "A",
      tokenHash: hash,
      bindingId: BIND_A,
      serverTimestamp: SERVER_TS,
    });
    expect(second).toBeNull();
    // wrong binding never gets a lease
    const wrong = await own.acquireSendLease({
      firestore: fs,
      uid: "A",
      tokenHash: hash,
      bindingId: BIND_B,
      serverTimestamp: SERVER_TS,
    });
    expect(wrong).toBeNull();
  });

  it("releaseSendLease clears only the matching lease", async () => {
    const fs = makeFirestore({
      [`fcmTokenClaims/${hash}`]: claimed("A", BIND_A),
    });
    const lease = await own.acquireSendLease({
      firestore: fs,
      uid: "A",
      tokenHash: hash,
      bindingId: BIND_A,
      serverTimestamp: SERVER_TS,
    });
    await own.releaseSendLease({
      firestore: fs,
      uid: "A",
      tokenHash: hash,
      bindingId: BIND_A,
      leaseId: lease.leaseId,
      serverTimestamp: SERVER_TS,
    });
    expect(fs.__store.get(`fcmTokenClaims/${hash}`).sendLease).toBeNull();
  });
});

describe("pushTokenOwnership.removeClaimsForDeletedUser", () => {
  it("deletes only the departing uid's claims; leaves other uids' claims", async () => {
    const fs = makeFirestore({
      "fcmTokenClaims/h1": {
        uid: "A",
        ownershipVersion: 2,
        status: "claimed",
        bindingId: BIND_A,
      },
      "fcmTokenClaims/h2": {
        uid: "A",
        ownershipVersion: 2,
        status: "claimed",
        bindingId: BIND_A,
      },
      "fcmTokenClaims/h3": {
        uid: "B",
        ownershipVersion: 2,
        status: "claimed",
        bindingId: BIND_B,
      },
    });
    await own.removeClaimsForDeletedUser({ firestore: fs, uid: "A" });
    expect(fs.__store.has("fcmTokenClaims/h1")).toBe(false);
    expect(fs.__store.has("fcmTokenClaims/h2")).toBe(false);
    expect(fs.__store.has("fcmTokenClaims/h3")).toBe(true);
  });

  it("leaves a claim that transferred to another uid before the delete read", async () => {
    // The query returns it as A's, but the transaction re-read sees uid B.
    const fs = makeFirestore({
      "fcmTokenClaims/h1": {
        uid: "B",
        ownershipVersion: 2,
        status: "claimed",
        bindingId: BIND_B,
      },
    });
    // Force the paged query to surface h1 as a candidate even though its
    // current uid is B (simulates a transfer between query and delete).
    const realCollection = fs.collection.bind(fs);
    fs.collection = (path) => {
      const q = realCollection(path);
      if (path === "fcmTokenClaims") {
        const origGet = q.get.bind(q);
        q.where = () => q;
        q.limit = () => q;
        q.get = async () => {
          void origGet;
          return {
            docs: [{ ref: fs.doc("fcmTokenClaims/h1") }],
            size: 1,
            empty: false,
          };
        };
      }
      return q;
    };
    await own.removeClaimsForDeletedUser({ firestore: fs, uid: "A" });
    expect(fs.__store.get("fcmTokenClaims/h1")).toMatchObject({ uid: "B" });
  });
});

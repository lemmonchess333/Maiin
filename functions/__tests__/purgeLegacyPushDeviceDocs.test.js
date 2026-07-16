/**
 * PR-F purge script — classification + deletion-scope invariants.
 * The script must delete ONLY pre-migration legacy device docs
 * (ownershipVersion mismatch under users/{uid}/devices), never touch
 * canonical v2 registrations, claims, or foreign "devices" collections,
 * and only report (not delete) claim anomalies.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const {
  isUserDevicePath,
  classifyDeviceDoc,
  purgeLegacyPushDeviceDocs,
} = require("../scripts/purgeLegacyPushDeviceDocs");

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

function fakeDoc(path, data) {
  return {
    ref: { path },
    get: (field) => data[field],
    exists: true,
  };
}

/** Minimal firestore fake: a devices collection-group + claim docs by path. */
function fakeFirestore({ deviceDocs, claims }) {
  const deleted = [];
  return {
    deleted,
    collectionGroup: (name) => ({
      get: async () => {
        expect(name).toBe("devices");
        return { docs: deviceDocs };
      },
    }),
    doc: (path) => ({
      get: async () => {
        const data = claims[path];
        return {
          exists: Boolean(data),
          get: (field) => (data ? data[field] : undefined),
        };
      },
    }),
    batch: () => ({
      delete: (ref) => deleted.push(ref.path),
      commit: async () => {},
    }),
  };
}

const TOKEN = "fcm-token-abcdefghijklmnop"; // ≥ MIN_TOKEN_LENGTH (20)
const HASH = sha256(TOKEN);
const BINDING = "a".repeat(32);

const legacyDoc = fakeDoc("users/u1/devices/" + TOKEN, {
  token: TOKEN,
  platform: "web",
}); // no ownershipVersion — pre-migration client write

const canonicalDoc = fakeDoc("users/u1/devices/" + HASH, {
  ownershipVersion: 2,
  token: TOKEN,
  bindingId: BINDING,
});

const ORPHAN_TOKEN = "fcm-token-orphan-qrstuvwxyz";
const orphanV2Doc = fakeDoc("users/u2/devices/" + sha256(ORPHAN_TOKEN), {
  ownershipVersion: 2,
  token: ORPHAN_TOKEN,
  bindingId: "b".repeat(32),
});

const foreignDoc = fakeDoc("crews/c1/devices/whatever", {});

const CLAIMS = {
  ["fcmTokenClaims/" + HASH]: {
    uid: "u1",
    bindingId: BINDING,
    status: "claimed",
  },
  // no claim for orphanV2Doc's token
};

describe("classifyDeviceDoc", () => {
  it("splits legacy / v2 / foreign correctly", () => {
    expect(classifyDeviceDoc(legacyDoc)).toBe("legacy");
    expect(classifyDeviceDoc(canonicalDoc)).toBe("v2");
    expect(classifyDeviceDoc(foreignDoc)).toBe("foreign");
    expect(isUserDevicePath("users/u1/devices/x")).toBe(true);
    expect(isUserDevicePath("users/u1/devices/x/y/z")).toBe(false);
  });
});

describe("purgeLegacyPushDeviceDocs", () => {
  const docs = [legacyDoc, canonicalDoc, orphanV2Doc, foreignDoc];

  it("dry run deletes nothing and reports every category", async () => {
    const firestore = fakeFirestore({ deviceDocs: docs, claims: CLAIMS });
    const report = await purgeLegacyPushDeviceDocs({ firestore });
    expect(report.dryRun).toBe(true);
    expect(report.deleted).toBe(0);
    expect(firestore.deleted).toEqual([]);
    expect(report.scanned).toBe(4);
    expect(report.legacy).toBe(1);
    expect(report.canonicalV2).toBe(1);
    expect(report.foreign).toBe(1);
    expect(report.anomalies).toEqual([
      { path: orphanV2Doc.ref.path, reason: "claim-mismatch" },
    ]);
  });

  it("apply deletes ONLY the legacy doc — v2, anomalies, foreign survive", async () => {
    const firestore = fakeFirestore({ deviceDocs: docs, claims: CLAIMS });
    const report = await purgeLegacyPushDeviceDocs({
      firestore,
      apply: true,
    });
    expect(report.deleted).toBe(1);
    expect(firestore.deleted).toEqual([legacyDoc.ref.path]);
  });

  it("a claim owned by a different uid is an anomaly, not a delete", async () => {
    const stolen = {
      ["fcmTokenClaims/" + HASH]: {
        uid: "someone-else",
        bindingId: BINDING,
        status: "claimed",
      },
    };
    const firestore = fakeFirestore({
      deviceDocs: [canonicalDoc],
      claims: stolen,
    });
    const report = await purgeLegacyPushDeviceDocs({
      firestore,
      apply: true,
    });
    expect(report.anomalies).toHaveLength(1);
    expect(firestore.deleted).toEqual([]);
  });
});

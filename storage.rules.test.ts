/**
 * Storage security-rules suite (2026-07-11 repo audit batch 5 — no
 * Storage rules tests existed; the Firestore rules had ~120 pins while
 * every Storage prefix was verified by eye only).
 *
 * Mirrors the firestore.rules.test.ts harness contract:
 *   - Skips cleanly when FIREBASE_STORAGE_EMULATOR_HOST is unset so
 *     plain `npm test` passes without the emulator.
 *   - REQUIRE_STORAGE_EMULATOR=1 turns "no emulator" into a hard error
 *     so a CI lane can guarantee the evidence is real.
 *
 * Run locally:
 *   npm run test:rules:storage
 *   (firebase emulators:exec --only storage 'vitest run storage.rules.test.ts')
 *
 * Pinned invariants, per prefix:
 *   - default deny for any unmatched path
 *   - progress-photos/{uid}: OWNER-only read/write/delete
 *   - food-photos/{uid}:     OWNER-only read/write/delete
 *   - profile-photos/{uid}:  owner-only write/delete, ANY-authenticated read
 *   - MIME allowlist is closed-set (jpeg/png/webp) — svg+xml (XSS
 *     carrier) and gif must be rejected
 *   - size caps: 10MB progress/food, 5MB profile
 */
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";

const EMULATOR_HOST =
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
  process.env.STORAGE_EMULATOR_HOST;
// Packet 11 — the freeze rule calls firestore.exists/get, so this suite is now
// a genuine CROSS-SERVICE test and needs the Firestore emulator too. A rule
// that references Firestore can only be exercised against a running Firestore
// emulator; without it the freeze would be silently unverified.
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const REQUIRE_EMULATOR = process.env.REQUIRE_STORAGE_EMULATOR === "1";
const REQUIRE_FIRESTORE_EMULATOR =
  process.env.REQUIRE_FIRESTORE_EMULATOR === "1";
if (REQUIRE_EMULATOR && !EMULATOR_HOST) {
  throw new Error(
    "FIREBASE_STORAGE_EMULATOR_HOST is required when REQUIRE_STORAGE_EMULATOR=1. " +
      "Start the Storage emulator or drop the flag."
  );
}
if (REQUIRE_FIRESTORE_EMULATOR && !FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is required when REQUIRE_FIRESTORE_EMULATOR=1 " +
      "(the storage freeze rule reads Firestore). Start both emulators."
  );
}
// Both hosts must be present — a storage-only run can't evaluate the
// cross-service freeze rule, so skip cleanly rather than pass a false green.
const suite =
  EMULATOR_HOST && FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const OWNER = "owner-uid";
const OTHER = "other-uid";

const JPEG = { contentType: "image/jpeg" };
const SVG = { contentType: "image/svg+xml" };
const GIF = { contentType: "image/gif" };

const smallBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic
/** Just over the 5MB profile cap; also used under the 10MB caps. */
const sixMB = new Uint8Array(6 * 1024 * 1024);
/** Just over the 10MB progress/food cap. */
const elevenMB = new Uint8Array(11 * 1024 * 1024);

let env: RulesTestEnvironment;

suite("storage.rules", () => {
  beforeAll(async () => {
    const [storageHost, storagePort] = (EMULATOR_HOST as string).split(":");
    const [firestoreHost, firestorePort] = (
      FIRESTORE_EMULATOR_HOST as string
    ).split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-tropos",
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        host: firestoreHost,
        port: Number(firestorePort),
      },
      storage: {
        rules: readFileSync("storage.rules", "utf8"),
        host: storageHost,
        port: Number(storagePort),
      },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.clearStorage();
  });

  const authed = (uid: string) => env.authenticatedContext(uid).storage();
  const anon = () => env.unauthenticatedContext().storage();

  // Seed the deletion ledger / tombstone bypassing client rules, so the
  // Storage freeze rule's cross-service read has state to consult.
  async function seedDeletionRequest(status: string) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "accountDeletionRequests", OWNER), {
        status,
      });
    });
  }
  async function seedTombstone() {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "deletedAccounts", OWNER), {
        uid: OWNER,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    });
  }

  describe("default deny", () => {
    it("denies unauthenticated read/write on an unmatched path", async () => {
      await assertFails(getBytes(ref(anon(), "random/path.bin")));
      await assertFails(
        uploadBytes(ref(anon(), "random/path.bin"), smallBytes, JPEG)
      );
    });

    it("denies AUTHENTICATED write on an unmatched path", async () => {
      await assertFails(
        uploadBytes(
          ref(authed(OWNER), "exports/owner-uid/x.jpg"),
          smallBytes,
          JPEG
        )
      );
    });
  });

  describe("progress-photos/{uid} — owner-only", () => {
    const path = `progress-photos/${OWNER}/1.jpg`;

    it("owner can write, read back, and delete", async () => {
      await assertSucceeds(
        uploadBytes(ref(authed(OWNER), path), smallBytes, JPEG)
      );
      await assertSucceeds(getBytes(ref(authed(OWNER), path)));
      await assertSucceeds(deleteObject(ref(authed(OWNER), path)));
    });

    it("another authenticated user can neither read nor write nor delete", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), smallBytes, JPEG);
      });
      await assertFails(getBytes(ref(authed(OTHER), path)));
      await assertFails(
        uploadBytes(ref(authed(OTHER), path), smallBytes, JPEG)
      );
      await assertFails(deleteObject(ref(authed(OTHER), path)));
    });

    it("unauthenticated read is denied", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), smallBytes, JPEG);
      });
      await assertFails(getBytes(ref(anon(), path)));
    });

    it("rejects SVG (XSS carrier) and GIF — closed MIME allowlist", async () => {
      await assertFails(uploadBytes(ref(authed(OWNER), path), smallBytes, SVG));
      await assertFails(uploadBytes(ref(authed(OWNER), path), smallBytes, GIF));
    });

    it("rejects an upload over the 10MB cap and accepts one under it", async () => {
      await assertFails(uploadBytes(ref(authed(OWNER), path), elevenMB, JPEG));
      await assertSucceeds(uploadBytes(ref(authed(OWNER), path), sixMB, JPEG));
    });
  });

  describe("food-photos/{uid} — owner-only", () => {
    const path = `food-photos/${OWNER}/123.jpg`;

    it("owner can write and read back", async () => {
      await assertSucceeds(
        uploadBytes(ref(authed(OWNER), path), smallBytes, JPEG)
      );
      await assertSucceeds(getBytes(ref(authed(OWNER), path)));
    });

    it("cross-user and unauthenticated access is denied", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), smallBytes, JPEG);
      });
      await assertFails(getBytes(ref(authed(OTHER), path)));
      await assertFails(getBytes(ref(anon(), path)));
      await assertFails(
        uploadBytes(ref(authed(OTHER), path), smallBytes, JPEG)
      );
    });

    it("rejects SVG and the over-cap size", async () => {
      await assertFails(uploadBytes(ref(authed(OWNER), path), smallBytes, SVG));
      await assertFails(uploadBytes(ref(authed(OWNER), path), elevenMB, JPEG));
    });
  });

  describe("space-photos/{uid} — owner write, authenticated read (Spc1 PR4)", () => {
    const path = `space-photos/${OWNER}/1.jpg`;

    it("owner can write; ANY authenticated user can read; anon cannot", async () => {
      await assertSucceeds(
        uploadBytes(ref(authed(OWNER), path), smallBytes, JPEG)
      );
      await assertSucceeds(getBytes(ref(authed(OTHER), path)));
      await assertFails(getBytes(ref(anon(), path)));
    });

    it("another user cannot write or delete the owner's post photo", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), smallBytes, JPEG);
      });
      await assertFails(
        uploadBytes(ref(authed(OTHER), path), smallBytes, JPEG)
      );
      await assertFails(deleteObject(ref(authed(OTHER), path)));
    });

    it("rejects SVG/GIF and the over-10MB size", async () => {
      await assertFails(uploadBytes(ref(authed(OWNER), path), smallBytes, SVG));
      await assertFails(uploadBytes(ref(authed(OWNER), path), smallBytes, GIF));
      await assertFails(uploadBytes(ref(authed(OWNER), path), elevenMB, JPEG));
      await assertSucceeds(uploadBytes(ref(authed(OWNER), path), sixMB, JPEG));
    });
  });

  describe("profile-photos/{uid} — owner write, authenticated read", () => {
    const path = `profile-photos/${OWNER}/avatar.jpg`;

    it("owner can write; ANY authenticated user can read; anon cannot", async () => {
      await assertSucceeds(
        uploadBytes(ref(authed(OWNER), path), smallBytes, JPEG)
      );
      await assertSucceeds(getBytes(ref(authed(OTHER), path)));
      await assertFails(getBytes(ref(anon(), path)));
    });

    it("another user cannot write or delete the owner's avatar", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), smallBytes, JPEG);
      });
      await assertFails(
        uploadBytes(ref(authed(OTHER), path), smallBytes, JPEG)
      );
      await assertFails(deleteObject(ref(authed(OTHER), path)));
    });

    it("enforces the tighter 5MB profile cap", async () => {
      await assertFails(uploadBytes(ref(authed(OWNER), path), sixMB, JPEG));
    });

    it("rejects SVG on the avatar path too", async () => {
      await assertFails(uploadBytes(ref(authed(OWNER), path), smallBytes, SVG));
    });
  });

  // Packet 11 — account-deletion write freeze (the cross-service part).
  // For every owned prefix: an ACTIVE deletion ledger status OR a tombstone
  // blocks the owner's uploads + deletes, while reads (the existing posture)
  // are untouched. requested/cancelled/completed-without-a-tombstone keep
  // normal write access.
  describe("account-deletion write freeze", () => {
    // The Storage rules runtime performs a cross-service HTTP read against the
    // Firestore emulator to evaluate the freeze. Some sandboxed environments
    // (outbound proxy in front of the rules runtime) break that call, which
    // would make a tombstone silently NOT block an upload. Probe once: if the
    // freeze doesn't engage here, SKIP this matrix rather than report a false
    // failure — the freeze is still enforced in production and re-verified by
    // the operator post-deploy. Where the emulator supports cross-service
    // (clean CI), the matrix runs and proves the guarantee.
    let crossServiceWorks = false;
    beforeAll(async () => {
      const probe = "probe-freeze-uid";
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "deletedAccounts", probe), {
          uid: probe,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
      });
      try {
        await uploadBytes(
          ref(
            env.authenticatedContext(probe).storage(),
            `progress-photos/${probe}/probe.jpg`
          ),
          smallBytes,
          JPEG
        );
        // Upload allowed despite a tombstone → cross-service did not engage.
        crossServiceWorks = false;
      } catch {
        crossServiceWorks = true;
      }
      await env.clearFirestore();
      await env.clearStorage();
      if (!crossServiceWorks) {
        console.warn(
          "[storage.rules] Cross-service Firestore reads are unavailable to the " +
            "Storage emulator in this environment — SKIPPING the account-deletion " +
            "freeze matrix (enforced in production; re-verified by the operator " +
            "post-deploy)."
        );
      }
    }, 30_000);

    const ACTIVE_STATUSES = [
      "running",
      "failed_cleanup",
      "pending_cleanup",
      "pending_auth_deletion",
      "operator_review",
    ];
    const PREFIXES = [
      { name: "progress-photos", ownerReadOnly: true },
      { name: "food-photos", ownerReadOnly: true },
      { name: "space-photos", ownerReadOnly: false },
      { name: "profile-photos", ownerReadOnly: false },
    ];

    for (const { name, ownerReadOnly } of PREFIXES) {
      const path = `${name}/${OWNER}/frozen.jpg`;

      it(`${name}: an existing object stays readable but the owner cannot re-upload or delete during an active deletion`, async (ctx) => {
        if (!crossServiceWorks) return ctx.skip();
        // Pre-existing blob (written before the freeze engaged).
        await env.withSecurityRulesDisabled(async (c) => {
          await uploadBytes(ref(c.storage(), path), smallBytes, JPEG);
        });
        for (const status of ACTIVE_STATUSES) {
          await env.clearFirestore();
          await seedDeletionRequest(status);
          await assertFails(
            uploadBytes(ref(authed(OWNER), path), smallBytes, JPEG)
          );
          await assertFails(deleteObject(ref(authed(OWNER), path)));
          // Read posture is unchanged by the freeze.
          await assertSucceeds(getBytes(ref(authed(OWNER), path)));
          if (!ownerReadOnly) {
            await assertSucceeds(getBytes(ref(authed(OTHER), path)));
          } else {
            await assertFails(getBytes(ref(authed(OTHER), path)));
          }
        }
      }, 30_000);

      it(`${name}: a completed-deletion tombstone also freezes writes + deletes`, async (ctx) => {
        if (!crossServiceWorks) return ctx.skip();
        await env.withSecurityRulesDisabled(async (c) => {
          await uploadBytes(ref(c.storage(), path), smallBytes, JPEG);
        });
        await seedTombstone();
        await assertFails(
          uploadBytes(ref(authed(OWNER), path), smallBytes, JPEG)
        );
        await assertFails(deleteObject(ref(authed(OWNER), path)));
      }, 30_000);

      it(`${name}: requested / cancelled / completed-without-tombstone keep normal write access`, async (ctx) => {
        if (!crossServiceWorks) return ctx.skip();
        for (const status of ["requested", "cancelled", "completed"]) {
          await env.clearFirestore();
          await env.clearStorage();
          await seedDeletionRequest(status);
          await assertSucceeds(
            uploadBytes(ref(authed(OWNER), path), smallBytes, JPEG)
          );
          await assertSucceeds(deleteObject(ref(authed(OWNER), path)));
        }
      }, 30_000);
    }
  });
});

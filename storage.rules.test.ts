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
 *   (firebase emulators:exec --only firestore,storage --project demo-tropos 'vitest run storage.rules.test.ts')
 *
 * Pinned invariants, per prefix:
 *   - default deny for any unmatched path
 *   - progress-photos/{uid}: OWNER-only read/write/delete
 *   - food-photos/{uid}:     no uploads at all (Food9: meal photos stay on
 *                            the device); OWNER-only read/delete of legacy ones
 *   - space-photos/{uid},
 *     profile-photos/{uid}:  owner-only write/delete, ANY-authenticated get,
 *                            and NOBODY may list a folder
 *   - route-maps/{uid}/{activityId}, post-photos/{uid}/{activityId}:
 *                            callable-only reads/uploads; no direct get,
 *                            token lookup, list, create or update, even for
 *                            the owner; owner delete honors deletion freeze
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
import {
  ref,
  uploadBytes,
  getBytes,
  getDownloadURL,
  deleteObject,
  listAll,
} from "firebase/storage";
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
if (
  (REQUIRE_EMULATOR || REQUIRE_FIRESTORE_EMULATOR) &&
  (!EMULATOR_HOST || !FIRESTORE_EMULATOR_HOST)
) {
  throw new Error(
    "Both FIREBASE_STORAGE_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST are " +
      "required when either REQUIRE_STORAGE_EMULATOR=1 or " +
      "REQUIRE_FIRESTORE_EMULATOR=1. Start both emulators."
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

  describe("food-photos/{uid} — legacy, owner read and delete only", () => {
    const path = `food-photos/${OWNER}/123.jpg`;

    // Food9: a meal photo is kept on the device and never uploaded, so the
    // prefix takes no uploads, the owner's included. A photo uploaded
    // before Food9 stays readable, for the old diary row, and deletable.
    it("nobody can upload, the owner included", async () => {
      await assertFails(
        uploadBytes(ref(authed(OWNER), path), smallBytes, JPEG)
      );
    });

    it("the owner can still read and delete a legacy photo", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), smallBytes, JPEG);
      });
      await assertSucceeds(getBytes(ref(authed(OWNER), path)));
      await assertSucceeds(deleteObject(ref(authed(OWNER), path)));
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

    // `read` would grant `list` too: anyone signed in could list a
    // person's folder and fetch every photo they ever posted, the posts
    // they deleted included.
    it("nobody can list a person's post photos, the owner included", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), smallBytes, JPEG);
      });
      const folder = `space-photos/${OWNER}`;
      await assertFails(listAll(ref(authed(OTHER), folder)));
      await assertFails(listAll(ref(authed(OWNER), folder)));
      await assertFails(listAll(ref(anon(), folder)));
      // The photo itself is still reached from its post's URL.
      await assertSucceeds(getBytes(ref(authed(OTHER), path)));
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

  // Only the Admin-SDK gateway can upload/read social activity media.
  // These are real rules tests, not a model of the callable's authorization;
  // the gateway has its own visibility, follower, block and membership tests.
  for (const [prefix, name] of [
    ["route-maps", "light.jpg"],
    ["post-photos", "Ab3dEf6hIj9kLm2nOp5q.jpg"],
  ]) {
    describe(`${prefix} — callable-only media`, () => {
      const POST = "post-1";
      const path = `${prefix}/${OWNER}/${POST}/${name}`;

      async function seedMedia(visibility?: string) {
        await env.withSecurityRulesDisabled(async (ctx) => {
          if (visibility) {
            await setDoc(doc(ctx.firestore(), "activities", POST), {
              authorId: OWNER,
              visibility,
            });
          }
          await uploadBytes(ref(ctx.storage(), path), smallBytes, JPEG);
        });
      }

      for (const visibility of ["public", "followers", "private", undefined]) {
        it(`denies direct reads and token lookup with ${visibility ?? "missing"} activity`, async () => {
          await seedMedia(visibility);
          // Even a current follower must use the live-policy gateway.
          await env.withSecurityRulesDisabled(async (ctx) => {
            await setDoc(doc(ctx.firestore(), "followers", OWNER, "users", OTHER), {});
          });
          for (const storage of [authed(OWNER), authed(OTHER), authed("stranger-uid"), anon()]) {
            await assertFails(getBytes(ref(storage, path)));
            await assertFails(getDownloadURL(ref(storage, path)));
          }
        });
      }

      it("denies direct upload and overwrite, including by the owner", async () => {
        // Existing public post cannot grant direct Storage write access.
        await seedMedia("public");
        for (const storage of [authed(OWNER), authed(OTHER), authed("stranger-uid"), anon()]) {
          await assertFails(uploadBytes(ref(storage, path), smallBytes, JPEG));
          await assertFails(uploadBytes(
            ref(storage, `${prefix}/${OWNER}/new-post/${name}`), smallBytes, JPEG
          ));
        }
      });

      it("denies listing at every social folder level", async () => {
        await seedMedia("public");
        for (const storage of [authed(OWNER), authed(OTHER), authed("stranger-uid"), anon()]) {
          for (const folder of [prefix, `${prefix}/${OWNER}`, `${prefix}/${OWNER}/${POST}`]) {
            await assertFails(listAll(ref(storage, folder)));
          }
        }
      });

      it("allows owner cleanup but denies another user and anonymous deletion", async () => {
        await seedMedia("private");
        await assertFails(deleteObject(ref(authed(OTHER), path)));
        await assertFails(deleteObject(ref(anon(), path)));
        await assertSucceeds(deleteObject(ref(authed(OWNER), path)));
      });

      for (const status of [
        "running", "failed_cleanup", "pending_cleanup",
        "pending_auth_deletion", "operator_review",
      ]) {
        it(`denies owner cleanup while deletion is ${status}`, async () => {
          await seedMedia("public");
          await seedDeletionRequest(status);
          await assertFails(deleteObject(ref(authed(OWNER), path)));
          await assertFails(getBytes(ref(authed(OWNER), path)));
          await assertFails(getBytes(ref(authed(OTHER), path)));
        });
      }

      it("denies cleanup and reads after account deletion", async () => {
        await seedMedia("public");
        await seedTombstone();
        await assertFails(deleteObject(ref(authed(OWNER), path)));
        await assertFails(getBytes(ref(authed(OWNER), path)));
        await assertFails(getBytes(ref(authed(OTHER), path)));
      });

      for (const status of ["requested", "cancelled", "completed"]) {
        it(`allows owner cleanup with ${status} ledger and no tombstone`, async () => {
          await seedMedia("private");
          await seedDeletionRequest(status);
          await assertSucceeds(deleteObject(ref(authed(OWNER), path)));
        });
      }
    });
  }

  describe("profile-photos/{uid} — owner write, authenticated read", () => {
    const path = `profile-photos/${OWNER}/avatar.jpg`;

    it("owner can write; ANY authenticated user can read; anon cannot", async () => {
      await assertSucceeds(
        uploadBytes(ref(authed(OWNER), path), smallBytes, JPEG)
      );
      await assertSucceeds(getBytes(ref(authed(OTHER), path)));
      await assertFails(getBytes(ref(anon(), path)));
    });

    it("nobody can list a person's profile photos, the owner included", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), smallBytes, JPEG);
      });
      const folder = `profile-photos/${OWNER}`;
      await assertFails(listAll(ref(authed(OTHER), folder)));
      await assertFails(listAll(ref(authed(OWNER), folder)));
      await assertSucceeds(getBytes(ref(authed(OTHER), path)));
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
    // Both emulators are required by the suite. Cross-service failures must
    // fail these tests, not turn a broken rule into a skipped/green run.
    const ACTIVE_STATUSES = [
      "running",
      "failed_cleanup",
      "pending_cleanup",
      "pending_auth_deletion",
      "operator_review",
    ];
    // `ownerUploads: false` — food-photos takes no uploads in any state
    // (Food9), so only its delete follows the freeze.
    const PREFIXES = [
      { name: "progress-photos", ownerReadOnly: true, ownerUploads: true },
      { name: "food-photos", ownerReadOnly: true, ownerUploads: false },
      { name: "space-photos", ownerReadOnly: false, ownerUploads: true },
      { name: "profile-photos", ownerReadOnly: false, ownerUploads: true },
    ];

    for (const { name, ownerReadOnly, ownerUploads } of PREFIXES) {
      const path = `${name}/${OWNER}/frozen.jpg`;

      it(`${name}: an existing object stays readable but the owner cannot re-upload or delete during an active deletion`, async () => {
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

      it(`${name}: a completed-deletion tombstone also freezes writes + deletes`, async () => {
        await env.withSecurityRulesDisabled(async (c) => {
          await uploadBytes(ref(c.storage(), path), smallBytes, JPEG);
        });
        await seedTombstone();
        await assertFails(
          uploadBytes(ref(authed(OWNER), path), smallBytes, JPEG)
        );
        await assertFails(deleteObject(ref(authed(OWNER), path)));
      }, 30_000);

      it(`${name}: requested / cancelled / completed-without-tombstone keep normal write access`, async () => {
        for (const status of ["requested", "cancelled", "completed"]) {
          await env.clearFirestore();
          await env.clearStorage();
          await seedDeletionRequest(status);
          if (ownerUploads) {
            await assertSucceeds(
              uploadBytes(ref(authed(OWNER), path), smallBytes, JPEG)
            );
          } else {
            await assertFails(
              uploadBytes(ref(authed(OWNER), path), smallBytes, JPEG)
            );
            await env.withSecurityRulesDisabled(async (c) => {
              await uploadBytes(ref(c.storage(), path), smallBytes, JPEG);
            });
          }
          await assertSucceeds(deleteObject(ref(authed(OWNER), path)));
        }
      }, 30_000);
    }
  });
});

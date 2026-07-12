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

const EMULATOR_HOST =
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
  process.env.STORAGE_EMULATOR_HOST;
const REQUIRE_EMULATOR = process.env.REQUIRE_STORAGE_EMULATOR === "1";
if (REQUIRE_EMULATOR && !EMULATOR_HOST) {
  throw new Error(
    "FIREBASE_STORAGE_EMULATOR_HOST is required when REQUIRE_STORAGE_EMULATOR=1. " +
      "Start the Storage emulator or drop the flag."
  );
}
const suite = EMULATOR_HOST ? describe : describe.skip;

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
    const [host, port] = (EMULATOR_HOST as string).split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-tropos",
      storage: {
        rules: readFileSync("storage.rules", "utf8"),
        host,
        port: Number(port),
      },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearStorage();
  });

  const authed = (uid: string) => env.authenticatedContext(uid).storage();
  const anon = () => env.unauthenticatedContext().storage();

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
});

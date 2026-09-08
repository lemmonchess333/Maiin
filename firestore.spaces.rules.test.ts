/**
 * Firestore rules unit tests — Community Spaces (Spc1 PR1).
 *
 * Pins the spaces/{id}/members + posts contract:
 *   - membership is self-owned and only for KNOWN space ids
 *   - posting requires membership; body allowlist + caps enforced
 *   - likeCount/commentCount are server-owned (must start neutral)
 *   - official / pinned are unforgeable without system/config.officialUids
 *   - officials can pin and moderate-delete; ordinary users cannot
 *   - the spaces/{id} parent path is fully denied
 *
 * Same emulator-gated harness as firestore.rules.test.ts: skips when
 * FIRESTORE_EMULATOR_HOST is unset; REQUIRE_FIRESTORE_EMULATOR=1 turns
 * that into a hard error for CI lanes.
 */
import { describe, it, beforeAll, afterAll, beforeEach } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const REQUIRE_EMULATOR = process.env.REQUIRE_FIRESTORE_EMULATOR === "1";
if (REQUIRE_EMULATOR && !EMULATOR_HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is required when REQUIRE_FIRESTORE_EMULATOR=1."
  );
}
const suite = EMULATOR_HOST ? describe : describe.skip;

const MEMBER = "member-uid";
const OTHER = "other-uid";
const OFFICIAL = "official-uid";
const SPACE = "womens-running";
/* NOT the same id as firestore.rules.test.ts — vitest runs the two
   files in parallel workers against one emulator, and a shared
   projectId means one file's clearFirestore() wipes the other's
   seeds mid-test. Distinct id = distinct data plane. */
const PROJECT_ID = "tropos-spaces-rules-test";
/** Token claims. Space posts are public content and require
 *  `email_verified`, so the shared context helper carries the verified
 *  claim by default — each post test then asserts the rule it names, not
 *  the gate. Membership never reads the claim; carrying it is harmless. */
const VERIFIED = { email_verified: true };
const UNVERIFIED = { email_verified: false };

/* Every value a client legitimately writes to a photo field — Storage
   download URL, Google OAuth CDN, Apple OAuth CDN — and the shapes that
   must never reach a stranger's <img src>: arbitrary host, suffix-phishing
   host, http downgrade, non-http schemes, and a 2049-char value on an
   allowed origin (the size cap). */
const ALLOWED_PHOTO_URLS = [
  "https://firebasestorage.googleapis.com/v0/b/tropos-fitness.firebasestorage.app/o/space-photos%2Fmember-uid%2Fp1.jpg?alt=media",
  "https://lh3.googleusercontent.com/a/ACg8ocIabcdefg=s96-c",
  "https://appleid.cdn-apple.com/static/bin/avatar/123.jpg",
];
const REJECTED_PHOTO_URLS = [
  "https://pixel-tracker.example/pixel?uid=victim",
  "https://lh3.googleusercontent.com.evil.com/a/x",
  "http://firebasestorage.googleapis.com/v0/b/x/o/y.jpg",
  "javascript:alert(1)",
  "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
  "https://firebasestorage.googleapis.com/" + "a".repeat(2010),
];

suite("firestore.rules — community spaces", () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, portStr] = (EMULATOR_HOST || "").split(":");
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync("firestore.rules", "utf8"),
        host,
        port: Number(portStr),
      },
    });
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
  });

  const db = (uid: string, claims: Record<string, unknown> = VERIFIED) =>
    env.authenticatedContext(uid, claims).firestore();

  const join = (uid: string, space = SPACE) =>
    setDoc(doc(db(uid), `spaces/${space}/members/${uid}`), {
      joinedAt: new Date(),
      displayName: "Test",
      uid,
    });

  /** Admin-seed a membership so post tests don't depend on the join rule. */
  const seedMember = (uid: string, space = SPACE) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `spaces/${space}/members/${uid}`), {
        joinedAt: new Date(),
      });
    });

  const seedOfficialConfig = () =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "system/config"), {
        officialUids: [OFFICIAL],
      });
    });

  const validPost = (uid: string) => ({
    authorId: uid,
    authorName: "Test",
    body: "First run of the block done — legs are toast.",
    likeCount: 0,
    commentCount: 0,
    createdAt: new Date(),
  });

  describe("parent doc", () => {
    it("denies read and write on spaces/{id} itself", async () => {
      await assertFails(getDoc(doc(db(MEMBER), `spaces/${SPACE}`)));
      await assertFails(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}`), { name: "squat" })
      );
    });
  });

  describe("membership", () => {
    it("user joins and leaves a known space", async () => {
      await assertSucceeds(join(MEMBER));
      await assertSucceeds(
        deleteDoc(doc(db(MEMBER), `spaces/${SPACE}/members/${MEMBER}`))
      );
    });

    it("rejects joining an UNKNOWN space id", async () => {
      await assertFails(join(MEMBER, "totally-made-up-space"));
    });

    it("rejects writing someone else's membership", async () => {
      await assertFails(
        setDoc(doc(db(OTHER), `spaces/${SPACE}/members/${MEMBER}`), {
          joinedAt: new Date(),
        })
      );
    });

    it("rejects a mirrored uid that doesn't match the path", async () => {
      await assertFails(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}/members/${MEMBER}`), {
          joinedAt: new Date(),
          uid: OTHER,
        })
      );
    });

    it("rejects unexpected fields on the membership doc", async () => {
      await assertFails(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}/members/${MEMBER}`), {
          joinedAt: new Date(),
          role: "admin",
        })
      );
    });

    it("join with a Storage or OAuth avatar succeeds; any other origin fails", async () => {
      // The roster renders every member's photoURL to every signed-in
      // viewer; useSpaceMembership copies profile.photoURL and omits the
      // field when there is none.
      const ref = doc(db(MEMBER), `spaces/${SPACE}/members/${MEMBER}`);
      for (const photoURL of ALLOWED_PHOTO_URLS) {
        await assertSucceeds(setDoc(ref, { joinedAt: new Date(), photoURL }));
        // Leave so the next iteration is a fresh join, not an update.
        await assertSucceeds(deleteDoc(ref));
      }
      for (const photoURL of [...REJECTED_PHOTO_URLS, 42]) {
        await assertFails(setDoc(ref, { joinedAt: new Date(), photoURL }));
      }
    });

    it("a cosmetic update cannot repoint photoURL off the allowed origins", async () => {
      await seedMember(MEMBER);
      const ref = doc(db(MEMBER), `spaces/${SPACE}/members/${MEMBER}`);
      await assertFails(updateDoc(ref, { photoURL: REJECTED_PHOTO_URLS[0] }));
      await assertSucceeds(updateDoc(ref, { photoURL: ALLOWED_PHOTO_URLS[1] }));
    });
  });

  describe("posts — create", () => {
    it("member creates a valid text post", async () => {
      await seedMember(MEMBER);
      await assertSucceeds(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p1`), validPost(MEMBER))
      );
    });

    it("NON-member cannot post", async () => {
      await assertFails(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p1`), validPost(MEMBER))
      );
    });

    it("cannot post as someone else", async () => {
      await seedMember(MEMBER);
      await assertFails(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p1`), validPost(OTHER))
      );
    });

    it("rejects forged likeCount / commentCount", async () => {
      await seedMember(MEMBER);
      await assertFails(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p1`), {
          ...validPost(MEMBER),
          likeCount: 9000,
        })
      );
      await assertFails(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p2`), {
          ...validPost(MEMBER),
          commentCount: 12,
        })
      );
    });

    it("ordinary member cannot claim official or pinned", async () => {
      await seedMember(MEMBER);
      await assertFails(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p1`), {
          ...validPost(MEMBER),
          official: true,
        })
      );
      await assertFails(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p2`), {
          ...validPost(MEMBER),
          pinned: true,
        })
      );
      // …but explicitly-false values are fine.
      await assertSucceeds(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p3`), {
          ...validPost(MEMBER),
          official: false,
          pinned: false,
        })
      );
    });

    it("official uid (system/config) can post pinned Team posts", async () => {
      await seedOfficialConfig();
      await seedMember(OFFICIAL);
      await assertSucceeds(
        setDoc(doc(db(OFFICIAL), `spaces/${SPACE}/posts/p1`), {
          ...validPost(OFFICIAL),
          official: true,
          pinned: true,
          title: "Introduce yourself!",
        })
      );
    });

    it("rejects an over-cap body and unknown fields", async () => {
      await seedMember(MEMBER);
      await assertFails(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p1`), {
          ...validPost(MEMBER),
          body: "x".repeat(4001),
        })
      );
      await assertFails(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p2`), {
          ...validPost(MEMBER),
          evil: "field",
        })
      );
    });

    it("rejects posting into an unknown space id even as a member there", async () => {
      await seedMember(MEMBER, "made-up");
      await assertFails(
        setDoc(doc(db(MEMBER), `spaces/made-up/posts/p1`), validPost(MEMBER))
      );
    });

    it("authorPhotoURL and photoUrl must sit on an allowed origin", async () => {
      // Both render to every signed-in viewer in SpacePostCard — the
      // avatar through Avatar, the attached photo as a bare <img src>.
      // The composer writes profile.photoURL and the Storage download URL
      // respectively, and omits each when there is none.
      await seedMember(MEMBER);
      const ref = (id: string) =>
        doc(db(MEMBER), `spaces/${SPACE}/posts/${id}`);
      await assertSucceeds(
        setDoc(ref("ok"), {
          ...validPost(MEMBER),
          authorPhotoURL: ALLOWED_PHOTO_URLS[1],
          photoUrl: ALLOWED_PHOTO_URLS[0],
        })
      );
      for (const [i, bad] of [...REJECTED_PHOTO_URLS, 42].entries()) {
        await assertFails(
          setDoc(ref(`bad-author-${i}`), {
            ...validPost(MEMBER),
            authorPhotoURL: bad,
          })
        );
        await assertFails(
          setDoc(ref(`bad-photo-${i}`), { ...validPost(MEMBER), photoUrl: bad })
        );
      }
    });
  });

  describe("posts — email verification gate", () => {
    it("the same valid post is refused when email_verified is false", async () => {
      await seedMember(MEMBER);
      await assertFails(
        setDoc(
          doc(db(MEMBER, UNVERIFIED), `spaces/${SPACE}/posts/p1`),
          validPost(MEMBER)
        )
      );
      // Paired positive: the refusal above cannot be passing for an
      // unrelated reason if this identical post lands with the claim true.
      await assertSucceeds(
        setDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p2`), validPost(MEMBER))
      );
    });

    it("a token with no email_verified claim at all is refused", async () => {
      await seedMember(MEMBER);
      await assertFails(
        setDoc(
          doc(db(MEMBER, {}), `spaces/${SPACE}/posts/p1`),
          validPost(MEMBER)
        )
      );
    });

    it("joining a space is not content — an unverified account still joins", async () => {
      await assertSucceeds(
        setDoc(
          doc(db(MEMBER, UNVERIFIED), `spaces/${SPACE}/members/${MEMBER}`),
          {
            joinedAt: new Date(),
            displayName: "Test",
            uid: MEMBER,
          }
        )
      );
    });
  });

  describe("posts — update / delete", () => {
    const seedPost = (authorId: string, extra: Record<string, unknown> = {}) =>
      env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `spaces/${SPACE}/posts/p1`), {
          ...validPost(authorId),
          ...extra,
        });
      });

    it("author edits own title/body; counters stay untouchable", async () => {
      await seedPost(MEMBER);
      await assertSucceeds(
        updateDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p1`), {
          body: "Edited body.",
          title: "Edited",
        })
      );
      await assertFails(
        updateDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p1`), {
          likeCount: 5,
        })
      );
      await assertFails(
        updateDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p1`), {
          pinned: true,
        })
      );
    });

    it("non-author cannot edit or delete", async () => {
      await seedPost(MEMBER);
      await assertFails(
        updateDoc(doc(db(OTHER), `spaces/${SPACE}/posts/p1`), {
          body: "hijack",
        })
      );
      await assertFails(deleteDoc(doc(db(OTHER), `spaces/${SPACE}/posts/p1`)));
    });

    it("author deletes own post", async () => {
      await seedPost(MEMBER);
      await assertSucceeds(
        deleteDoc(doc(db(MEMBER), `spaces/${SPACE}/posts/p1`))
      );
    });

    it("official can pin and moderate-delete another user's post", async () => {
      await seedOfficialConfig();
      await seedPost(MEMBER);
      await assertSucceeds(
        updateDoc(doc(db(OFFICIAL), `spaces/${SPACE}/posts/p1`), {
          pinned: true,
        })
      );
      await assertSucceeds(
        deleteDoc(doc(db(OFFICIAL), `spaces/${SPACE}/posts/p1`))
      );
    });

    it("without the config doc, nobody is official", async () => {
      await seedPost(MEMBER);
      await assertFails(
        updateDoc(doc(db(OFFICIAL), `spaces/${SPACE}/posts/p1`), {
          pinned: true,
        })
      );
    });
  });
});

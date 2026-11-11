import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const { publicPhotoUrl, profilePhotoUrl } = createRequire(import.meta.url)(
  "../lib/publicPhotoUrl"
);

const OWN =
  "https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb";

describe("public avatar URL boundary", () => {
  it.each([
    // A profile photo as profilePhotoUpload stores it.
    `${OWN}.firebasestorage.app/o/profile-photos%2Fuid%2F1714521600000.jpg?alt=media&token=synthetic&v=1714521600001`,
    `${OWN}.appspot.com/o/space-photos%2Fuid%2F1.jpg?alt=media`,
    // Google sign-in avatars, current and older.
    "https://lh3.googleusercontent.com/a/ACg8ocIabcdefg=s96-c",
    "https://lh3.googleusercontent.com/a-/AOh14GgSynthetic=s96-c",
    "https://appleid.cdn-apple.com/a.png",
    `${OWN}.firebasestorage.app/o/profile-photos%2F${"a".repeat(600)}`,
  ])("preserves supported URLs without truncation: %s", (value) => {
    expect(publicPhotoUrl(value)).toBe(value);
  });
  it.each([
    null,
    undefined,
    42,
    "",
    "not-a-url",
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "file:///tmp/avatar",
    "http://lh3.googleusercontent.com/a",
    "https://tracker.example.test/pixel",
    "https://lh3.googleusercontent.com.evil.test/a",
    "https://lh3.googleusercontent.com@evil.test/a",
    "https://user:pass@lh3.googleusercontent.com/a",
    "https://lh3.googleusercontent.com:444/a",
    " https://lh3.googleusercontent.com/a",
    `https://lh3.googleusercontent.com/${"a".repeat(2048)}`,
    // Another Firebase project's bucket: same origin, someone else's logs.
    "https://firebasestorage.googleapis.com/v0/b/attacker.appspot.com/o/p.jpg",
    "https://firebasestorage.googleapis.com/v0/b/demo-tropos.appspot.com/o/p.jpg",
    "https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.evil.app/o/p.jpg",
    "https://firebasestorage.googleapis.com/photo.jpg",
    // A browser resolves the dot segments before it fetches, which leaves
    // this project's bucket for another's.
    `${OWN}.appspot.com/o/../../attacker.appspot.com/o/p.png?alt=media`,
    `${OWN}.appspot.com/o/profile-photos%2Fa/../../../attacker.appspot.com/o/p.png`,
    `${OWN}.appspot.com/o/profile-photos%2Fa\\..\\..\\x.png`,
    // Folders the photo screen never checks.
    `${OWN}.firebasestorage.app/o/progress-photos%2Fuid%2Fx.jpg?alt=media`,
    `${OWN}.firebasestorage.app/o/a.jpg?alt=media`,
    // Google's host serves shared Photos and Drive files too.
    "https://lh3.googleusercontent.com/a.png",
    "https://lh3.googleusercontent.com/pw/AP1GczSynthetic=w600",
    "https://lh3.googleusercontent.com/d/1SyntheticDriveId",
    "https://lh3.googleusercontent.com/a/x/../../pw/AP1Gcz",
    "https://lh3.googleusercontent.com/a/%2e%2e%2fpw%2fAP1Gcz",
    "https://lh3.googleusercontent.com/a/x?sz=1",
  ])("drops unsupported input: %s", (value) => {
    expect(publicPhotoUrl(value)).toBeUndefined();
  });
});

/* The server writes these URLs with the Admin SDK, past the rules, so it
   must answer as the rule does. Read from firestore.rules, so the bucket
   moving on one side alone fails here. */
describe("the server's answer is the rule's", () => {
  const rules = readFileSync(
    fileURLToPath(new URL("../../firestore.rules", import.meta.url)),
    "utf8"
  );
  const body = rules.match(
    /function isAllowedPhotoUrl\(v\) \{([\s\S]*?)\n\s*\}/
  );
  const patterns = [...body[1].matchAll(/matches\('([^']+)'\)/g)].map(
    (m) => new RegExp(m[1].replace(/\\\\/g, "\\"))
  );
  const ruleAllows = (url) =>
    url.length <= 2048 && patterns.some((p) => p.test(url));

  it("reads the rule's three origins", () => {
    expect(patterns).toHaveLength(3);
  });

  it.each([
    `${OWN}.firebasestorage.app/o/profile-photos%2Fa.jpg?alt=media`,
    `${OWN}.appspot.com/o/space-photos%2Fa%2F1.jpg`,
    "https://firebasestorage.googleapis.com/v0/b/attacker.appspot.com/o/p.jpg",
    "https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb.evil.app/o/p.jpg",
    "https://firebasestorage.googleapis.com/photo.jpg",
    `${OWN}.appspot.com/o/../../attacker.appspot.com/o/p.png?alt=media`,
    `${OWN}.appspot.com/o/profile-photos%2Fa/../../../attacker.appspot.com/o/p.png`,
    `${OWN}.firebasestorage.app/o/progress-photos%2Fuid%2Fx.jpg?alt=media`,
    `${OWN}.firebasestorage.app/o/a.jpg?alt=media`,
    "https://lh3.googleusercontent.com/a/ACg8ocIabcdefg=s96-c",
    "https://lh3.googleusercontent.com/a-/AOh14GgSynthetic=s96-c",
    "https://lh3.googleusercontent.com/a.png",
    "https://lh3.googleusercontent.com/pw/AP1GczSynthetic=w600",
    "https://lh3.googleusercontent.com/a/x/../../pw/AP1Gcz",
    "https://lh3.googleusercontent.com/a/%2e%2e%2fpw%2fAP1Gcz",
    "https://appleid.cdn-apple.com/a.png",
    "https://tracker.example.test/pixel",
  ])("agrees on %s", (url) => {
    expect(publicPhotoUrl(url) !== undefined).toBe(ruleAllows(url));
  });
});

/* A comment's avatar is the commenter's own profile photo, read on the
   server: a URL the request names is never written. */
describe("profilePhotoUrl", () => {
  const txnWith = (docs) => ({
    get: async (ref) => {
      const data = docs[ref.path];
      return { exists: data !== undefined, data: () => data };
    },
  });
  const firestore = {
    collection: (a) => ({
      doc: (b) => ({
        collection: (c) => ({
          doc: (d) => ({ path: `${a}/${b}/${c}/${d}` }),
        }),
      }),
    }),
  };
  const PHOTO = `${OWN}.firebasestorage.app/o/profile-photos%2Fu1%2F1.jpg?alt=media`;

  it("reads the photo from the person's public profile", async () => {
    const txn = txnWith({ "users/u1/public/profile": { photoURL: PHOTO } });
    await expect(profilePhotoUrl(txn, firestore, "u1")).resolves.toBe(PHOTO);
  });

  it("gives nothing for a profile with no photo, an unsupported one, or none", async () => {
    await expect(
      profilePhotoUrl(
        txnWith({ "users/u1/public/profile": { photoURL: "" } }),
        firestore,
        "u1"
      )
    ).resolves.toBeUndefined();
    await expect(
      profilePhotoUrl(
        txnWith({
          "users/u1/public/profile": {
            photoURL: `${OWN}.appspot.com/o/progress-photos%2Fu1%2Fx.jpg`,
          },
        }),
        firestore,
        "u1"
      )
    ).resolves.toBeUndefined();
    await expect(
      profilePhotoUrl(txnWith({}), firestore, "u1")
    ).resolves.toBeUndefined();
  });
});

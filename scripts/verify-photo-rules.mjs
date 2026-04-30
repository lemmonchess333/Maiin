/**
 * One-shot verification that the photoURL/photoStoragePath rules in
 * firestore.rules behave as designed. Not part of the permanent test
 * suite — run via `firebase emulators:exec` to spin up the Firestore
 * emulator, exercise the four cases the audit flagged, and exit with
 * a non-zero code on failure.
 *
 * Run: npx firebase emulators:exec --only firestore "node scripts/verify-photo-rules.mjs"
 *
 * Each assertion has a comment describing the privacy behaviour it
 * pins. If any assertion fails the script throws — the emulators:exec
 * wrapper then exits non-zero so a CI run would fail loudly.
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { setDoc, doc, serverTimestamp } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-rules-verify",
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules: readFileSync("firestore.rules", "utf8"),
  },
});

/* Two synthetic users: alice owns the doc we're writing to, mallory
   is a different signed-in user trying to write to alice's doc. */
const alice = env.authenticatedContext("alice").firestore();
const mallory = env.authenticatedContext("mallory").firestore();

const profileRef = doc(alice, "users/alice/public/profile");
const profileRefAsMallory = doc(mallory, "users/alice/public/profile");

/* Common payload shape — every test mutates only the photo fields. */
const base = {
  uid: "alice",
  displayName: "Alice",
  athleteType: "Lifter",
  currentStreak: 0,
  longestStreak: 0,
  createdAt: serverTimestamp(),
};

let pass = 0;
let fail = 0;
async function check(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    pass++;
  } catch (e) {
    console.error(`  ✗ ${label}\n    ${e.message}`);
    fail++;
  }
}

console.log("\n[A] Owner can write valid photoURL host values:");

await check("Firebase Storage URL is allowed", async () =>
  assertSucceeds(
    setDoc(profileRef, {
      ...base,
      photoURL: "https://firebasestorage.googleapis.com/v0/b/x.appspot.com/o/profile-photos%2Falice%2F1.jpg?alt=media&token=abc",
      photoStoragePath: "profile-photos/alice/1.jpg",
    }),
  ),
);

await check("Google CDN URL (lh3.googleusercontent.com) is allowed", async () =>
  assertSucceeds(
    setDoc(profileRef, {
      ...base,
      photoURL: "https://lh3.googleusercontent.com/a/AAAA",
      photoStoragePath: null,
    }),
  ),
);

await check("Apple CDN URL is allowed", async () =>
  assertSucceeds(
    setDoc(profileRef, {
      ...base,
      photoURL: "https://appleid.cdn-apple.com/static/img/x.png",
      photoStoragePath: null,
    }),
  ),
);

await check("Empty string (removal) is allowed", async () =>
  assertSucceeds(
    setDoc(profileRef, { ...base, photoURL: "", photoStoragePath: null }),
  ),
);

console.log("\n[B] Non-allowlisted photoURL values are rejected:");

await check("Tracking-pixel URL is rejected", async () =>
  assertFails(
    setDoc(profileRef, {
      ...base,
      photoURL: "https://tracker.example.com/pixel.gif?u=alice",
      photoStoragePath: null,
    }),
  ),
);

await check("javascript: URL is rejected", async () =>
  assertFails(
    setDoc(profileRef, {
      ...base,
      photoURL: "javascript:alert(1)",
      photoStoragePath: null,
    }),
  ),
);

await check("data: URL is rejected", async () =>
  assertFails(
    setDoc(profileRef, {
      ...base,
      photoURL: "data:image/png;base64,iVBOR",
      photoStoragePath: null,
    }),
  ),
);

await check("URL with allowed host as a path component is rejected", async () =>
  assertFails(
    setDoc(profileRef, {
      ...base,
      photoURL: "https://evil.example.com/firebasestorage.googleapis.com/x.jpg",
      photoStoragePath: null,
    }),
  ),
);

console.log("\n[C] Cross-user write is rejected:");

await check("Mallory cannot write Alice's profile", async () =>
  assertFails(
    setDoc(profileRefAsMallory, {
      ...base,
      photoURL: "https://firebasestorage.googleapis.com/v0/b/x/o/y.jpg",
      photoStoragePath: "profile-photos/alice/1.jpg",
    }),
  ),
);

console.log("\n[D] photoStoragePath must point to the owner's own folder:");

await check("Mallory's path on Alice's doc is rejected (same-user-different-prefix)", async () =>
  assertFails(
    setDoc(profileRef, {
      ...base,
      photoURL: "https://firebasestorage.googleapis.com/v0/b/x/o/y.jpg",
      photoStoragePath: "profile-photos/mallory/1.jpg",
    }),
  ),
);

await check("Path outside profile-photos/ entirely is rejected", async () =>
  assertFails(
    setDoc(profileRef, {
      ...base,
      photoURL: "https://firebasestorage.googleapis.com/v0/b/x/o/y.jpg",
      photoStoragePath: "progress-photos/alice/1.enc",
    }),
  ),
);

await check("Null photoStoragePath is allowed (OAuth-only users)", async () =>
  assertSucceeds(
    setDoc(profileRef, {
      ...base,
      photoURL: "https://lh3.googleusercontent.com/a/X",
      photoStoragePath: null,
    }),
  ),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
await env.cleanup();
process.exit(fail ? 1 : 0);

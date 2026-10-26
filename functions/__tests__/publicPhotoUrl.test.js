import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const { publicPhotoUrl } = createRequire(import.meta.url)(
  "../lib/publicPhotoUrl"
);

const OWN =
  "https://firebasestorage.googleapis.com/v0/b/adaptive-fitness-af8bb";

describe("public avatar URL boundary", () => {
  it.each([
    `${OWN}.firebasestorage.app/o/profile-photos%2Fa.jpg?alt=media&token=synthetic`,
    `${OWN}.appspot.com/o/a?alt=media`,
    "https://lh3.googleusercontent.com/a.png",
    "https://appleid.cdn-apple.com/a.png",
    `${OWN}.firebasestorage.app/o/${"a".repeat(600)}`,
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
    "https://lh3.googleusercontent.com/a.png",
    "https://appleid.cdn-apple.com/a.png",
    "https://tracker.example.test/pixel",
  ])("agrees on %s", (url) => {
    expect(publicPhotoUrl(url) !== undefined).toBe(ruleAllows(url));
  });
});

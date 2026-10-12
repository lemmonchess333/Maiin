/**
 * One display-name limit — the app, the server and the rules agree.
 *
 * The app refuses a name past DISPLAY_NAME_MAX (src/lib/displayName.ts);
 * the server cleans a profile's name to MAX_DISPLAY_NAME_LENGTH
 * (functions/profileSanitizer.js); the feed fan-out cuts a copied name to
 * it (functions/lib/socialFanout.js); and firestore.rules caps every place
 * a name is copied: activities, space posts, challenge participants,
 * space members. When they differ, a name one side accepts is one the
 * other refuses or cuts: the app at 30 and the rules at 100 meant a name
 * from another path could be three times what the screens were built for,
 * and a limit raised in the app alone would refuse a join or a post.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { DISPLAY_NAME_MAX } from "@/lib/displayName";

const require = createRequire(import.meta.url);
const sanitizer = require("../../../functions/profileSanitizer.js");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("display-name limit — one number everywhere", () => {
  it("the server keeps the app's limit", () => {
    expect(sanitizer.MAX_DISPLAY_NAME_LENGTH).toBe(DISPLAY_NAME_MAX);
    const long = "a".repeat(DISPLAY_NAME_MAX + 10);
    expect(
      sanitizer.sanitizeProfileData({ displayName: long }).displayName
    ).toHaveLength(DISPLAY_NAME_MAX);
  });

  it("the rules cap every copied name at the app's limit", () => {
    const rules = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");
    const caps = [
      ...rules.matchAll(/\.(?:authorName|displayName)\.size\(\) <= (\d+)/g),
    ].map((m) => Number(m[1]));
    // Activities, space posts, and challenge participants and space
    // members on create and update. Fewer means a cap went missing.
    expect(caps).toHaveLength(6);
    for (const cap of caps) expect(cap).toBe(DISPLAY_NAME_MAX);
  });

  it("the fan-out cuts names at the server's limit, not a number of its own", () => {
    const fanout = readFileSync(
      resolve(repoRoot, "functions/lib/socialFanout.js"),
      "utf8"
    );
    const nameSlices = [
      ...fanout.matchAll(/(?:authorName|fromName)\.slice\(0, ([^)]+)\)/g),
    ].map((m) => m[1]);
    expect(nameSlices).toEqual([
      "MAX_DISPLAY_NAME_LENGTH",
      "MAX_DISPLAY_NAME_LENGTH",
    ]);
  });
});

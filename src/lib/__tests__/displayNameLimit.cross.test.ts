/**
 * One display-name limit — the app, the server and the rules agree.
 *
 * The app refuses a name past DISPLAY_NAME_MAX (src/lib/displayNameLimit.ts,
 * re-exported by displayName.ts, which validates against it);
 * the server cleans a profile's name to MAX_DISPLAY_NAME_LENGTH
 * (functions/profileSanitizer.js); notifications cut a copied name to it
 * (functions/lib/socialFanout.js), while feed indexes copy no name; and
 * firestore.rules caps every place
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
const {
  createNotification,
  fanoutActivityToFeeds,
} = require("../../../functions/lib/socialFanout.js");
const {
  memoryFirestore,
} = require("../../../functions/__tests__/helpers/memoryFirestore.cjs");
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
    // Activities, space posts, challenge participants and space members
    // on create and update, and the public profile. Fewer means a cap
    // went missing.
    expect(caps).toHaveLength(7);
    for (const cap of caps) expect(cap).toBe(DISPLAY_NAME_MAX);
  });

  it("notifications cut names at the server's limit, not a number of their own", async () => {
    const fanout = readFileSync(
      resolve(repoRoot, "functions/lib/socialFanout.js"),
      "utf8"
    );
    const nameSlices = [
      ...fanout.matchAll(/(?:authorName|fromName)\.slice\(0, ([^)]+)\)/g),
    ].map((m) => m[1]);
    expect(nameSlices).toEqual(["MAX_DISPLAY_NAME_LENGTH"]);

    const firestore = memoryFirestore();
    const long = "a".repeat(DISPLAY_NAME_MAX + 10);
    const result = await createNotification({
      firestore,
      fromUid: "alice",
      toUid: "bob",
      data: { type: "kudos", fromName: long },
      serverTimestamp: () => "created",
    });
    expect(result.notificationId).toBeTruthy();
    const notification = firestore.data.get(
      `notifications/bob/items/${result.notificationId}`
    );
    expect(notification.fromName).toBe(long.slice(0, DISPLAY_NAME_MAX));
    expect(notification.fromName).toHaveLength(DISPLAY_NAME_MAX);
  });

  it("the actual feed writer stores routing indexes without copied names", async () => {
    const firestore = memoryFirestore({ "followers/alice/users/bob": {} });
    const long = "a".repeat(DISPLAY_NAME_MAX + 10);
    await expect(
      fanoutActivityToFeeds({
        firestore,
        activityId: "activity1",
        authorId: "alice",
        activityData: {
          visibility: "public",
          type: "run",
          authorName: long,
          displayName: long,
        },
        serverTimestamp: () => "created",
      })
    ).resolves.toEqual({ fanned: 2 });
    for (const recipient of ["alice", "bob"]) {
      const item = firestore.data.get(`feeds/${recipient}/items/activity1`);
      expect(item.activityId).toBe("activity1");
      expect(item.authorId).toBe("alice");
      expect(Object.keys(item).sort()).toEqual([
        "activityId",
        "authorId",
        "createdAt",
        "expiresAt",
        "schemaVersion",
      ]);
    }
  });
});

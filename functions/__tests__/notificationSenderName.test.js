/**
 * A notification names its sender from the sender's own public profile.
 *
 * The props and space-post-like callables took `data.fromName` from the
 * client and wrote it into the recipient's tray as written ("{name} gave
 * you props"): no word filter, and uncut in the message. Any caller could
 * put any text in someone else's notifications, in the app's own words.
 * They now ask socialFanout.senderDisplayName, which reads the document
 * the follow notification already reads.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const { memoryFirestore } = require("./helpers/memoryFirestore.cjs");
const { senderDisplayName } = require("../lib/socialFanout");
const { MAX_DISPLAY_NAME_LENGTH } = require("../profileSanitizer");

describe("senderDisplayName", () => {
  it("is the sender's public profile name", async () => {
    const db = memoryFirestore({
      "users/u1/public/profile": { displayName: "Sam" },
    });
    expect(await senderDisplayName(db, "u1")).toBe("Sam");
  });

  it("is Someone with no profile, no name or a name that is not text", async () => {
    expect(await senderDisplayName(memoryFirestore({}), "u1")).toBe("Someone");
    for (const displayName of ["", "   ", null, 42]) {
      const db = memoryFirestore({
        "users/u1/public/profile": { displayName },
      });
      expect(await senderDisplayName(db, "u1")).toBe("Someone");
    }
  });

  it("is cut at the app's name limit", async () => {
    const db = memoryFirestore({
      "users/u1/public/profile": { displayName: "a".repeat(80) },
    });
    expect(await senderDisplayName(db, "u1")).toHaveLength(
      MAX_DISPLAY_NAME_LENGTH
    );
  });

  it("is Someone when the read fails, so the props still land", async () => {
    const db = memoryFirestore({
      "users/u1/public/profile": { displayName: "Sam" },
    });
    db.failures.set("get:users/u1/public/profile", new Error("unavailable"));
    expect(await senderDisplayName(db, "u1")).toBe("Someone");
  });
});

describe("reachability: no callable takes the sender's name from the request", () => {
  const index = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "index.js"),
    "utf8"
  );

  it("props, space-post likes and both comment callables ask senderDisplayName", () => {
    // Anchor on the four notifications by their wording, so the count below
    // is about these callables.
    expect(index).toContain("gave you props");
    expect(index).toContain("gave your space post props");
    expect(index).toContain("commented on your activity");
    expect(index).toContain("commented on your space post");
    expect(
      index.match(/socialFanout\.senderDisplayName\(/g) || []
    ).toHaveLength(4);
  });

  it("reads no fromName off a request", () => {
    expect(index).not.toMatch(/data\.fromName|data\?\.fromName/);
  });
});

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FEED_INDEX_VERSION } from "../feedIndex";

const require = createRequire(import.meta.url);
const server = require("../../../functions/lib/feedIndex");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("feed index schema across client, writer and rules", () => {
  it("the running writer emits the version both client queries select", () => {
    const index = server.buildFeedIndex({
      activityId: "a1",
      authorId: "author",
      createdAt: new Date(),
      expiresAt: new Date(),
    });
    expect(index.schemaVersion).toBe(FEED_INDEX_VERSION);
    expect(server.FEED_INDEX_VERSION).toBe(FEED_INDEX_VERSION);
    expect(Object.keys(index).sort()).toEqual([
      "activityId",
      "authorId",
      "createdAt",
      "expiresAt",
      "schemaVersion",
    ]);
  });

  it("the read rule accepts exactly that schema version", () => {
    const rules = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");
    const feedRule = rules.match(
      /match \/feeds\/\{uid\}\/items\/\{doc\} \{([\s\S]*?)\n {4}\}/
    );
    expect(feedRule).not.toBeNull();
    const readableVersion = feedRule?.[1].match(
      /allow read:.*resource\.data\.schemaVersion\s*==\s*(\d+)/
    );
    expect(readableVersion).not.toBeNull();
    expect(Number(readableVersion?.[1])).toBe(FEED_INDEX_VERSION);
  });
});

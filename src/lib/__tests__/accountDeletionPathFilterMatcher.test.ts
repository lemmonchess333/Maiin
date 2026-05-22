/**
 * R1A-Deletion Chunk 1.1 — segment-aware pathFilter matcher tests.
 *
 * Pin the blast-radius behaviour of pathFilter matching. The deletion
 * executor (Chunk 3) uses matchesPathFilter to scope collectionGroup
 * query results before batched delete — a sloppy substring matcher
 * could delete unrelated collections that happen to share a name
 * (e.g. admin/feeds_archive/x/items would match a substring check for
 * "/feeds/").
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { matchesPathFilter, isValidPathFilter, assertEveryCollectionGroupHasPathFilter } = require(
  "../../../functions/lib/pathFilterMatcher.js",
);

describe("matchesPathFilter — positive cases", () => {
  it("feeds/*/items matches feeds/abc/items/doc1", () => {
    expect(matchesPathFilter("feeds/*/items", "feeds/abc/items/doc1")).toBe(true);
  });

  it("feeds/*/items matches the parent prefix feeds/abc/items (no leaf doc)", () => {
    expect(matchesPathFilter("feeds/*/items", "feeds/abc/items")).toBe(true);
  });

  it("blocks/*/users matches blocks/uidA/users/uidB", () => {
    expect(matchesPathFilter("blocks/*/users", "blocks/uidA/users/uidB")).toBe(true);
  });

  it("comments/*/items matches comments/activity123/items/comment456", () => {
    expect(matchesPathFilter("comments/*/items", "comments/activity123/items/comment456")).toBe(true);
  });

  it("groups/*/members matches groups/crewABC/members/uidD", () => {
    expect(matchesPathFilter("groups/*/members", "groups/crewABC/members/uidD")).toBe(true);
  });
});

describe("matchesPathFilter — negative blast-radius cases", () => {
  it("feeds/*/items does NOT match admin/feeds_archive/x/items/doc1 (substring trap)", () => {
    expect(matchesPathFilter("feeds/*/items", "admin/feeds_archive/x/items/doc1")).toBe(false);
  });

  it("feeds/*/items does NOT match testFixtures/feeds/x/items/doc1", () => {
    expect(matchesPathFilter("feeds/*/items", "testFixtures/feeds/x/items/doc1")).toBe(false);
  });

  it("blocks/*/users does NOT match following/uidA/users/uidB", () => {
    expect(matchesPathFilter("blocks/*/users", "following/uidA/users/uidB")).toBe(false);
  });

  it("blocks/*/users does NOT match followers/uidA/users/uidB", () => {
    expect(matchesPathFilter("blocks/*/users", "followers/uidA/users/uidB")).toBe(false);
  });

  it("blocks/*/users does NOT match kudos/activity/users/uidA (same leaf name, different parent)", () => {
    expect(matchesPathFilter("blocks/*/users", "kudos/activity/users/uidA")).toBe(false);
  });

  it("kudos/*/users does NOT match following/uidA/users/uidB", () => {
    expect(matchesPathFilter("kudos/*/users", "following/uidA/users/uidB")).toBe(false);
  });

  it("feeds/*/items does NOT match feeds/abc (candidate shorter than filter)", () => {
    expect(matchesPathFilter("feeds/*/items", "feeds/abc")).toBe(false);
  });

  it("feeds/*/items does NOT match feeds (much shorter)", () => {
    expect(matchesPathFilter("feeds/*/items", "feeds")).toBe(false);
  });
});

describe("matchesPathFilter — defensive input handling", () => {
  it("returns false for non-string inputs", () => {
    expect(matchesPathFilter(null, "feeds/x/items")).toBe(false);
    expect(matchesPathFilter("feeds/*/items", null)).toBe(false);
    expect(matchesPathFilter(123, "feeds/x/items")).toBe(false);
    expect(matchesPathFilter(undefined, undefined)).toBe(false);
  });

  it("tolerates leading and trailing slashes", () => {
    expect(matchesPathFilter("/feeds/*/items/", "/feeds/abc/items/doc1/")).toBe(true);
  });

  it("rejects empty segments inside paths", () => {
    expect(matchesPathFilter("feeds//items", "feeds/abc/items/doc1")).toBe(false);
    expect(matchesPathFilter("feeds/*/items", "feeds//items/doc1")).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(matchesPathFilter("", "feeds/abc/items/doc1")).toBe(false);
    expect(matchesPathFilter("feeds/*/items", "")).toBe(false);
  });
});

describe("isValidPathFilter", () => {
  it("accepts well-formed filters", () => {
    expect(isValidPathFilter("feeds/*/items")).toBe(true);
    expect(isValidPathFilter("blocks/*/users")).toBe(true);
    expect(isValidPathFilter("comments/*/items")).toBe(true);
    expect(isValidPathFilter("kudos/*/users")).toBe(true);
    expect(isValidPathFilter("groups/*/members")).toBe(true);
    expect(isValidPathFilter("challenges/*/participants")).toBe(true);
  });

  it("rejects single-segment filters (use type:collectionGroup directly)", () => {
    expect(isValidPathFilter("items")).toBe(false);
  });

  it("rejects empty filters", () => {
    expect(isValidPathFilter("")).toBe(false);
    expect(isValidPathFilter("/")).toBe(false);
  });

  it("rejects filters with empty segments", () => {
    expect(isValidPathFilter("feeds//items")).toBe(false);
  });

  it("rejects filters ending in wildcard (trailing wildcard would match any leaf — defeats filtering)", () => {
    expect(isValidPathFilter("feeds/abc/*")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isValidPathFilter(null)).toBe(false);
    expect(isValidPathFilter(undefined)).toBe(false);
    expect(isValidPathFilter(123)).toBe(false);
  });
});

describe("assertEveryCollectionGroupHasPathFilter", () => {
  it("passes when every collectionGroup entry has a valid pathFilter", () => {
    const included = [
      { key: "a", type: "userSubcollection", path: "users/{uid}/x" },
      { key: "b", type: "collectionGroupByField", pathFilter: "feeds/*/items" },
      { key: "c", type: "collectionGroupByDocId", pathFilter: "groups/*/members" },
    ];
    expect(() => assertEveryCollectionGroupHasPathFilter(included)).not.toThrow();
  });

  it("throws when a collectionGroup entry lacks pathFilter", () => {
    const included = [
      { key: "a", type: "collectionGroupByField" }, // missing
    ];
    expect(() => assertEveryCollectionGroupHasPathFilter(included)).toThrow(
      /missing valid pathFilter/,
    );
    expect(() => assertEveryCollectionGroupHasPathFilter(included)).toThrow(/a/);
  });

  it("throws when a pathFilter is malformed", () => {
    const included = [
      { key: "a", type: "collectionGroupByField", pathFilter: "feeds/*" }, // trailing wildcard
    ];
    expect(() => assertEveryCollectionGroupHasPathFilter(included)).toThrow(/malformed/);
  });

  it("ignores non-collectionGroup entry types", () => {
    const included = [
      { key: "a", type: "userSubcollection" }, // no pathFilter needed
      { key: "b", type: "topLevelByUid" }, // no pathFilter needed
      { key: "c", type: "storagePrefix" }, // no pathFilter needed
    ];
    expect(() => assertEveryCollectionGroupHasPathFilter(included)).not.toThrow();
  });
});

describe("matchesPathFilter — applied to the actual inventory pathFilters", () => {
  const inventory = require("../../../functions/accountDeletionInventory.json");

  it("every collectionGroup entry's pathFilter passes isValidPathFilter", () => {
    for (const entry of inventory.included) {
      if (entry.pathFilter) {
        expect(isValidPathFilter(entry.pathFilter), `${entry.key}: ${entry.pathFilter}`).toBe(true);
      }
    }
  });

  it("inventory-level validation passes", () => {
    expect(() => assertEveryCollectionGroupHasPathFilter(inventory.included)).not.toThrow();
  });

  it("known-evil candidate paths are rejected by all inventory pathFilters that mention 'feeds'", () => {
    const evilFeedsAlike = [
      "admin/feeds_archive/x/items/doc1",
      "testFixtures/feeds/x/items/doc1",
      "feeds_v2/abc/items/doc1",
    ];
    const feedsFilters = inventory.included
      .filter((e: { pathFilter?: string }) => e.pathFilter && e.pathFilter.startsWith("feeds/"))
      .map((e: { pathFilter: string }) => e.pathFilter);
    for (const filter of feedsFilters) {
      for (const candidate of evilFeedsAlike) {
        expect(matchesPathFilter(filter, candidate), `${filter} should not match ${candidate}`).toBe(false);
      }
    }
  });
});

/**
 * R1A-Deletion Chunk 1.1 — legacy alias executable-target tests.
 *
 * Phase 0 found that deleteMyAccount enumerates collection NAMES that
 * don't match what the app actually writes (bodyweight vs bodyweightLogs,
 * water vs waterLog, favorites vs foodFavourites, preferences vs
 * settings). The Chunk 1 inventory listed legacyAliases as informational
 * strings; Chunk 1.1 promotes them to EXECUTABLE deletion targets so
 * the Chunk 3 executor sweeps both current and historical paths.
 *
 * Contract pinned here:
 *   1. Aliases are an array of {key, path, reason} entries — not just strings.
 *   2. Every aliased entry exposes alias paths via the loader helper.
 *   3. Missing alias paths must be treated as success by the executor
 *      (NotFound is no-op; clean accounts shouldn't enter failed_cleanup
 *      just because they never wrote to a legacy path).
 *   4. The drift-prevention test treats aliases as classified paths.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const inventoryLoader = require("../../../functions/accountDeletionInventory.js");
const { expandUserSubcollectionPaths } = inventoryLoader;
const inventory = require("../../../functions/accountDeletionInventory.json");

interface AliasEntry { key: string; path: string; reason: string; }
interface IncludedEntry {
  key: string;
  path?: string;
  aliases?: AliasEntry[];
}

const findEntry = (key: string): IncludedEntry =>
  (inventory.included as IncludedEntry[]).find((e) => e.key === key) as IncludedEntry;

describe("legacy aliases are executable deletion targets", () => {
  const namingDriftEntries = [
    {
      key: "userBodyweightLogs",
      currentPath: "users/{uid}/bodyweightLogs",
      expectedLegacyPaths: ["users/{uid}/bodyweight", "users/{uid}/weights"],
    },
    {
      key: "userWaterLog",
      currentPath: "users/{uid}/waterLog",
      expectedLegacyPaths: ["users/{uid}/water"],
    },
    {
      key: "userFoodFavourites",
      currentPath: "users/{uid}/foodFavourites",
      expectedLegacyPaths: ["users/{uid}/favorites"],
    },
    {
      key: "userSettings",
      currentPath: "users/{uid}/settings",
      expectedLegacyPaths: ["users/{uid}/preferences"],
    },
  ];

  it("every naming-drift entry has aliases array (not string array)", () => {
    for (const drift of namingDriftEntries) {
      const entry = findEntry(drift.key);
      expect(entry, `missing entry: ${drift.key}`).toBeTruthy();
      expect(Array.isArray(entry.aliases), `${drift.key}.aliases must be an array`).toBe(true);
      for (const alias of entry.aliases!) {
        expect(typeof alias).toBe("object");
        expect(alias.key).toBeTruthy();
        expect(alias.path).toBeTruthy();
        expect(alias.reason).toBeTruthy();
      }
    }
  });

  it("every naming-drift entry's aliases include the expected legacy paths", () => {
    for (const drift of namingDriftEntries) {
      const entry = findEntry(drift.key);
      const aliasPaths = entry.aliases!.map((a) => a.path);
      for (const legacyPath of drift.expectedLegacyPaths) {
        expect(aliasPaths, `${drift.key}: missing legacy alias ${legacyPath}`).toContain(legacyPath);
      }
    }
  });

  it("expandUserSubcollectionPaths returns current + every alias for a uid", () => {
    const uid = "test-uid-123";
    const entry = findEntry("userBodyweightLogs");
    const paths = expandUserSubcollectionPaths(entry, uid);
    expect(paths).toContain("users/test-uid-123/bodyweightLogs");
    expect(paths).toContain("users/test-uid-123/bodyweight");
    expect(paths).toContain("users/test-uid-123/weights");
    expect(paths.length).toBe(3);
  });

  it("expandUserSubcollectionPaths returns just the current path for entries with no aliases", () => {
    const uid = "test-uid-123";
    const entry = findEntry("userMeals");
    const paths = expandUserSubcollectionPaths(entry, uid);
    expect(paths).toEqual(["users/test-uid-123/meals"]);
  });
});

describe("executor contract: missing legacy alias is success", () => {
  /**
   * The executor in Chunk 3 will iterate expandUserSubcollectionPaths
   * results and attempt to delete each. For aliases, the path may not
   * exist on a given account (clean accounts that never wrote to legacy
   * names). The contract is documented here as the test we will pin in
   * Chunk 3:
   *
   *   - missing subcollection -> success (NotFound = no-op)
   *   - existing alias subcollection -> deleted
   *   - mixed (current exists, legacy missing) -> success
   *   - retry on already-deleted alias -> success (idempotent)
   *
   * Chunk 1.1 cannot test the executor itself (Chunk 3 scope), but the
   * inventory loader contract pinned here ensures the executor receives
   * the full path list — including aliases — for every account.
   */
  it("contract: every alias is reachable as a deletion target even on clean accounts", () => {
    // Verify the alias path is well-formed (so deletion would succeed-no-op
    // rather than throw a malformed-path error).
    const entry = findEntry("userBodyweightLogs");
    const paths = expandUserSubcollectionPaths(entry, "uid-with-special-chars-_123");
    for (const path of paths) {
      // Each path is parseable as a Firestore collection ref shape:
      // segments separated by /, no double slashes, at least 2 segments.
      const segments = path.split("/");
      expect(segments.length).toBeGreaterThanOrEqual(2);
      expect(segments.every((s: string) => s !== "")).toBe(true);
      expect(path).not.toContain("//");
    }
  });

  it("contract: alias entries do not produce duplicate paths in expansion", () => {
    const entry = findEntry("userBodyweightLogs");
    const paths = expandUserSubcollectionPaths(entry, "uid-X");
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });
});

describe("non-naming-drift entries do not accidentally carry aliases", () => {
  it("entries with no naming history have aliases: []", () => {
    const noLegacyKeys = ["userMeals", "userWorkouts", "userRuns", "userShoes", "userPrivacyZones"];
    for (const key of noLegacyKeys) {
      const entry = findEntry(key);
      expect(entry.aliases, `${key} should have aliases: []`).toEqual([]);
    }
  });
});

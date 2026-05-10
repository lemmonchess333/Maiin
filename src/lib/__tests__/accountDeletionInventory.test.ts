/**
 * R1A-Deletion Chunk 1 — inventory shape tests.
 *
 * Pin the canonical inventory shape so a future edit can't silently
 * drop a required field or introduce a duplicate key. The
 * drift-prevention test (accountDeletionDrift.test.ts) cross-checks
 * code paths against this inventory; if it diverges from its
 * expected shape the drift test would silently misclassify.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const inventoryPath = resolve(here, "../../../functions/accountDeletionInventory.json");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));

interface IncludedEntry {
  key: string;
  domain: string;
  type: string;
  path?: string;
  collectionGroup?: string;
  legacyAliases?: string[];
  containsPersonalData: boolean;
  strategy: string;
  lockNeeded: string;
  reason: string;
  testCoveragePlanned: string;
}

interface ExcludedEntry {
  key: string;
  domain: string;
  type: string;
  containsPersonalData: boolean;
  strategy: string;
  retentionWindow: string;
  reviewedBy: string;
  reason: string;
  minimisationRule?: string;
}

const ALLOWED_DOMAINS = [
  "A_private",
  "B_publicProfile",
  "C_ugc",
  "D_crossUserEdge",
  "E_fanout",
  "F_usage",
  "G_payment",
  "H_excluded",
  "Z_operational",
];

const ALLOWED_STRATEGIES = [
  "deleteSubcollection",
  "deleteQueryInBatches",
  "deleteCollectionGroupInBatches",
  "deleteKnownDocIfExists",
  "deleteStoragePrefix",
  "anonymise",
  "retain",
];

const ALLOWED_LOCK_TYPES = [
  "direct-rules",
  "callable-actor",
  "referenced-uid",
  "system-writer",
  "none",
];

describe("accountDeletionInventory shape", () => {
  it("loads with version + included + excluded + domains + strategies + lockTypes", () => {
    expect(inventory.version).toBe(1);
    expect(Array.isArray(inventory.included)).toBe(true);
    expect(Array.isArray(inventory.excluded)).toBe(true);
    expect(inventory.included.length).toBeGreaterThan(20);
    expect(inventory.excluded.length).toBeGreaterThan(0);
    expect(typeof inventory.domains).toBe("object");
    expect(typeof inventory.strategies).toBe("object");
    expect(typeof inventory.lockTypes).toBe("object");
  });

  it("included entries all have required fields", () => {
    for (const entry of inventory.included as IncludedEntry[]) {
      expect(entry.key, JSON.stringify(entry)).toBeTruthy();
      expect(entry.domain).toBeTruthy();
      expect(entry.type).toBeTruthy();
      expect(typeof entry.containsPersonalData).toBe("boolean");
      expect(entry.strategy).toBeTruthy();
      expect(entry.lockNeeded).toBeTruthy();
      expect(entry.reason).toBeTruthy();
      expect(entry.testCoveragePlanned).toBeTruthy();
      expect(ALLOWED_DOMAINS).toContain(entry.domain);
      expect(ALLOWED_STRATEGIES).toContain(entry.strategy);
      expect(ALLOWED_LOCK_TYPES).toContain(entry.lockNeeded);
    }
  });

  it("excluded entries all have required fields incl. meaningful reason", () => {
    for (const entry of inventory.excluded as ExcludedEntry[]) {
      expect(entry.key).toBeTruthy();
      expect(entry.domain).toBeTruthy();
      expect(typeof entry.containsPersonalData).toBe("boolean");
      expect(entry.strategy).toBeTruthy();
      expect(entry.retentionWindow).toBeTruthy();
      expect(entry.reviewedBy).toBeTruthy();
      expect(entry.reason).toBeTruthy();
      expect(ALLOWED_DOMAINS).toContain(entry.domain);
      // Spec rule: if containsPersonalData, reason must be specific
      // (>30 chars meaningful — not "operational" / "system" / "legal")
      if (entry.containsPersonalData) {
        expect(entry.reason.length).toBeGreaterThan(30);
        const oneWordRejects = /^(operational|system|legal|business|required)\.?$/i;
        expect(entry.reason).not.toMatch(oneWordRejects);
      }
    }
  });

  it("no duplicate keys across included + excluded", () => {
    const allKeys = [
      ...inventory.included.map((e: IncludedEntry) => e.key),
      ...inventory.excluded.map((e: ExcludedEntry) => e.key),
    ];
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const k of allKeys) {
      if (seen.has(k)) dupes.push(k);
      seen.add(k);
    }
    expect(dupes).toEqual([]);
  });

  it("naming-drift entries carry the legacy aliases that prove backward-compat sweep coverage", () => {
    const byKey = (k: string) =>
      (inventory.included as IncludedEntry[]).find((e) => e.key === k);
    expect(byKey("userBodyweightLogs")?.legacyAliases).toContain("users/{uid}/bodyweight");
    expect(byKey("userBodyweightLogs")?.legacyAliases).toContain("users/{uid}/weights");
    expect(byKey("userWaterLog")?.legacyAliases).toContain("users/{uid}/water");
    expect(byKey("userFoodFavourites")?.legacyAliases).toContain("users/{uid}/favorites");
    expect(byKey("userSettings")?.legacyAliases).toContain("users/{uid}/preferences");
  });

  it("user root + public profile have correct ordering metadata in their reasons", () => {
    const byKey = (k: string) =>
      (inventory.included as IncludedEntry[]).find((e) => e.key === k);
    expect(byKey("userPublicProfile")?.reason).toMatch(/before users\/\{uid\}/i);
    expect(byKey("userRoot")?.reason).toMatch(/last/i);
  });

  it("operational records (Z_operational) carry minimisation rules", () => {
    const operational = (inventory.excluded as ExcludedEntry[]).filter(
      (e) => e.domain === "Z_operational",
    );
    expect(operational.length).toBeGreaterThanOrEqual(3);
    for (const entry of operational) {
      expect(entry.minimisationRule).toBeTruthy();
    }
  });
});

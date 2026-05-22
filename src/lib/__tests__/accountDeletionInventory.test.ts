/**
 * R1A-Deletion Chunk 1.1 — inventory shape tests.
 *
 * Pin the canonical inventory shape so a future edit can't silently
 * drop a required field or introduce a duplicate key. The
 * drift-prevention test (accountDeletionDrift.test.ts) cross-checks
 * code paths against this inventory; if it diverges from its
 * expected shape the drift test would silently misclassify.
 *
 * Chunk 1.1 schema changes:
 *   - aliases[] (array of {key, path, reason}) replaces legacyAliases (string[])
 *   - piiCategory + recordPurpose split out from containsPersonalData
 *   - testCoverageKey + testCoverageStatus per entry
 *   - hasNestedSubcollections per entry
 *   - userPublicSubcollection replaces userPublicProfile
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const inventoryPath = resolve(here, "../../../functions/accountDeletionInventory.json");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));

interface AliasEntry {
  key: string;
  path: string;
  reason: string;
}

interface IncludedEntry {
  key: string;
  domain: string;
  type: string;
  path?: string;
  collectionGroup?: string;
  aliases?: AliasEntry[];
  containsPersonalData: boolean;
  piiCategory: string;
  recordPurpose: string;
  strategy: string;
  lockNeeded: string;
  reason: string;
  testCoverageKey: string;
  testCoverageStatus: string;
  hasNestedSubcollections?: boolean;
}

interface ExcludedEntry {
  key: string;
  domain: string;
  type: string;
  containsPersonalData: boolean;
  piiCategory: string;
  recordPurpose: string;
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
  "anonymiseAndOverwriteContent",
  "anonymiseAuthorOnly",
  "anonymiseMinimisedShape",
  "retain",
];

const ALLOWED_LOCK_TYPES = [
  "direct-rules",
  "callable-actor",
  "referenced-uid",
  "system-writer",
  "none",
];

const ALLOWED_PII_CATEGORIES = [
  "uid",
  "paymentIdentifier",
  "location",
  "healthFitness",
  "userContent",
  "publicProfile",
  "none",
];

const ALLOWED_RECORD_PURPOSES = [
  "private",
  "userContent",
  "publicProfile",
  "payment",
  "moderation",
  "operational",
  "system",
];

const ALLOWED_TEST_COVERAGE_STATUSES = ["planned", "implemented"];

describe("inventory shape — Chunk 1.1 schema v2", () => {
  it("inventory version is 2 (Chunk 1.1 schema)", () => {
    expect(inventory.version).toBe(2);
  });

  it("loads with included + excluded + domains + strategies + lockTypes + piiCategories + recordPurposes + designConstants", () => {
    expect(Array.isArray(inventory.included)).toBe(true);
    expect(Array.isArray(inventory.excluded)).toBe(true);
    expect(inventory.included.length).toBeGreaterThan(20);
    expect(inventory.excluded.length).toBeGreaterThan(0);
    expect(typeof inventory.domains).toBe("object");
    expect(typeof inventory.strategies).toBe("object");
    expect(typeof inventory.lockTypes).toBe("object");
    expect(typeof inventory.piiCategories).toBe("object");
    expect(typeof inventory.recordPurposes).toBe("object");
    expect(typeof inventory.designConstants).toBe("object");
  });

  it("designConstants document the spec items 15-19", () => {
    expect(inventory.designConstants.executionOrder).toContain("Phase A");
    expect(inventory.designConstants.executionOrder).toContain("Phase H");
    expect(inventory.designConstants.verificationRule).toContain("strongly consistent");
    expect(inventory.designConstants.systemWriterCheckTiming).toContain("before each write commit");
    expect(inventory.designConstants.counterIdempotence).toContain("transaction");
    expect(inventory.designConstants.lockFirstEnumerateSecond).toContain("OUTSIDE");
  });
});

describe("included entries — required fields and allowed values", () => {
  it("every included entry has the full Chunk 1.1 field set", () => {
    for (const entry of inventory.included as IncludedEntry[]) {
      expect(entry.key, JSON.stringify(entry)).toBeTruthy();
      expect(entry.domain).toBeTruthy();
      expect(entry.type).toBeTruthy();
      expect(typeof entry.containsPersonalData).toBe("boolean");
      expect(entry.piiCategory).toBeTruthy();
      expect(entry.recordPurpose).toBeTruthy();
      expect(entry.strategy).toBeTruthy();
      expect(entry.lockNeeded).toBeTruthy();
      expect(entry.reason).toBeTruthy();
      expect(entry.testCoverageKey).toBeTruthy();
      expect(entry.testCoverageStatus).toBeTruthy();
      expect(typeof entry.hasNestedSubcollections).toBe("boolean");

      expect(ALLOWED_DOMAINS).toContain(entry.domain);
      expect(ALLOWED_STRATEGIES).toContain(entry.strategy);
      expect(ALLOWED_LOCK_TYPES).toContain(entry.lockNeeded);
      expect(ALLOWED_PII_CATEGORIES).toContain(entry.piiCategory);
      expect(ALLOWED_RECORD_PURPOSES).toContain(entry.recordPurpose);
      expect(ALLOWED_TEST_COVERAGE_STATUSES).toContain(entry.testCoverageStatus);
    }
  });

  it("aliases are an array of {key, path, reason} objects (not strings)", () => {
    for (const entry of inventory.included as IncludedEntry[]) {
      if (!entry.aliases) continue;
      expect(Array.isArray(entry.aliases)).toBe(true);
      for (const alias of entry.aliases) {
        expect(typeof alias).toBe("object");
        expect(alias.key).toBeTruthy();
        expect(alias.path).toBeTruthy();
        expect(alias.reason).toBeTruthy();
      }
    }
  });

  it("naming-drift entries carry the expected legacy aliases", () => {
    const findEntry = (k: string) =>
      (inventory.included as IncludedEntry[]).find((e) => e.key === k);

    const bodyweight = findEntry("userBodyweightLogs");
    const bodyweightPaths = bodyweight!.aliases!.map((a) => a.path);
    expect(bodyweightPaths).toContain("users/{uid}/bodyweight");
    expect(bodyweightPaths).toContain("users/{uid}/weights");

    const water = findEntry("userWaterLog");
    expect(water!.aliases!.map((a) => a.path)).toContain("users/{uid}/water");

    const foodFav = findEntry("userFoodFavourites");
    expect(foodFav!.aliases!.map((a) => a.path)).toContain("users/{uid}/favorites");

    const settings = findEntry("userSettings");
    expect(settings!.aliases!.map((a) => a.path)).toContain("users/{uid}/preferences");
  });

  it("userPublicSubcollection (not userPublicProfile) is the public-data entry", () => {
    const pub = (inventory.included as IncludedEntry[]).find((e) => e.key === "userPublicSubcollection");
    expect(pub, "userPublicSubcollection must exist (replaces userPublicProfile)").toBeTruthy();
    expect(pub!.path).toBe("users/{uid}/public");
    expect(pub!.strategy).toBe("deleteSubcollection");
    const oldKey = (inventory.included as IncludedEntry[]).find((e) => e.key === "userPublicProfile");
    expect(oldKey, "old userPublicProfile key should not coexist").toBeFalsy();
  });

  it("userRoot is documented as having nested subcollections handled separately", () => {
    const root = (inventory.included as IncludedEntry[]).find((e) => e.key === "userRoot");
    expect(root!.hasNestedSubcollections).toBe(true);
    expect((root as unknown as { nestedSubcollectionsHandledBy: string }).nestedSubcollectionsHandledBy).toBeTruthy();
  });

  it("activitiesOwn audit note confirms no nested subcollections under activities/{id}", () => {
    const act = (inventory.included as IncludedEntry[]).find((e) => e.key === "activitiesOwn");
    expect(act!.hasNestedSubcollections).toBe(false);
    expect(
      (act as unknown as { nestedSubcollectionsAuditNote: string }).nestedSubcollectionsAuditNote,
    ).toContain("kudos and comments are TOP-LEVEL");
  });

  it("activitiesOwnKudos and activitiesOwnComments exist for content-ID reference cleanup", () => {
    const kudosRef = (inventory.included as IncludedEntry[]).find((e) => e.key === "activitiesOwnKudos");
    const commentsRef = (inventory.included as IncludedEntry[]).find((e) => e.key === "activitiesOwnComments");
    expect(kudosRef).toBeTruthy();
    expect(commentsRef).toBeTruthy();
    expect((kudosRef as unknown as { preflightSource: string }).preflightSource).toContain("activities where authorId");
    expect((commentsRef as unknown as { preflightSource: string }).preflightSource).toContain("activities where authorId");
  });
});

describe("excluded entries — required fields and allowed values", () => {
  it("every excluded entry has the Chunk 1.1 schema", () => {
    for (const entry of inventory.excluded as ExcludedEntry[]) {
      expect(entry.key).toBeTruthy();
      expect(entry.domain).toBeTruthy();
      expect(typeof entry.containsPersonalData).toBe("boolean");
      expect(entry.piiCategory).toBeTruthy();
      expect(entry.recordPurpose).toBeTruthy();
      expect(entry.strategy).toBeTruthy();
      expect(entry.retentionWindow).toBeTruthy();
      expect(entry.reviewedBy).toBeTruthy();
      expect(entry.reason).toBeTruthy();

      expect(ALLOWED_DOMAINS).toContain(entry.domain);
      expect(ALLOWED_PII_CATEGORIES).toContain(entry.piiCategory);
      expect(ALLOWED_RECORD_PURPOSES).toContain(entry.recordPurpose);

      if (entry.containsPersonalData) {
        expect(entry.reason.length).toBeGreaterThan(30);
        const oneWordRejects = /^(operational|system|legal|business|required)\.?$/i;
        expect(entry.reason).not.toMatch(oneWordRejects);
      }
    }
  });

  it("reportsAboutMe uses anonymiseMinimisedShape (not retain unchanged)", () => {
    const reports = (inventory.excluded as ExcludedEntry[]).find((e) => e.key === "reportsAboutMe");
    expect(reports!.strategy).toBe("anonymiseMinimisedShape");
    expect(reports!.retentionWindow).toContain("365 days");
    expect(
      (reports as unknown as { minimisedShape: { abuseIdentityHashSpec: string } }).minimisedShape.abuseIdentityHashSpec,
    ).toContain("HMAC");
  });

  it("commentsAuthoredByMe defines Option C interim: visible 'Comment deleted' + server-only originalText for moderation reversibility", () => {
    const comments = (inventory.excluded as ExcludedEntry[]).find((e) => e.key === "commentsAuthoredByMe");
    expect(comments!.strategy).toBe("anonymiseAndOverwriteContent");
    const anonFields = (comments as unknown as { anonymiseFields: Record<string, string | null> }).anonymiseFields;
    expect(anonFields.text).toBe("Comment deleted");
    expect(anonFields.authorId).toBe(null);
    const renderAudit = (comments as unknown as { renderSafetyAudit: { verdict: string; renderers: unknown[]; originalTextLeakageAudit: string } }).renderSafetyAudit;
    expect(renderAudit.verdict).toContain("safely");
    expect(Array.isArray(renderAudit.renderers)).toBe(true);
    expect(renderAudit.renderers.length).toBeGreaterThan(0);
    expect(renderAudit.originalTextLeakageAudit).toBeTruthy();
    // Option C interim: originalText preserved server-side with 365d retention
    const preserved = (comments as unknown as { preservedOriginalFields: { policy: string; fields: { name: string; retentionWindow: string; readAccess: string }[] } }).preservedOriginalFields;
    expect(preserved.policy).toContain("Option C");
    expect(preserved.fields.length).toBeGreaterThan(0);
    const originalText = preserved.fields.find((f) => f.name === "originalText");
    expect(originalText, "originalText must be in preservedOriginalFields per Option C").toBeTruthy();
    expect(originalText!.retentionWindow).toContain("365 days");
    expect(originalText!.readAccess).toContain("server-only");
  });

  it("paymentEventsPostDeletion is NOT marked as indefinite default retention", () => {
    const pmt = (inventory.excluded as ExcludedEntry[]).find((e) => e.key === "paymentEventsPostDeletion");
    expect(pmt!.retentionWindow.toLowerCase()).not.toBe("indefinite");
    expect(pmt!.retentionWindow).toContain("90 days");
    expect((pmt as unknown as { reviewClosureProcess: string }).reviewClosureProcess).toBeTruthy();
  });

  it("deletedBillingIdentities is a separate billing tombstone", () => {
    const billing = (inventory.excluded as ExcludedEntry[]).find((e) => e.key === "deletedBillingIdentities");
    expect(billing, "deletedBillingIdentities must exist as a separate billing tombstone").toBeTruthy();
    expect(billing!.piiCategory).toBe("paymentIdentifier");
    expect(billing!.retentionWindow).toContain("13 months");
    expect(billing!.minimisationRule).toContain("hashed");
  });

  it("operational records (Z_operational) all carry minimisation rules", () => {
    const operational = (inventory.excluded as ExcludedEntry[]).filter(
      (e) => e.domain === "Z_operational",
    );
    expect(operational.length).toBeGreaterThanOrEqual(4);
    for (const entry of operational) {
      expect(entry.minimisationRule, `${entry.key} missing minimisationRule`).toBeTruthy();
    }
  });

  it("PII classification corrections: ledger / tombstone / paymentEvents are containsPersonalData:true even though they were 'no' in Chunk 1", () => {
    const keys = ["accountDeletionLedger", "deletedAccountsTombstone", "paymentEventsPostDeletion"];
    for (const key of keys) {
      const entry = (inventory.excluded as ExcludedEntry[]).find((e) => e.key === key);
      expect(entry!.containsPersonalData, `${key} should have containsPersonalData: true (uid or paymentId is PII)`).toBe(true);
    }
  });

  it("scanUsage and userEngineLock are also containsPersonalData:true (uid is PII per piiCategory:uid)", () => {
    const keys = ["scanUsage", "userEngineLock", "rateLimits"];
    for (const key of keys) {
      const entry = (inventory.included as IncludedEntry[]).find((e) => e.key === key);
      expect(entry!.containsPersonalData, `${key} should have containsPersonalData: true`).toBe(true);
      expect(entry!.piiCategory).toBe("uid");
    }
  });
});

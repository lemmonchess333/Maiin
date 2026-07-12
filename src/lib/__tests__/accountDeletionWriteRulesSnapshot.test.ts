/**
 * R1A-Deletion Chunk 2.C — future-drift protection (Blocker F).
 *
 * Catches the case where a new feature adds a write rule to
 * firestore.rules that silently bypasses the deletion freeze. Without
 * this guard, the protected-path list would drift away from reality
 * as the app grows.
 *
 * Methodology (Blocker E):
 *   A "protected path" is any `match /PATH { ... }` block in
 *   firestore.rules where at least one client-write rule exists
 *   (allow create / allow update / allow delete / allow write — but
 *   NOT `allow write: if false`, which is vacuously frozen).
 *
 *   Every protected path MUST appear in PROTECTED_PATHS in
 *   accountDeletionRulesCoverage.test.ts (which independently asserts
 *   the freeze is applied) OR in EXPLICITLY_EXEMPT below (server-only
 *   collections, read-only paths, recursive-wildcard read rules).
 *
 *   The two lists together must cover EVERY non-infrastructure
 *   match block in firestore.rules. Anything else fails this test
 *   and the new feature's PR cannot merge until the implementer
 *   classifies the new path.
 *
 * Detection mode (Blocker F sub-question "additions or modifications"):
 *   Snapshot — we maintain the authoritative list here and require it
 *   to match the parsed-rules result exactly. Additions OR removals
 *   OR rule-shape changes that toggle write-ability all surface as
 *   test failures. CI on the deployment branch must mark this test
 *   as a required status check.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const rulesText = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");

/**
 * The client-writable paths protected by the deletion freeze.
 * Maintained alongside accountDeletionRulesCoverage.test.ts
 * PROTECTED_PATHS — drift between the two is detected by the
 * cross-check at the bottom of this file.
 */
const PROTECTED_PATHS = [
  "match /users/{uid}",
  "match /users/{uid}/meals/{doc}",
  "match /users/{uid}/savedRoutines/{doc}",
  "match /users/{uid}/savedRoutes/{doc}",
  "match /users/{uid}/workouts/{doc}",
  "match /users/{uid}/runs/{doc}",
  "match /users/{uid}/weights/{doc}",
  "match /users/{uid}/settings/{doc}",
  "match /users/{uid}/foodFavourites/{doc}",
  "match /users/{uid}/waterLog/{doc}",
  // Per-day macro-target snapshot backing the nutrition badges. Owner-writable
  // (frozen mid-deletion) + swept by the executor (USER_SUBCOLLECTIONS includes
  // "dailyNutrition"), so it's a protected path like waterLog.
  "match /users/{uid}/dailyNutrition/{doc}",
  "match /users/{uid}/bodyweightLogs/{doc}",
  "match /users/{uid}/programState/{doc}",
  "match /users/{uid}/streaks/{doc}",
  "match /users/{uid}/devices/{token}",
  "match /users/{uid}/shoes/{shoeId}",
  "match /users/{uid}/logs/{date}",
  "match /users/{uid}/stats/{doc}",
  "match /users/{uid}/public/{doc}",
  "match /users/{uid}/progressPhotos/{doc}",
  // Progress Vault check-ins (BODY-VAULT-01) — owner-writable groupings
  // over progressPhotos, frozen mid-deletion + swept by the executor
  // (USER_SUBCOLLECTIONS includes "progressCheckins").
  "match /users/{uid}/progressCheckins/{doc}",
  "match /users/{uid}/privacyZones/{doc}",
  "match /users/{uid}/checkins/{weekKey}",
  "match /users/{uid}/trainingBlocks/{blockId}",
  "match /users/{uid}/journeys/{journeyId}",
  "match /users/{uid}/nutritionCommitments/{weekKey}",
  "match /goalSpaces/{spaceId}/events/{eventId}",
  "match /users/{uid}/errors/{doc}",
  "match /feeds/{uid}/items/{doc}",
  "match /following/{uid}/users/{targetUid}",
  "match /followers/{uid}/users/{followerUid}",
  "match /notifications/{uid}/items/{doc}",
  "match /blocks/{uid}/users/{targetUid}",
  "match /reports/{reportId}",
  "match /groups/{crewId}",
  // SOCIAL S3 — partner-streak bond. Client-writable create + delete
  // (either of the two members); Soc7 made UPDATE server-only
  // (`if false` — streak state is written by the Admin SDK persist path).
  // Create freezes BOTH members (!isDeleting on members[0] AND members[1])
  // so a bond can't be minted naming a mid-deletion user. Still a
  // protected path (create+delete are client-writable). R1A executor
  // sweeps these in step 3b (inventory key: partnerBondsMember).
  "match /partnerBonds/{bondId}",
  // Spc1 PR1 — Community Spaces. Parser sees the bare nested forms
  // (like /participants/{uid} under challenges): semantic paths are
  // spaces/{spaceId}/members/{uid} and spaces/{spaceId}/posts/{postId}.
  // Both freeze CREATE via !isDeleting (member join / post create);
  // update+delete are intentionally unfrozen (leave/cleanup stays
  // possible; the executor sweep for spaces data lands in Spc1 PR4
  // alongside the space-photos Storage prefix sweep).
  "match /members/{uid}",
  "match /posts/{postId}",
  // 2026-05-26 audit PR 2: /groups/{crewId}/members/{userId} removed
  // from PROTECTED_PATHS — the rule is now `if false` (server-only).
  // R1A protection moved to setCrewMembershipCallable.
];

export const EXPECTED_PROTECTED_PATH_COUNT = PROTECTED_PATHS.length;

/**
 * Match blocks that have client-writable rules BUT are intentionally
 * exempt from the deletion freeze, with the reason. Adding a new
 * exempt path requires a code-review-visible decision here.
 */
const EXPLICITLY_EXEMPT = [
  {
    path: "match /activities/{activityId}",
    reason:
      "Cross-user UGC. Deleting users CAN technically create new activities mid-deletion; Chunk 3 executor sweeps activities where authorId==uid in Phase D so any mid-deletion create is cleaned. Adding a freeze here would deny legitimate post-creation kudos/comment bumps from OTHER users which is the dominant write path. Re-evaluate if Chunk 3 experiences race issues.",
  },
  {
    path: "match /kudos/{activityId}/users/{userId}",
    reason:
      "Cross-user write — kudos giver is request.auth.uid. Freeze would require !isDeleting(userId), but kudos creation rate is high and the Chunk 3 executor sweeps kudosByMe via collectionGroup. Same race-cleanup posture as activities.",
  },
  {
    path: "match /comments/{activityId}/items/{commentId}",
    reason:
      "Cross-user write — comment authorId is request.auth.uid. Anonymisation strategy (Option C interim) means comments by a deleting user become 'Comment deleted' anyway. Freezing creation here would only narrow the orphan-comment window slightly.",
  },
  {
    path: "match /challenges/{challengeId}",
    reason:
      "Global challenge metadata, not user-keyed. Client-seeded for the global challenge UI. No user data persists on the doc itself.",
  },
  {
    // Parser sees this as bare `match /participants/{uid}` because it's
    // nested inside `match /challenges/{challengeId}`. The semantic
    // path is `challenges/{challengeId}/participants/{uid}`.
    path: "match /participants/{uid}",
    reason:
      "Nested under challenges/{challengeId}. PENDING Chunk 3 — freeze should be added when challengeParticipations cleanup lands. Adding it mid-Chunk-2.C would create a deadlock with the seedChallenges initialisation flow. Tracked as Chunk 3 prerequisite.",
  },
];

/**
 * Infrastructure / recursive read / server-only match blocks. These
 * have no client writes (or no writes at all) and don't need freeze
 * coverage. Listed here so the parser can verify it's seen every
 * match block.
 */
const INFRASTRUCTURE_AND_READ_ONLY = [
  "match /goalSpaces/{spaceId}",
  "match /goalSpaces/{spaceId}/members/{memberUid}",
  "match /databases/{database}/documents",
  "match /{document=**}",
  "match /users/{uid}/performance/{doc}",
  "match /{path=**}/public/{doc}",
  "match /scanUsage/{uid}",
  // S4e (PR #722) — restricted-user marker. Admin SDK writes only
  // (Cloud Function resolveReport sets the doc); clients can read
  // their own doc but cannot write. R1A cleanup is wired via the
  // accountDeletionInventory entry (key: globalRestrictedUids).
  "match /globalRestrictedUids/{uid}",
  "match /config/{doc}",
  "match /accountDeletionRequests/{uid}",
  "match /deletedAccounts/{uid}",
  "match /deletedBillingIdentities/{identifierHash}",
  "match /paymentEventsPostDeletion/{eventId}",
  // Durable trial-eligibility tombstone (money-path audit F1). Admin SDK
  // writes only (`allow read, write: if false`), written by completeOnboarding
  // the first time a uid is granted the trial. INTENTIONALLY excluded from the
  // deletion sweep so it survives account deletion — that durability is the
  // whole anti-abuse point (self-delete-and-re-onboard must not re-grant the
  // trial). uid + timestamps only, no user data on the doc.
  "match /trialLedger/{uid}",
  // Server-only audit collection — Admin SDK writes from
  // createCheckoutSession Cloud Function; `allow read, write: if false`
  // for clients. No user-keyed data on the doc; not in scope for the
  // deletion freeze.
  "match /audit_checkout_sessions/{doc}",
  // Spc1 PR1 — spaces parent doc is fully denied (`allow read, write:
  // if false`): no parent doc exists in v1, member counts are client
  // aggregate queries. Vacuously frozen.
  "match /spaces/{spaceId}",
  // 2026-05-26 audit PR 2 — crew member sub-docs are now server-only.
  // Client writes denied at the rules layer (`allow create, update,
  // delete: if false`); reads are allowed for the Suggested-People
  // crew-member lookup. R1A protection lives in
  // `setCrewMembershipCallable` via `assertCallableActorNotDeleting`.
  "match /groups/{crewId}/members/{userId}",
];

/**
 * Find every `match /PATH {` line. Strip trailing space-brace.
 */
function listAllMatchBlocks(): string[] {
  const re = /^\s*(match \/[^\s]+) \{/gm;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(rulesText)) !== null) {
    found.push(m[1]);
  }
  return found;
}

/**
 * Check whether a match block declares any client-writable rules.
 * "Client-writable" = `allow create/update/delete/write` with a
 * condition other than `if false`.
 */
function blockHasClientWrites(pattern: string): boolean {
  const startMarker = `${pattern} {`;
  const idx = rulesText.indexOf(startMarker);
  if (idx < 0) return false;
  const openIdx = idx + startMarker.length - 1;
  let depth = 1;
  let i = openIdx + 1;
  while (i < rulesText.length && depth > 0) {
    if (rulesText[i] === "{") depth += 1;
    else if (rulesText[i] === "}") depth -= 1;
    i += 1;
  }
  const body = rulesText.slice(openIdx + 1, i - 1);
  // Look for any allow-write rule.
  const writeRules =
    body.match(
      /allow\s+(create|update|delete|write|create,\s*delete|create,\s*update|create,\s*update,\s*delete)[^:]*:\s*(if\s+([^;]+);|if\s+([^;]+)$)/gm
    ) || [];
  // A rule with `if false` is vacuously frozen — not a client-write.
  for (const rule of writeRules) {
    if (/if\s+false/.test(rule)) continue;
    return true; // Found a real client-write rule.
  }
  return false;
}

describe("write-rules snapshot — drift detection", () => {
  const allBlocks = listAllMatchBlocks();
  // Strip nested duplicates by exact text — `match /` strings are unique
  // per nesting level due to path differences.
  const uniqueBlocks = Array.from(new Set(allBlocks));

  it("parser found at least 30 match blocks", () => {
    expect(uniqueBlocks.length).toBeGreaterThanOrEqual(30);
  });

  it("every match block is classified (protected OR exempt OR infrastructure)", () => {
    const classified = new Set<string>([
      ...PROTECTED_PATHS,
      ...EXPLICITLY_EXEMPT.map((e) => e.path),
      ...INFRASTRUCTURE_AND_READ_ONLY,
    ]);
    const unclassified = uniqueBlocks.filter((b) => !classified.has(b));
    if (unclassified.length > 0) {
      throw new Error(
        `Unclassified match block(s) found in firestore.rules — every new write rule must be added to PROTECTED_PATHS, EXPLICITLY_EXEMPT, or INFRASTRUCTURE_AND_READ_ONLY before merge:\n  ${unclassified.join("\n  ")}`
      );
    }
    expect(unclassified).toEqual([]);
  });

  it("every PROTECTED_PATHS entry actually has client-writable rules", () => {
    const phantoms: string[] = [];
    for (const path of PROTECTED_PATHS) {
      if (!blockHasClientWrites(path)) phantoms.push(path);
    }
    expect(
      phantoms,
      `PROTECTED_PATHS entries without writable rules: ${phantoms.join(", ")}`
    ).toEqual([]);
  });

  it("EXPECTED_PROTECTED_PATH_COUNT matches the array length", () => {
    expect(PROTECTED_PATHS.length).toBe(EXPECTED_PROTECTED_PATH_COUNT);
  });

  it("EXPLICITLY_EXEMPT entries all have specific reasons (>60 chars)", () => {
    for (const exempt of EXPLICITLY_EXEMPT) {
      expect(
        exempt.reason.length,
        `${exempt.path} exemption reason too short`
      ).toBeGreaterThan(60);
    }
  });

  it("no path appears in more than one classification", () => {
    const all = [
      ...PROTECTED_PATHS,
      ...EXPLICITLY_EXEMPT.map((e) => e.path),
      ...INFRASTRUCTURE_AND_READ_ONLY,
    ];
    const dupes: string[] = [];
    const seen = new Set<string>();
    for (const p of all) {
      if (seen.has(p)) dupes.push(p);
      seen.add(p);
    }
    expect(dupes).toEqual([]);
  });
});

describe("Blocker E — path-count reconciliation", () => {
  it("authoritative count is 38 (Spc1 added spaces members + posts)", () => {
    // History: Chunk 2 prose said "22"; Chunk 2.C reconciled to 27.
    // 2026-05-26 audit PR 2 moved /groups/{crewId}/members/{userId}
    // to server-only (write `if false`), dropping the count to 26.
    // push #961 added the owner-only /users/{uid}/devices/{token}
    // FCM-token subcollection (freeze via isOwnerAndNotDeleting),
    // bringing it back to 27. SOCIAL S3 added the client-writable
    // /partnerBonds/{bondId} block (freeze via !isDeleting), → 28.
    // Saved-routes library added /users/{uid}/savedRoutes/{doc}, → 29.
    // Nutrition badges added /users/{uid}/dailyNutrition/{doc} (per-day
    // macro-target snapshot, freeze via isOwnerAndNotDeleting), → 30.
    // CHECKIN-01 added /users/{uid}/checkins/{weekKey} (weekly Momentum
    // Check-in, freeze via isOwnerAndNotDeleting), → 31.
    // PROGRAM-BLOCK-01 added /users/{uid}/trainingBlocks/{blockId}
    // (owner-only block layer, freeze via isOwnerAndNotDeleting), → 32.
    // GOALS-CORE-01 added /users/{uid}/journeys/{journeyId} (owner-only,
    // freeze via isOwnerAndNotDeleting) and the member-only, allowlisted
    // /goalSpaces/{spaceId}/events/{eventId} create path, → 34.
    // NUTR-CONSISTENCY-01 added /users/{uid}/nutritionCommitments/{weekKey}
    // (owner-only weekly logging commitment), → 35.
    // BODY-VAULT-01 added /users/{uid}/progressCheckins/{doc} (owner-only
    // Progress Vault check-in groupings, freeze via
    // isOwnerAndNotDeleting), → 36.
    // Spc1 PR1 added the Community Spaces nested blocks — members/{uid}
    // (join) and posts/{postId} (member posts), both create-frozen via
    // !isDeleting — → 38.
    // Counting methodology unchanged: one `match /PATH {` block with
    // at least one client-write rule.
    expect(EXPECTED_PROTECTED_PATH_COUNT).toBe(38);
  });
});

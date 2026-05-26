/**
 * R1A-Deletion Chunk 2.B — static rules coverage meta-test.
 *
 * Spec Blocker 4: a future refactor could remove isDeleting() from one
 * protected path and the representative-path emulator test
 * (users/{uid}/meals) would still pass. This static parser asserts
 * every protected match block has the freeze applied on writes.
 *
 * Coverage matrix is encoded as PROTECTED_PATHS below — adding a new
 * user-owned write path requires adding a matching entry here OR
 * explicitly tagging the match block with the comment marker
 * `// @r1a-no-freeze: <reason>` (escape hatch for legitimately
 * exempt rules).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const rulesText = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");

/**
 * Each entry describes a protected write path:
 *   pathPattern: the literal match path as it appears in firestore.rules
 *   side: which uid(s) the freeze must check
 *     'owner'      = isDeleting(uid) on the path's owner segment
 *     'actor'      = isDeleting(request.auth.uid)
 *     'both'       = freeze checks both sides (e.g. follow create checks
 *                    follower AND followee)
 *     'cross-user-target' = freeze checks the target side as well
 */
interface ProtectedPath {
  pathPattern: string;
  sides: Array<"owner" | "actor" | "target" | "writer">;
  notes?: string;
}

const PROTECTED_PATHS: ProtectedPath[] = [
  // ── User-owned subcollections (write-frozen via isOwnerAndNotDeleting) ──
  {
    pathPattern: "match /users/{uid}",
    sides: ["owner"],
    notes:
      "root user doc create/update only — delete is intentionally not frozen so deleteMyAccount remains accessible",
  },
  { pathPattern: "match /users/{uid}/meals/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/savedRoutines/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/workouts/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/runs/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/weights/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/settings/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/foodFavourites/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/waterLog/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/bodyweightLogs/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/programState/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/streaks/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/shoes/{shoeId}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/logs/{date}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/stats/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/public/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/progressPhotos/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/privacyZones/{doc}", sides: ["owner"] },
  { pathPattern: "match /users/{uid}/errors/{doc}", sides: ["owner"] },
  // ── Cross-user paths ──
  // 2026-05-26 audit PR 3 (finding #3) — feed-item create is now
  // server-only via the onActivityCreated trigger; the writer-side
  // freeze moved into the trigger as
  // `accountDeletionLocks.shouldSystemWriteProceed(authorId)` plus a
  // compensating delete (matches onWorkoutCreated pattern). Only the
  // owner-side freeze on delete remains client-visible.
  {
    pathPattern: "match /feeds/{uid}/items/{doc}",
    sides: ["owner"],
    notes:
      "delete is owner-only with freeze; create is server-only (R1A guard in onActivityCreated trigger)",
  },
  {
    pathPattern: "match /following/{uid}/users/{targetUid}",
    sides: ["owner", "target"],
    notes: "create/delete requires !isDeleting on follower AND followee",
  },
  {
    pathPattern: "match /followers/{uid}/users/{followerUid}",
    sides: ["owner", "writer"],
    notes: "create/delete requires !isDeleting on recipient AND follower",
  },
  // 2026-05-26 audit PR 3 (finding #6) — notification create is now
  // server-only via `toggleKudosCallable` + `addCommentCallable`,
  // which fold in the notification write via
  // `socialFanout.createNotification`. Writer-side freeze lives in
  // the parent callables (they already apply
  // `assertCallableActorNotDeleting`). Only the owner-side freeze on
  // delete remains client-visible.
  {
    pathPattern: "match /notifications/{uid}/items/{doc}",
    sides: ["owner"],
    notes:
      "delete is owner-only with freeze; create is server-only (R1A guards in kudos/comment callables)",
  },
  {
    pathPattern: "match /blocks/{uid}/users/{targetUid}",
    sides: ["owner"],
    notes: "target is NOT checked — blocking a deleting user is allowed",
  },
  {
    pathPattern: "match /reports/{reportId}",
    sides: ["actor"],
    notes: "deleting users cannot file new reports",
  },
  {
    pathPattern: "match /groups/{crewId}",
    sides: ["actor"],
    notes: "deleting users cannot create/update crews",
  },
  // 2026-05-26 audit PR 2: /groups/{crewId}/members/{userId} is now
  // server-only (write `if false`). R1A protection moved to the CF
  // (`setCrewMembershipCallable` in functions/index.js) which checks
  // `accountDeletionLocks.shouldSystemWriteProceed` before any write.
  // Excluded from PROTECTED_PATHS because there's no client-writable
  // rule for R1A to guard at the rule layer.
];

/**
 * Extract the content between `match /PATH {` and its matching `}` for
 * a given path pattern. Brace-balanced parser — handles nested matches.
 *
 * Important: the start marker is `pattern + " {"` (literal space-brace),
 * NOT just the next `{`. Without the space-brace anchor, a path that
 * itself contains `{seg}` placeholders (like
 * `match /users/{uid}/meals/{doc}`) would pick up the FIRST `{` after
 * the indexOf — which is the `{` inside the path segment, not the
 * opening brace of the match block.
 */
function extractMatchBlock(pattern: string): string | null {
  const startMarker = `${pattern} {`;
  const idx = rulesText.indexOf(startMarker);
  if (idx < 0) return null;
  // The opening `{` is the last char of startMarker.
  const openIdx = idx + startMarker.length - 1;
  // Walk forward, balancing braces.
  let depth = 1;
  let i = openIdx + 1;
  while (i < rulesText.length && depth > 0) {
    if (rulesText[i] === "{") depth += 1;
    else if (rulesText[i] === "}") depth -= 1;
    i += 1;
  }
  return rulesText.slice(openIdx + 1, i - 1);
}

describe("static rules coverage — every protected path has the write-freeze", () => {
  for (const p of PROTECTED_PATHS) {
    it(`${p.pathPattern} carries the freeze on writes (sides: ${p.sides.join(", ")})`, () => {
      const block = extractMatchBlock(p.pathPattern);
      expect(
        block,
        `match block not found for ${p.pathPattern}`
      ).not.toBeNull();
      const allowedExempt = block!.includes("@r1a-no-freeze:");
      // The freeze appears as either `isOwnerAndNotDeleting(...)` (combined
      // form) or as `!isDeleting(...)` (multi-side form). Either one
      // counts as protection on at least one side.
      const hasOwnerCombinedForm = /isOwnerAndNotDeleting\s*\(/.test(block!);
      const hasExplicitNotDeleting = /!\s*isDeleting\s*\(/.test(block!);
      const hasAnyFreeze = hasOwnerCombinedForm || hasExplicitNotDeleting;
      if (!allowedExempt) {
        expect(
          hasAnyFreeze,
          `${p.pathPattern} write rule must call isOwnerAndNotDeleting(...) or !isDeleting(...) — found neither`
        ).toBe(true);
      }
    });

    if (p.sides.includes("writer") || p.sides.includes("target")) {
      it(`${p.pathPattern} checks the cross-user side as well (${p.sides.join(", ")})`, () => {
        const block = extractMatchBlock(p.pathPattern);
        expect(block).not.toBeNull();
        // Count both forms of freeze-application:
        //   - `isOwnerAndNotDeleting(...)` covers the OWNER side only
        //     (combined owner-check + deletion-check).
        //   - `!isDeleting(...)` covers whichever uid is passed
        //     explicitly (target, writer, recipient, etc.).
        // For a 2-side rule the total of these forms must be >= 2.
        const explicitNotDeleting = (block!.match(/!\s*isDeleting\s*\(/g) || [])
          .length;
        const ownerCombined = (
          block!.match(/isOwnerAndNotDeleting\s*\(/g) || []
        ).length;
        const totalFreezeApplications = explicitNotDeleting + ownerCombined;
        expect(
          totalFreezeApplications,
          `${p.pathPattern} must apply freeze for each declared side (${p.sides.join(", ")}); found ${explicitNotDeleting} explicit !isDeleting + ${ownerCombined} isOwnerAndNotDeleting = ${totalFreezeApplications}`
        ).toBeGreaterThanOrEqual(p.sides.length);
      });
    }
  }

  it("operational collections (accountDeletionRequests, deletedAccounts, deletedBillingIdentities, paymentEventsPostDeletion) are present in rules", () => {
    expect(rulesText).toMatch(/match \/accountDeletionRequests\/\{uid\}/);
    expect(rulesText).toMatch(/match \/deletedAccounts\/\{uid\}/);
    expect(rulesText).toMatch(/match \/deletedBillingIdentities\//);
    expect(rulesText).toMatch(/match \/paymentEventsPostDeletion\//);
  });

  it("accountDeletionRequests allows owner read only — no client write", () => {
    const block = extractMatchBlock("match /accountDeletionRequests/{uid}");
    expect(block).not.toBeNull();
    expect(block).toMatch(/allow read:\s*if\s+isOwner/);
    expect(block).toMatch(/allow write:\s*if\s+false/);
  });

  it("deletedAccounts blocks all client read/write", () => {
    const block = extractMatchBlock("match /deletedAccounts/{uid}");
    expect(block).not.toBeNull();
    expect(block).toMatch(/allow read,\s*write:\s*if\s+false/);
  });

  it("PROTECTED_PATHS list matches the canonical count (26 paths post-2026-05-26 audit PR 2)", () => {
    // Authoritative count maintained in accountDeletionWriteRulesSnapshot.test.ts
    // via EXPECTED_PROTECTED_PATH_COUNT. The two test files must agree —
    // drift fails fast here, not silently in CI. Was 27 pre-PR-2;
    // /groups/{crewId}/members/{userId} moved to server-only.
    expect(PROTECTED_PATHS.length).toBe(26);
  });
});

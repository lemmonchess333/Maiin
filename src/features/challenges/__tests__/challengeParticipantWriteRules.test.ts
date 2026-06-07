/**
 * 2026-06-07 audit (HIGH) — challenge participant progress is now
 * SERVER-OWNED. Static guards that pin the fix in two places:
 *
 *  1. firestore.rules — the participant match block must:
 *     - keep reads open to any authed user (leaderboard),
 *     - on CREATE allow only an identity/join payload with
 *       currentValue==0 (or omitted) and tierAchieved==null (or omitted),
 *     - on UPDATE deny any diff that touches currentValue/tierAchieved
 *       (diff().affectedKeys().hasOnly([...identity fields...])).
 *
 *  2. useChallenges.ts — the client must no longer attempt to persist
 *     currentValue/tierAchieved (the old updateProgress() write that the
 *     locked-down rule would now reject). Progress is written ONLY by the
 *     Admin SDK triggers (syncChallengeProgress) which bypass rules.
 *
 * There's no Firestore emulator harness in this repo, so these are
 * source-text assertions in the same idiom as
 * src/lib/__tests__/accountDeletionRulesCoverage.test.ts. The behavioural
 * rules check (real setDoc rejection) is documented for manual QA in the
 * PR description.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const rulesText = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");
const hookText = readFileSync(resolve(here, "../useChallenges.ts"), "utf8");

/**
 * Brace-balanced extractor for a `match /PATH {...}` block — copied from
 * accountDeletionRulesCoverage.test.ts so this file stays self-contained.
 */
function extractMatchBlock(pattern: string): string | null {
  const startMarker = `${pattern} {`;
  const idx = rulesText.indexOf(startMarker);
  if (idx < 0) return null;
  const openIdx = idx + startMarker.length - 1;
  let depth = 1;
  let i = openIdx + 1;
  while (i < rulesText.length && depth > 0) {
    if (rulesText[i] === "{") depth += 1;
    else if (rulesText[i] === "}") depth -= 1;
    i += 1;
  }
  return rulesText.slice(openIdx + 1, i - 1);
}

describe("firestore.rules — challenge participant docs are server-owned", () => {
  const block = extractMatchBlock("match /participants/{uid}");

  it("the participant match block exists", () => {
    expect(block, "participant match block not found").not.toBeNull();
  });

  it("reads stay open to any authed user (leaderboard)", () => {
    expect(block!).toMatch(/allow read:\s*if\s+request\.auth\s*!=\s*null/);
  });

  it("does NOT carry the old blanket `allow write: if ... uid == uid`", () => {
    // The pre-fix rule was a single
    //   allow write: if request.auth != null && request.auth.uid == uid;
    // that let a user setDoc ANY body. The fix splits write into
    // create/update/delete with field guards — there must be no blanket
    // `allow write` left on this block.
    expect(block!).not.toMatch(/allow write:/);
  });

  it("CREATE pins currentValue to 0 (or omitted)", () => {
    expect(block!).toMatch(/allow create:/);
    expect(block!).toMatch(/request\.resource\.data\.currentValue\s*==\s*0/);
  });

  it("CREATE pins tierAchieved to null (or omitted)", () => {
    expect(block!).toMatch(/request\.resource\.data\.tierAchieved\s*==\s*null/);
  });

  it("CREATE has a field allowlist (no arbitrary fields)", () => {
    expect(block!).toMatch(/request\.resource\.data\.keys\(\)\.hasOnly\(/);
  });

  it("UPDATE only permits cosmetic identity fields (currentValue/tierAchieved immutable)", () => {
    expect(block!).toMatch(/allow update:/);
    // The diff allowlist must restrict to identity fields only, so any
    // diff touching currentValue or tierAchieved is rejected.
    expect(block!).toMatch(
      /diff\(resource\.data\)\.affectedKeys\(\)\s*\.hasOnly\(\s*\[\s*['"]displayName['"]\s*,\s*['"]photoURL['"]\s*\]\s*\)/
    );
  });

  it("UPDATE allowlist excludes the server-owned fields", () => {
    // Extract the update rule's hasOnly([...]) and confirm neither
    // server-owned field appears in it.
    const updateAllowlist = block!.match(
      /allow update:[\s\S]*?affectedKeys\(\)\s*\.hasOnly\(\s*\[([\s\S]*?)\]\s*\)/
    );
    expect(
      updateAllowlist,
      "update hasOnly() allowlist not found"
    ).not.toBeNull();
    const list = updateAllowlist![1];
    expect(list).not.toMatch(/currentValue/);
    expect(list).not.toMatch(/tierAchieved/);
  });

  it("DELETE (leave) stays owner-only", () => {
    expect(block!).toMatch(
      /allow delete:\s*if\s+request\.auth\s*!=\s*null\s*&&\s*request\.auth\.uid\s*==\s*uid/
    );
  });
});

describe("useChallenges.ts — client no longer persists server-owned progress", () => {
  it("no updateProgress writer remains (it was the forbidden client write)", () => {
    expect(hookText).not.toMatch(/const\s+updateProgress\s*=/);
    expect(hookText).not.toMatch(/\bupdateProgress\b\s*,/); // not returned
  });

  it("the only participant setDocGuarded is the join write (currentValue: 0)", () => {
    // joinChallenge writes the neutral join payload; there must be no
    // setDocGuarded that writes a non-zero/derived currentValue.
    const guardedWrites = hookText.match(/setDocGuarded\s*\(/g) || [];
    expect(guardedWrites.length).toBe(1);
    // The single write seeds currentValue: 0 (join), not a client value.
    expect(hookText).toMatch(/currentValue:\s*0/);
    expect(hookText).not.toMatch(/currentValue:\s*newValue/);
    expect(hookText).not.toMatch(/tierAchieved:\s*tier\b/);
  });
});

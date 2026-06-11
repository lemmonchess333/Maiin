/**
 * Profile field-allowlist parity (D1).
 *
 * A persisted profile field has to be declared consistently across the writers
 * that touch `users/{uid}`:
 *   - `firestore.rules` `allowedUserFields()` — gates a DIRECT client write
 *     (`updateProfile` → batch.set / setDocGuarded).
 *   - `functions/profileSanitizer.js` `PROFILE_ALLOWED_FIELDS` — gates the CF
 *     write path (`completeOnboarding` / `configurePlan`, which merge a
 *     sanitised profile).
 *
 * Either side forgetting a field is a SILENT bug, and it has recurred ≥4×
 * (`hideWeightNumber`, `goalWeightKg`, `adaptiveCapState`, `runFitness`, and
 * `hideSharedRouteEnds`). Two failure shapes:
 *   - in sanitiser but NOT rules → the CF can write it, but a direct Settings
 *     edit hits permission-denied (this is the `hideWeightNumber` bug D1 found:
 *     the "Hide the number" toggle silently failed to save).
 *   - in rules but NOT sanitiser → a direct edit works, but the onboarding /
 *     configure CF SILENTLY STRIPS it (the lament the sanitiser comments record).
 *
 * This test pins both directions. New drift fails CI; the only way to add a
 * one-path-only field is to consciously classify it in an exclusion list below
 * — so the decision is explicit, never accidental. Same discipline as the
 * `runEligibility` / plan-validation cross-tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

const sanitizer = require(
  resolve(repoRoot, "functions/profileSanitizer.js")
) as {
  PROFILE_ALLOWED_FIELDS: readonly string[];
  SERVER_MANAGED_PROFILE_FIELDS: readonly string[];
};

/** Parse the `allowedUserFields()` function body out of firestore.rules. */
function rulesAllowedFields(): Set<string> {
  const rules = readFileSync(resolve(repoRoot, "firestore.rules"), "utf8");
  const body = rules.match(/function allowedUserFields\(\)[\s\S]*?\];/);
  if (!body) throw new Error("could not locate allowedUserFields() in rules");
  return new Set([...body[0].matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]));
}

// ── Conscious one-path-only classifications ──────────────────────────────
// Adding a field here is a deliberate statement: "this is intentionally only
// writable via ONE path." Anything NOT here must exist on BOTH sides.

/** In rules (direct client write) but intentionally NOT CF-sanitised — set via
 *  `updateProfile` after onboarding, never sent through completeOnboarding /
 *  configurePlan. Social / notification / cosmetic prefs + system timestamps. */
const DIRECT_WRITE_ONLY = new Set<string>([
  "autoPostBadges",
  "autoPostRuns",
  "autoPostWorkouts",
  "crewId",
  "defaultVisibility",
  "lastActiveAt",
  "mealReminders",
  "onboardingComplete", // CF sets it via post-sanitise overwrite, not the allow-list
  "phaseMode",
  "privacyZones",
  "shoes",
  "stallPopupCooldowns",
  "stepGoal",
  "trainingPhase",
  "trialExpiryPromptShown",
  "updatedAt",
]);

/** In the sanitiser (CF write) but intentionally NOT directly client-writable.
 *  Currently empty — every CF-accepted field is also a legitimate direct edit.
 *  If you add a CF-only field, list it here (and confirm no client updateProfile
 *  writes it). */
const CF_WRITE_ONLY = new Set<string>([]);

describe("profile field-allowlist parity — rules ↔ sanitiser", () => {
  it("every sanitiser-allowed field is also client-writable (rules)", () => {
    const rules = rulesAllowedFields();
    const missing = sanitizer.PROFILE_ALLOWED_FIELDS.filter(
      (f) => !rules.has(f) && !CF_WRITE_ONLY.has(f)
    );
    expect(
      missing,
      `Fields the CF writes but firestore.rules rejects on a direct write — a ` +
        `Settings edit of these silently fails (permission-denied). Add to ` +
        `allowedUserFields() in firestore.rules, or to CF_WRITE_ONLY if truly ` +
        `CF-only: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("every client-writable field (rules) is CF-sanitised, server-managed, or explicitly direct-only", () => {
    const rules = [...rulesAllowedFields()];
    const allowed = new Set(sanitizer.PROFILE_ALLOWED_FIELDS);
    const server = new Set(sanitizer.SERVER_MANAGED_PROFILE_FIELDS);
    const unclassified = rules.filter(
      (f) => !allowed.has(f) && !server.has(f) && !DIRECT_WRITE_ONLY.has(f)
    );
    expect(
      unclassified,
      `Fields in firestore.rules allowedUserFields() that the onboarding / ` +
        `configure CF would SILENTLY STRIP (not in profileSanitizer). Add a ` +
        `validator to profileSanitizer.js, or classify in DIRECT_WRITE_ONLY ` +
        `if the field is never sent through the CF: ${unclassified.join(", ")}`
    ).toEqual([]);
  });

  it("the exclusion lists stay honest (no stale entries)", () => {
    const rules = rulesAllowedFields();
    const allowed = new Set(sanitizer.PROFILE_ALLOWED_FIELDS);
    // A DIRECT_WRITE_ONLY entry that's now ALSO in the sanitiser is stale.
    const staleDirect = [...DIRECT_WRITE_ONLY].filter((f) => allowed.has(f));
    expect(
      staleDirect,
      `Stale DIRECT_WRITE_ONLY (now CF-sanitised too)`
    ).toEqual([]);
    // A DIRECT_WRITE_ONLY entry no longer in the rules at all is stale.
    const orphanDirect = [...DIRECT_WRITE_ONLY].filter((f) => !rules.has(f));
    expect(
      orphanDirect,
      `Orphan DIRECT_WRITE_ONLY (no longer in rules)`
    ).toEqual([]);
  });
});

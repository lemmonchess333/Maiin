/**
 * Tests for `findSafeSubstitute` — the PT-curated injury-aware
 * exercise swap helper used by `applyInjuryFilters` to replace
 * contraindicated exercises with safe alternatives.
 *
 * What we pin:
 *   1. Multi-injury intersection — a substitute must clear EVERY
 *      injury the user has, not just one. This is the W1a fix:
 *      pre-W1a a knee+lower_back user could be swapped from
 *      Barbell Squat → Leg Press (clears knee, fails lower_back),
 *      silently. The `safeFor.includes(injury)` AND ensures every
 *      relevant injury is cleared.
 *   2. excludeIds — prevents two contraindicated exercises on the
 *      same day from both swapping to the same safe candidate
 *      (the "two Bulgarian Split Squats in a row" trap).
 *   3. Unknown exercise / no candidates → null, so the caller's
 *      "keep with warning note" path fires rather than swallowing
 *      the failure silently.
 *   4. Injury-category filtering — strings outside the
 *      InjuryCategory union (e.g. "ankle", "neck") are dropped
 *      from the relevance check so they don't accidentally
 *      block a swap.
 */
import { describe, it, expect } from "vitest";
import { findSafeSubstitute } from "../injurySubstitutions";

describe("findSafeSubstitute — happy path", () => {
  it("returns the first safe substitute for a single injury", () => {
    /* Deadlift has multiple substitutes; the first ordered candidate
       is trap-bar-deadlift which is safeFor lower_back. */
    const result = findSafeSubstitute("deadlift", ["lower_back"]);
    expect(result?.id).toBe("trap-bar-deadlift");
    expect(result?.name).toBe("Trap Bar Deadlift");
    expect(result?.safeFor).toContain("lower_back");
  });

  it("returns a substitute that clears MULTIPLE injuries when the user has more than one", () => {
    /* knee + lower_back together: deadlift's first candidate
       trap-bar-deadlift is only safeFor lower_back (not knee),
       so the iteration must continue. The next ordered candidate
       with both is hip-thrust (safeFor: lower_back + knee). */
    const result = findSafeSubstitute("deadlift", ["lower_back", "knee"]);
    expect(result?.id).toBe("hip-thrust");
    expect(result?.safeFor).toContain("lower_back");
    expect(result?.safeFor).toContain("knee");
  });

  it("returns null when no candidate clears all the user's injuries", () => {
    /* A made-up combination that no real candidate handles —
       force-feeding the table an injury combination no entry
       covers. The "wrist + elbow" combo on a "deadlift" entry
       can't be cleared because none of the deadlift candidates
       are safeFor wrist or elbow. */
    const result = findSafeSubstitute("deadlift", ["wrist", "elbow"]);
    expect(result).toBeNull();
  });
});

describe("findSafeSubstitute — excludeIds", () => {
  it("skips a candidate whose id is in excludeIds", () => {
    /* If the same day already has trap-bar-deadlift on it (e.g. a
       previous swap already landed there), the next swap from a
       different lower_back contra exercise should skip it and
       fall to the next ordered candidate. */
    const excluded = new Set(["trap-bar-deadlift"]);
    const result = findSafeSubstitute("deadlift", ["lower_back"], excluded);
    expect(result?.id).not.toBe("trap-bar-deadlift");
    /* Next candidate in deadlift's list is rack-pull. */
    expect(result?.id).toBe("rack-pull");
  });

  it("returns null when ALL safe candidates are excluded", () => {
    /* Exclude every deadlift substitute that clears lower_back —
       caller's job to surface the no-safe-swap path. */
    const excluded = new Set([
      "trap-bar-deadlift",
      "rack-pull",
      "hip-thrust",
      "glute-ham-raise",
    ]);
    const result = findSafeSubstitute("deadlift", ["lower_back"], excluded);
    expect(result).toBeNull();
  });
});

describe("findSafeSubstitute — guards", () => {
  it("returns null for an exercise id with no entry in the table", () => {
    const result = findSafeSubstitute("not-a-real-exercise-id", [
      "lower_back",
    ]);
    expect(result).toBeNull();
  });

  it("returns null when the user has no contraindicated injuries", () => {
    /* No injuries → no swap needed; the relevance filter empties
       the list and the function early-returns null. */
    expect(findSafeSubstitute("deadlift", [])).toBeNull();
  });

  it("filters out unknown injury strings before matching", () => {
    /* "ankle" isn't in InjuryCategory — the function drops it.
       If only unknown strings are passed, we should get null,
       not a false-positive match against an empty safeFor set. */
    expect(findSafeSubstitute("deadlift", ["ankle", "neck"])).toBeNull();
  });

  it("matches successfully when the user has a mix of known + unknown injuries", () => {
    /* "ankle" is dropped; lower_back remains; the swap proceeds
       normally rather than failing because of the noise input. */
    const result = findSafeSubstitute("deadlift", ["ankle", "lower_back"]);
    expect(result?.id).toBe("trap-bar-deadlift");
  });
});

describe("findSafeSubstitute — deterministic ordering", () => {
  it("always returns the first matching candidate (not a random one)", () => {
    /* Called twice with the same inputs, must return the same
       substitute. Pins that the iteration is in-order and not
       randomised — `applyInjuryFilters` relies on this so a
       second swap with the same inputs lands the same place. */
    const a = findSafeSubstitute("barbell-row", ["lower_back"]);
    const b = findSafeSubstitute("barbell-row", ["lower_back"]);
    expect(a?.id).toBe(b?.id);
    expect(a?.id).toBe("chest-supported-db-row");
  });
});

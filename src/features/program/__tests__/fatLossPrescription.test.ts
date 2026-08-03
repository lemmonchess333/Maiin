/**
 * The fat-loss prescription agrees with itself across all three copies.
 *
 * ── Why this file exists ─────────────────────────────────────────────────
 *
 * The fat-loss rep numbers lived in THREE places and nothing compared them:
 *
 *   1. `programEngine.GOAL_PROFILES.fat_loss`      — the profile table
 *   2. `functions/lib/represcribe.js`              — the server mirror
 *   3. `templates.ts` fatLossCircuit               — an authored template
 *
 * (2) is guarded by `represcribe.cross.test.ts`. (3) was not guarded by
 * anything, and it is the copy a 4-day full-gym user actually RECEIVES:
 * `matchTemplate` selects the template, `templateConversion.parseTemplateReps`
 * stamps its own rep strings, and `buildPlan`'s preserve branch returns that
 * week untouched whenever day-count and experience are unchanged. So changing
 * the profile table alone would have left the most common fat-loss
 * configuration on the old prescription permanently, silently, in both
 * directions.
 *
 * ── What is asserted ─────────────────────────────────────────────────────
 *
 * The template's BARBELL COMPOUNDS must match the profile's main rep band.
 * Its isolations deliberately do not — the template's character is its
 * density (four full-body days, short rests), not high reps on the barbell
 * lifts, and pinning those to the profile would be asserting a design
 * decision that was never made.
 */
import { describe, it, expect } from "vitest";

import { goalProfileFor } from "../programEngine";
import { PROGRAM_TEMPLATES } from "../templates";
import { parseTemplateReps } from "../templateConversion";

/** The lifts that carry strength preservation through a deficit. */
const BARBELL_COMPOUNDS = new Set([
  "squat",
  "bench-press",
  "barbell-row",
  "overhead-press",
  "deadlift",
]);

const fatLossCircuit = PROGRAM_TEMPLATES.find(
  (t) => t.id === "fat-loss-circuit"
);

describe("fat-loss rep prescription is consistent across its copies", () => {
  it("the template still exists and is the fat-loss match", () => {
    // If this template is ever renamed or dropped, the assertions below would
    // silently pass over an empty set — the "covered elsewhere" failure this
    // repo has been bitten by. Anchor on its presence first.
    expect(fatLossCircuit).toBeDefined();
    expect(fatLossCircuit!.goal).toBe("fat_loss");
    expect(fatLossCircuit!.daysPerWeek).toBe(4);
  });

  it("the template's barbell compounds match the profile's main rep band", () => {
    const profile = goalProfileFor("fat_loss");
    const seen: string[] = [];
    for (const week of fatLossCircuit!.weeks) {
      for (const day of week.days) {
        for (const ex of day.exercises ?? []) {
          if (!BARBELL_COMPOUNDS.has(ex.exerciseId)) continue;
          const parsed = parseTemplateReps(ex.reps);
          seen.push(`${ex.exerciseId} ${ex.reps}`);
          expect(parsed.reps, `${ex.exerciseId} (${ex.reps})`).toBe(
            profile.mainReps
          );
          expect(parsed.repRangeMax, `${ex.exerciseId} (${ex.reps})`).toBe(
            profile.mainRepsMax
          );
        }
      }
    }
    // The loop must actually have run — an empty template would pass vacuously.
    expect(seen.length).toBeGreaterThanOrEqual(5);
  });

  it("the isolations are deliberately NOT pinned to the profile", () => {
    // Stated as an assertion so the exemption is a decision on the record
    // rather than an oversight in the test above. The template keeps higher
    // reps on assistance work; that is what makes it a circuit.
    const isolationReps = new Set<string>();
    for (const week of fatLossCircuit!.weeks) {
      for (const day of week.days) {
        for (const ex of day.exercises ?? []) {
          if (BARBELL_COMPOUNDS.has(ex.exerciseId)) continue;
          isolationReps.add(ex.reps);
        }
      }
    }
    expect([...isolationReps].some((r) => r.startsWith("15-"))).toBe(true);
  });
});

describe("the fat-loss profile itself", () => {
  it("prescribes the same mains as `general` — a deficit is not its own stimulus", () => {
    // Fleck & Kraemer p.179: "To maintain strength gains the intensity should
    // be maintained, but the volume and frequency of training can be reduced."
    // The old row inverted it — dropped intensity, held volume.
    const fatLoss = goalProfileFor("fat_loss");
    const general = goalProfileFor("general");
    expect(fatLoss.mainReps).toBe(general.mainReps);
    expect(fatLoss.mainRepsMax).toBe(general.mainRepsMax);
  });

  it("does NOT cut volume — Roth 2023 found volume does not spare lean mass", () => {
    // The counterpart to the intensity half, and the reason
    // `goalVolumeMultiplier("cut")` was deliberately left alone: resistance
    // training volume does not influence lean-mass preservation during energy
    // restriction (Roth et al. 2023, Scand J Med Sci Sports), so there is no
    // evidence-backed reason to reduce it here.
    expect(goalProfileFor("fat_loss").volumeMultiplier).toBe(1.0);
  });
});

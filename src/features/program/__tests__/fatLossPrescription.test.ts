/**
 * The fat-loss profile keeps general's mains and its volume.
 *
 * The fat-loss rep numbers lived in three places: the profile table, its
 * server mirror (`represcribe.cross.test.ts` pins that one) and the
 * fat-loss circuit template. No new plan starts from a template since Lift4
 * (5), so the template's copy is no longer one a new user receives, and what
 * stays worth pinning is the profile's own reasoning.
 */
import { describe, it, expect } from "vitest";

import { goalProfileFor } from "../programEngine";

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

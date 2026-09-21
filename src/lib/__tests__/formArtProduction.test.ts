import { describe, it, expect } from "vitest";
import { buildFormArtPrompt, type FormArtScene } from "../formArtProduction";
import curl from "../../../docs/exercise-art/scenes/db-curl.json";
import rope from "../../../docs/exercise-art/scenes/rope-tricep-pushdown.json";
// Synthetic reviewed v3 scene: legacy production scene files remain blocked.
const scene: FormArtScene = {
  ...curl as FormArtScene,
  athleteVersion: "anatomy-neutral-v3",
  reference: "docs/exercise-art/masters/db-curl/1.png",
};
describe("six-frame production brief", () => {
  it("uses the exact six authored cues and canonical reference", () => {
    const prompt = buildFormArtPrompt("db-curl", scene);
    expect(prompt).toContain("FRAME 6 — FINISH RETURN 6/6");
    expect(prompt).toContain("docs/exercise-art/identity/athlete-anatomy-v3.png");
    expect(prompt).toContain("six separate full-resolution files");
    expect(prompt).toContain("Upper arms still, wrists straight.");
  });
  it("rejects the old athlete and another exercise's scene master", () => {
    expect(() => buildFormArtPrompt("db-curl", curl as FormArtScene)).toThrow(/canonical anatomical athlete/);
    expect(() => buildFormArtPrompt("db-curl", {
      ...scene, reference: "docs/exercise-art/masters/squat/1.png",
    })).toThrow(/exact exercise master/);
  });
  it("rejects draft scenes, wrong variants and incomplete state ladders", () => {
    expect(() =>
      buildFormArtPrompt("db-curl", { ...scene, status: "draft" })
    ).toThrow(/Review/);
    expect(() => buildFormArtPrompt("hammer-curl", scene)).toThrow(/exact/);
    expect(() =>
      buildFormArtPrompt("db-curl", {
        ...scene,
        states: scene.states.slice(0, 4),
      })
    ).toThrow(/six/);
  });
  it("never substitutes four catalogue instructions for six authored beats", () => {
    expect(() =>
      buildFormArtPrompt("concentration-curl", {
        ...scene,
        exerciseId: "concentration-curl",
        reference: "docs/exercise-art/masters/concentration-curl/1.png",
      })
    ).toThrow(/six/);
  });
  it("includes a physical selected-stack ladder and rejects reversed movement", () => {
    const plan = structuredClone(rope) as FormArtScene;
    plan.athleteVersion = "anatomy-neutral-v3";
    plan.reference = "docs/exercise-art/masters/rope-tricep-pushdown/1.png";
    const prompt = buildFormArtPrompt("rope-tricep-pushdown", plan);
    expect(prompt).toContain("Exactly 4 selected plates of 12 total");
    expect(prompt).toContain("payout 300 mm; stack gap 320 mm");
    plan.cable!.states[4].stackLiftMm = 20;
    expect(() => buildFormArtPrompt("rope-tricep-pushdown", plan)).toThrow(
      /contradicts/
    );
  });
});

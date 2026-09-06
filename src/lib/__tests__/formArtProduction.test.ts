import { describe, it, expect } from "vitest";
import { buildFormArtPrompt, type FormArtScene } from "../formArtProduction";
import curl from "../../../docs/exercise-art/scenes/db-curl.json";
import rope from "../../../docs/exercise-art/scenes/rope-tricep-pushdown.json";
const scene = curl as FormArtScene;
describe("six-frame production brief", () => {
  it("uses the exact six authored cues and canonical reference", () => {
    const prompt = buildFormArtPrompt("db-curl", scene);
    expect(prompt).toContain("FRAME 6 — FINISH RETURN 6/6");
    expect(prompt).toContain("public/form-frames/barbell-row/1.webp");
    expect(prompt).toContain("six separate full-resolution files");
    expect(prompt).toContain("Upper arms still, wrists straight.");
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
      buildFormArtPrompt("hammer-curl", { ...scene, exerciseId: "hammer-curl" })
    ).toThrow(/six/);
  });
  it("includes a physical selected-stack ladder and rejects reversed movement", () => {
    const plan = structuredClone(rope) as FormArtScene;
    const prompt = buildFormArtPrompt("rope-tricep-pushdown", plan);
    expect(prompt).toContain("Exactly 4 selected plates of 12 total");
    expect(prompt).toContain("payout 300 mm; stack gap 320 mm");
    plan.cable!.states[4].stackLiftMm = 20;
    expect(() => buildFormArtPrompt("rope-tricep-pushdown", plan)).toThrow(
      /contradicts/
    );
  });
});

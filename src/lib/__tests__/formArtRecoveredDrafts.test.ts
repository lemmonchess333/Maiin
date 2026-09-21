import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import batch from "../../../docs/exercise-art/BATCH_REVIEW_MANIFEST.json";
import recovered from "../../../docs/exercise-art/RECOVERED_DRAFTS.json";
import { EXERCISES } from "../exercises";

// Recovery preserves candidate bytes; it never confers visual approval.
describe("recovered form artwork", () => {
  it("keeps recovery separate from release and avoids duplicate exercise IDs", () => {
    expect(recovered.releaseApproved).toBe(false);
    expect(recovered.productionAssetsChanged).toBe(false);
    expect(recovered.completeDraftSets.length).toBeGreaterThan(0);
    const sets = [...batch.completeDraftSets, ...recovered.completeDraftSets];
    expect(new Set(sets.map((set) => set.exerciseId)).size).toBe(sets.length);
    expect(recovered.selectedFrameCount).toBe(
      recovered.completeDraftSets.reduce((total, set) => total + set.frames.length, 0),
    );
  });

  it("preserves all six native source blobs with explicit order and return reuse", () => {
    for (const set of recovered.completeDraftSets) {
      expect(EXERCISES.some((exercise) => exercise.id === set.exerciseId)).toBe(true);
      expect(set.status).toBe("draft-awaiting-review");
      expect(set.reviewFindings.length).toBeGreaterThan(0);
      expect(set.frames).toHaveLength(6);
      expect(new Set(set.frames.map((frame) => frame.path)).size).toBe(6);
      for (const [index, frame] of set.frames.entries()) {
        expect(frame.frame).toBe(index + 1);
        expect(frame.caption.endsWith(` ${index + 1}/6`)).toBe(true);
        expect(frame.cue.trim().length).toBeGreaterThan(0);
        expect(Number.isFinite(frame.progress)).toBe(true);
        expect(frame.progress).toBeGreaterThanOrEqual(0);
        expect(frame.progress).toBeLessThanOrEqual(1);
        expect(frame.path).toMatch(/^docs\/exercise-art\/pilots\/recovered-deadlift\/[1-6]\.png$/);
        const data = readFileSync(frame.path);
        expect(data.length).toBe(frame.bytes);
        expect(data.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
        expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual(frame.dimensions);
        expect(frame.dimensions).toEqual(set.frames[0].dimensions);
        expect(createHash("sha256").update(data).digest("hex")).toBe(frame.sha256);
        expect(createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex"))
          .toBe(frame.sourceBlobSha);
        expect(frame.sourcePath).toMatch(/^docs\/exercise-art\/pilots\/deadlift\//);
        if (frame.reusedFrom !== null) {
          expect(frame.reusedFrom).toBeLessThan(frame.frame);
          expect(set.frames[frame.reusedFrom - 1].sha256).toBe(frame.sha256);
        }
      }
    }
  });

  it("includes the recovery manifest in both the real review fixture and integrity audit", () => {
    const fixture = readFileSync("e2e/fixtures/form-art.tsx", "utf8");
    const audit = readFileSync("scripts/audit-form-drafts.ts", "utf8");
    expect(fixture).toContain('import recovered from "../../docs/exercise-art/RECOVERED_DRAFTS.json"');
    expect(fixture).toContain("...recovered.completeDraftSets");
    expect(audit).toContain('import recovered from "../docs/exercise-art/RECOVERED_DRAFTS.json"');
    expect(audit).toContain("for (const current of [manifest, recovered, continuation])");
  });
});

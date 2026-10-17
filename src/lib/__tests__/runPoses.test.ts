/**
 * The run cards' runner: which pose each run gets, and the cut-outs stay
 * bound to the released poses they were cut from.
 *
 * `scripts/art/cut-out-run-poses.ts` keys each pose in
 * docs/exercise-art/run-poses out of its black backdrop. The failure this
 * guards is a pose replaced or re-released while its cut-out keeps showing
 * the old drawing on Home and Train.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runPoseFor, runPoseUrl } from "../runPoses";
import { RUN_POSE_CUTOUTS, type RunPose } from "../runPoses.data";
import { RUN_TEMPLATES } from "../workoutTemplates";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const repoFile = (path: string) => readFileSync(resolve(process.cwd(), path));

describe("runPoseFor", () => {
  it("gives the fast stride to a tempo, intervals and a race", () => {
    expect(runPoseFor("tempo")).toBe("run-fast");
    expect(runPoseFor("intervals")).toBe("run-fast");
    expect(runPoseFor("race")).toBe("run-fast");
  });

  it("gives the easy stride to every other run, a free run included", () => {
    expect(runPoseFor("easy")).toBe("run-easy");
    expect(runPoseFor("long")).toBe("run-easy");
    expect(runPoseFor(undefined)).toBe("run-easy");
  });

  it("covers every planned run the app can schedule", () => {
    const fast = RUN_TEMPLATES.filter(
      (template) => runPoseFor(template.type) === "run-fast"
    ).map((template) => template.type);
    expect(new Set(fast)).toEqual(new Set(["tempo", "intervals", "race"]));
    // The run-walk weeks are easy runs: the easy stride, not the fast one.
    const runWalk = RUN_TEMPLATES.filter((template) =>
      template.id.startsWith("run_walk")
    );
    expect(runWalk.length).toBeGreaterThan(0);
    for (const template of runWalk)
      expect(runPoseFor(template.type)).toBe("run-easy");
  });

  it("serves the cut-out under the app's base path", () => {
    expect(runPoseUrl("run-fast")).toMatch(/\/form-art\/run-fast\.webp$/);
  });
});

const poses = Object.keys(RUN_POSE_CUTOUTS) as RunPose[];

describe("run pose cut-outs", () => {
  it.each(poses)("%s is cut from its released pose", (pose) => {
    const cutout = RUN_POSE_CUTOUTS[pose];
    expect(cutout.source).toBe(`docs/exercise-art/run-poses/${pose}.jpg`);
    expect(
      sha(repoFile(cutout.source)),
      `${cutout.source} changed since its cut-out was made — run ` +
        `npm run art:run-poses`
    ).toBe(cutout.sourceSha256);
  });

  it.each(poses)("%s ships the file its manifest names", (pose) => {
    const cutout = RUN_POSE_CUTOUTS[pose];
    const bytes = repoFile(`public/${cutout.src}`);
    expect(sha(bytes)).toBe(cutout.sha256);
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
    // Lossy with alpha is the extended format, with the alpha flag set.
    expect(bytes.toString("ascii", 12, 16)).toBe("VP8X");
    expect(bytes[20] & 0x10).not.toBe(0);
    expect([1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)]).toEqual([
      cutout.width,
      cutout.height,
    ]);
    expect(Math.max(cutout.width, cutout.height)).toBeLessThanOrEqual(480);
  });

  it.each(poses)("%s is the pose its provenance record names", (pose) => {
    const provenance = JSON.parse(
      repoFile("docs/exercise-art/run-poses/provenance.json").toString("utf8")
    ) as { poses: Record<string, { file: string; sha256: string }> };
    expect(provenance.poses[pose]).toMatchObject({
      file: RUN_POSE_CUTOUTS[pose].source,
      sha256: RUN_POSE_CUTOUTS[pose].sourceSha256,
    });
  });
});

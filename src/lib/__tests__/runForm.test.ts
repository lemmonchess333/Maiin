/**
 * The running form guide: six frames that alternate the two steps, cues
 * that fit the frame they are read in, and files bound to the sources and
 * provenance in docs/exercise-art/run-form.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RUN_FORM_BEATS } from "../runForm";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const repoFile = (path: string) => readFileSync(resolve(process.cwd(), path));
const provenance = JSON.parse(
  repoFile("docs/exercise-art/run-form/provenance.json").toString("utf8")
) as {
  sources: Record<string, string>;
  frames: Record<string, { source: string; sha256: string }>;
};

describe("running form guide", () => {
  it("has six frames that alternate the two steps", () => {
    expect(RUN_FORM_BEATS).toHaveLength(6);
    expect(RUN_FORM_BEATS.map((beat) => beat.t)).toEqual([
      0, 0.5, 0, 0.5, 0, 0.5,
    ]);
    expect(
      RUN_FORM_BEATS.map((beat) => provenance.frames[beat.image!].source)
    ).toEqual([
      "stride.png",
      "stride-mirrored.png",
      "stride.png",
      "stride-mirrored.png",
      "stride.png",
      "stride-mirrored.png",
    ]);
  });

  it("keeps each cue to one instruction of seven words or fewer", () => {
    for (const beat of RUN_FORM_BEATS)
      expect(beat.cue.split(/\s+/).length, beat.cue).toBeLessThanOrEqual(7);
    expect(new Set(RUN_FORM_BEATS.map((beat) => beat.label)).size).toBe(6);
  });

  it.each(RUN_FORM_BEATS.map((beat) => beat.image!))(
    "%s ships the file its provenance names",
    (image) => {
      expect(sha(repoFile(`public/${image}`))).toBe(
        provenance.frames[image].sha256
      );
    }
  );

  it("is cut from the sources its provenance names", () => {
    for (const [file, hash] of Object.entries(provenance.sources))
      expect(sha(repoFile(`docs/exercise-art/run-form/${file}`)), file).toBe(
        hash
      );
  });
});

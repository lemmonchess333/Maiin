/**
 * An approved set's registry entry comes from its release record. Only the
 * sets released without a strict review are listed by hand, and an ID is
 * never in both places: a hand entry left beside an approved record would
 * be dead, and would read as the set's release.
 */
import { describe, expect, it } from "vitest";
import {
  FORM_ARTWORK,
  HAND_LISTED_FORM_ARTWORK,
  formFramePaths,
} from "../formArtwork";
import { APPROVED_FORM_ART_RELEASES } from "../formArtReleases.data";
import { getFormPlayback } from "../formGuides";

describe("the artwork registry", () => {
  it("stops forward swimming and the ascent-only get-up while ordinary reps keep cycling", () => {
    expect(getFormPlayback("turkish-get-up")).toBe("sequence");
    expect(getFormPlayback("swimming")).toBe("sequence");
    expect(
      Object.keys(FORM_ARTWORK)
        .filter((id) => getFormPlayback(id) === "sequence")
        .sort()
    ).toEqual(["swimming", "turkish-get-up"]);
    expect(getFormPlayback("lu-raise")).toBe("cycle");
  });
  it("lists no set both by hand and from an approved record", () => {
    const approved = Object.keys(APPROVED_FORM_ART_RELEASES);
    expect(approved.length).toBeGreaterThan(0);
    expect(
      Object.keys(HAND_LISTED_FORM_ARTWORK).filter((id) =>
        approved.includes(id)
      )
    ).toEqual([]);
  });

  it("has no owner-only sets left after the final two strict reviews", () => {
    expect(HAND_LISTED_FORM_ARTWORK).toEqual({});
  });

  it("builds every approved set from its record", () => {
    const approved = Object.keys(FORM_ARTWORK)
      .filter((id) => FORM_ARTWORK[id].status === "approved")
      .sort();
    expect(approved).toEqual(Object.keys(APPROVED_FORM_ART_RELEASES).sort());
    for (const id of approved) {
      const release = APPROVED_FORM_ART_RELEASES[id];
      expect(FORM_ARTWORK[id], id).toEqual({
        version: release.version,
        status: "approved",
        width: release.width,
        height: release.height,
        frames: formFramePaths(id),
        reference: `form-frames/${id}/${release.reference}.webp`,
        reviewFile: `docs/exercise-art/releases/${release.folder}/${id}.json`,
      });
    }
  });
});

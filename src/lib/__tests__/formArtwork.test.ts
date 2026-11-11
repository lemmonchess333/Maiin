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
  it("cycles the reviewed swimming rig while the ascent-only get-up stops", () => {
    expect(getFormPlayback("turkish-get-up")).toBe("sequence");
    expect(getFormPlayback("swimming")).toBe("cycle");
    expect(
      Object.keys(FORM_ARTWORK)
        .filter((id) => getFormPlayback(id) === "sequence")
        .sort()
    ).toEqual(["turkish-get-up"]);
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

  it("lists only the owner-released straight-arm pulldown redraw by hand", () => {
    // The owner had the set redrawn on 2026-11-07; its owner record
    // supersedes the 2026-10-20 strict approval until a strict review.
    expect(Object.keys(HAND_LISTED_FORM_ARTWORK)).toEqual([
      "straight-arm-pulldown",
    ]);
    expect(HAND_LISTED_FORM_ARTWORK["straight-arm-pulldown"].status).toBe(
      "owner-released-with-findings"
    );
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
        frames: release.frames ?? formFramePaths(id),
        reference: (release.frames ?? formFramePaths(id))[
          release.reference - 1
        ],
        reviewFile: `docs/exercise-art/releases/${release.folder}/${id}.json`,
      });
    }
  });
});

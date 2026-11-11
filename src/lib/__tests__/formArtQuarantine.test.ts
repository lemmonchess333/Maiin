import { describe, expect, it } from "vitest";
import { getBodyDemo } from "../bodyRig";
import { getFormArtCutout } from "../formArtCutouts";
import { getDemoMuscleKey, getFormBeats } from "../formGuides";
import { FORM_ART_QUARANTINE_IDS } from "../formArtQuarantine";
import { getReleasedFormArtwork } from "../formArtwork";

describe("artwork withheld after movement review", () => {
  it("keeps the original record but serves a motion guide for every quarantined exercise", () => {
    for (const id of FORM_ART_QUARANTINE_IDS) {
      expect(getReleasedFormArtwork(id), `${id} provenance`).not.toBeNull();
      expect(getBodyDemo(id), `${id} replacement motion`).not.toBeNull();
      expect(getFormBeats(id), `${id} placard`).toBeNull();
      expect(getDemoMuscleKey(id), `${id} muscle key`).toBeNull();
      expect(getFormArtCutout(id), `${id} card art`).toBeNull();
    }
  });
});

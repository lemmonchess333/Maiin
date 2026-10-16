import { beforeEach, describe, expect, it, vi } from "vitest";

const { artworkRef, setupInstructions, advice } = vi.hoisted(() => ({
  artworkRef: {
    current: null as { frames: string[] } | null,
  },
  setupInstructions: ["Prepare before starting the depicted cycle."],
  advice: {
    tip: "Advice for this explicitly named variation.",
    commonMistakes: ["A mistake specific to this variation."],
  },
}));

vi.mock("../releasedFormPlacards", () => ({
  RELEASED_FORM_PLACARDS: {
    "setup-guide": {
      authoredSetupInstructions: setupInstructions,
      advice,
      beats: Array.from({ length: 6 }, (_, i) => ({
        t: i / 5,
        label: `Position ${i + 1}`,
        cue: `Cue ${i + 1}`,
        image: `form-frames/setup-guide/${i + 1}.webp`,
      })),
    },
  },
}));

vi.mock("../formArtwork", () => ({
  getReleasedFormArtwork: () => artworkRef.current,
}));

import { getFormAdvice, getFormSetup } from "../formGuides";

beforeEach(() => {
  artworkRef.current = null;
});

describe("released placard preparation", () => {
  it("returns setup only when all six released frames match the placard", () => {
    expect(getFormSetup("setup-guide")).toBeNull();
    expect(getFormAdvice("setup-guide")).toBeNull();
    artworkRef.current = {
      frames: Array.from(
        { length: 6 },
        (_, i) => `form-frames/setup-guide/${i + 1}.webp`
      ),
    };
    expect(getFormSetup("setup-guide")).toBe(setupInstructions);
    expect(getFormAdvice("setup-guide")).toBe(advice);
    artworkRef.current.frames[5] = "form-frames/another-guide/6.webp";
    expect(getFormSetup("setup-guide")).toBeNull();
    expect(getFormAdvice("setup-guide")).toBeNull();
    expect(getFormSetup("unknown-guide")).toBeNull();
    expect(getFormAdvice("unknown-guide")).toBeNull();
  });

  it("keeps a released placard without authored preparation unchanged", () => {
    artworkRef.current = {
      frames: Array.from(
        { length: 6 },
        (_, i) => `form-frames/dips/${i + 1}.webp`
      ),
    };
    expect(getFormSetup("dips")).toBeNull();
    expect(getFormAdvice("dips")).toBeNull();
  });
});

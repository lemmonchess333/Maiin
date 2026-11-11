/**
 * The signed-out screens name their drawings by path so they never load
 * the exercise database (authArt.ts). These hold each path to the
 * released cut-out it stands for, and the sign-in lifter to a flipbook.
 */
import { describe, it, expect } from "vitest";
import {
  SIGN_IN_EXERCISE,
  WELCOME_SESSION_EXERCISE,
  authArtPath,
} from "../authArt";
import { getFormArtCutout } from "../formArtCutouts";
import { heroMotionFor } from "../heroMotion";

describe("the signed-out screens' drawings", () => {
  for (const id of [WELCOME_SESSION_EXERCISE, SIGN_IN_EXERCISE]) {
    it(`${id} is a released drawing, at the path the screen asks for`, () => {
      // Null once a drawing is withdrawn or redrawn from another frame:
      // the screen must then name a different one.
      expect(getFormArtCutout(id)?.src).toBe(authArtPath(id));
    });
  }

  it("the sign-in lifter has a flipbook, so it can play its rep", () => {
    const sheet = heroMotionFor(authArtPath(SIGN_IN_EXERCISE));
    expect(sheet).not.toBeNull();
    expect(sheet?.still).toBe(authArtPath(SIGN_IN_EXERCISE));
  });
});

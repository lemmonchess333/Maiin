/**
 * The frame of a released drawing that its card picture is cut from.
 *
 * A card cut-out (`formArtCutouts`) was always cut from the set's review
 * reference, which for most sets is frame 1: the start of the movement.
 * For a curl, a raise or a squat the start is a figure standing with its
 * arms down, and at a row's 48px it reads as an anatomy outline, not the
 * exercise (the owner: "Should be able to see the exercise itself not
 * just the outlined version"). The frames listed here show the
 * position that names the exercise: the bar at the shoulders, the arms
 * out, the bottom of the squat. Each was picked on a contact sheet of the
 * set's six frames and checked as a 48px tile on both themes and in
 * Home's card.
 *
 * The reference stays what review pinned: the release records and owner
 * releases compare it by path and hash, and this does not touch it. A set
 * not listed here is cut from its reference, as before. ab-wheel stays on
 * its reference because its card is a reviewed hand-made cut-out of that
 * frame (`docs/exercise-art/cutout-sources/ab-wheel.json`).
 */
import type { FormArtwork } from "./formArtwork";

export const CARD_FRAMES: Readonly<Record<string, number>> = {
  "barbell-curl": 4,
  "barbell-shrug": 3,
  "bayesian-cable-curl": 3,
  "bodyweight-squat": 3,
  "box-jumps": 3,
  "bulgarian-split": 3,
  burpees: 1,
  "cable-crunch": 3,
  "cable-curl": 3,
  "cable-glute-kickback": 3,
  "cable-lateral-raise": 4,
  "chest-supported-db-row": 3,
  "clean-and-press": 5,
  "concentration-curl": 3,
  "cross-body-hammer-curl": 3,
  "cuban-press": 3,
  "db-curl": 3,
  "db-flyes": 3,
  "db-rdl": 3,
  "db-row": 4,
  "decline-sit-up": 3,
  "ez-bar-curl": 3,
  "face-pulls": 3,
  "front-raise": 3,
  "glute-bridge": 3,
  "glute-ham-raise": 4,
  "goblet-squat": 4,
  "hack-squat": 3,
  "hammer-curl": 3,
  "hip-abduction-machine": 3,
  "hip-thrust": 3,
  "incline-db-curl": 3,
  "incline-db-press": 4,
  "landmine-press": 3,
  "landmine-squat": 3,
  "lateral-raise": 3,
  "meadows-row": 3,
  "mountain-climbers": 4,
  "muscle-ups": 4,
  "pallof-press": 3,
  "preacher-curl": 3,
  "rear-delt-machine-fly": 3,
  "reverse-barbell-curl": 3,
  "reverse-pec-deck": 3,
  "seated-leg-curl": 3,
  "shoulder-press-machine": 4,
  "sissy-squat": 3,
  "smith-machine-squat": 3,
  "smith-shoulder-press": 4,
  "spider-db-curl": 3,
  squat: 4,
  "superman-hold": 3,
  "t-bar-row": 3,
  "tricep-kickback": 3,
  "weighted-plank": 3,
  "zercher-squat": 3,
  "zottman-curl": 3,
};

/** The frame a released set's card picture is cut from: its listed card
 *  frame, or its reference. */
export function cardFrameOf(
  exerciseId: string,
  art: Pick<FormArtwork, "frames" | "reference">
): string {
  const frame = CARD_FRAMES[exerciseId];
  return frame ? (art.frames[frame - 1] ?? art.reference) : art.reference;
}

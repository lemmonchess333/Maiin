import { RELEASED_FORM_PLACARDS } from "./releasedFormPlacards";
import { getReleasedFormArtwork } from "./formArtwork";

/* ── Form beats: the placard sequence ────────────────────────────────
 *
 * A named position, the frame that shows it, and the cue that belongs
 * to it — the numbered panels of a gym form placard (owner reference,
 * 2026-09-03: a six-panel chest-dip card, every panel captioned under
 * its own drawing). Where a demo has beats the player STEPS through
 * them, holding on each long enough to read, instead of running the
 * two-way rep — and the cue sits under the figure it describes rather
 * than in an instruction list further down the page.
 *
 * Keyed by EXERCISE ID, and deliberately NOT alias-resolved.
 * `tricep-dips` and `weighted-chest-dip` render the `dips` GEOMETRY,
 * which is already an approximation for the upright triceps variant —
 * whose own catalogue entry reads "don't lean forward like a chest
 * dip". Inheriting these captions would promote a silent visual
 * approximation into written coaching that contradicts the exercise.
 * A variant earns beats by having its own row.
 */
export interface FormBeat {
  /** The demo's own progress value — this beat IS a frame of it, and
   *  the legacy rig coordinate; image load failures use the frame player retry state. */
  t: number;
  /** The position's name: the panel heading. */
  label: string;
  /** What the lifter does here. Authored to the placard read budget in
   *  `PLACARD_TIMING` — about seven words, one instruction. */
  cue: string;
  /** SUPPLIED ART for this position: a path under `public/`, resolved
   *  against the app's base URL by the player. Where a placard has
   *  them, the frames ARE the animation and the rig figure is the
   *  fallback for when they fail to load. */
  image?: string;
}

/** A placard: the positions, and — where the frames are supplied art
 *  rather than the rig's own figure — the key that describes THAT art. */
export interface FormPlacard {
  beats: readonly FormBeat[];
  /** A lesson that ends at a different position stops instead of jumping back. */
  playback?: "cycle" | "sequence";
  /** Preparation before the depicted movement cycle, kept separate from cues. */
  authoredSetupInstructions?: readonly string[];
  /** Advice specific to the explicitly named variation in this artwork. */
  advice?: FormGuideAdvice;
  /** The muscle key for SUPPLIED art. The catalogue names the muscle
   *  groups an exercise trains, which is a true statement about the
   *  exercise and not necessarily about the picture: the dips card
   *  shades a pec solid and hatches the serratus, neither of which the
   *  catalogue's "chest / triceps / shoulders" describes. A key is a
   *  key to what is ON SCREEN, so supplied art brings its own. */
  key?: DemoMuscleKey;
}

export interface FormGuideAdvice {
  tip: string;
  commonMistakes: readonly string[];
}

export interface DemoMuscleKey {
  primary: string[];
  secondary: string[];
  /** How the secondary muscles are painted. The rig pales the purple;
   *  the supplied card hatches it, and a solid swatch beside a hatched
   *  muscle is a key describing something that is not there. */
  secondaryFill: "solid" | "hatch";
}

const FORM_BEATS: Record<string, FormPlacard> = {
  /* Dips — the first placard demo. Six positions on the dip's own t,
   * where 0 is the locked-out top and 1 the bottom. The cues are the
   * catalogue's four authored steps re-cut into the six frames the
   * geometry actually passes through: the lean (step 2) belongs to the
   * descent because the rig leans continuously, 12° → 30°, as it
   * sinks, and "keeping the forward lean locked" (step 4) belongs to
   * the press. */

  /* Supplied art, 2026-09-04. The labels are the card's, not the ones
     authored ahead of it: the pictures decide, the same way the
     pushdown's cues follow its drawings.

     THREE cues from the authored set are gone, all for one reason —
     this card is a FRONT view and they are sagittal claims. "Head back
     slightly", "head through as the bar passes it" and "bar over the
     mid-foot" are all true of the lift and none of them is visible
     from the front, so each would have been a caption asserting
     something the frame beneath it cannot show. That is the dips
     lockout mistake in another form: there the caption said "arms
     locked" over a 152-degree elbow. A cue has to be checkable against
     its own picture. */

  /* Supplied art, 2026-09-04. The first card whose registration
     EARNED itself: `MID LOWER` was drawn 31px low (its bench pad sits
     at y=718 where the other five sit at 687), and the gated shift
     caught it — 28% aligned before, 62.4% after. Every earlier card
     either needed no shift or had the shift declined, so this is the
     first evidence the pass does anything on real art.

     The bench is furniture, so the DEFAULT station anchor is correct
     here; `--anchor base` exists for the free-weight case (see the
     overhead press) and would be wrong on a lying exercise, where the
     figure's ground contact is the bench it is lying on. */

  /* Supplied art, 2026-09-04. The cleanest registration of any set:
     95.8-98.7%, not one shift applied. The shoes are why — a rigid,
     high-contrast ground contact that never moves (L=540, R=762, sole
     at y=1069-1070 across all six, a 1px spread), which is exactly
     what `--anchor base` wants. The moving load is not a fixed
     anchor, even for free weights.

     The authored cue said "torso about 45 degrees". MEASURED off this
     art it is 27-30 degrees below horizontal — so 45 was wrong on the
     horizontal reading and wrong on the vertical one (63) too. The cue
     now describes the hinge without asserting a number, which is the
     dips-lockout lesson: a caption is a claim about its own frame. */
  ...RELEASED_FORM_PLACARDS,
};

/**
 * The placard sequence for an exercise, or null where the demo plays as
 * an ordinary rep or a cycle.
 *
 * A placard is LIVE only once its card exists. The positions are
 * authored AHEAD of the art, because the generator prompt is built from
 * them — asking for six panels while the app knows only four
 * instructions produces a card that does not match the code. Until
 * every position has a frame, the exercise plays as an ordinary rep and
 * nothing about it changes.
 */
export function getFormBeats(exerciseId: string): readonly FormBeat[] | null {
  const placard = FORM_BEATS[exerciseId];
  const artwork = getReleasedFormArtwork(exerciseId);
  if (!placard || placard.beats.length !== 6 || !artwork) return null;
  return placard.beats.every((beat, i) => beat.image === artwork.frames[i])
    ? placard.beats
    : null;
}

/** Preparation is shown only alongside the exercise's released placard. */
export function getFormSetup(exerciseId: string): readonly string[] | null {
  return getFormBeats(exerciseId)
    ? (FORM_BEATS[exerciseId]?.authoredSetupInstructions ?? null)
    : null;
}

/** Ordinary reps cycle; an ascent-only lesson stops on its final drawing. */
export function getFormPlayback(exerciseId: string): "cycle" | "sequence" {
  return getFormBeats(exerciseId)
    ? (FORM_BEATS[exerciseId]?.playback ?? "cycle")
    : "cycle";
}

/** Variation advice is active only with its exact released six-frame guide. */
export function getFormAdvice(exerciseId: string): FormGuideAdvice | null {
  return getFormBeats(exerciseId)
    ? (FORM_BEATS[exerciseId]?.advice ?? null)
    : null;
}

/** The authored positions whether or not their art has arrived — for
 *  `form-card-prompt.ts`, which exists to go and ask for that art. */
export function getAuthoredBeats(
  exerciseId: string
): readonly FormBeat[] | null {
  return FORM_BEATS[exerciseId]?.beats ?? null;
}

/** Every id that has one, for the tests that pin them against the
 *  geometry they caption. */
export const FORM_BEAT_IDS = Object.keys(FORM_BEATS);

/** The muscle key a demo's own art needs, or null where the catalogue's
 *  groups describe the picture perfectly well (every rig-drawn demo:
 *  it tints the muscles the catalogue names). */
export function getDemoMuscleKey(exerciseId: string): DemoMuscleKey | null {
  return FORM_BEATS[exerciseId]?.key ?? null;
}

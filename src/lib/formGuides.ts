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
  /** The muscle key for SUPPLIED art. The catalogue names the muscle
   *  groups an exercise trains, which is a true statement about the
   *  exercise and not necessarily about the picture: the dips card
   *  shades a pec solid and hatches the serratus, neither of which the
   *  catalogue's "chest / triceps / shoulders" describes. A key is a
   *  key to what is ON SCREEN, so supplied art brings its own. */
  key?: DemoMuscleKey;
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
  dips: {
    /* The FRAMES are the owner's own card, cut into six by
       `scripts/extract-form-frames.mjs` — the card's art, unretouched
       apart from its panel text, which the app renders itself so it
       can be themed, selected, translated and read at any size.

       Each beat keeps its `t` as well. That is not redundancy: it is
       the fallback the rig renders when a frame cannot load, and it is
       what every geometry pin below still measures. */
    beats: [
      {
        t: 0,
        label: "Top position",
        cue: "Arms locked, chest tall, core braced.",
        image: "form-frames/dips/1.webp",
      },
      {
        t: 0.22,
        label: "Initiate descent",
        cue: "Unlock the elbows and lean forward.",
        image: "form-frames/dips/2.webp",
      },
      {
        t: 0.62,
        label: "Mid descent",
        cue: "Elbows travel back as the chest sinks.",
        image: "form-frames/dips/3.webp",
      },
      {
        t: 1,
        label: "Bottom position",
        cue: "Stop when upper arms reach parallel.",
        image: "form-frames/dips/4.webp",
      },
      {
        t: 0.5,
        label: "Press up",
        cue: "Drive through the palms, holding the lean.",
        image: "form-frames/dips/5.webp",
      },
      {
        t: 0,
        label: "Return to top",
        cue: "Lock the elbows out, ready to repeat.",
        image: "form-frames/dips/6.webp",
      },
    ],
    /* The card's own names, because the card's art is what is on
       screen. Finer than the catalogue's groups, and the two hatched
       entries are hatched in the pictures. */
    key: {
      primary: ["Pectoralis major"],
      secondary: [
        "Triceps",
        "Anterior deltoids",
        "Lower chest",
        "Serratus anterior",
      ],
      secondaryFill: "hatch",
    },
  },

  "bench-press": {
    /* Card-sourced (2026-09-03), so the figure region is 451px against
       the 900 the player renders — softer than the dips set, which came
       from six per-position images at 754. Labels follow the card's own
       panel headings so the two agree. */
    beats: [
      {
        t: 1,
        label: "Set up",
        cue: "Shoulder blades pinched, feet planted.",
        image: "form-frames/bench-press/1.webp",
      },
      {
        t: 0.75,
        label: "Unrack",
        cue: "Bar over the shoulders, arms locked.",
        image: "form-frames/bench-press/2.webp",
      },
      {
        t: 0.35,
        label: "Lower",
        cue: "Elbows about 45 degrees from the torso.",
        image: "form-frames/bench-press/3.webp",
      },
      {
        t: 0,
        label: "Bottom position",
        cue: "Bar touches the mid-chest, no bounce.",
        image: "form-frames/bench-press/4.webp",
      },
      {
        t: 0.5,
        label: "Drive",
        cue: "Press up and slightly back.",
        image: "form-frames/bench-press/5.webp",
      },
      {
        t: 1,
        label: "Lockout",
        cue: "Arms straight, ribs still down.",
        image: "form-frames/bench-press/6.webp",
      },
    ],
  },

  "rope-tricep-pushdown": {
    /* RE-ART 2026-09-04. The first set drew the cable machine as a
       bare post with a pulley — no stack, no guide rods, no housing —
       and this one draws the whole tower, with the plate block moving
       through the rep. That is the change worth having; it is also the
       one a consistency metric MISSES, because a machine with more
       parts in it scores slightly WORSE on frame-to-frame overlap
       while being strictly better art. The overlap reading nearly
       argued against adopting it.

       Six per-position images, edited from one original: figure height
       936px and foot line y=1080 in all six, back edge within 8px.
       Registration declines to move any frame.

       `t` runs stretch (elbows bent, rope high) to lockout, which is
       this demo's own direction: concentricTo 1, startsAt "stretch".

       The stack ladder is monotonic 1 -> 5 and descends at 6, which is
       right — but it is DECORATION, not a readout. Measured across the
       set the cable is not conserved: between "set elbows" and
       "controlled return" the hands rise 68px and the stack rises with
       them, the wrong way. This is a known replacement requirement:
       the new release gate must reject contradictory cable physics. */
    beats: [
      {
        t: 0,
        label: "Start",
        cue: "Elbows pinned, rope high, triceps stretched.",
        image: "form-frames/rope-tricep-pushdown/1.webp",
      },
      {
        t: 0.1,
        label: "Set elbows",
        cue: "Pin the elbows; upper arms stay still.",
        image: "form-frames/rope-tricep-pushdown/2.webp",
      },
      {
        t: 0.4,
        label: "Initiate push",
        cue: "Drive the rope down by extending.",
        image: "form-frames/rope-tricep-pushdown/3.webp",
      },
      {
        t: 0.7,
        label: "Mid pushdown",
        cue: "Keep pushing; the triceps contract.",
        image: "form-frames/rope-tricep-pushdown/4.webp",
      },
      {
        t: 1,
        label: "Lockout",
        cue: "Elbows fully extended, hands at the thighs.",
        image: "form-frames/rope-tricep-pushdown/5.webp",
      },
      {
        t: 0,
        label: "Controlled return",
        cue: "Return slowly; elbows must not drift.",
        image: "form-frames/rope-tricep-pushdown/6.webp",
      },
    ],
  },

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
  "overhead-press": {
    beats: [
      {
        t: 0,
        label: "Start position",
        cue: "Bar on the front delts, elbows under.",
        image: "form-frames/overhead-press/1.webp",
      },
      {
        t: 0.1,
        label: "Brace and set",
        cue: "Ribs down, glutes tight, grip outside shoulders.",
        image: "form-frames/overhead-press/2.webp",
      },
      {
        t: 0.4,
        label: "Initiate press",
        cue: "Drive the bar straight past the chin.",
        image: "form-frames/overhead-press/3.webp",
      },
      {
        t: 0.7,
        label: "Drive up",
        cue: "Keep pushing; the bar clears the head.",
        image: "form-frames/overhead-press/4.webp",
      },
      {
        t: 1,
        label: "Lockout",
        cue: "Elbows locked, bar centred over the head.",
        image: "form-frames/overhead-press/5.webp",
      },
      {
        t: 0,
        label: "Controlled return",
        cue: "Same path down, elbows stay under.",
        image: "form-frames/overhead-press/6.webp",
      },
    ],
    /* Solid, not hatched: this card fills its secondaries with flat
       lilac where the dips card cross-hatched them. The names are the
       card's own — it shades the anterior delt caps darkest and pales
       the chest, abs and upper arms, which is finer than the
       catalogue's "Deltoids / Triceps, Upper Chest, Core". */
    key: {
      primary: ["Anterior deltoids"],
      secondary: ["Upper chest", "Triceps", "Core"],
      secondaryFill: "solid",
    },
  },

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
  "skull-crushers": {
    beats: [
      {
        t: 0,
        label: "Start",
        cue: "Bar over the chest, elbows locked.",
        image: "form-frames/skull-crushers/1.webp",
      },
      {
        t: 0.15,
        label: "Initiate lower",
        cue: "Tilt the upper arms back, unlock elbows.",
        image: "form-frames/skull-crushers/2.webp",
      },
      {
        t: 0.5,
        label: "Mid lower",
        cue: "Only the forearms move; upper arms hold.",
        image: "form-frames/skull-crushers/3.webp",
      },
      {
        t: 1,
        label: "Bottom",
        cue: "Bar past the forehead, triceps stretched.",
        image: "form-frames/skull-crushers/4.webp",
      },
      {
        t: 0.55,
        label: "Extend",
        cue: "Drive back up; elbows stay stacked.",
        image: "form-frames/skull-crushers/5.webp",
      },
      {
        t: 0,
        label: "Return to lockout",
        cue: "Elbows locked again, ready to repeat.",
        image: "form-frames/skull-crushers/6.webp",
      },
    ],
    /* The card's own reading, which is NARROWER than the catalogue's.
       `secondaryMuscles` claims Chest and Front Delts; the art shades
       neither. It shades the triceps solid and pales the forearms —
       the same two-tier convention as the rope pushdown card, from the
       same generator. A key describes what is on screen. */
    key: {
      primary: ["Triceps"],
      secondary: ["Forearms"],
      secondaryFill: "solid",
    },
  },

  /* Supplied art, 2026-09-04. The tightest source set so far — foot
     line within 4px and stance width within 3px across all six, which
     is what lets registration sit at 84-97% with a single 4px nudge.

     `--anchor base` again, and for the same reason as the overhead
     press: the dumbbells travel from the thighs to shoulder height, so
     the grey-equipment mask is the WORST thing in frame to align on.
     The rule that decides it is not "free weight" but "does the load
     move" — the skull-crusher bench is furniture and takes the default
     anchor even though a barbell is in shot. */
  "lateral-raise": {
    beats: [
      {
        t: 0,
        label: "Start",
        cue: "Dumbbells at the thighs, arms straight.",
        image: "form-frames/lateral-raise/1.webp",
      },
      {
        t: 0.1,
        label: "Set position",
        cue: "Slight bend in the elbows, ribs down.",
        image: "form-frames/lateral-raise/2.webp",
      },
      {
        t: 0.4,
        label: "Initiate raise",
        cue: "Lead with the elbows, not the hands.",
        image: "form-frames/lateral-raise/3.webp",
      },
      {
        t: 0.7,
        label: "Mid raise",
        cue: "Keep the elbow angle fixed throughout.",
        image: "form-frames/lateral-raise/4.webp",
      },
      {
        t: 1,
        label: "Top position",
        cue: "Arms level with the shoulders.",
        image: "form-frames/lateral-raise/5.webp",
      },
      {
        t: 0,
        label: "Controlled return",
        cue: "Lower slowly; resist all the way down.",
        image: "form-frames/lateral-raise/6.webp",
      },
    ],
    /* Read off the art at the top position, where the shading is
       clearest: the side-delt cap is solid, and the pale wash covers
       the trap, the FOREARM and the abs — the upper arm is unshaded.
       Broader than the catalogue, which claims Traps alone. */
    key: {
      primary: ["Side deltoids"],
      secondary: ["Traps", "Forearms", "Core"],
      secondaryFill: "solid",
    },
  },

  /* ── Authored ahead of the art (2026-09-03) ──────────────────────
   * Positions only: no `image`, so `getFormBeats` returns null and
   * these play as ordinary reps until their cards arrive. They exist
   * so `form-card-prompt.ts` can ask a generator for exactly these six
   * panels — a prompt built from four catalogue instructions produces
   * a card the app cannot use.
   *
   * This header used to sit above bench-press, and stayed put as three
   * placards below it were given art — so it went on calling them
   * imageless long after they stopped being. It belongs immediately
   * above the first entry it is still true of; move it DOWN again as
   * the remaining cards arrive.
   *
   * `t` runs in each demo's OWN direction, which differs: row locks
   * out at t=1, squat and deadlift at t=0. The order pins in
   * bodyRig.test.ts check the labels against that, not against a
   * convention assumed here. */

  deadlift: {
    beats: [
      { t: 1, label: "Set up", cue: "Bar over mid-foot, shins close." },
      {
        t: 0.8,
        label: "Take the slack",
        cue: "Chest up, lats tight, arms straight.",
      },
      {
        t: 0.5,
        label: "Break the floor",
        cue: "Push the legs, bar stays against you.",
      },
      {
        t: 0.25,
        label: "Past the knees",
        cue: "Hips and shoulders rise together.",
      },
      { t: 0, label: "Lockout", cue: "Stand tall, glutes squeezed." },
      { t: 1, label: "Return", cue: "Hips back first, then bend the knees." },
    ],
  },

  "pull-ups": {
    beats: [
      { t: 0, label: "Dead hang", cue: "Arms straight, shoulders active." },
      {
        t: 0.3,
        label: "Initiate",
        cue: "Pull the shoulder blades down first.",
      },
      { t: 0.6, label: "Mid pull", cue: "Elbows drive down toward the ribs." },
      { t: 1, label: "Top", cue: "Chin over the bar, chest to it." },
      { t: 0.5, label: "Lower", cue: "Control the descent, no dropping." },
      { t: 0, label: "Hang", cue: "Back to straight arms, stay tight." },
    ],
  },

  /* Supplied art, 2026-09-04. The cleanest registration of any set:
     95.8-98.7%, not one shift applied. The shoes are why — a rigid,
     high-contrast ground contact that never moves (L=540, R=762, sole
     at y=1069-1070 across all six, a 1px spread), which is exactly
     what `--anchor base` wants. Load moves, so base anchor; see the
     lateral raise for why the test is "does the load move" and not
     "is it a free weight".

     The authored cue said "torso about 45 degrees". MEASURED off this
     art it is 27-30 degrees below horizontal — so 45 was wrong on the
     horizontal reading and wrong on the vertical one (63) too. The cue
     now describes the hinge without asserting a number, which is the
     dips-lockout lesson: a caption is a claim about its own frame. */
  "barbell-row": {
    beats: [
      {
        t: 0,
        label: "Start",
        cue: "Hinged over, arms straight, lats stretched.",
        image: "form-frames/barbell-row/1.webp",
      },
      {
        t: 0.1,
        label: "Set position",
        cue: "Back flat, hinged from the hips.",
        image: "form-frames/barbell-row/2.webp",
      },
      {
        t: 0.4,
        label: "Initiate pull",
        cue: "Shoulder blades pull before the arms.",
        image: "form-frames/barbell-row/3.webp",
      },
      {
        t: 0.7,
        label: "Mid row",
        cue: "Elbows track back, not out.",
        image: "form-frames/barbell-row/4.webp",
      },
      {
        t: 1,
        label: "Top contract",
        cue: "Bar to the lower ribs, squeeze.",
        image: "form-frames/barbell-row/5.webp",
      },
      {
        t: 0,
        label: "Controlled lower",
        cue: "Control it; the torso angle holds.",
        image: "form-frames/barbell-row/6.webp",
      },
    ],
    /* Broader than the catalogue again: it claims Rhomboids, Rear
       Delts and Biceps, and the art additionally washes the traps and
       the whole posterior chain — glutes and hamstrings are shaded
       because they hold the hinge. Rhomboids are not separable from
       the lat wedge at this size, so they are not named. */
    key: {
      primary: ["Lats"],
      secondary: ["Traps", "Rear deltoids", "Biceps", "Glutes", "Hamstrings"],
      secondaryFill: "solid",
    },
  },
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

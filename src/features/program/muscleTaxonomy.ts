/**
 * The muscle taxonomy — two layers, one attribution pass.
 *
 * ── Why this module exists (13a) ─────────────────────────────────────────
 *
 * `volumeModel.ts` tallies weekly sets against ten canonical groups. That
 * taxonomy is too coarse to express several things the sources state plainly,
 * and the module already concedes it in its own words: push/pull balance is
 * computed at MOVEMENT level rather than muscle level precisely because "the
 * canonical 'Shoulders' group lumps the push-y front delt with the pull-y rear
 * delt, so a muscle-level ratio would be misleading."
 *
 * Two citations make the coarseness a correctness problem rather than a
 * rounding one:
 *
 *   - Schoenfeld pp.186–187, on the shoulder press: the shoulder is externally
 *     rotated, so "the anterior head … receives the majority of stimulation;
 *     the middle and posterior heads are substantially less active."
 *   - Schoenfeld p.170: responsiveness is muscle-specific *within one person* —
 *     one subject grows quads and not elbow flexors, another the reverse.
 *
 * Averaging a lateral raise and a rear-delt flye into one "Shoulders" number is
 * therefore not imprecise, it is incoherent: the two have opposing profiles and
 * average to noise. Any per-muscle response model built on the ten groups would
 * be fitting that noise.
 *
 * ── What this changes today: nothing ─────────────────────────────────────
 *
 * The fine layer is the layer the tally is actually computed on; the canonical
 * ten are a ROLL-UP of it. `FINE_TO_CANONICAL` is total, so every canonical row
 * equals the sum of its fine rows and the published numbers are unchanged to
 * the set. `planSweep.golden.test.ts` proves that across all 90 configurations
 * — if the snapshot moves, the roll-up is wrong.
 *
 * ── How the splits were chosen ───────────────────────────────────────────
 *
 * Mechanically, not by taste: **split wherever the exercise DB already carries
 * the finer label on at least one exercise.** Every split below is therefore a
 * distinction the data already makes and the old map was throwing away. Nothing
 * here is invented, and no exercise had to be re-labelled.
 *
 * Two consequences of that rule worth stating, because they are the honest
 * output of 13a rather than a shortfall in it:
 *
 * **1. `*Unspecified` buckets are load-bearing, not filler.** Nine exercises are
 * labelled `Deltoids` and thirteen `Pectorals` / `Chest` — coarse parents that
 * name no head or region. They land in `DeltsUnspecified` / `ChestUnspecified`
 * rather than being silently attributed to a head the label does not claim.
 * That residue is the size of the data gap, and re-labelling those rows is
 * exactly handoff 11b's job. A response engine must be able to see how much of
 * a muscle's tally it cannot actually resolve.
 *
 * **2. Some splits the sources call for are not representable.** Schoenfeld
 * pp.101–102 (Fonseca) and p.188 single out the rectus femoris — squat-only
 * training has repeatedly failed to grow it — but no exercise in the DB labels
 * a quadriceps head, so `Quads` stays whole. The blocker is the data, not this
 * taxonomy; when the labels exist the split is one row here.
 *
 * ── Which splits carry a citation, and which are only data-preserving ────
 *
 * A future response engine must not read "we split it" as "the sources say
 * these respond differently". Only two do:
 *
 *   - **Delt heads** — cited above (pp.186–187), and independently conceded by
 *     `volumeModel`'s own push/pull comment.
 *   - **Back** — §3.9 of the v8 evaluation names the Lats/Traps/Rhomboids/
 *     Teres-Major lumping as the second incoherent group. Lats (vertical pull),
 *     upper back (horizontal pull) and erectors (hinge, largely isometric) do
 *     not share a stimulus.
 *
 * The rest — chest regions, gastrocnemius/soleus, abs/obliques, adductors,
 * posterior chain — are split ONLY because the label exists. They preserve
 * information at zero cost, and that is their whole claim. Do not titrate on
 * them as though a differential response has been shown.
 */

/** The ten groups the app has always published. Unchanged. */
export type CanonicalMuscle =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Quads"
  | "Hamstrings"
  | "Glutes"
  | "Calves"
  | "Core";

/** Display order (push → pull → legs → core), used by the summary UI. */
export const CANONICAL_MUSCLE_ORDER: CanonicalMuscle[] = [
  "Chest",
  "Shoulders",
  "Triceps",
  "Back",
  "Biceps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
];

/**
 * The finer layer the tally is computed on.
 *
 * `*Unspecified` members are not a shrug — they record that the exercise's own
 * label names a parent rather than a part (see the module note). `Forearms` and
 * `HipFlexors` are real muscles that the ten-group taxonomy has no home for;
 * they roll up to `null` and so contribute nothing to the canonical tally,
 * exactly as they did before this module existed.
 */
export type FineMuscle =
  // Chest
  | "UpperChest"
  | "LowerChest"
  | "ChestUnspecified"
  // Back
  | "Lats"
  | "UpperBack"
  | "Traps"
  | "LowerBack"
  | "BackUnspecified"
  // Shoulders
  | "FrontDelts"
  | "SideDelts"
  | "RearDelts"
  | "RotatorCuff"
  | "DeltsUnspecified"
  // Arms
  | "Biceps"
  | "Triceps"
  | "Forearms"
  // Legs
  | "Quads"
  | "Hamstrings"
  | "PosteriorChainUnspecified"
  | "Glutes"
  | "Adductors"
  | "Gastrocnemius"
  | "Soleus"
  | "HipFlexors"
  // Core
  | "Abs"
  | "Obliques"
  | "CoreUnspecified";

/**
 * Where each fine muscle lands in the published ten.
 *
 * `null` means "no home in the ten-group taxonomy" — the volume is real and now
 * visible at the fine layer, but it is excluded from the canonical tally so
 * that tally is byte-identical to the one the app published before 13a.
 * Widening the ten groups to admit them would move every existing number and is
 * deliberately not part of this change.
 */
export const FINE_TO_CANONICAL: Record<FineMuscle, CanonicalMuscle | null> = {
  UpperChest: "Chest",
  LowerChest: "Chest",
  ChestUnspecified: "Chest",

  Lats: "Back",
  UpperBack: "Back",
  Traps: "Back",
  LowerBack: "Back",
  BackUnspecified: "Back",

  FrontDelts: "Shoulders",
  SideDelts: "Shoulders",
  RearDelts: "Shoulders",
  RotatorCuff: "Shoulders",
  DeltsUnspecified: "Shoulders",

  Biceps: "Biceps",
  Triceps: "Triceps",
  // No Forearms group exists in the ten, and no exercise has forearms as its
  // PRIMARY — they appear only as a secondary on curls, rows and carries (18
  // occurrences). They used to map to nothing at all; now they tally at the
  // fine layer and still earn no canonical volume, so no published number
  // moves.
  Forearms: null,

  Quads: "Quads",
  Hamstrings: "Hamstrings",
  // "Posterior Chain" names glutes + hamstrings + erectors at once. One
  // exercise carries it. It has always been attributed to Hamstrings; that is
  // preserved, but it is now visible as the coarse label it is so 11b can
  // re-label the row rather than inheriting the guess.
  PosteriorChainUnspecified: "Hamstrings",
  Glutes: "Glutes",
  // The adductors are hip ADDUCTORS, not quadriceps. Adductor magnus is a
  // primary hip extensor trained by the same movements as the glutes (sumo
  // pulls, wide squats), which is why P1 moved it out of "Quads" and into
  // "Glutes". The fine layer keeps the decision and stops hiding it.
  Adductors: "Glutes",
  Gastrocnemius: "Calves",
  Soleus: "Calves",
  // The hip flexors are the iliopsoas, not the quadriceps. P1 removed them
  // from "Quads" after finding that — because "hip flexors" is a secondary on
  // nearly every ab movement in the DB — every core session was silently
  // booking quad volume. Same disposition here, now with the volume visible
  // instead of discarded.
  HipFlexors: null,

  Abs: "Core",
  Obliques: "Core",
  CoreUnspecified: "Core",
};

/**
 * Every muscle label that appears in the exercise DB, mapped to its fine
 * muscle. `null` means the label contributes NO resistance volume at all — a
 * different thing from a fine muscle that rolls up to `null` canonical, which
 * is real volume with no group to put it in.
 *
 * `muscleTaxonomy.test.ts` walks the whole DB and fails on any label missing
 * from this table, so an exercise added with a new label cannot quietly tally
 * zero.
 */
export const LABEL_TO_FINE: Record<string, FineMuscle | null> = {
  // ── Chest ──
  pectorals: "ChestUnspecified",
  chest: "ChestUnspecified",
  "upper chest": "UpperChest",
  "lower chest": "LowerChest",

  // ── Back ──
  lats: "Lats",
  "mid back": "UpperBack",
  "middle back": "UpperBack",
  rhomboids: "UpperBack",
  "teres major": "UpperBack",
  traps: "Traps",
  "lower back": "LowerBack",
  back: "BackUnspecified",
  "full back": "BackUnspecified",

  // ── Shoulders ──
  "front delts": "FrontDelts",
  "side delts": "SideDelts",
  "rear delts": "RearDelts",
  "rotator cuff": "RotatorCuff",
  deltoids: "DeltsUnspecified",
  shoulders: "DeltsUnspecified",

  // ── Arms ──
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  brachioradialis: "Forearms",

  // ── Legs ──
  quads: "Quads",
  hamstrings: "Hamstrings",
  "posterior chain": "PosteriorChainUnspecified",
  glutes: "Glutes",
  adductors: "Adductors",
  calves: "Gastrocnemius",
  soleus: "Soleus",
  "hip flexors": "HipFlexors",

  // ── Core ──
  core: "CoreUnspecified",
  abs: "Abs",
  // The rectus abdominis is one muscle with one nerve supply; "lower abs" names
  // a region of it, not a separate head. Folded into Abs rather than given a
  // bucket that would imply a distinction the anatomy does not support.
  "lower abs": "Abs",
  obliques: "Obliques",

  /* ── Contributes no resistance volume, each for its own reason ─────────
     `null` here is a DECISION, pinned by assertions in `volumeModel.test.ts`
     so a future edit has to argue with them rather than quietly flip one. ── */

  // Whole-body conditioning and cardio are not resistance volume.
  "full body": null,
  cardio: null,
  // Too coarse to attribute — "legs" and "arms" name a region of the BODY, not
  // a muscle or even a muscle group. Unlike `back` or `deltoids`, there is no
  // single canonical group they could roll up to, so there is nothing to put
  // in an Unspecified bucket.
  legs: null,
  arms: null,
};

/** The fine muscle a DB label names, or null when it earns no volume. */
export function toFine(name: string | undefined): FineMuscle | null {
  if (!name) return null;
  return LABEL_TO_FINE[name.toLowerCase().trim()] ?? null;
}

/** The canonical group a fine muscle rolls up into, or null when the ten-group
 *  taxonomy has no home for it. */
export function fineToCanonical(
  fine: FineMuscle | null
): CanonicalMuscle | null {
  return fine ? FINE_TO_CANONICAL[fine] : null;
}

/**
 * Injury-aware exercise substitution table.
 *
 * Keyed by original exerciseId. Each entry is an ordered list of
 * substitutes with the injuries they're genuinely safe for. The filter
 * in `applyInjuryFilters` iterates these in order and returns the first
 * substitute whose `safeFor` covers ALL the user's contraindicated
 * injuries — so a user with knee + lower_back both doesn't get
 * swapped into an exercise that fixes one injury while still
 * aggravating the other.
 *
 * RESEARCH BASIS:
 *
 *   Lower back — "spare the spine" framework (Stu McGill). Primary
 *   goal: eliminate axial loading under hip hinge. Key moves: trap
 *   bar deadlift (more upright, reduced erector activity), hip thrust
 *   (load glutes/hamstrings with spine supported), cable pull-through
 *   (lighter hinge), chest-supported rows (remove bent-over position).
 *   Confirmed via Physio Network / The Barbell Physio consensus.
 *
 *   Knee — unilateral > bilateral (Mike Boyle). Primary goal: reduce
 *   compressive load + shear at the joint. Key moves: hip thrust
 *   (off-loads knee), step-up (controlled unilateral), Bulgarian split
 *   squat (contrary to blanket "bad for knees" advice, BSS is
 *   clinically knee-friendlier than bilateral squat for most knee
 *   conditions), box squat (limits ROM). REP Fitness / NASM / T3
 *   consensus, confirmed via Legion + Nourish Move Love.
 *
 *   Shoulder — angled pressing + neutral grip (Eric Cressey). Primary
 *   goal: avoid impingement arc in pressing. Key moves: landmine press
 *   (angled path eliminates impingement arc), floor press (limits
 *   bottom-of-press stretch), neutral-grip DB variants, chest-supported
 *   horizontal pulling. BarBend / Sole Treadmills / modernsportspt
 *   consensus.
 *
 *   Wrist — remove end-range extension + heavy barbell grip (PT consensus,
 *   e.g. Barbell Medicine wrist-pain guides). Primary goal: swap loaded
 *   wrist extension (barbell bench, heavy OHP, BB curls, front squat
 *   rack, bodyweight push-ups) for neutral-grip DB or machine variants
 *   where the wrist stays aligned with the forearm. Machine work is
 *   wrist-friendlier than dumbbell, which is wrist-friendlier than
 *   barbell — and cable tricep ropes are wrist-neutral.
 *
 *   Elbow — reduce loaded end-range flexion/extension + heavy supinated
 *   grip (tennis/golfer's-elbow rehab guidelines, e.g. Mike Reinold,
 *   Barbell Medicine). Primary goal: swap heavy BB curls, chin-ups,
 *   dips, close-grip bench, and skull crushers for hammer / cable
 *   variants, machine presses with limited ROM, and horizontal pulling
 *   with neutral grip. Cable work provides smoother load than free
 *   weights through the elbow's painful arcs.
 *
 * SCOPE NOTE:
 *
 *   `alternatives: []` on a template exercise (or this table coming up
 *   empty for a given id+injury) means no safe substitute exists for
 *   the user's combination — the filter will keep the exercise with
 *   a user-visible warning note rather than silently swap to another
 *   contraindicated movement. That's the fix for the pre-W1a bug
 *   where e.g. `Barbell Squat (contra: knee) → Leg Press (ALSO
 *   contra: knee)`.
 */

export type InjuryCategory = "knee" | "shoulder" | "lower_back" | "wrist" | "elbow";

export interface SafeSubstitute {
  /** Exercise id from `src/lib/exercises.ts`. Must resolve to a real entry. */
  id: string;
  /** Display name. Cached here to avoid re-indexing EXERCISES at call time. */
  name: string;
  /** Which injury keywords this substitute is genuinely safe for. */
  safeFor: readonly InjuryCategory[];
  /** Short rationale, shown to the user in the exercise notes. */
  rationale: string;
}

/**
 * Helper for building table entries with less syntactic noise.
 */
function sub(
  id: string,
  name: string,
  safeFor: InjuryCategory[],
  rationale: string,
): SafeSubstitute {
  return { id, name, safeFor, rationale };
}

export const INJURY_SUBSTITUTIONS: Record<string, readonly SafeSubstitute[]> = {
  // ═══════════════════════════════════════════════════════════════════════
  // LOWER BACK — axial-loaded hinge patterns that need substitutes
  // ═══════════════════════════════════════════════════════════════════════

  "deadlift": [
    sub("trap-bar-deadlift", "Trap Bar Deadlift", ["lower_back"], "More upright torso reduces erector-spinae activation"),
    sub("rack-pull", "Rack Pull", ["lower_back"], "Reduced ROM, starts at knee height, less lumbar flexion"),
    sub("hip-thrust", "Hip Thrust", ["lower_back", "knee"], "Spine supported against bench, loads posterior chain"),
    sub("glute-ham-raise", "Glute-Ham Raise", ["lower_back"], "Hamstring-focused with minimal spinal load"),
  ],

  "romanian-deadlift": [
    sub("hip-thrust", "Hip Thrust", ["lower_back", "knee"], "Targets same posterior chain without hinging under load"),
    sub("kettlebell-swing", "Kettlebell Swing", ["lower_back"], "Ballistic pattern, lighter load, shorter TUT"),
    sub("glute-ham-raise", "Glute-Ham Raise", ["lower_back"], "Isolated posterior chain, minimal lumbar demand"),
  ],

  "sumo-deadlift": [
    sub("trap-bar-deadlift", "Trap Bar Deadlift", ["lower_back"], "More upright torso reduces erector-spinae activation"),
    sub("hip-thrust", "Hip Thrust", ["lower_back"], "Spine supported, loads posterior chain"),
  ],

  "barbell-row": [
    sub("chest-supported-db-row", "Chest-Supported DB Row", ["lower_back", "knee"], "Bench supports torso — zero lumbar load"),
    sub("seated-row", "Seated Cable Row", ["lower_back", "shoulder"], "Seated position, fixed torso angle"),
    sub("t-bar-row", "T-Bar Row", ["lower_back"], "Supported T-bar variant keeps torso braced"),
  ],

  "pendlay-row": [
    sub("chest-supported-db-row", "Chest-Supported DB Row", ["lower_back"], "Bench supports torso, eliminates hinge"),
    sub("seated-row", "Seated Cable Row", ["lower_back", "shoulder"], "Fixed seated position, no bent-over work"),
  ],

  "meadows-row": [
    sub("chest-supported-db-row", "Chest-Supported DB Row", ["lower_back"], "Removes the asymmetric bent-over load"),
    sub("seated-row", "Seated Cable Row", ["lower_back"], "Seated position preserves row pattern safely"),
  ],

  "t-bar-row": [
    sub("chest-supported-db-row", "Chest-Supported DB Row", ["lower_back"], "Removes free-standing torso load"),
    sub("seated-row", "Seated Cable Row", ["lower_back"], "Seated alternative keeps the pulling pattern"),
  ],

  // Bent-over rows share the same hinge issue as deadlifts
  "db-row": [
    sub("chest-supported-db-row", "Chest-Supported DB Row", ["lower_back"], "Bench supports torso, same muscle targets"),
    sub("seated-row", "Seated Cable Row", ["lower_back"], "Seated row pattern, no hinging"),
  ],

  // Dumbbell RDL — same hinge issue, separate id so the table has a
  // first-class entry rather than deferring to the barbell RDL row.
  "db-rdl": [
    sub("hip-thrust", "Hip Thrust", ["lower_back", "knee"], "Glute-hamstring focus with spine supported"),
    sub("kettlebell-swing", "Kettlebell Swing", ["lower_back"], "Ballistic posterior-chain work, lighter load"),
    sub("glute-ham-raise", "Glute-Ham Raise", ["lower_back"], "Hamstring isolation, minimal lumbar demand"),
  ],

  // Superman Hold — loaded lumbar extension, not appropriate for
  // lower-back users. Substitute with a supported posterior-chain
  // alternative or a core stabiliser that doesn't require spinal
  // extension.
  "superman-hold": [
    sub("dead-bug", "Dead Bug", ["lower_back"], "Neutral-spine core stability, zero extension load"),
    sub("plank", "Plank", ["lower_back"], "Isometric anti-extension, spine-safe"),
    sub("hip-thrust", "Hip Thrust", ["lower_back", "knee"], "Glute focus without spinal extension"),
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // KNEE — bilateral compression patterns that need substitutes
  // ═══════════════════════════════════════════════════════════════════════

  "squat": [
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee", "lower_back"], "Unilateral loading, less compressive shear at the knee"),
    sub("hip-thrust", "Hip Thrust", ["knee", "lower_back"], "Glute-focused, off-loads the knee joint entirely"),
    sub("goblet-squat", "Goblet Squat", ["knee"], "Lighter load, allows ROM control to pain-free depth"),
    sub("barbell-step-ups", "Step-Up", ["knee"], "Controlled unilateral, start low height"),
  ],

  "hack-squat": [
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee"], "Unilateral loading, less knee compression"),
    sub("hip-thrust", "Hip Thrust", ["knee"], "Off-loads the knee joint entirely"),
    sub("barbell-step-ups", "Step-Up", ["knee"], "Controlled unilateral alternative"),
  ],

  "leg-press": [
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee"], "Unilateral loading — clinically knee-friendlier than leg press"),
    sub("hip-thrust", "Hip Thrust", ["knee", "lower_back"], "Glute-focused, off-loads the knee"),
    sub("barbell-step-ups", "Step-Up", ["knee"], "Unilateral, start low, minimal knee shear"),
    sub("nordic-hamstring-curl", "Nordic Hamstring Curl", ["knee"], "Posterior-chain focus, eccentric hamstring work"),
  ],

  "smith-machine-squat": [
    sub("hip-thrust", "Hip Thrust", ["knee"], "Off-loads the knee joint entirely"),
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee"], "Unilateral loading reduces knee shear"),
  ],

  "pistol-squat": [
    sub("barbell-step-ups", "Step-Up", ["knee"], "Controlled unilateral pattern, less depth"),
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee"], "Unilateral, rear-foot-elevated, controllable depth"),
  ],

  "sissy-squat": [
    sub("hip-thrust", "Hip Thrust", ["knee"], "Off-loads the knee — sissy squat is maximal knee shear"),
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee"], "Unilateral knee-friendly pattern"),
  ],

  "leg-extension": [
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee"], "Compound unilateral replaces open-chain knee isolation"),
    sub("hip-thrust", "Hip Thrust", ["knee"], "Posterior-chain focus, minimal knee stress"),
    sub("barbell-step-ups", "Step-Up", ["knee"], "Unilateral, start low height, lower knee shear"),
    sub("goblet-squat", "Goblet Squat", ["knee"], "Closed-chain pattern with controllable depth"),
    sub("nordic-hamstring-curl", "Nordic Hamstring Curl", ["knee"], "Posterior-chain alternative, spares the knee"),
  ],

  "lunges": [
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee"], "Rear foot stable — less knee shear than forward lunge"),
    sub("barbell-step-ups", "Step-Up", ["knee"], "Vertical movement path, lower knee stress"),
    sub("hip-thrust", "Hip Thrust", ["knee"], "Off-loads the knee"),
  ],

  "walking-dumbbell-lunges": [
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee"], "Static rear-foot position removes walking-lunge impact"),
    sub("barbell-step-ups", "Step-Up", ["knee"], "Controlled unilateral with lower knee shear"),
  ],

  "bodyweight-lunge": [
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee"], "Static rear-foot position removes forward-lunge knee shear"),
    sub("barbell-step-ups", "Step-Up", ["knee"], "Lower-impact unilateral alternative"),
  ],

  // Bodyweight and goblet patterns — only swap if the user's knee
  // condition is flagged. For most "knee" labels these are already
  // safe, but we provide lighter alternatives for worst-case use.
  "zercher-squat": [
    sub("goblet-squat", "Goblet Squat", ["knee"], "Lighter front-loaded alternative"),
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee"], "Unilateral knee-friendly pattern"),
  ],

  // ═══════════════════════════════════════════════════════════════════════
  // SHOULDER — pressing and overhead patterns that need substitutes
  // ═══════════════════════════════════════════════════════════════════════

  "overhead-press": [
    sub("landmine-press", "Landmine Press", ["shoulder", "wrist"], "Angled path removes impingement arc and reduces wrist extension"),
    sub("db-shoulder-press", "Seated DB Press", ["shoulder", "wrist"], "Neutral grip keeps the wrist aligned with the forearm"),
    sub("shoulder-press-machine", "Shoulder Press Machine", ["shoulder", "wrist", "elbow"], "Controlled plane + limited ROM — spares stabilisers, wrist, and elbow"),
  ],

  "smith-shoulder-press": [
    sub("landmine-press", "Landmine Press", ["shoulder", "wrist"], "Angled path, shoulder and wrist friendly"),
    sub("db-shoulder-press", "Seated DB Press", ["shoulder", "wrist"], "Neutral-grip alternative"),
    sub("shoulder-press-machine", "Shoulder Press Machine", ["shoulder", "wrist", "elbow"], "Controlled plane with limited elbow ROM"),
  ],

  "arnold-press": [
    sub("landmine-press", "Landmine Press", ["shoulder", "wrist"], "Angled path, shoulder and wrist friendly"),
    sub("shoulder-press-machine", "Shoulder Press Machine", ["shoulder", "wrist", "elbow"], "Machine-controlled, reduced stabiliser and joint load"),
  ],

  // DB overhead press (the non-barbell variant). Template alts currently
  // point at "Lateral Raise" which is a hypertrophy-stimulus downgrade.
  // The landmine and machine press options preserve the pressing pattern
  // while being shoulder-friendly.
  "db-shoulder-press": [
    sub("landmine-press", "Landmine Press", ["shoulder", "wrist"], "Angled path removes impingement arc and reduces wrist extension"),
    sub("shoulder-press-machine", "Shoulder Press Machine", ["shoulder", "wrist", "elbow"], "Controlled plane, limited elbow ROM"),
    sub("incline-db-press", "Incline DB Press", ["shoulder", "wrist"], "Inclined pressing preserves the pattern with friendlier wrist loading"),
  ],

  // Pike push-up — bodyweight vertical press. Irritates shoulder in the
  // bottom position AND loads the wrist heavily. Substitutes must spare
  // whichever is flagged.
  "pike-push-up": [
    sub("landmine-press", "Landmine Press", ["shoulder", "wrist"], "Angled path eliminates overhead impingement and wrist extension"),
    sub("shoulder-press-machine", "Shoulder Press Machine", ["shoulder", "wrist", "elbow"], "Machine-controlled plane, limited ROM"),
    sub("db-shoulder-press", "Seated DB Press", ["shoulder", "wrist"], "Neutral-grip seated alternative"),
    sub("push-ups", "Push-Ups", ["shoulder"], "Horizontal press pattern avoids overhead impingement (still wrist-loaded)"),
  ],

  "bench-press": [
    sub("chest-press-machine", "Chest Press Machine", ["shoulder", "wrist", "elbow"], "Controlled plane, neutral grip option, limited ROM spares every upper-body joint"),
    sub("db-bench", "Dumbbell Bench Press", ["wrist", "elbow"], "Neutral-grip DB spares wrist and elbow from barbell supinated load"),
    sub("incline-db-press", "Incline DB Press", ["shoulder", "wrist"], "Neutral-grip DB spares the wrist and stabilises the shoulder"),
    sub("barbell-floor-press", "Floor Press", ["shoulder"], "Limits ROM — no bottom-of-press stretch that irritates the shoulder"),
  ],

  "incline-bench": [
    sub("incline-db-press", "Incline DB Press", ["shoulder", "wrist"], "Neutral-grip variant, friendlier on the shoulder and wrist"),
    sub("chest-press-machine", "Chest Press Machine", ["shoulder", "wrist", "elbow"], "Machine-controlled plane and limited ROM"),
  ],

  "decline-bench": [
    sub("incline-db-press", "Incline DB Press", ["shoulder", "wrist"], "Neutral-grip variant with controlled ROM"),
    sub("chest-press-machine", "Chest Press Machine", ["shoulder", "wrist", "elbow"], "Controlled plane and joint-sparing ROM"),
  ],

  // Dips — wrist-loaded, elbow-stressful at the bottom, shoulder
  // impingement risk for some. Need subs that can cover any combination.
  "dips": [
    sub("chest-press-machine", "Chest Press Machine", ["shoulder", "wrist", "elbow"], "Controlled plane, limited ROM, neutral wrist option"),
    sub("db-bench", "Dumbbell Bench Press", ["shoulder", "wrist", "elbow"], "Neutral-grip DB removes the deep dip stretch across every joint"),
    sub("incline-db-press", "Incline DB Press", ["shoulder", "wrist"], "Neutral grip, stable shoulder, wrist-friendly"),
    sub("close-grip-bench", "Close-Grip Bench Press", ["shoulder"], "Removes the deep bottom-position shoulder stretch"),
  ],

  "weighted-chest-dip": [
    sub("chest-press-machine", "Chest Press Machine", ["shoulder", "wrist", "elbow"], "Controlled plane with limited joint ROM"),
    sub("db-bench", "Dumbbell Bench Press", ["shoulder", "wrist", "elbow"], "Neutral-grip DB press removes the deep stretch and shares the load across joints"),
    sub("incline-db-press", "Incline DB Press", ["shoulder", "wrist"], "Neutral-grip variant"),
    sub("close-grip-bench", "Close-Grip Bench Press", ["shoulder"], "Removes bottom-position shoulder stretch"),
  ],

  "barbell-upright-row": [
    sub("face-pulls", "Face Pulls", ["shoulder", "elbow", "wrist"], "Light load, external rotation, neutral-grip rope"),
    sub("lateral-raise", "Lateral Raise", ["shoulder", "elbow"], "Lower-ROM alternative without impingement or heavy elbow load"),
  ],

  // Vertical pulling — neutral grip is friendlier than pronated for
  // shoulders, and lat pulldowns / supported rows replace chin/pull-up
  // elbow stress.
  "pull-ups": [
    sub("lat-pulldown", "Lat Pulldown", ["shoulder", "elbow"], "Neutral / wide-grip options, controlled ROM spares the elbow"),
    sub("chest-supported-db-row", "Chest-Supported DB Row", ["shoulder", "lower_back", "elbow"], "Horizontal pulling with chest support removes overhead and elbow stress"),
    sub("chin-ups", "Chin-Ups", ["shoulder"], "Supinated grip externally rotates the shoulder — friendlier position (still elbow-loaded)"),
  ],

  // Chin-ups — elbow-flexion under bodyweight load, worst for tennis /
  // golfer's elbow. Substitutes preserve vertical pulling where the
  // elbow tolerates it and fall back to horizontal otherwise.
  "chin-ups": [
    sub("lat-pulldown", "Lat Pulldown", ["elbow", "shoulder"], "Controlled cable load, neutral grip option"),
    sub("chest-supported-db-row", "Chest-Supported DB Row", ["elbow", "shoulder", "lower_back"], "Horizontal pulling removes the elbow-heavy vertical stress"),
    sub("seated-row", "Seated Cable Row", ["elbow", "shoulder", "lower_back"], "Seated cable variant with controlled tension"),
  ],

  // Barbell curl — supinated load at end-range, tough on both wrist
  // and elbow (especially medial epicondylitis / golfer's elbow).
  "barbell-curl": [
    sub("hammer-curl", "Hammer Curl", ["wrist", "elbow"], "Neutral grip reduces wrist extension and elbow pronation stress"),
    sub("cable-curl", "Cable Curl", ["wrist", "elbow"], "Cable smooths the strength curve and spares end-range elbow stress"),
    sub("incline-db-curl", "Incline DB Curl", ["wrist"], "Neutral-to-supinated DB path is wrist-friendlier than barbell"),
    sub("ez-bar-curl", "EZ Bar Curl", ["wrist"], "Angled grip reduces wrist stress (still loaded elbow flexion)"),
  ],

  // Close-grip bench — heavy elbow-extension lockout AND wrist stress.
  "close-grip-bench": [
    sub("chest-press-machine", "Chest Press Machine", ["shoulder", "wrist", "elbow"], "Controlled plane and limited ROM spare the elbow"),
    sub("incline-db-press", "Incline DB Press", ["shoulder", "wrist"], "Neutral-grip DB press — wrist-friendlier than barbell"),
    sub("rope-tricep-pushdown", "Rope Tricep Pushdown", ["wrist", "elbow"], "Cable isolates triceps with elbow- and wrist-friendly neutral rope"),
  ],

  // Skull crushers — heavy loaded elbow extension + wrist.
  "skull-crushers": [
    sub("rope-tricep-pushdown", "Rope Tricep Pushdown", ["wrist", "elbow"], "Cable + rope keeps wrist neutral and elbow tension smoother"),
    sub("overhead-cable-tricep-extension", "Overhead Cable Tricep Extension", ["elbow"], "Cable variant smooths loading; uses rope (neutral grip)"),
    sub("tricep-kickback", "Tricep Kickback", ["wrist", "elbow"], "Light load, neutral grip, controllable ROM"),
  ],

  // Overhead tricep extension — loaded elbow extension, often aggravates
  // medial elbow for bench / heavy-pressing lifters.
  "overhead-extension": [
    sub("rope-tricep-pushdown", "Rope Tricep Pushdown", ["elbow", "wrist"], "Cable isolates triceps with neutral-grip rope"),
    sub("tricep-kickback", "Tricep Kickback", ["elbow", "wrist"], "Light load, easier on the elbow and wrist"),
  ],

  // Push-ups — bodyweight wrist extension. Elbow is usually fine.
  "push-ups": [
    sub("chest-press-machine", "Chest Press Machine", ["shoulder", "wrist", "elbow"], "Removes the wrist-extended bodyweight pattern entirely"),
    sub("incline-db-press", "Incline DB Press", ["shoulder", "wrist"], "Neutral-grip DB press — wrist stays aligned with the forearm"),
  ],

  // Diamond push-ups — narrow wrist angle AND heavy triceps/elbow load.
  "diamond-push-ups": [
    sub("chest-press-machine", "Chest Press Machine", ["shoulder", "wrist", "elbow"], "Removes the narrow-grip wrist extension AND elbow lockout"),
    sub("rope-tricep-pushdown", "Rope Tricep Pushdown", ["wrist", "elbow"], "Cable isolates triceps with a wrist-neutral grip"),
  ],

  // Front squat — the front-rack position is famously hard on the
  // wrists. Goblet squat holds the load at the chest with no rack.
  "front-squat": [
    sub("goblet-squat", "Goblet Squat", ["knee", "wrist"], "Front-loaded at chest, no rack position — wrist-friendly and lighter load"),
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee", "lower_back", "wrist"], "No front-rack requirement, unilateral knee-friendly"),
    sub("hip-thrust", "Hip Thrust", ["knee", "wrist"], "Off-loads the knee, bar across hips not in the rack"),
    sub("hack-squat", "Hack Squat", ["wrist"], "No rack position, shoulder-pad loading"),
  ],
};

/**
 * Find the first substitute whose `safeFor` covers ALL of the user's
 * contraindicated injuries AND whose id is not already in `excludeIds`.
 * Returns null if no substitute clears every injury — caller should
 * keep the original exercise with a user-visible warning note.
 *
 * `excludeIds` is how `applyInjuryFilters` prevents duplicate-stacking
 * when multiple contraindicated exercises on the same day would
 * otherwise all swap to the same safe candidate (e.g. a knee user's
 * Barbell Squat AND Leg Press both picking Bulgarian Split Squat
 * would leave two BSS entries in a row). Passing the day's already-
 * present ids in `excludeIds` forces the second swap to continue
 * down the ordered candidate list to the next safe option (e.g. Hip
 * Thrust), preserving pattern diversity and total work.
 */
export function findSafeSubstitute(
  originalId: string,
  userInjuries: readonly string[],
  excludeIds?: ReadonlySet<string>,
): SafeSubstitute | null {
  const candidates = INJURY_SUBSTITUTIONS[originalId];
  if (!candidates || candidates.length === 0) return null;

  // Normalise injury strings to the InjuryCategory subset we handle.
  const relevant = userInjuries.filter((i): i is InjuryCategory =>
    i === "knee" || i === "shoulder" || i === "lower_back" ||
    i === "wrist" || i === "elbow",
  );
  if (relevant.length === 0) return null;

  for (const candidate of candidates) {
    const clears = relevant.every((injury) => candidate.safeFor.includes(injury));
    if (!clears) continue;
    if (excludeIds && excludeIds.has(candidate.id)) continue;
    return candidate;
  }
  return null;
}

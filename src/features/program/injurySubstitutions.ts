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

export type InjuryCategory = "knee" | "shoulder" | "lower_back";

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

  "barbell-squat": [
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee", "lower_back"], "Unilateral loading, less compressive shear at the knee"),
    sub("hip-thrust", "Hip Thrust", ["knee", "lower_back"], "Glute-focused, off-loads the knee joint entirely"),
    sub("goblet-squat", "Goblet Squat", ["knee"], "Lighter load, allows ROM control to pain-free depth"),
    sub("barbell-step-ups", "Step-Up", ["knee"], "Controlled unilateral, start low height"),
  ],

  "front-squat": [
    sub("goblet-squat", "Goblet Squat", ["knee"], "Front-loaded pattern, lighter load, controllable depth"),
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee", "lower_back"], "Unilateral, reduces knee shear"),
    sub("hip-thrust", "Hip Thrust", ["knee"], "Off-loads knee entirely"),
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

  // Dumbbell lunge variant (forward-step, knee-stressful path). Same
  // substitutes as generic `lunges` but declared separately so the
  // table-lookup path doesn't fall through.
  "db-lunge": [
    sub("bulgarian-split", "Bulgarian Split Squat", ["knee"], "Rear foot stable — less knee shear than forward lunge"),
    sub("barbell-step-ups", "Step-Up", ["knee"], "Vertical movement path, lower knee stress"),
    sub("hip-thrust", "Hip Thrust", ["knee"], "Off-loads the knee entirely"),
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
    sub("landmine-press", "Landmine Press", ["shoulder"], "Angled path eliminates the impingement arc"),
    sub("db-shoulder-press", "Seated DB Press", ["shoulder"], "Neutral/semi-pronated grip reduces impingement risk"),
    sub("shoulder-press-machine", "Shoulder Press Machine", ["shoulder"], "Controlled plane, reduced stabiliser demand"),
  ],

  "smith-shoulder-press": [
    sub("landmine-press", "Landmine Press", ["shoulder"], "Angled path, shoulder-friendly"),
    sub("db-shoulder-press", "Seated DB Press", ["shoulder"], "Neutral-grip alternative"),
  ],

  "arnold-press": [
    sub("landmine-press", "Landmine Press", ["shoulder"], "Angled path, shoulder-friendly"),
    sub("shoulder-press-machine", "Shoulder Press Machine", ["shoulder"], "Machine-controlled, reduced stabiliser load"),
  ],

  // DB overhead press (the non-barbell variant). Template alts currently
  // point at "Lateral Raise" which is a hypertrophy-stimulus downgrade.
  // The landmine and machine press options preserve the pressing pattern
  // while being shoulder-friendly.
  "db-shoulder-press": [
    sub("landmine-press", "Landmine Press", ["shoulder"], "Angled path eliminates the impingement arc"),
    sub("shoulder-press-machine", "Shoulder Press Machine", ["shoulder"], "Controlled plane, reduced stabiliser demand"),
    sub("incline-db-press", "Incline DB Press", ["shoulder"], "Inclined bench press emphasises upper chest with friendlier shoulder path"),
  ],

  // Pike push-up — advanced bodyweight vertical press, irritates the
  // shoulder in the bottom position. Substitutes preserve the
  // bodyweight-friendly theme where possible.
  "pike-push-up": [
    sub("landmine-press", "Landmine Press", ["shoulder"], "Angled path, friendlier than overhead"),
    sub("push-ups", "Push-Ups", ["shoulder"], "Horizontal press pattern avoids overhead impingement"),
    sub("shoulder-press-machine", "Shoulder Press Machine", ["shoulder"], "Controlled plane alternative"),
  ],

  "bench-press": [
    sub("barbell-floor-press", "Floor Press", ["shoulder"], "Limits ROM — no bottom-of-press stretch that irritates the shoulder"),
    sub("incline-db-press", "Incline DB Press", ["shoulder"], "Neutral grip, stable shoulder position"),
    sub("chest-press-machine", "Chest Press Machine", ["shoulder"], "Controlled plane, reduced stabiliser demand"),
  ],

  "incline-bench": [
    sub("incline-db-press", "Incline DB Press", ["shoulder"], "Neutral-grip variant, more forgiving on the shoulder"),
    sub("chest-press-machine", "Chest Press Machine", ["shoulder"], "Machine-controlled plane"),
  ],

  "decline-bench": [
    sub("incline-db-press", "Incline DB Press", ["shoulder"], "Neutral-grip variant with controlled ROM"),
    sub("chest-press-machine", "Chest Press Machine", ["shoulder"], "Controlled plane"),
  ],

  "dips": [
    sub("close-grip-bench", "Close-Grip Bench Press", ["shoulder"], "Removes deep bottom-position shoulder stretch"),
    sub("chest-press-machine", "Chest Press Machine", ["shoulder"], "Controlled plane, zero bottom-position stretch"),
  ],

  "weighted-chest-dip": [
    sub("close-grip-bench", "Close-Grip Bench Press", ["shoulder"], "Removes bottom-position shoulder stretch"),
  ],

  "barbell-upright-row": [
    sub("face-pulls", "Face Pulls", ["shoulder"], "External-rotation-friendly, strengthens rotator cuff"),
    sub("lateral-raise", "Lateral Raise", ["shoulder"], "Lower-ROM alternative without impingement risk"),
  ],

  // Vertical pulling — neutral grip is friendlier than pronated for shoulders
  "pull-ups": [
    sub("chin-ups", "Chin-Ups", ["shoulder"], "Supinated grip externally rotates the shoulder — friendlier position"),
    sub("lat-pulldown", "Lat Pulldown", ["shoulder"], "Neutral / wide-grip options, controlled ROM"),
    sub("chest-supported-db-row", "Chest-Supported DB Row", ["shoulder", "lower_back"], "Switch to horizontal pulling if overhead is painful"),
  ],
};

/**
 * Find the first substitute whose `safeFor` covers ALL of the user's
 * contraindicated injuries. Returns null if no substitute in the table
 * clears every injury — caller should keep the original exercise with
 * a user-visible warning note.
 */
export function findSafeSubstitute(
  originalId: string,
  userInjuries: readonly string[],
): SafeSubstitute | null {
  const candidates = INJURY_SUBSTITUTIONS[originalId];
  if (!candidates || candidates.length === 0) return null;

  // Normalise injury strings to the InjuryCategory subset we handle.
  const relevant = userInjuries.filter((i): i is InjuryCategory =>
    i === "knee" || i === "shoulder" || i === "lower_back",
  );
  if (relevant.length === 0) return null;

  for (const candidate of candidates) {
    const clears = relevant.every((injury) => candidate.safeFor.includes(injury));
    if (clears) return candidate;
  }
  return null;
}

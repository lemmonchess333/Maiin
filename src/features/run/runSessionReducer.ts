/**
 * Run-session state machine — first cut of the RunSession orchestrator.
 *
 * Today `src/pages/Run.tsx` holds `useState<RunPhase>` and threads the
 * transitions through ~10 scattered `setPhase(...)` calls, several of
 * which bundle side effects (timer.start, audioCues.speak, haptic,
 * gps.stop) inside the same setter call. That makes the rules hard
 * to test in isolation and easy to drift if a refactor introduces a
 * new transition.
 *
 * This module is the pure half of the orchestrator: actions in →
 * next phase out. Side effects stay in Run.tsx until the follow-up
 * migration PR — the goal here is to pin the transition rules with
 * exhaustive tests so the migration is mechanical, not exploratory.
 *
 * Phases (mirror src/pages/Run.tsx:44):
 *   'waiting'    — initial; setup modal open. No timer / GPS in
 *                  flight.
 *   'acquiring'  — outdoor GPS run started; waiting for the first
 *                  GPS fix. Can transition to 'countdown' (lock
 *                  acquired OR auto-skip after permission denied) or
 *                  'active' (manual fallback after 15s+ wait) or
 *                  back to 'waiting' (user cancelled).
 *   'countdown'  — 3-2-1 audio countdown before activity start.
 *   'active'     — run in progress (timer running, GPS streaming).
 *   'paused'     — user-paused (timer halted, GPS stopped on outdoor).
 *   'finished'   — terminal; navigates to RunSummary.
 *
 * Snapshot resume (Phase B3 of the run-resume work) restores the
 * machine into 'active' or 'paused' depending on the stored phase —
 * modelled here as `RESUME_SNAPSHOT` with a target phase so the
 * transition is explicit, not implicit.
 *
 * Defensive guards: every transition checks the current phase before
 * proceeding. Stray dispatches from stale UI events return the input
 * state unchanged (referentially equal — so React skips the render).
 * `FINISH` is accepted from `active` and `paused` only — the Finish
 * button lives in RunBottomSheet which only renders for those two
 * phases. acquiring/countdown use `CANCEL_ACQUIRING` to bail out
 * instead.
 */

export type RunPhase =
  | "waiting"
  | "acquiring"
  | "countdown"
  | "active"
  | "paused"
  | "finished";

export type RunSessionAction =
  /* Non-GPS path (treadmill, intervals, strength, manual). Skips
     the acquiring phase entirely because there's no GPS lock to
     wait for. */
  | { type: "START_MANUAL" }
  /* Outdoor GPS path. Enters acquiring phase; the gps hook starts
     fetching fixes and dispatches GPS_ACQUIRED when the first one
     lands (or GPS_FAILED if permission was denied). */
  | { type: "START_GPS" }
  /* First GPS point landed. Acquiring → countdown. */
  | { type: "GPS_ACQUIRED" }
  /* GPS error (permission denied / unavailable). Acquiring →
     countdown anyway — the user still gets a run, just without
     the live trail. */
  | { type: "GPS_FAILED" }
  /* Manual fallback after the user waited 15s+ for a GPS lock that
     never came (the "Switch to manual" button on the acquiring
     screen). Acquiring → active directly, skipping countdown
     because the user explicitly opted in. */
  | { type: "MANUAL_FALLBACK" }
  /* Countdown timer hit 0. Countdown → active; the timer + audio
     cues start in Run.tsx's effect that fires on this transition. */
  | { type: "COUNTDOWN_DONE" }
  /* User tapped Pause. Active → paused. */
  | { type: "PAUSE" }
  /* User tapped Resume. Paused → active. */
  | { type: "RESUME" }
  /* User tapped Finish or hit a target distance. Only valid from
     active|paused — those are the only phases that mount the
     finish control. */
  | { type: "FINISH" }
  /* User tapped Cancel on the acquiring screen. Acquiring →
     waiting. */
  | { type: "CANCEL_ACQUIRING" }
  /* Resume-from-snapshot path (interrupted-run recovery). The
     stored phase is either 'active' or 'paused'; restoring to
     waiting/acquiring/countdown/finished would either be
     meaningless or skip steps. */
  | { type: "RESUME_SNAPSHOT"; phase: "active" | "paused" };

export const initialRunPhase: RunPhase = "waiting";

export function runSessionReducer(
  state: RunPhase,
  action: RunSessionAction,
): RunPhase {
  switch (action.type) {
    case "START_MANUAL":
      if (state !== "waiting") return state;
      return "active";
    case "START_GPS":
      if (state !== "waiting") return state;
      return "acquiring";
    case "GPS_ACQUIRED":
    case "GPS_FAILED":
      if (state !== "acquiring") return state;
      return "countdown";
    case "MANUAL_FALLBACK":
      if (state !== "acquiring") return state;
      return "active";
    case "COUNTDOWN_DONE":
      if (state !== "countdown") return state;
      return "active";
    case "PAUSE":
      if (state !== "active") return state;
      return "paused";
    case "RESUME":
      if (state !== "paused") return state;
      return "active";
    case "FINISH":
      /* Finish control mounts in RunBottomSheet which only renders
         for active|paused. acquiring/countdown bail via
         CANCEL_ACQUIRING; waiting has no run; finished is terminal. */
      if (state !== "active" && state !== "paused") return state;
      return "finished";
    case "CANCEL_ACQUIRING":
      if (state !== "acquiring") return state;
      return "waiting";
    case "RESUME_SNAPSHOT":
      /* Only valid from the initial waiting phase — a snapshot
         resume kicks off before any other action would have run. */
      if (state !== "waiting") return state;
      return action.phase;
    default:
      return state;
  }
}

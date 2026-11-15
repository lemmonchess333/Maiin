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
 * Phases:
 *   'waiting'    — initial; setup modal open. No timer / GPS in
 *                  flight.
 *   'countdown'  — Start tapped: 3-2-1 on screen, a tap skips it
 *                  (Run27 (1), useStartCountdown). Nothing is
 *                  recorded and no clock runs. At Go a GPS run starts
 *                  its clock if a fix within GPS_START_ACCURACY_M is in
 *                  hand, or goes on to 'acquiring'; any other run
 *                  starts its clock.
 *   'acquiring'  — outdoor GPS run started, its clock not yet: the
 *                  screen says "Finding GPS" until a fix within
 *                  GPS_START_ACCURACY_M arrives (Run25 call 2,
 *                  src/lib/gpsStart.ts). Leaves for 'active' on that
 *                  fix, on Start anyway, or on a switch to manual
 *                  distance; back to 'waiting' on Cancel.
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
 * phases. acquiring uses `CANCEL_ACQUIRING` to bail out instead.
 *
 * The countdown comes before the clock, never inside it (Run27 (1)): a GPS
 * run's clock starts at Go with a good fix in hand, or at the instant of
 * its first good fix after Go (Run25 call 2), so it counts no second of
 * the 3-2-1 and its start stays on the fix it is measured from.
 */

export type RunPhase =
  "waiting" | "countdown" | "acquiring" | "active" | "paused" | "finished";

export type RunSessionAction =
  /* Start tapped: the 3-2-1 before the run (Run27 (1)). Waiting →
     countdown. */
  | { type: "COUNTDOWN" }
  /* Go, on a run with no GPS (treadmill, indoor, manual distance): its
     clock starts. Countdown → active, skipping the acquiring phase
     entirely because there's no GPS lock to wait for. */
  | { type: "START_MANUAL" }
  /* Go, on an outdoor GPS run. With a good fix already in hand (the run
     screen watches location before Start and through the countdown) the
     clock starts at Go: countdown → active. Without one: countdown →
     acquiring, until GPS_ACQUIRED or START_ANYWAY. */
  | { type: "START_GPS"; fixInHand: boolean }
  /* The first fix within GPS_START_ACCURACY_M landed, and the clock
     starts on it. Acquiring → active. */
  | { type: "GPS_ACQUIRED" }
  /* Start anyway on the "Finding GPS" screen: the clock starts at the
     tap, and distance counts from the first fix the reading gate
     passes. Acquiring → active. */
  | { type: "START_ANYWAY" }
  /* "Track without GPS" or "On a treadmill" on the acquiring screen:
     the run becomes one of typed-in distance and its clock starts.
     Acquiring → active. */
  | { type: "MANUAL_FALLBACK" }
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
     waiting/acquiring/finished would either be
     meaningless or skip steps. */
  | { type: "RESUME_SNAPSHOT"; phase: "active" | "paused" };

export const initialRunPhase: RunPhase = "waiting";

export function runSessionReducer(
  state: RunPhase,
  action: RunSessionAction
): RunPhase {
  switch (action.type) {
    case "COUNTDOWN":
      if (state !== "waiting") return state;
      return "countdown";
    case "START_MANUAL":
      if (state !== "countdown") return state;
      return "active";
    case "START_GPS":
      if (state !== "countdown") return state;
      return action.fixInHand ? "active" : "acquiring";
    case "GPS_ACQUIRED":
    case "START_ANYWAY":
    case "MANUAL_FALLBACK":
      if (state !== "acquiring") return state;
      return "active";
    case "PAUSE":
      if (state !== "active") return state;
      return "paused";
    case "RESUME":
      if (state !== "paused") return state;
      return "active";
    case "FINISH":
      /* Finish control mounts in RunBottomSheet which only renders
         for active|paused. acquiring bails via CANCEL_ACQUIRING;
         waiting has no run; finished is terminal. */
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

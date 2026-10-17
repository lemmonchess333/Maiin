/**
 * Whether the Run page starts the run it was opened for as soon as it opens
 * (the owner, on Home's run card: "Should open then go"). Home's Start
 * asks for it with `?start=1`; Train's "View run" still opens the run's own
 * card, where the shoe and Customise are.
 *
 * The page waits for what the start depends on: the plan, which names the
 * run, and, for an account the guide owes its first-run hint, whether this
 * is that first run. It shows itself instead when the person has something
 * to see first:
 *
 *  - a run that was interrupted, whose resume prompt asks what to do with
 *    it;
 *  - a route to follow, which only the full setup takes;
 *  - their first run, whose hint on the run's card says what is about to
 *    happen (FV1).
 *
 * Otherwise it starts the planned run the page names, or a free run, as
 * the card's Start and the Free tile would.
 */

/** The query parameter Home's run card adds to ask for the start. */
export const START_ON_ARRIVAL_PARAM = "start";

/** How long the page waits to learn whether an account owed the first-run
 *  hint has any runs. Past it the run starts: a slow read must not keep
 *  the person standing at a blank screen. */
export const FIRST_RUN_CHECK_MS = 1000;

export type ArrivalStart = "wait" | "show" | "planned" | "free";

export function startOnArrival(input: {
  /** The plan has loaded (a free runner has none to wait for). */
  planReady: boolean;
  interruptedRun: boolean;
  routeToFollow: boolean;
  /** "checking" while the runs are read for an account owed the hint. */
  firstRunHint: "checking" | "due" | "not-due";
  /** The page names a planned run (its launch card would show). */
  plannedRun: boolean;
}): ArrivalStart {
  if (input.interruptedRun || input.routeToFollow) return "show";
  if (!input.planReady || input.firstRunHint === "checking") return "wait";
  if (input.firstRunHint === "due") return "show";
  return input.plannedRun ? "planned" : "free";
}

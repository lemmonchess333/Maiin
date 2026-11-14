/**
 * Whether the Run page starts the run it was opened for as soon as it opens
 * (the owner, on Home's run card: "Should open then go"). Home's Start and
 * Train's "Start run" on today's run ask for it with `?start=1`, as the
 * Lift tab's Start begins its workout; Train's "View run" on any other day
 * still opens the run's own card, where the shoe and Customise are.
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
 *    happen (FV1);
 *  - a hot day, whose card offers to adjust the run for heat or to swap
 *    it, or an extreme one, which says running outside isn't advised and
 *    leaves the start to the person (heatAdjustment.ts). For a planned
 *    run the page waits a moment for the weather (`HEAT_CHECK_MS`), which
 *    Home has usually read already; a free run waits for nothing.
 *
 * Otherwise it starts the planned run the page names, or a free run, as
 * the card's Start and the Free tile would.
 */

/** The query parameter Home's run card adds to ask for the start. */
export const START_ON_ARRIVAL_PARAM = "start";

/** A Run page address with the start asked for, after any query it has. */
export function withStartOnArrival(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${START_ON_ARRIVAL_PARAM}=1`;
}

/** How long the page waits to learn whether an account owed the first-run
 *  hint has any runs. Past it the run starts: a slow read must not keep
 *  the person standing at a blank screen. */
export const FIRST_RUN_CHECK_MS = 1000;

/** How long the page waits for the weather before starting a tempo or
 *  interval session. Past it the run starts as planned: a slow read must
 *  not keep the person standing at a blank screen. A Tropos heuristic, the
 *  first-run check's second. */
export const HEAT_CHECK_MS = 1000;

export type ArrivalStart = "wait" | "show" | "planned" | "free";

/** What the weather means for the start: still being read, a hot day
 *  with something on the card to choose or read first, or nothing. */
export type ArrivalHeat = "checking" | "show" | "none";

export function startOnArrival(input: {
  /** The plan has loaded (a free runner has none to wait for). */
  planReady: boolean;
  interruptedRun: boolean;
  routeToFollow: boolean;
  /** "checking" while the runs are read for an account owed the hint. */
  firstRunHint: "checking" | "due" | "not-due";
  /** The page names a planned run (its launch card would show). */
  plannedRun: boolean;
  /** Whether the weather puts something on the card first. */
  heat?: ArrivalHeat;
}): ArrivalStart {
  if (input.interruptedRun || input.routeToFollow) return "show";
  if (!input.planReady || input.firstRunHint === "checking") return "wait";
  if (input.firstRunHint === "due") return "show";
  if (input.heat === "checking") return "wait";
  if (input.heat === "show") return "show";
  return input.plannedRun ? "planned" : "free";
}

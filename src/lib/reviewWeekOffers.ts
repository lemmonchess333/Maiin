/**
 * The changes the weekly review offers for the week ahead (App1 Q36: "The
 * weekly review ends with next week and any offered change, accepted in one
 * tap", overturning Rev1's passive narration).
 *
 * Nothing here decides a change. Each offer is one the app already makes
 * somewhere else, read from the same trigger and taken through the same
 * command:
 *
 *   fell-behind   the weekly check's prompt (`pendingFellBehindPrompt`),
 *                 Home's fell-behind sheet: realign a race plan, or rebuild
 *                 it after a long break (`realignRacePlan`)
 *   race-check    Run24 (11)'s check of the long runs against the race
 *                 (`raceLongRunCheck`), the same sheet's race register:
 *                 move the race, or realign and keep the date
 *   lighter-week  Train's lighter-week offer (Train's one decision), taken
 *                 by the server's `applyDeloadWeek` and undone by
 *                 `revertDeloadWeek`
 *   paces         the run summary's new paces (`resolvePaceInsight`, every
 *                 account since Run24 (4)), saved to `runFitness`
 *
 * Q5 sorts them: a small change that can be put back takes an undo once it
 * is made (the lighter week, whose undo Train's toast already offers), and a
 * big one is only offered (a realign re-plans every week to the race; new
 * paces move every run). The words are this module's, so the card and its
 * tests read one copy.
 */
import type { LayoffClass } from "@/features/program/layoffDetection";
import type { DistanceUnit } from "./distanceUnits";
import { distanceLabel, paceBandLabel } from "./runLabels";
import { trainingBands } from "./runPaces";

export type WeekOfferKind =
  "fell-behind" | "race-check" | "lighter-week" | "paces";

export interface WeekOffer {
  kind: WeekOfferKind;
  /** The sport whose colour its button takes; null for a change to both. */
  sport: "run" | null;
  title: string;
  /** Why, in one or two short sentences, with the person's own number. */
  reason: string;
  /** What taking it changes, when the reason has not said. */
  change: string | null;
  acceptLabel: string;
  /** The other way, by a page of its own ("My race moved"). */
  route: { label: string; to: string } | null;
  /** The route comes first: the race register leads with moving the race. */
  routeFirst: boolean;
  /** Q5: small and put back in one tap, so it takes an undo once made. */
  undoable: boolean;
  /** What the card says once it is taken; null when the command's own
   *  result says it (a realign names the weeks it built). */
  doneLine: string | null;
}

export interface WeekOffersInput {
  /** The weekly check's prompt, for a race plan (`raceModeActive`). */
  fellBehind: { realRunCount: number; weeklyTarget: number } | null;
  /** The layoff the plan is rebuilt from: past three weeks, a rebuild. */
  recentLayoff: LayoffClass;
  /** Run24 (11)'s check, not yet answered this week, in km. */
  raceCheck: {
    longestKm: number;
    reachKm: number;
    raceKm: number;
    distance: string;
  } | null;
  /** The lighter week Train offers now, not set aside this week: why, in
   *  the words of the reason that fired when Train's decision gives them
   *  (null for the review's own plain line), the lift sessions it halves
   *  and the runs it steps down a rung. */
  lighterWeek: {
    why: string | null;
    liftSessions: number;
    runsEased: number;
  } | null;
  /** New paces from a recent race or tempo, not yet set aside. */
  paces: {
    direction: "faster" | "slower";
    currentVdot: number;
    suggestedVdot: number;
  } | null;
  unit: DistanceUnit;
}

/** The race's name in a sentence, as the fell-behind sheet names it. */
const RACE_NAME: Record<string, string> = {
  "5k": "A 5K",
  "10k": "A 10K",
  half: "A half marathon",
  marathon: "A marathon",
};

const RUN_PLAN_ROUTE = "/settings/run-plan";

/** A distance in a sentence: "8 km", "21.1 km", "5.0 mi" read as "5 mi". */
function km(value: number, unit: DistanceUnit): string {
  return distanceLabel(value * 1000, unit).replace(/\.0(?= )/, "");
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function realignOffer(input: WeekOffersInput): WeekOffer | null {
  const { fellBehind, raceCheck, unit } = input;
  if (fellBehind) {
    // A return of three weeks or more is not a missed week: the sheet drops
    // the count for a welcome back, and the button rebuilds (Run15).
    if (input.recentLayoff === "detrained") {
      return {
        kind: "fell-behind",
        sport: "run",
        title: "Welcome back",
        reason:
          "It’s been a while between runs. Rebuilding starts with easy running and keeps your race.",
        change: null,
        acceptLabel: "Rebuild my plan",
        route: { label: "My race moved", to: RUN_PLAN_ROUTE },
        routeFirst: false,
        undoable: false,
        doneLine: null,
      };
    }
    return {
      kind: "fell-behind",
      sport: "run",
      title: "Last week didn’t go to plan",
      reason: `You ran ${fellBehind.realRunCount} of ${plural(fellBehind.weeklyTarget, "planned run", "planned runs")}. Realigning keeps your race date and plans from today.`,
      change: null,
      acceptLabel: "Realign my plan",
      route: { label: "My race moved", to: RUN_PLAN_ROUTE },
      routeFirst: false,
      undoable: false,
      doneLine: null,
    };
  }
  if (raceCheck) {
    const race = RACE_NAME[raceCheck.distance] ?? "Your race";
    return {
      kind: "race-check",
      sport: "run",
      title: "Your long runs and your race",
      reason: `Your longest run in four weeks is ${km(raceCheck.longestKm, unit)}. By the taper it reaches about ${km(raceCheck.reachKm, unit)}.`,
      change: `${race} is ${km(raceCheck.raceKm, unit)}. Moving the race gives you time to build up to it.`,
      acceptLabel: "Realign my plan",
      route: { label: "Move my race", to: RUN_PLAN_ROUTE },
      routeFirst: true,
      undoable: false,
      doneLine: null,
    };
  }
  return null;
}

function lighterWeekOffer(input: WeekOffersInput): WeekOffer | null {
  const week = input.lighterWeek;
  if (!week) return null;
  const { liftSessions, runsEased } = week;
  const runs =
    runsEased > 0 ? `${plural(runsEased, "run", "runs")} a step shorter` : null;
  // An offer that changes nothing is not one: no lift left to halve and no
  // run with a rung below it.
  if (liftSessions === 0 && !runs) return null;
  const change =
    liftSessions > 0 && runs
      ? `Half the sets at the same weights, and ${runs}.`
      : liftSessions > 0
        ? "Half the sets, at the same weights."
        : `${runs}.`;
  return {
    kind: "lighter-week",
    sport: null,
    title: "A lighter week",
    // Train's words for the reason that fired, when it has them; else a
    // line that claims no reason, since the engine has three.
    reason: week.why ?? "Your last 7 days point to a lighter week.",
    change: `${change} The full plan is back next week.`,
    acceptLabel: "Take a lighter week",
    route: null,
    routeFirst: false,
    undoable: true,
    doneLine: "This week is a lighter one. The full plan is back next week.",
  };
}

function pacesOffer(input: WeekOffersInput): WeekOffer | null {
  const paces = input.paces;
  if (!paces) return null;
  // The easy band, which every plan runs most: one number and what it was.
  const from = trainingBands(paces.currentVdot).easy;
  const to = trainingBands(paces.suggestedVdot).easy;
  const faster = paces.direction === "faster";
  return {
    kind: "paces",
    sport: "run",
    title: faster ? "Faster paces" : "Easier paces",
    reason: faster
      ? "You ran a recent race or tempo faster than your paces."
      : "Your recent races and tempos were slower than your paces.",
    change: `Easy runs become ${paceBandLabel(to, input.unit)}, from ${paceBandLabel(from, input.unit)}.`,
    acceptLabel: "Update paces",
    route: null,
    routeFirst: false,
    undoable: false,
    doneLine: "Training paces updated.",
  };
}

/**
 * The week's offers, most consequential first: the race plan, then the
 * week's load, then the paces. Empty when nothing is offered, and the
 * review then ends on the week and "Looks good".
 */
export function reviewWeekOffers(input: WeekOffersInput): WeekOffer[] {
  return [
    realignOffer(input),
    lighterWeekOffer(input),
    pacesOffer(input),
  ].filter((offer): offer is WeekOffer => offer !== null);
}

import type { TodaySession } from "@/lib/todaySession";
import { FIRST_WEEK_DAYS, accountDay } from "@/lib/firstWeek";
import { isAutomated } from "@/lib/launchSplash";
import { readString } from "@/lib/localStore";

/**
 * The first-visit guide (FV1): the words, and who is offered what.
 *
 * A new account's first visit to Home gets a short walk: the page dims and
 * the Tropos mark points at today's session, the first-week card and the
 * Food card, one at a time, saying what each screen doesn't. After that
 * the guide turns up once in each place the first time it is used: Train's
 * order, the first set, the food composer and the first run. Analytics has
 * no hint: its empty state already says what one would.
 * `GuideWalk` and `GuideHint` draw it; this decides it, so the rules can be
 * tested without rendering a page.
 *
 * It replaced nothing: the first-week card (FW1) stays as the week's list,
 * and its rows now open the step they name.
 */

/** A stop on the walk. `target` names the element it points at: the one
 *  carrying `data-guide-stop="<target>"`. */
export interface GuideStop {
  id: "today" | "first-week" | "food";
  target: string;
  title: string;
  body: string;
}

/** The first card in Home's session stack, as `StackedCTACards` draws it. */
export type TodayCard =
  | "lift"
  | "first-workout"
  | "run"
  | "free-run"
  | "first-meal"
  | "rest";

/**
 * What the stack's first card is today. Null when there is no card the
 * walk can explain: a lifting day whose plan has no workout linked shows a
 * "Check your lifting plan" notice, and the walk leaves that to the notice.
 */
export function todayCard(session: TodaySession): TodayCard | null {
  if (session.lift?.workout) return "lift";
  if (session.run) return "run";
  if (session.lift) return null;
  switch (session.rest?.kind) {
    case "first-workout":
      return "first-workout";
    case "free-run":
      return "free-run";
    case "first-meal":
      return "first-meal";
    case "rest":
      return "rest";
    default:
      return null;
  }
}

/** The `data-guide-stop` value each session card carries. */
export function todayCardTarget(card: TodayCard): string {
  switch (card) {
    case "lift":
    case "first-workout":
      return "today-lift";
    case "run":
    case "free-run":
      return "today-run";
    default:
      return "today-rest";
  }
}

const TODAY_WORDS: Record<
  Exclude<TodayCard, "first-meal">,
  { title: string; body: string }
> = {
  lift: {
    title: "Today’s workout",
    body: "Start takes you through it set by set. Not training today? It stays here until it’s done.",
  },
  "first-workout": {
    title: "Your first workout",
    body: "Start takes you through it set by set, whenever suits you. It stays here until it’s done.",
  },
  run: {
    title: "Today’s run",
    body: "Start opens the run screen, which records the distance, pace and splits as you go.",
  },
  "free-run": {
    title: "Run when it suits you",
    body: "Start opens the run screen, which records the distance, pace and splits as you go.",
  },
  rest: {
    title: "A rest day",
    body: "Your next session shows here on its day, with Start to begin it.",
  },
};

const COUNT_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six"];

/** "Three things", spelled as a person would say it. */
function thingsToDo(n: number): string {
  const word = COUNT_WORDS[n] ?? String(n);
  return n === 1 ? `${word} thing to do` : `${word} things to do`;
}

export const FOOD_STOP_BODY =
  "Log what you eat here, by typing it or scanning it. Your target already counts your training, so there’s nothing to eat back.";

/**
 * The walk's stops, in the order the page shows them. The session card
 * leads unless it is the first-meal card, which the Food stop already
 * covers; the first-week stop needs the card on screen; Food always ends
 * it.
 */
export function walkStops(input: {
  today: TodayCard | null;
  /** Items on the first-week card, or 0 when the card isn't showing. */
  firstWeekItems: number;
}): GuideStop[] {
  const stops: GuideStop[] = [];
  if (input.today && input.today !== "first-meal") {
    stops.push({
      id: "today",
      target: todayCardTarget(input.today),
      ...TODAY_WORDS[input.today],
    });
  }
  if (input.firstWeekItems > 0) {
    stops.push({
      id: "first-week",
      target: "first-week",
      title: "Your first week",
      body: `${thingsToDo(input.firstWeekItems)} in your first seven days. Each one ticks itself when it’s done, and tapping one shows you how.`,
    });
  }
  stops.push({
    id: "food",
    target: "food",
    title: "Food",
    body: FOOD_STOP_BODY,
  });
  return stops;
}

/**
 * The one stop a first-week row opens on Home: the session card that does
 * the thing, when today's card is it. Null when it isn't, and the row
 * opens Train instead.
 */
export function rowStop(
  item: "workout" | "run",
  today: TodayCard | null
): GuideStop | null {
  if (item === "workout" && (today === "lift" || today === "first-workout")) {
    return {
      id: "today",
      target: "today-lift",
      title: "Your first workout",
      body: "Start takes you through it set by set. It’s ticked off on the card below when you finish.",
    };
  }
  if (item === "run" && (today === "run" || today === "free-run")) {
    return {
      id: "today",
      target: "today-run",
      title: "Your first run",
      body: "Start opens the run screen, which records the distance, pace and splits. It’s ticked off on the card below when you finish.",
    };
  }
  return null;
}

/**
 * Whether Home offers the walk on its own: in the account's first seven
 * days, once. Older accounts never meet it unasked; anyone can play it
 * again from Settings → Support & legal.
 */
export function walkOffered(input: {
  startKey: string | null;
  todayKey: string;
  seen: boolean;
}): boolean {
  if (input.seen || !input.startKey) return false;
  const day = accountDay(input.startKey, input.todayKey);
  return day >= 1 && day <= FIRST_WEEK_DAYS;
}

/** The hints, one per place, each shown once to an account that has met
 *  the guide. */
export const GUIDE_HINTS = {
  "train-order": {
    title: "Workouts go in order",
    body: "Each one waits its turn, whatever the weekday. Miss a day and the next one is still next.",
  },
  "first-set": {
    title: "Your first set",
    body: "Each row is a set. Check the weight and reps, then tap the circle when it’s done. Your rest timer starts on its own.",
  },
  "food-composer": {
    title: "Logging food",
    body: "Write it the way you’d say it, like “200g chicken & rice”, or tap the camera to scan it.",
  },
  "first-run": {
    title: "Your first run",
    body: "When you start, it finds your position first, counts down from three, then records the distance and pace as you go.",
  },
} as const;

/** The first-set hint for someone who has turned the automatic rest timer
 *  off in Settings: the circle is still how a set is done. */
export const FIRST_SET_BODY_NO_AUTO_REST =
  "Each row is a set. Check the weight and reps, then tap the circle when it’s done.";

export type GuideHintId = keyof typeof GUIDE_HINTS;

/** Where the walk's seen flag lives (scoped to the account by
 *  `useDismissOnce`). An account that has seen the walk has met the guide,
 *  and only then do the hints turn up. */
export const WALK_SEEN_KEY = "tropos-guide-walk-seen";

export function hintSeenKey(id: GuideHintId): string {
  return `tropos-guide-hint:${id}`;
}

/** Set to "on" in localStorage, a capture spec turns the guide on under
 *  automation, where it otherwise never shows (as the launch animation
 *  never does): the specs that don't ask for it never meet it. */
export const GUIDE_UNDER_AUTOMATION_KEY = "tropos-guide-under-automation";

export function guideAllowed(
  nav: Pick<Navigator, "webdriver"> | undefined,
  automationFlag: string | null
): boolean {
  return !isAutomated(nav) || automationFlag === "on";
}

/** `guideAllowed` for this browser. The switch is device state, not an
 *  account's: a capture spec plants it before the account exists. */
export function guideAllowedHere(): boolean {
  return guideAllowed(
    typeof navigator === "undefined" ? undefined : navigator,
    readString(GUIDE_UNDER_AUTOMATION_KEY)
  );
}

/** Router state that asks a page to show its step: Settings' "Show me
 *  around" asks Home for the walk; a first-week row asks Food for the
 *  composer hint. */
export type GuideRequest = { guide: "walk" } | { guide: GuideHintId };

export function guideRequest(state: unknown): GuideRequest["guide"] | null {
  if (!state || typeof state !== "object") return null;
  const guide = (state as { guide?: unknown }).guide;
  if (guide === "walk") return "walk";
  return typeof guide === "string" && Object.hasOwn(GUIDE_HINTS, guide)
    ? (guide as GuideHintId)
    : null;
}

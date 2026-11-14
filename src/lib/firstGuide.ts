import { isAutomated } from "@/lib/launchSplash";
import { readString } from "@/lib/localStore";

/**
 * The first-use guide (FV1): its hints' words, and where it may show.
 *
 * The guide turns up once in each place the first time it is used:
 * Train's order, the first set, the food composer and the first run.
 * Analytics has no hint: its empty state already says what one would.
 * `GuideHint` draws it; this decides it, so the rules can be tested
 * without rendering a page.
 *
 * Home has no walk of its own (App1, whole-app grill Q27): the three-stop
 * walk a new account once met on its first visit, and the "Show me
 * around" that replayed it, went with the older first-week journey. Home
 * leads with today's session and the first-week card (`firstWeek.ts`).
 */

/**
 * Whether one of the guide's hints is due on this visit, so something else
 * on the page can wait its turn (FV2: Food's Pro line under the food box
 * waits for the food-box hint). Due while the guide may show here, the
 * account is owed the hint and it hasn't been closed.
 */
export function hintDue(input: {
  allowed: boolean;
  owed: boolean;
  closed: boolean;
}): boolean {
  return input.allowed && input.owed && !input.closed;
}

/** The hints, one per place, each shown once to an account. */
export const GUIDE_HINTS = {
  "train-order": {
    title: "Workouts go in order",
    body: "Each one waits its turn, whatever the weekday. Miss a day and the next one is still next.",
  },
  // Lift4: starting weights are an estimate, said once, here.
  "first-set": {
    title: "Your first set",
    body: "Each row is a set. Check weight and reps, then tap the box when it’s done. Your rest timer starts automatically.\n\nWeights are estimates. Start light: use a weight you can control for every rep, with a few more left.",
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
 *  off in Settings: the box is still how a set is done. */
export const FIRST_SET_BODY_NO_AUTO_REST =
  "Each row is a set. Check weight and reps, then tap the box when it’s done.\n\nWeights are estimates. Start light: use a weight you can control for every rep, with a few more left.";

export type GuideHintId = keyof typeof GUIDE_HINTS;

/** Where a hint's seen flag lives (scoped to the account by
 *  `useDismissOnce`). */
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

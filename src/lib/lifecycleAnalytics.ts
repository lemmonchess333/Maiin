/**
 * Lifecycle / funnel analytics — the activation + conversion funnel the
 * product is actually measured on.
 *
 * Same thin-shim pattern as `paywallAnalytics` / `homeAnalytics`: a closed
 * event union, one metadata shape, delegate to `analyticsClient.emit()`.
 * Defining the full taxonomy here (even for events not yet wired at every
 * call site) lets dashboards be built against a known schema and keeps the
 * funnel coherent as call sites get instrumented.
 *
 * Scope note (locked from the ROI eval, 2026-06): the provider wiring +
 * this activation funnel (signup → onboarding → first activity → paywall →
 * subscription) are built because they produce value the moment a real
 * cohort lands and don't drift — they map to durable product milestones.
 * The experiment / A-B-assignment layer the original proposal bundled into
 * the same "P0" is deliberately NOT built: it produces no value below a few
 * hundred weekly-actives (no statistical power) and any taxonomy guessed
 * pre-traffic would be rewritten before it's usable. Adopt Firebase A/B
 * Testing — which rides on this same Analytics — when traffic warrants it.
 *
 * Every event here is sent (App1 Q17, 13 November 2026, deleted the ones
 * nothing sent: `first_workout_started`, `first_workout_completed`,
 * `first_run_started`, `first_food_logged`). A new one is declared with the
 * code that sends it. Paywall conversion lives in `paywallAnalytics`.
 *
 * **The five launch numbers** (App1 Q17), each one event, once per account:
 *   1. finished setup: `onboarding_completed`, from Onboarding.tsx when the
 *      plan is saved (a finished account never sees setup again);
 *   2. first session within 7 days: `first_session_saved`, with `kind` and
 *      `daysSinceSetup`; within 7 days is `daysSinceSetup` 0 to 6, cut in
 *      the analytics tool;
 *   3. week-4 return: `week_4_returned`, the first counted session on days
 *      21 to 27 after setup;
 *   4. trial start: `trial_started`, and
 *   5. paid: `subscription_started`, each with `purchasePlatform` and
 *      `daysSinceSetup`.
 * The server decides 2 to 5 and the app sends them (`launchEvents.ts`):
 * the session triggers keep the first session and the week-4 return
 * (functions/lib/launchMilestones.js), and the billing record keeps the
 * first verified trial and paid period from RevenueCat, App Store and web
 * alike (functions/lib/activationBilling.js), so a sale the app never saw
 * finish (closed after Apple's sheet, or a trial that turned paid with the
 * app shut) still counts, and counts once.
 *
 * Read the start of the funnel in that order: auth_screen_viewed (welcome)
 * → auth_screen_viewed (sign_up) → signup_completed → the onboarding steps
 * → onboarding_completed. Someone who closes the app part-way shows as the
 * step they reached and nothing after it: a phone does not say an app was
 * closed for good rather than paused, so `onboarding_abandoned` is sent
 * only for the exit the app can see, signing out of setup (A1b pin 4).
 */
import { emit } from "./analyticsClient";

export type LifecycleEvent =
  | "auth_screen_viewed"
  | "signup_completed"
  | "email_verified"
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  | "onboarding_completed"
  | "onboarding_abandoned"
  | "first_plan_generated"
  /** Launch numbers 2 and 3: the account's first counted session, and its
   *  first in days 21 to 27 after setup. Sent once per account by
   *  `launchEvents.ts` from what the server kept. */
  | "first_session_saved"
  | "week_4_returned"
  // Activation activity events — per-occurrence (fired by the snapshot
  // observer in activationTracker.ts for food/workout, and at the run save
  // site). GA4 derives first-occurrence/activation from these natively, and
  // per-occurrence also captures ongoing engagement.
  | "workout_completed"
  | "run_completed"
  | "food_logged"
  | "first_week_card_viewed"
  | "first_week_task_selected"
  | "first_week_reminder_offered"
  | "first_week_reminder_choice"
  /** Launch numbers 4 and 5: the account's first verified trial and its
   *  first paid period. Sent once per account by `launchEvents.ts`. */
  | "trial_started"
  | "subscription_started"
  // Companion batch B0 — the training loop, as distinct from the
  // activation funnel above: a session is started, the finish shows some
  // number of surfaces, a return visit offers one surface and the user
  // picks something. These are per-occurrence and ongoing, not once-ever.
  | "session_started"
  | "completion_surfaces"
  | "return_surface_shown"
  | "return_choice"
  | "checkin_answered"
  | "week_reset_viewed"
  | "week_reset_choice"
  | "week_reset_completed"
  /** The first-visit guide (FV1): a walk began, showed a stop, was
   *  finished from its last stop or skipped; a hint was shown. */
  | "guide_started"
  | "guide_step_viewed"
  | "guide_finished"
  | "guide_skipped"
  | "guide_hint_viewed";

export type SignupMethod = "email" | "google" | "apple";

/** The tier-4 surfaces the coordinator arbitrates (ADR-0004). */
export type ReturnSurface =
  | "trial-expired"
  | "fell-behind"
  | "badge"
  | "priming"
  | "lift-return"
  | "run-return"
  | "race-check"
  // Soc15: a new medal's reveal, on Social (MedalRevealGate).
  | "medal-reveal"
  // Soc15 call 3: a league week's result, on Social (LeagueResultGate).
  | "league-result";

/**
 * What the user did with a return surface. `dismissed` is the close with
 * no action; the rest map to the actions those surfaces actually offer.
 */
export type ReturnChoice =
  | "dismissed"
  | "realign"
  | "rebuild"
  | "shift"
  | "compress"
  | "skip"
  | "upgrade"
  | "enable"
  | "acknowledge"
  | "ease_back"
  | "easy_run";

export interface LifecycleEventMetadata {
  /** auth_screen_viewed: which signed-out screen was shown. */
  screen?: "welcome" | "sign_in" | "sign_up";
  /** signup_completed: which auth provider created the account. */
  method?: SignupMethod;
  /** onboarding_step_* and onboarding_abandoned: stable step identifier
   *  (non-PII), from ONBOARDING_STEP_IDS. */
  step?: string;
  /** onboarding_step_*: zero-based step position. */
  stepIndex?: number;
  /** onboarding_completed: chosen goal enum (lose / gain / maintain / perform). */
  primaryGoal?: string;
  /** onboarding_completed: training days per week. */
  daysPerWeek?: number;
  /** onboarding_completed: resolved run mode (freeform / race_prep). */
  runMode?: string;
  /** Generic timing dimension (ms). */
  durationMs?: number;
  /** session_started, first_session_saved, week_4_returned: which
   *  discipline. */
  kind?: "lift" | "run";
  /** first_session_saved, week_4_returned, trial_started,
   *  subscription_started: whole days from setup to the moment, setup's day
   *  being 0. */
  daysSinceSetup?: number;
  /** trial_started, subscription_started: where it was bought. The device
   *  that sends the event can be another one. */
  purchasePlatform?: "ios" | "web";
  /** First-week card: onboarding training selection, never a free-text goal. */
  sport?: "runner" | "lifter" | "hybrid";
  /** first_week_task_selected: training task selected. */
  task?: "workout" | "run";
  /** First-week card: local calendar day 1 through 7. */
  firstWeekDay?: number;
  /** Saved-session reminder offer: delivery path and explicit answer. */
  reminderChannel?: "push" | "local";
  reminderOutcome?: "enabled" | "later" | "denied" | "setup_failed";
  /**
   * session_started (runs only): the run did not match its planned slot.
   * Read straight from `computePlanMetadata`, which already decides this.
   *
   * The B0 brief asked for a planned/actual date pair. A LIFT has no
   * planned date to compare against — ADR-0002 pins lifts as split-ordered
   * and runs as date-pinned — so that pair is undefined for half the
   * sessions it was meant to cover. Runs, meanwhile, already have the
   * answer computed. Absent on lifts, deliberately, rather than filled.
   */
  offPlan?: boolean;
  /**
   * completion_surfaces: dialogs plus toasts shown between the session
   * ending and the user reaching the page again. Exists to catch the
   * pile-up creeping back after it was collapsed to one screen, so it is
   * read as a regression signal rather than as a metric. guide_started:
   * how many stops the walk has.
   */
  count?: number;
  /** return_surface_shown / return_choice: which surface was shown. */
  surface?: ReturnSurface;
  /** return_choice: what the user picked. */
  choice?: ReturnChoice;
  /** checkin_answered: 1-5, "did this week's plan make sense?". */
  clarity?: number;
  /** checkin_answered: 1-5, "was logging easy this week?". */
  ease?: number;
  /** Guided review-to-plan handoff; the choice is never an automatic edit. */
  weekResetAction?: "run_move" | "usual_layout" | "keep_plan";
  weekResetOutcome?: "applied" | "queued";
  /**
   * guide_*: which walk. Not `guide`: the redaction drops any key that
   * contains "uid", and "guide" does.
   */
  walk?: "first-visit" | "replay" | "first-week-row";
  /** guide_step_viewed / guide_finished / guide_skipped: the stop's id
   *  ("today", "first-week", "food"). With `stepIndex`, its place. */
  stop?: string;
  /** guide_hint_viewed: which hint ("train-order", "first-set", …). */
  hint?: string;
}

export function track(
  event: LifecycleEvent,
  metadata: LifecycleEventMetadata = {}
): void {
  emit("lifecycle", event, metadata as Record<string, unknown>);
}

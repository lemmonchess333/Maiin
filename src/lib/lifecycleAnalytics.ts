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
 * Currently wired: `signup_completed` (auth.tsx, all three providers),
 * `onboarding_completed` (Onboarding.tsx). The remaining events are
 * declared for schema stability and wired as their call sites are
 * instrumented. Paywall conversion already lives in `paywallAnalytics`.
 */
import { emit } from "./analyticsClient";

export type LifecycleEvent =
  | "signup_completed"
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  | "onboarding_completed"
  | "onboarding_abandoned"
  | "first_plan_generated"
  | "first_workout_started"
  | "first_workout_completed"
  | "first_run_started"
  | "first_food_logged"
  | "trial_started"
  | "subscription_started";

export type SignupMethod = "email" | "google" | "apple";

export interface LifecycleEventMetadata {
  /** signup_completed: which auth provider created the account. */
  method?: SignupMethod;
  /** onboarding_step_*: stable step identifier (non-PII). */
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
}

export function track(
  event: LifecycleEvent,
  metadata: LifecycleEventMetadata = {}
): void {
  emit("lifecycle", event, metadata as Record<string, unknown>);
}

/**
 * Fire a one-time activation milestone (`first_*`) at most once per user.
 *
 * The `first_*` funnel events mark "the user reached this milestone for the
 * first time", so they must not re-emit on every workout / meal / run. A
 * uid-scoped localStorage guard gives funnel-grade dedup with no Firestore
 * write and no profileSanitizer change. Cross-device re-fires are acceptable
 * for activation analysis — the cohort that matters is new users on their
 * first device, and Firebase A/B / funnel reports count distinct users
 * regardless. (When private-mode localStorage throws, we emit rather than drop
 * — a possible duplicate beats a missing activation signal.)
 */
export function trackFirst(
  event: LifecycleEvent,
  uid: string | undefined,
  metadata: LifecycleEventMetadata = {}
): void {
  if (!uid) return;
  const key = `tropos.lifecycle.${uid}.${event}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    /* localStorage unavailable (private mode / webview) — emit anyway */
  }
  track(event, metadata);
}

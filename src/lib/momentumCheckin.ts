/**
 * Momentum Check-in (CHECKIN-01) — pure model.
 *
 * A small, optional decision moment at the end of the private Weekly
 * Review: how did the week's plan feel, and what's the one realistic
 * focus for next week. It turns the review from a read-only recap into
 * a next action — WITHOUT ever auto-changing programme volume, calorie
 * targets or bodyweight goals from a single answer (a plan should not
 * swing on one difficult week; every response maps to a NAVIGATION,
 * never a mutation).
 *
 * Storage: `users/{uid}/checkins/{weekKey}` — owner-only (rules),
 * keyed by the reviewed week (Monday-anchored key from
 * `reviewedWeekKey()`), so writes are idempotent by construction:
 * re-submitting a week overwrites that week's own doc and can never
 * fan out. Detailed answers stay owner-only; nothing here is copied
 * to any social surface (a future Goal Space event would be a
 * separate, explicit opt-in contract).
 */

export type PlanFeel = "good_fit" | "a_bit_much" | "too_light";

/** One realistic next-week focus, drawn from commitments the app
 *  already tracks — no second goal calculator. */
export type MomentumFocus = "lifts" | "runs" | "food_logging" | "weigh_ins";

export interface MomentumCheckin {
  /** Reviewed week key (YYYY-MM-DD Monday) — also the doc id. */
  weekKey: string;
  feel: PlanFeel;
  focus: MomentumFocus | null;
  /**
   * The two app-experience answers, 1-5, present only on the weeks the
   * monthly cadence asks for them. Distinct from `feel`, which is about
   * the PLAN's load ("Good fit" / "A bit much" / "Too light"): these ask
   * whether the app made the week legible and logging cheap, which the
   * load answer cannot report on.
   *
   * Optional because most weeks never ask, and because a user can answer
   * the training half and skip these.
   */
  clarity?: number;
  ease?: number;
  /** True when the user dismissed the card without answering — the
   *  card must not re-nag for the same review week. */
  dismissed?: boolean;
  /** ms epoch, client clock. */
  createdAt: number;
}

export const FEEL_OPTIONS: Array<{ value: PlanFeel; label: string }> = [
  { value: "good_fit", label: "Good fit" },
  { value: "a_bit_much", label: "A bit much" },
  { value: "too_light", label: "Too light" },
];

export const FOCUS_OPTIONS: Array<{ value: MomentumFocus; label: string }> = [
  { value: "lifts", label: "Hit my planned lifts" },
  { value: "runs", label: "Hit my planned runs" },
  { value: "food_logging", label: "Log food consistently" },
  { value: "weigh_ins", label: "Weigh in consistently" },
];

/** 1-5, the range both app-experience answers use. */
export const EXPERIENCE_SCALE = [1, 2, 3, 4, 5] as const;

/**
 * Weeks between askings of the two app-experience questions.
 *
 * The check-in is weekly and already asks two questions. Asking two more
 * every week would turn a decision moment into a survey, which is the
 * thing the check-in was built NOT to be — so these ride along roughly
 * monthly and are absent the rest of the time.
 */
export const EXPERIENCE_EVERY_N_WEEKS = 4;

/**
 * Whether this review week should carry the app-experience questions.
 *
 * Derived from the week key alone, so it needs no history read and gives
 * the same answer on every render and every device. The anchor is the
 * Unix epoch's own Monday (1970-01-05); which weeks land on the cadence
 * is arbitrary, but it is STABLE, which is the property that matters —
 * a cadence computed from "when did they last answer" would move every
 * time someone skipped one.
 *
 * Returns false for an unparseable key: a malformed week should show the
 * ordinary check-in, never a surprise extra pair of questions.
 */
export function asksExperienceQuestions(weekKey: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) return false;
  const ms = Date.parse(`${weekKey}T00:00:00Z`);
  if (Number.isNaN(ms)) return false;
  const ANCHOR_MS = Date.parse("1970-01-05T00:00:00Z"); // first Monday
  const weeks = Math.round((ms - ANCHOR_MS) / (7 * 24 * 3600 * 1000));
  return weeks % EXPERIENCE_EVERY_N_WEEKS === 0;
}

export interface NextAction {
  label: string;
  /** In-app route the action navigates to. Navigation ONLY — no
   *  response mutates programme or nutrition state. */
  to: string;
}

/**
 * The single contextual next action for a feel response. `a_bit_much`
 * steers to the programme (settings / Express Sessions live there)
 * rather than auto-cutting volume; `too_light` steers to progression
 * review rather than auto-increasing anything.
 */
export function nextActionForFeel(feel: PlanFeel): NextAction {
  switch (feel) {
    case "a_bit_much":
      return { label: "Review programme options", to: "/program" };
    case "too_light":
      return { label: "Review progression", to: "/program" };
    case "good_fit":
      return { label: "See next week's plan", to: "/program" };
  }
}

/** Focus-specific follow-through surface. */
export function nextActionForFocus(focus: MomentumFocus): NextAction {
  switch (focus) {
    case "lifts":
    case "runs":
      return { label: "Open Programme", to: "/program" };
    case "food_logging":
      return { label: "Open Food", to: "/food" };
    case "weigh_ins":
      return { label: "Open Home", to: "/" };
  }
}

/**
 * REVIEW-ROUTE-01 — the review's single next action, FOCUS-first.
 *
 * The chosen next-week focus decides the destination PRODUCT AREA: a
 * food-logging or weigh-in commitment must never route to Programme.
 * The plan FEEL then refines the label/copy WITHIN a Programme focus
 * (progression vs options vs next-week) — the "fit refines the label,
 * it does not pick the area" rule. When no focus was chosen, fall back
 * to the feel-based action (Programme is the sensible default for a
 * plan-fit-only review). This composition pins all 4×3 focus/feel
 * cells to a truthful destination.
 */
export function resolveReviewNextAction(
  feel: PlanFeel,
  focus: MomentumFocus | null
): NextAction {
  // No focus, or a Programme focus (lifts/runs) → the feel-refined
  // Programme action. Both live in Programme, so the feel label is the
  // useful refinement.
  if (focus === null || focus === "lifts" || focus === "runs") {
    return nextActionForFeel(feel);
  }
  // Food-logging / weigh-in commitments route to their own area,
  // independent of how the plan felt.
  return nextActionForFocus(focus);
}

export function checkinDocPath(uid: string, weekKey: string): string {
  return `users/${uid}/checkins/${weekKey}`;
}

/** Validation guard for reads (Firestore data is untyped at the
 *  boundary). Returns null for anything malformed. */
export function parseCheckin(data: unknown): MomentumCheckin | null {
  if (data == null || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.weekKey !== "string" || typeof d.createdAt !== "number")
    return null;
  if (d.dismissed === true) {
    return {
      weekKey: d.weekKey,
      feel: "good_fit",
      focus: null,
      dismissed: true,
      createdAt: d.createdAt,
    };
  }
  const feel = d.feel;
  if (feel !== "good_fit" && feel !== "a_bit_much" && feel !== "too_light")
    return null;
  const focus = d.focus;
  const validFocus =
    focus === "lifts" ||
    focus === "runs" ||
    focus === "food_logging" ||
    focus === "weigh_ins"
      ? focus
      : null;
  // Validated on the way back in, not just on the way out: a stored value
  // outside 1-5 (a hand-edited doc, a future scale change) must not reach
  // a consumer that trusts the range. Out-of-range reads as unanswered.
  const inScale = (v: unknown): v is number =>
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= 1 &&
    v <= EXPERIENCE_SCALE.length;

  return {
    weekKey: d.weekKey,
    feel,
    focus: validFocus,
    ...(inScale(d.clarity) ? { clarity: d.clarity } : {}),
    ...(inScale(d.ease) ? { ease: d.ease } : {}),
    createdAt: d.createdAt,
  };
}

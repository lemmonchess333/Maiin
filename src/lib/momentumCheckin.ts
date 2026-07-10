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
  return {
    weekKey: d.weekKey,
    feel,
    focus: validFocus,
    createdAt: d.createdAt,
  };
}

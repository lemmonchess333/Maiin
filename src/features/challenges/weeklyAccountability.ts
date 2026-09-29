/**
 * Phase 1 — accountability-first framing for the weekly challenge card.
 *
 * The weekly card leads with the next useful action, not a ranking. This pure
 * helper maps the three signals that matter — the user's own sessions this
 * week, how many people they FOLLOW have trained (the leaderboard population is
 * the follow graph, never "crew"), and the weekly session target — to a calm,
 * action-first message + CTA. Cold-start (no follows, nobody trained) falls
 * back to a PERSONAL consistency goal, not fake social proof, per the
 * design-for-the-user-base rule: the empty state is one of the most-seen states
 * across the user base, so it gets a real, personal call to action.
 *
 * The lines under the titles state the week's count and nothing more (house
 * voice). They closed on pep-talk tails ("one more keeps it
 * alive", "keep the streak alive", "Build your consistency"), and the first
 * said "one more" whatever the target was.
 *
 * Pure + injected so all four states are unit-testable without Firestore.
 */
export interface WeeklyAccountability {
  title: string;
  sub: string;
  ctaLabel: string;
  /** Route the primary CTA navigates to. */
  ctaTo: string;
  /** Drives the success-tone (green) vs brand-tone (purple) styling. */
  goalMet: boolean;
}

export function getWeeklyAccountability(input: {
  /** The current user's workout_count this week. */
  myWeeklyCount: number;
  /** How many DIFFERENT followed people have trained this week (>0 each). */
  othersTrained: number;
  /** Weekly session target (challenge bronze tier; default 2). */
  target: number;
}): WeeklyAccountability {
  const { myWeeklyCount, othersTrained, target } = input;

  // State C — goal met: say so, and point at progress, not "do more".
  if (myWeeklyCount >= target) {
    return {
      title: `You've hit your ${target}-session week`,
      sub: `${myWeeklyCount} ${myWeeklyCount === 1 ? "session" : "sessions"} this week.`,
      ctaLabel: "View progress",
      ctaTo: "/history",
      goalMet: true,
    };
  }

  // State C′ — on the board but short of target: the count, and the
  // session that moves it.
  if (myWeeklyCount > 0) {
    return {
      title: "You're on the board",
      sub: `${myWeeklyCount} of ${target} sessions this week.`,
      ctaLabel: "Do today's session",
      ctaTo: "/program",
      goalMet: false,
    };
  }

  // State B — others trained, you haven't: real social proof (follow graph).
  if (othersTrained > 0) {
    return {
      title: `${othersTrained} ${
        othersTrained === 1 ? "person" : "people"
      } you follow trained this week`,
      sub: "Join them — one planned session today.",
      ctaLabel: "Do today's session",
      ctaTo: "/program",
      goalMet: false,
    };
  }

  // State A — cold-start / sparse: personal goal, never fake social proof.
  const targetWord = target === 2 ? "twice" : `${target} times`;
  return {
    title: `Train ${targetWord} this week`,
    sub: "No sessions yet this week.",
    ctaLabel: "Start today's session",
    ctaTo: "/program",
    goalMet: false,
  };
}

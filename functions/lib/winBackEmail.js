"use strict";

/**
 * The emails after a break (App1 Q54 and Q55): the ladder's later steps go
 * by email, to someone who chose them. Two steps, then silence.
 *
 * A Tropos decision (Q54 leaves the days open, Round 7's Q70 to Q81 were
 * not answered): about day 3 and day 7 are the ladder's push half, not
 * built here; email takes day 14 and day 30, the two "later steps".
 *
 *   the anchor   the last thing the person logged: a saved session (the
 *                server's `lastActiveAt`, stamped by the workout and run
 *                triggers) or a meal (its `createdAt`), whichever is later.
 *                A person who has never logged anything has not stopped
 *                anything, so the ladder leaves them be; setup's first week
 *                is Home's to answer.
 *   the steps    14 and 30 whole days after the anchor's day, where the
 *                person is. Each may go on any of the 7 days from its own
 *                (a day the email could not go is not the end of it); one
 *                never sent by then is skipped, and when both are due only
 *                day 30 goes. After day 30's week, nothing.
 *   the reset    logging anything moves the anchor, and a new break has
 *                its own ladder.
 *
 * The words are true for every plan (lifts, free running, a race plan,
 * both): the plan and everything logged are still in the app, and Home
 * always shows what is next. They make no promise about how the plan
 * eases someone back, which depends on the sport and the time away
 * (src/features/program/trainingReturn.ts). No guilt (Q61): no streak, no
 * "we miss you", nothing lost.
 */

const { appUrl, renderEmail } = require("./updateEmailLayout");

/** The ladder's email steps, in days since the last thing logged. */
const WIN_BACK_STEPS = Object.freeze([14, 30]);
/** How many days a step may still go after its own. */
const STEP_WINDOW_DAYS = 7;

const DAY_MS = 86400000;

function dayMs(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Whole days from one day key to a later one. */
function daysBetween(fromKey, toKey) {
  return Math.round((dayMs(toKey) - dayMs(fromKey)) / DAY_MS);
}

/**
 * The step due, given whole days since the anchor's day and the steps
 * already sent for this anchor: 30, 14 or null.
 */
function winBackStepDue(daysAway, sentSteps = []) {
  if (!Number.isInteger(daysAway)) return null;
  const sent = new Set(sentSteps.map(Number));
  for (const step of [...WIN_BACK_STEPS].reverse()) {
    if (
      daysAway >= step &&
      daysAway < step + STEP_WINDOW_DAYS &&
      !sent.has(step)
    ) {
      return step;
    }
  }
  return null;
}

/** The later of two stored times in milliseconds, or null for neither. */
function lastLoggedMs(...times) {
  const valid = times.filter((ms) => Number.isFinite(ms));
  return valid.length > 0 ? Math.max(...valid) : null;
}

const REASON =
  "You’re getting this because you chose emails after a break in Tropos. We send one at 2 weeks and one at a month, then none.";

/**
 * The email for a step.
 *
 * @param {object} args
 * @param {14 | 30} args.step
 * @param {string} args.unsubscribe - the person's unsubscribe link
 * @returns {{ subject: string, text: string, html: string }}
 */
function buildWinBackEmail({ step, unsubscribe }) {
  const button = { label: "Open Tropos", url: appUrl("/") };
  if (step === 30) {
    const { text, html } = renderEmail({
      heading: "Your plan is still here",
      paragraphs: [
        "It’s been a month since you last logged a session or a meal in Tropos.",
        "Everything you logged is still there. If you come back, start with something easy. Home shows what’s next.",
        "This is the last of these emails for this break.",
      ],
      button,
      reason: REASON,
      unsubscribe,
    });
    return { subject: "Your plan is still here", text, html };
  }
  const { text, html } = renderEmail({
    heading: "Your plan is here when you want it",
    paragraphs: [
      "It’s been 2 weeks since you last logged a session or a meal in Tropos.",
      "Your plan is still there, and Home shows what’s next whenever you open it.",
    ],
    button,
    reason: REASON,
    unsubscribe,
  });
  return { subject: "Your plan is here when you want it", text, html };
}

module.exports = {
  WIN_BACK_STEPS,
  STEP_WINDOW_DAYS,
  daysBetween,
  winBackStepDue,
  lastLoggedMs,
  buildWinBackEmail,
};

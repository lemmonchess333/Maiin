"use strict";

/**
 * The budget in front of every push that is not from a person (App1 Q60,
 * owner, 13 November 2026): "at most one non-social push a day and five a
 * week". Counted here, on the server, per account, by the person's own
 * local day; a sender with no time zone sends nothing at all, so every
 * push it covers has one.
 *
 * What it covers, the server's own pushes:
 *
 * | Push (`data.type`)            | Sender                                     |
 * | ----------------------------- | ------------------------------------------ |
 * | `streak` (and the first-week return, sent in its place) | `hourlyStreakNudge` |
 * | `recap` / `fellbehind`        | `hourlyStreakNudge`, Monday 09:00          |
 * | `challengeReminders`          | `hourlyChallengeAnnouncements`, 09:00      |
 * | `challenges`                  | `hourlyChallengeAnnouncements`, 09:00      |
 * | `badge`                       | `hourlyStreakNudge`, from 10:00            |
 *
 * What it leaves out: a push from a person (a comment, a follow request, an
 * invite joined, a league result: Q18, sent as they happen), the test push a
 * person asks for in Settings, and the reminders the phone schedules at a
 * time the person set (training days, meals, and the streak and review when
 * push does not carry them). The server cannot see those fire, and each is
 * an alarm the person set for themselves; Q62's rule still quietens one
 * that goes unanswered (`src/lib/reminderAttention.ts`).
 *
 * "Five a week" is any seven local days running, today and the six before,
 * so no seven days ever hold more than five. A calendar week would let a
 * Saturday and Sunday be followed by five more on Monday to Friday.
 *
 * WHICH PUSH WINS A DAY (`PUSH_PRIORITY`, first wins). The one that protects
 * something, or that cannot wait, goes first:
 *   1. `streak`: the evening reminder, at the person's own hour, only when
 *      nothing is logged yet that day and the streak a log keeps is 2 or
 *      more. Miss that evening and the streak is gone, so it cannot wait.
 *   2. `recap`: Monday's review. It opens the review, which stays on Home
 *      all week (WeeklyReviewEntry), so it can wait more than the streak.
 *   3. `challengeReminders`: a joined monthly goal ends in three days.
 *   4. `challenges`: a new month's goals, three mornings to choose from.
 *   5. `badge`: earned already and waiting on Home (NewBadgeRow).
 * A push that is due earlier in the day gives way to a higher one still
 * armed for later that day (`yieldsTo`), rather than taking the day's one
 * push first. The evening reminder is the only higher push that comes
 * later, so in practice: on a day the evening reminder may still go, the
 * 09:00 pushes and the badge wait, and a badge never goes before 10:00, so
 * it never takes the morning from the review or a challenge. Before this,
 * Monday's recap went first and silenced that evening's streak reminder
 * (recap > streak, #967).
 */

const crypto = require("node:crypto");

/** `users/{uid}/settings/{this}`: the sends counted against the budget. */
const PUSH_BUDGET_DOC = "pushBudget";
const DAILY_PUSH_LIMIT = 1;
const WEEKLY_PUSH_LIMIT = 5;
/** Local days the weekly limit counts over: today and the six before. */
const BUDGET_DAYS = 7;

/** Which push wins a day, first to last (the header has the reasons). */
const PUSH_PRIORITY = Object.freeze([
  "streak",
  "recap",
  "challengeReminders",
  "challenges",
  "badge",
]);

/** The badge waits for the 09:00 pushes: from 10:00 local. */
const BADGE_EARLIEST_HOUR = 10;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The local date keys `days` long, ending on `todayKey`. */
function budgetDayKeys(todayKey, days = BUDGET_DAYS) {
  if (typeof todayKey !== "string" || !DATE_KEY.test(todayKey)) return [];
  const anchor = Date.parse(`${todayKey}T12:00:00Z`);
  if (!Number.isFinite(anchor)) return [];
  return Array.from({ length: days }, (_, back) =>
    new Date(anchor - back * 86_400_000).toISOString().slice(0, 10)
  );
}

function sentEntries(state) {
  const sent = state && Array.isArray(state.sent) ? state.sent : [];
  return sent.filter(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      typeof entry.day === "string" &&
      DATE_KEY.test(entry.day)
  );
}

/**
 * How much of the budget is used on `todayKey`, from the stored document
 * (absent or malformed reads as nothing sent).
 *
 * @returns {{ today: number, week: number, allowed: boolean }}
 */
function budgetUse(state, todayKey) {
  const days = new Set(budgetDayKeys(todayKey));
  const recent = sentEntries(state).filter((entry) => days.has(entry.day));
  const today = recent.filter((entry) => entry.day === todayKey).length;
  const week = recent.length;
  return {
    today,
    week,
    allowed:
      days.size > 0 && today < DAILY_PUSH_LIMIT && week < WEEKLY_PUSH_LIMIT,
  };
}

/**
 * Whether a push of `kind` gives way today: some push above it in
 * `PUSH_PRIORITY` is still armed for now or later today. `armed` is the
 * list of kinds that are.
 */
function yieldsTo(kind, armed) {
  const rank = PUSH_PRIORITY.indexOf(kind);
  if (rank < 0) return false;
  return (armed || []).some((other) => {
    const otherRank = PUSH_PRIORITY.indexOf(other);
    return otherRank >= 0 && otherRank < rank;
  });
}

function budgetRef(db, uid) {
  return db.doc(`users/${uid}/settings/${PUSH_BUDGET_DOC}`);
}

/**
 * Takes today's push for `kind`, or refuses: one transaction, so two
 * senders in the same hour (the streak sweep and the challenge sweep run
 * at once) cannot both take it. Resolves to the claim's id, or null when
 * the day or the week is used up. Only the last seven days are kept.
 */
async function claimPushBudget(db, uid, { kind, dayKey }) {
  const ref = budgetRef(db, uid);
  const id = crypto.randomBytes(8).toString("hex");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const state = (snap.exists && snap.data()) || {};
    if (!budgetUse(state, dayKey).allowed) return null;
    const days = new Set(budgetDayKeys(dayKey));
    const kept = sentEntries(state).filter((entry) => days.has(entry.day));
    tx.set(ref, { sent: [...kept, { day: dayKey, kind, id }] });
    return id;
  });
}

/** Gives a claim back when its push reached no device, so a failed send
 *  does not use the day. */
async function releasePushBudget(db, uid, claimId) {
  if (!claimId) return;
  const ref = budgetRef(db, uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const sent = sentEntries(snap.data());
    const kept = sent.filter((entry) => entry.id !== claimId);
    if (kept.length !== sent.length) tx.set(ref, { sent: kept });
  });
}

module.exports = {
  PUSH_BUDGET_DOC,
  DAILY_PUSH_LIMIT,
  WEEKLY_PUSH_LIMIT,
  BUDGET_DAYS,
  PUSH_PRIORITY,
  BADGE_EARLIEST_HOUR,
  budgetDayKeys,
  budgetUse,
  yieldsTo,
  claimPushBudget,
  releasePushBudget,
};

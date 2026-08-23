/**
 * Coach prompts (SOC-P2a) — the seeded weekly conversation layer for
 * Community Spaces, modelled on Runna's community playbook: the app's
 * coach voice drops one question or tip into each space per week, so a
 * space is never an empty room on day one and answering is as easy as
 * replying to a person. ONE post per space per week, system-authored,
 * never impersonating a human.
 *
 * Everything here is PURE (no Firestore, no clock reads — the caller
 * passes `now`) so the selection logic is unit-testable and the
 * scheduled function in index.js stays a thin I/O shell.
 *
 * Idempotency contract: the post's doc id is `coach-<weekKey>` —
 * deterministic per space+week — so the Monday cron can `create()`
 * blindly and treat ALREADY_EXISTS as "done" (at-least-once safe, the
 * rolloverChallenges discipline).
 *
 * Register rules (product): warm, coaching-first, support-over-
 * competition. Questions invite an answer a beginner can give; tips
 * are actionable in one session. NEVER fake urgency, NEVER reference
 * "the community said" (no fabricated social proof).
 */

const { SPACE_IDS } = require("./spaceIds");

/** Race-kind space ids — the subset of SPACE_IDS whose prompts should
 *  speak to race prep. Kept HERE (single server source) rather than
 *  mirrored from the client kind field; membership in SPACE_IDS is
 *  already pinned three-way by spaceDefs.test.ts, and a race id missing
 *  from this set degrades to the general bank — never a crash. */
const RACE_SPACE_IDS = Object.freeze(
  new Set([
    "london-marathon",
    "manchester-marathon",
    "brighton-marathon",
    "edinburgh-marathon",
    "great-north-run",
    "the-big-half",
    "royal-parks-half",
    "cardiff-half",
    "london-10000",
    "great-birmingham-run",
    "great-manchester-run",
    "leeds-10k",
  ])
);

/** The system author identity. authorId is NOT a real uid — Firestore
 *  rules bind client-created posts to auth.uid, so no client can ever
 *  post as the coach; only the Admin SDK writes this author. */
const COACH_AUTHOR = Object.freeze({
  authorId: "tropos-coach",
  authorName: "Tropos Coach",
});

/* ── Prompt banks ──────────────────────────────────────────────────
   Interest bank: general hybrid-training questions/tips. Race bank:
   race-prep themes written date-agnostic (the server doesn't know each
   user's weeks-out; prompts that work at any point in a block). */

const INTEREST_PROMPTS = Object.freeze([
  {
    title: "What's your week one win?",
    body: "New week, clean slate. What's the ONE session you're definitely not skipping this week — and what usually gets in its way?",
  },
  {
    title: "Coach tip: the 10-minute rule",
    body: "Motivation low? Commit to just the first 10 minutes of the session. If you still want to stop after that, stop — you almost never will.",
  },
  {
    title: "What did your last rest day look like?",
    body: "Rest is training. Did you actually rest — or just not train? Share what recovery looks like for you: sleep, walks, stretching, food. Someone here needs to steal your routine.",
  },
  {
    title: "Coach tip: log it before you rate it",
    body: "A session that felt terrible often reads fine in the numbers. Log first, judge after — feelings lie on hard weeks, data doesn't. What's a session you almost wrote off that turned out solid?",
  },
  {
    title: "One exercise you'd never drop?",
    body: "If your programme got cut to five movements, what survives — and why?",
  },
  {
    title: "Coach tip: protect the easy days",
    body: "The most common hybrid mistake is making easy days medium. Easy runs build the engine that hard days spend. If every session feels like a 7/10, nothing is actually a 9.",
  },
  {
    title: "What's your fuelling before a morning session?",
    body: "Training first thing? Share what you eat (or don't) beforehand and how it lands. Morning-session fuelling is wildly personal — the range of answers here is the point.",
  },
  {
    title: "Coach tip: the deload isn't optional",
    body: "Feeling flat for a week straight, sleep off, weights heavier than the numbers say? That's the signal to ease off. An easier week now buys you a stronger month.",
  },
  {
    title: "What got you into training?",
    body: "Everyone here started somewhere — a race entry, a doctor's nudge, a friend's dare. What was yours? First-day stories welcome, especially the unglamorous ones.",
  },
  {
    title: "Coach tip: pair the habit",
    body: "Struggling to make sessions stick? Anchor them to something that already happens daily — same time, same trigger, same bag by the door.",
  },
]);

const RACE_PROMPTS = Object.freeze([
  {
    title: "How's the long run treating you?",
    body: "Wherever you are in the block — building, peaking, or just surviving — how did the last long one feel? Share the distance and one thing you learned from it.",
  },
  {
    title: "Coach tip: practise race-day fuelling now",
    body: "Nothing new on race day — which means the long runs are where you rehearse gels, drinks and breakfast. What's your current fuelling plan, and has anything disagreed with you yet?",
  },
  {
    title: "What's your goal for this one?",
    body: "Time goal, finish-line goal, or just-get-round goal — all three are real races. Say yours out loud.",
  },
  {
    title: "Coach tip: the taper will feel wrong",
    body: "When the volume drops, expect phantom niggles, restlessness and doubt — that's normal in a taper. Trust the block you've already banked.",
  },
  {
    title: "Kit check: what are you racing in?",
    body: "Shoes, socks, shorts, vest — what's the current plan, and has all of it survived a long run yet? Race-day blisters are a training-day decision.",
  },
  {
    title: "Coach tip: plan your first 5K slower than feels right",
    body: "Most race-day blowups are bought in the first 15 minutes. Decide your opening pace now, while you're calm — and make it boring. The race starts at the two-thirds mark.",
  },
  {
    title: "Who's coming to watch you?",
    body: "Supporters change a race. Who's on the course for you — and where are they standing? (Planning their spots is a genuinely useful long-run distraction.)",
  },
  {
    title: "What's the hardest session of your block so far?",
    body: "The one you nearly bailed on but didn't — what was it, and what pulled you through? Someone a few weeks behind you needs to read it.",
  },
]);

/* ── Selection ──────────────────────────────────────────────────── */

/** Monday-anchored UTC week key (YYYY-MM-DD). Scheduled functions are
 *  pinned to UTC (the BST lesson, PR #815) — this key is an idempotency
 *  id, not a user-facing date, so UTC is the right single basis. */
function coachWeekKey(now) {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  // getUTCDay(): Sun=0 … Sat=6 → distance back to Monday.
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** Stable tiny hash so different spaces rotate through the bank in
 *  different orders — the whole directory never shows one identical
 *  prompt on the same week. */
function spaceOffset(spaceId) {
  let h = 0;
  for (let i = 0; i < spaceId.length; i++) h = (h + spaceId.charCodeAt(i)) % 997;
  return h;
}

/** Weeks since a fixed epoch Monday (2024-01-01 was a Monday). */
function weekIndex(weekKey) {
  const ms = Date.parse(weekKey + "T00:00:00Z") - Date.parse("2024-01-01T00:00:00Z");
  return Math.floor(ms / (7 * 86_400_000));
}

/** Deterministic prompt for (spaceId, week). */
function selectPrompt(spaceId, weekKey) {
  const bank = RACE_SPACE_IDS.has(spaceId) ? RACE_PROMPTS : INTEREST_PROMPTS;
  const idx = (weekIndex(weekKey) + spaceOffset(spaceId)) % bank.length;
  return bank[(idx + bank.length) % bank.length];
}

/**
 * The full weekly coach post for one space: deterministic doc id (the
 * idempotency key) + a doc shape that mirrors the client SpacePostDoc
 * and stays inside the firestore.rules field allowlist. `official` is
 * the unforgeable system badge (rules gate it to officialUids for
 * clients; the Admin SDK writer is exempt but honest).
 */
function buildCoachPost(spaceId, now) {
  const weekKey = coachWeekKey(now);
  const prompt = selectPrompt(spaceId, weekKey);
  return {
    docId: `coach-${weekKey}`,
    doc: {
      ...COACH_AUTHOR,
      title: prompt.title,
      body: prompt.body,
      official: true,
      likeCount: 0,
      commentCount: 0,
    },
  };
}

module.exports = {
  SPACE_IDS,
  RACE_SPACE_IDS,
  COACH_AUTHOR,
  INTEREST_PROMPTS,
  RACE_PROMPTS,
  coachWeekKey,
  selectPrompt,
  buildCoachPost,
};

"use strict";

/**
 * Medals and the trophy case (Soc15).
 *
 * A medal is a person's highest tier (bronze, silver or gold) in one
 * challenge edition: this month's Mileage, this week's Weekly Warrior,
 * this season's goal. It is what a month of effort leaves behind once
 * ChallengeFinaleCard's seven days are over, the way Strava, Garmin and
 * Nike Run Club keep a dated medal for every challenge in a trophy case.
 *
 * WHAT IS STORED
 *
 *   users/{uid}/medals/{challengeId}
 *       { challengeId, name, metric, type, tier, value, goal,
 *         targetDistance?, startDate, endDate, earnedAt, reachedAt,
 *         updatedAt }
 *       The owner's own record, owner-read, server-written only.
 *       `startDate` and `endDate` are the challenge's UTC day keys, the
 *       end exclusive as the challenge's own is (the next edition's
 *       first day). `earnedAt` is when the medal's tier was first
 *       reached and `reachedAt` holds that time for each tier up to it,
 *       so a medal lowered from silver keeps the day bronze came. Times
 *       are ISO strings, as a badge's `earnedAt` is.
 *
 *   users/{uid}/public/profile.medalSummary
 *       { [challengeId]: { tier, name, metric, type, value, goal,
 *         targetDistance?, startDate, endDate } }
 *       The trophy case other people read: the newest MEDAL_SUMMARY_MAX
 *       medals, mirrored in the same transaction as the medal, the way
 *       badgeSummary mirrors the badges. The rules let no client set or
 *       change it.
 *
 * ONE WRITER. `tierAchieved` on challenges/{id}/participants/{uid} is
 * written by several paths (the live session triggers and the join
 * backfill, the active-day and minute recomputation, the session
 * reversals, the fastest-effort rebuild and the workout correction path),
 * and a deleted run can take it DOWN. So no writer of
 * the tier writes a medal: the participant trigger
 * (onChallengeParticipantWritten) derives the medal from the participant
 * document, here, and nowhere else.
 *
 * IN STEP, THEN FROZEN. While a challenge can still take sessions the
 * medal follows the participant: created or raised when the tier rises,
 * lowered or removed when a reversal lowers it, removed when the person
 * leaves. Once it cannot (MEDAL_SETTLE_MS after the challenge's end) the
 * medal is frozen: deleting an old run, or leaving the finished
 * challenge, never takes it away. The settle window is there because
 * a session counts by its LOCAL day: the last day ends twelve hours after
 * the UTC boundary in the farthest time zone (challengeBackfill.js,
 * JOIN_CLOSE_GRACE_MS), and a session saved offline on that day can reach
 * the server the next morning.
 *
 * Every delivery reads the participant as it is NOW, inside the
 * transaction that writes the medal, never as the event says it was.
 * Deliveries are at least once and in no particular order, so a rise, a
 * reversal and its retry can arrive in any order, twice each, and every
 * one of them still leaves the medal matching the participant. The
 * freeze is decided from the participant document's own last write time
 * (`updateTime`), so a state written before the challenge settled still
 * applies when its delivery is late, and a state written after it never
 * does.
 *
 * NOT A MEDAL. A community goal (`collectiveTarget`, `group-goal-…`) is
 * everyone's total, not a person's tier, and a challenge without three
 * numeric tiers or a readable window has nothing to award.
 *
 * WHO. An account being deleted gets no medal and no summary: the check
 * runs in the transaction that would write them, as the social writers'
 * do (deletionTransactionGuard.js), and the deletion executor sweeps
 * users/{uid}/medals with the rest of the user's tree. A restricted
 * account keeps its medals and its summary, as it keeps its badgeSummary:
 * both are built from server-owned challenge data, so nothing the person
 * wrote reaches anyone through them, and a restriction refuses new joins.
 */

const { instantToDateKey } = require("./challengeActivityWindow");
const { transactionAccountsLive } = require("./deletionTransactionGuard");

const MEDAL_TIERS = Object.freeze(["bronze", "silver", "gold"]);
const TIER_RANK = Object.freeze({ bronze: 1, silver: 2, gold: 3 });

/** How long after a challenge's stored end its medals still follow the
 *  participant: the farthest time zone's last local day (12 h) and a day
 *  and a half for a session saved on it to reach the server. */
const MEDAL_SETTLE_MS = 48 * 3_600_000;

/** How many medals the public summary keeps: the newest, by edition.
 *  About 180 bytes each, in a document every search result and profile
 *  view downloads. The owner's own record keeps every medal. */
const MEDAL_SUMMARY_MAX = 40;

/** A challenge's name, as long as it may be on a medal. The server writes
 *  the names (challengeDefs.js), the longest today is 25 characters. */
const MEDAL_NAME_MAX = 60;

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function medalTier(value) {
  return MEDAL_TIERS.includes(value) ? value : null;
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/** Three decimal places: kilometres to the metre, without float dust. */
function roundValue(value) {
  return finite(value) && value > 0 ? Math.round(value * 1000) / 1000 : 0;
}

/** The challenge's UTC [start, end) day keys, or null when unreadable. */
function medalWindow(challenge) {
  const startDate = instantToDateKey(challenge && challenge.startDate);
  const endDate = instantToDateKey(challenge && challenge.endDate);
  if (!startDate || !endDate || startDate >= endDate) return null;
  return { startDate, endDate };
}

/** Whether a challenge awards medals: three numeric tiers, a name, a
 *  metric and a window, and not a community goal. */
function isMedalChallenge(challenge, challengeId) {
  if (!challenge || typeof challenge !== "object") return false;
  if (typeof challengeId === "string" && challengeId.startsWith("group-goal-"))
    return false;
  if (Number(challenge.collectiveTarget) > 0) return false;
  const tiers = challenge.tiers;
  if (!tiers || typeof tiers !== "object") return false;
  if (!MEDAL_TIERS.every((tier) => finite(tiers[tier]))) return false;
  if (typeof challenge.name !== "string" || !challenge.name.trim()) return false;
  if (typeof challenge.metric !== "string" || !challenge.metric) return false;
  return medalWindow(challenge) !== null;
}

/** The instant a challenge's medals freeze: MEDAL_SETTLE_MS after the UTC
 *  midnight its window ends on. */
function medalFreezeMs(challenge) {
  const window = medalWindow(challenge);
  if (!window) return null;
  return Date.parse(`${window.endDate}T00:00:00Z`) + MEDAL_SETTLE_MS;
}

/** Could this participant change move a medal? A cheap test on the event
 *  alone, so the many writes that cannot (progress below bronze, a name
 *  carried by identityResync) open no transaction. */
function participantChangeMayMoveMedal(before, after) {
  const tierBefore = medalTier(before && before.tierAchieved);
  const tierAfter = medalTier(after && after.tierAchieved);
  if (!tierBefore && !tierAfter) return false;
  if (
    before &&
    after &&
    tierBefore === tierAfter &&
    before.currentValue === after.currentValue
  )
    return false;
  return true;
}

function isoTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

/** When each tier up to `tier` was first reached: the stored times kept,
 *  a tier reached now (or skipped on the way to this one) given `atIso`,
 *  and the tiers above it dropped, since a medal lowered from silver no
 *  longer holds it. */
function reachedAtFor(tier, previous, atIso) {
  const out = {};
  for (const step of MEDAL_TIERS) {
    if (TIER_RANK[step] > TIER_RANK[tier]) break;
    out[step] = isoTime(previous && previous[step]) || atIso;
  }
  return out;
}

/** The medal a participant's current standing makes. */
function buildMedal({ challengeId, challenge, participant, existing, atIso }) {
  const tier = medalTier(participant.tierAchieved);
  const window = medalWindow(challenge);
  const reachedAt = reachedAtFor(
    tier,
    existing && existing.reachedAt,
    atIso
  );
  const medal = {
    challengeId,
    name: challenge.name.trim().slice(0, MEDAL_NAME_MAX),
    metric: challenge.metric,
    type: typeof challenge.type === "string" ? challenge.type : null,
    tier,
    value: roundValue(participant.currentValue),
    goal: challenge.tiers[tier],
    startDate: window.startDate,
    endDate: window.endDate,
    earnedAt: reachedAt[tier],
    reachedAt,
  };
  if (challenge.metric === "fastest_effort" && finite(challenge.targetDistance))
    medal.targetDistance = challenge.targetDistance;
  return medal;
}

const MEDAL_FIELDS = [
  "challengeId",
  "name",
  "metric",
  "type",
  "tier",
  "value",
  "goal",
  "targetDistance",
  "startDate",
  "endDate",
  "earnedAt",
];

function sameMedal(a, b) {
  if (!a || !b) return false;
  for (const field of MEDAL_FIELDS) {
    if ((a[field] ?? null) !== (b[field] ?? null)) return false;
  }
  return stableJson(a.reachedAt || {}) === stableJson(b.reachedAt || {});
}

/**
 * What one delivery does to the medal.
 *
 * @param {object} args
 * @param {string} args.challengeId
 * @param {object|null} args.challenge  the challenge document, or null
 * @param {object|null} args.participant  the participant as it is now, or
 *   null when it no longer exists
 * @param {number} args.observedMs  the participant document's last write
 * @param {object|null} args.existing  the stored medal, or null
 * @param {number} args.eventMs  the triggering write's commit time
 * @param {boolean} args.isDelete  the triggering write removed the
 *   participant (the person left)
 * @param {boolean} [args.backfill]  the one-off backfill: it creates a
 *   missing medal whatever the freeze says, for the challenges that ended
 *   before medals existed, and never changes one that exists
 * @returns {{ kind: "set", medal: object } | { kind: "delete" } |
 *   { kind: "none", reason: string }}
 */
function decideMedal({
  challengeId,
  challenge,
  participant,
  observedMs,
  existing,
  eventMs,
  isDelete,
  backfill = false,
}) {
  const none = (reason) => ({ kind: "none", reason });
  if (!isMedalChallenge(challenge, challengeId)) return none("not-a-medal");
  const freezeMs = medalFreezeMs(challenge);

  if (!participant) {
    if (backfill) return none("not-a-participant");
    // A later write may have removed it; only the removal's own delivery,
    // which carries when the person left, decides.
    if (!isDelete) return none("participant-gone");
    if (!(eventMs < freezeMs)) return none("frozen");
    return existing ? { kind: "delete" } : none("no-medal");
  }

  const tier = medalTier(participant.tierAchieved);
  if (backfill) {
    if (existing) return none("exists");
    if (!tier) return none("no-tier");
    const atMs = Math.min(
      finite(observedMs) ? observedMs : eventMs,
      Date.parse(`${medalWindow(challenge).endDate}T00:00:00Z`) - 1
    );
    return {
      kind: "set",
      medal: buildMedal({
        challengeId,
        challenge,
        participant,
        existing: null,
        atIso: new Date(atMs).toISOString(),
      }),
    };
  }

  const atMs = finite(observedMs) ? observedMs : eventMs;
  if (!(atMs < freezeMs)) return none("frozen");
  if (!tier) return existing ? { kind: "delete" } : none("no-tier");
  const medal = buildMedal({
    challengeId,
    challenge,
    participant,
    existing,
    atIso: new Date(atMs).toISOString(),
  });
  if (existing && sameMedal(existing, medal)) return none("unchanged");
  return { kind: "set", medal };
}

/** A medal's line in the public summary. */
function summaryEntryFor(medal) {
  const entry = {
    tier: medal.tier,
    name: medal.name,
    metric: medal.metric,
    type: medal.type ?? null,
    value: medal.value,
    goal: medal.goal,
    startDate: medal.startDate,
    endDate: medal.endDate,
  };
  if (finite(medal.targetDistance)) entry.targetDistance = medal.targetDistance;
  return entry;
}

function validSummaryEntry(entry) {
  return (
    !!entry &&
    typeof entry === "object" &&
    medalTier(entry.tier) !== null &&
    typeof entry.name === "string" &&
    typeof entry.endDate === "string" &&
    DAY_KEY_RE.test(entry.endDate)
  );
}

/** Newest edition first; within one, the higher tier, then the id. */
function compareSummaryEntries([idA, a], [idB, b]) {
  if (a.endDate !== b.endDate) return a.endDate < b.endDate ? 1 : -1;
  const byTier = TIER_RANK[b.tier] - TIER_RANK[a.tier];
  if (byTier !== 0) return byTier;
  return idA < idB ? -1 : idA > idB ? 1 : 0;
}

/**
 * The summary with one medal's line set (or removed, for null), capped
 * to the newest `max`. A malformed stored line is dropped rather than
 * carried: nothing but this module writes the field.
 */
function nextMedalSummary(current, challengeId, entry, max = MEDAL_SUMMARY_MAX) {
  const lines = new Map();
  if (current && typeof current === "object" && !Array.isArray(current)) {
    for (const [id, line] of Object.entries(current)) {
      if (validSummaryEntry(line)) lines.set(id, line);
    }
  }
  if (entry) lines.set(challengeId, entry);
  else lines.delete(challengeId);
  const kept = [...lines.entries()].sort(compareSummaryEntries).slice(0, max);
  return Object.fromEntries(kept);
}

/** JSON with every object's keys sorted, so two equal maps compare equal
 *  whatever order Firestore handed their keys back in. */
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function sameSummary(current, next) {
  const before =
    current && typeof current === "object" && !Array.isArray(current)
      ? current
      : {};
  return stableJson(before) === stableJson(next);
}

/** The person's medals. Spelled out, not built from a constant, so the
 *  account-deletion sweep's guard (accountDeletionSubcollections.test.js)
 *  can read the path. */
function medalsCollection(firestore, uid) {
  return firestore.collection("users").doc(uid).collection("medals");
}

function updateMsOf(snapshot) {
  const time = snapshot && snapshot.updateTime;
  if (time && typeof time.toMillis === "function") return time.toMillis();
  return null;
}

/**
 * Bring one person's medal for one challenge, and its line in their
 * public summary, in step with their participant document, in one
 * transaction. Safe to run any number of times, in any order, beside any
 * other writer: it reads everything it decides from inside the
 * transaction, and writes nothing that is already right.
 *
 * @returns {Promise<{ changed: boolean, decision: string, reason?: string,
 *   summaryChanged: boolean }>}
 */
async function syncMedal({
  firestore,
  uid,
  challengeId,
  eventMs,
  isDelete = false,
  backfill = false,
  now = Date.now(),
}) {
  const challengeRef = firestore.collection("challenges").doc(challengeId);
  const participantRef = challengeRef.collection("participants").doc(uid);
  const medalRef = medalsCollection(firestore, uid).doc(challengeId);
  const publicRef = firestore
    .collection("users")
    .doc(uid)
    .collection("public")
    .doc("profile");

  return firestore.runTransaction(async (tx) => {
    const [participantSnap, challengeSnap, medalSnap, publicSnap] =
      await Promise.all([
        tx.get(participantRef),
        tx.get(challengeRef),
        tx.get(medalRef),
        tx.get(publicRef),
      ]);
    if (!(await transactionAccountsLive({ firestore, tx, uids: [uid] }))) {
      return {
        changed: false,
        decision: "none",
        reason: "account-deleting",
        summaryChanged: false,
      };
    }
    const challenge = challengeSnap.exists ? challengeSnap.data() : null;
    const existing = medalSnap.exists ? medalSnap.data() || null : null;
    const decision = decideMedal({
      challengeId,
      challenge,
      participant: participantSnap.exists ? participantSnap.data() || {} : null,
      observedMs: updateMsOf(participantSnap),
      existing,
      eventMs,
      isDelete,
      backfill,
    });

    let stored = existing;
    if (decision.kind === "set") {
      stored = decision.medal;
      tx.set(medalRef, {
        ...decision.medal,
        updatedAt: new Date(now).toISOString(),
      });
    } else if (decision.kind === "delete") {
      stored = null;
      tx.delete(medalRef);
    }

    // The summary follows the medal as it now stands, so a delivery that
    // changes no medal still puts back a line the summary lost.
    let summaryChanged = false;
    if (isMedalChallenge(challenge, challengeId)) {
      const current = publicSnap.exists
        ? (publicSnap.data() || {}).medalSummary
        : undefined;
      const next = nextMedalSummary(
        current,
        challengeId,
        stored && medalTier(stored.tier) ? summaryEntryFor(stored) : null
      );
      if (!sameSummary(current, next)) {
        summaryChanged = true;
        tx.set(
          publicRef,
          { medalSummary: next },
          { mergeFields: ["medalSummary"] }
        );
      }
    }

    return {
      changed: decision.kind !== "none" || summaryChanged,
      decision: decision.kind,
      ...(decision.reason ? { reason: decision.reason } : {}),
      summaryChanged,
    };
  });
}

/** How far back the backfill looks by default: challenges that ended in
 *  the last 13 months, and every one still running. */
const BACKFILL_LOOKBACK_DAYS = 400;
const BACKFILL_PAGE = 300;

/**
 * Give every participant who reached a tier before medals existed the
 * medal for it. Bounded to the challenges that ended within `sinceDays`
 * (or the one `challengeId`), paged through each challenge's
 * participants, and idempotent: a medal that exists is left to the
 * trigger, so a second run writes nothing. `participants` counts the ones
 * holding a tier.
 *
 * @returns {Promise<{ challenges: number, participants: number,
 *   written: number, skipped: number }>}
 */
async function backfillMedals(
  db,
  {
    now = Date.now(),
    sinceDays = BACKFILL_LOOKBACK_DAYS,
    challengeId = null,
    // admin.firestore.FieldPath.documentId; the bare name works as well.
    documentId = () => "__name__",
    shouldWrite = async () => true,
  } = {}
) {
  const totals = { challenges: 0, participants: 0, written: 0, skipped: 0 };
  let challengeDocs;
  if (challengeId) {
    const snap = await db.collection("challenges").doc(challengeId).get();
    challengeDocs = snap.exists ? [snap] : [];
  } else {
    const since = new Date(now - sinceDays * 86_400_000);
    challengeDocs = (
      await db.collection("challenges").where("endDate", ">", since).get()
    ).docs;
  }

  for (const challengeDoc of challengeDocs) {
    if (!isMedalChallenge(challengeDoc.data(), challengeDoc.id)) continue;
    totals.challenges += 1;
    // Every participant, in id order, and the tier checked here: a filter
    // on the tier with a cursor would want an index this one-off does not
    // earn, and below-bronze rows cost one read each.
    const participants = challengeDoc.ref.collection("participants");
    let last = null;
    for (;;) {
      let page = participants.orderBy(documentId()).limit(BACKFILL_PAGE);
      if (last) page = page.startAfter(last);
      const snap = await page.get();
      for (const participant of snap.docs) {
        if (!medalTier((participant.data() || {}).tierAchieved)) continue;
        totals.participants += 1;
        if (!(await shouldWrite(participant.id))) {
          totals.skipped += 1;
          continue;
        }
        const result = await syncMedal({
          firestore: db,
          uid: participant.id,
          challengeId: challengeDoc.id,
          eventMs: now,
          backfill: true,
          now,
        });
        if (result.changed) totals.written += 1;
      }
      if (snap.docs.length < BACKFILL_PAGE) break;
      last = snap.docs[snap.docs.length - 1];
    }
  }
  return totals;
}

module.exports = {
  MEDAL_TIERS,
  MEDAL_SETTLE_MS,
  MEDAL_SUMMARY_MAX,
  MEDAL_NAME_MAX,
  BACKFILL_LOOKBACK_DAYS,
  medalTier,
  isMedalChallenge,
  medalFreezeMs,
  participantChangeMayMoveMedal,
  decideMedal,
  summaryEntryFor,
  nextMedalSummary,
  sameSummary,
  medalsCollection,
  syncMedal,
  backfillMedals,
};

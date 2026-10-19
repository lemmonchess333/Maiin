"use strict";

const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { buildCurrentChallenges } = require("./challengeDefs");
const { localDateKeyInTz } = require("./streakNudge");
const { isLocalSendHour } = require("./pushSchedule");
const { mayTargetUserConsent } = require("./pushConsent");
const { withNativePushAlert } = require("./pushSend");
const { isValidDateKey } = require("./challengeActivityWindow");
const { resolveTier } = require("./challengeTiers");
const { AggregateField } = require("firebase-admin/firestore");
const deletionStatus = require("./accountDeletionStatus");

const LOCAL_HOUR = 9;
const CATCHUP_DAYS = 3;

function isReminderSweepWindow(now) {
  // The earliest final-three-days morning is February 26 in UTC+14,
  // which falls on UTC February 25. Per-user eligibility is stricter.
  return (
    now instanceof Date &&
    Number.isFinite(now.getTime()) &&
    now.getUTCDate() >= 25
  );
}

function reminderCandidate(profile, consent, now) {
  if (!mayTargetUserConsent(consent, "challengeReminders")) return null;
  if (!isLocalSendHour(now, profile?.timezone, LOCAL_HOUR)) return null;
  const dayKey = localDateKeyInTz(now, profile.timezone);
  if (!isValidDateKey(dayKey)) return null;
  const anchor = new Date(`${dayKey}T12:00:00Z`);
  const lastDay = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)
  ).getUTCDate();
  if (Number(dayKey.slice(8)) < lastDay - 2) return null;
  return {
    kind: "reminder",
    dayKey,
    periodKey: dayKey.slice(0, 7),
    definitions: buildCurrentChallenges(anchor).filter(
      (definition) => definition.type === "monthly"
    ),
  };
}

function isSweepWindow(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return false;
  const day = now.getUTCDate();
  // UTC+14 can reach local day1 before UTC's month ends; UTC-12 can still
  // be on local day3 during UTC day4. Never send from this coarse gate alone.
  return day <= 4 || new Date(now.getTime() + 86400000).getUTCDate() === 1;
}

function announcementCandidate(profile, consent, now) {
  if (!mayTargetUserConsent(consent, "challenges")) return null;
  if (!isLocalSendHour(now, profile?.timezone, LOCAL_HOUR)) return null;
  const dayKey = localDateKeyInTz(now, profile.timezone);
  if (!isValidDateKey(dayKey) || Number(dayKey.slice(8)) > CATCHUP_DAYS)
    return null;
  // Select by the user's CURRENT local month, not tomorrow's lookahead or
  // the server's UTC month. The pure generator has an injected UTC anchor.
  const localAnchor = new Date(`${dayKey}T12:00:00Z`);
  const definition = buildCurrentChallenges(localAnchor).find((challenge) =>
    challenge.id.startsWith("featured-monthly-")
  );
  return definition
    ? { dayKey, periodKey: dayKey.slice(0, 7), definition }
    : null;
}

function matchesCanonicalDefinition(actual, definition) {
  if (!actual) return false;
  for (const field of [
    "name",
    "metric",
    "type",
    "tiers",
    "targetDistance",
    "collectiveTarget",
  ])
    if (!isDeepStrictEqual(actual[field], definition[field])) return false;
  for (const field of ["startDate", "endDate"]) {
    const value = actual[field];
    const millis =
      value instanceof Date
        ? value.getTime()
        : typeof value?.toMillis === "function"
          ? value.toMillis()
          : NaN;
    if (millis !== definition[field].getTime()) return false;
  }
  return true;
}

function writable(deletion, tombstone, now) {
  return !(
    (deletion.exists &&
      deletionStatus.isStatusActive(deletion.data()?.status)) ||
    (tombstone.exists &&
      deletionStatus.isTombstoneLive(tombstone.data(), now.getTime()))
  );
}

function stateRef(db, uid, periodKey, kind) {
  const prefix =
    kind === "reminder" ? "challengeReminder" : "challengeAnnouncement";
  return db.doc(`users/${uid}/settings/${prefix}-${periodKey}`);
}

async function claimReminder(db, uid, candidate, now, serverTimestamp) {
  const ref = stateRef(db, uid, candidate.periodKey, "reminder");
  const attemptId = crypto.randomBytes(16).toString("hex");
  return db.runTransaction(async (tx) => {
    const [profile, consent, state, deletion, tombstone, ...documents] =
      await Promise.all([
        tx.get(db.doc(`users/${uid}`)),
        tx.get(db.doc(`users/${uid}/settings/push`)),
        tx.get(ref),
        tx.get(db.doc(`accountDeletionRequests/${uid}`)),
        tx.get(db.doc(`deletedAccounts/${uid}`)),
        ...candidate.definitions.flatMap((definition) => [
          tx.get(db.doc(`challenges/${definition.id}`)),
          tx.get(db.doc(`challenges/${definition.id}/participants/${uid}`)),
        ]),
      ]);
    if (!profile.exists || !writable(deletion, tombstone, now)) return null;
    const current = reminderCandidate(profile.data(), consent.data(), now);
    if (!current || current.periodKey !== candidate.periodKey) return null;
    if (
      state.exists &&
      (state.data()?.status !== "retryable" ||
        !isValidDateKey(state.data()?.lastAttemptDateKey) ||
        state.data().lastAttemptDateKey >= current.dayKey)
    )
      return null;
    const eligible = [];
    for (let index = 0; index < current.definitions.length; index++) {
      const definition = current.definitions[index];
      const [canonical, participant] = documents.slice(
        index * 2,
        index * 2 + 2
      );
      if (
        candidate.definitions[index]?.id !== definition.id ||
        !matchesCanonicalDefinition(canonical?.data(), definition) ||
        !participant?.exists ||
        now >= definition.endDate ||
        now < definition.startDate
      )
        continue;
      let value = participant.data()?.currentValue;
      if (value === undefined) value = 0;
      if (definition.collectiveTarget) {
        // Read the current community sum, not this member's mileage. Keep
        // the aggregate outside the transaction's locks: locking every
        // participant for each recipient would serialize the whole sweep.
        if (canonical.data().collectiveTarget !== definition.collectiveTarget)
          continue;
        const total = await db
          .collection(`challenges/${definition.id}/participants`)
          .aggregate({ total: AggregateField.sum("currentValue") })
          .get();
        value = total.data().total;
      }
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
        continue;
      // Match the cards: Gold has no next tier, while Bronze and Silver
      // still show progress toward another tier. The reminder only asks
      // people to review their progress; it never prescribes extra training.
      if (resolveTier(value, definition.tiers, definition.metric) !== "gold")
        eligible.push(definition);
    }
    if (eligible.length === 0) return null;
    tx.set(ref, {
      status: "sending",
      attemptId,
      lastAttemptDateKey: current.dayKey,
      attemptedAt: serverTimestamp,
    });
    return { ...current, definitions: eligible, attemptId };
  });
}

async function claimAnnouncement(db, uid, candidate, now, serverTimestamp) {
  const ref = stateRef(db, uid, candidate.periodKey);
  const attemptId = crypto.randomBytes(16).toString("hex");
  return db.runTransaction(async (tx) => {
    const [profile, consent, definition, state, deletion, tombstone] =
      await Promise.all([
        tx.get(db.doc(`users/${uid}`)),
        tx.get(db.doc(`users/${uid}/settings/push`)),
        tx.get(db.doc(`challenges/${candidate.definition.id}`)),
        tx.get(ref),
        tx.get(db.doc(`accountDeletionRequests/${uid}`)),
        tx.get(db.doc(`deletedAccounts/${uid}`)),
      ]);
    if (!profile.exists || !writable(deletion, tombstone, now)) return null;
    const current = announcementCandidate(profile.data(), consent.data(), now);
    if (
      !current ||
      current.periodKey !== candidate.periodKey ||
      !matchesCanonicalDefinition(definition.data(), current.definition)
    )
      return null;
    if (
      state.exists &&
      (state.data()?.status !== "retryable" ||
        !isValidDateKey(state.data()?.lastAttemptDateKey) ||
        state.data().lastAttemptDateKey >= current.dayKey)
    )
      return null;
    tx.set(ref, {
      status: "sending",
      attemptId,
      lastAttemptDateKey: current.dayKey,
      attemptedAt: serverTimestamp,
    });
    return { ...current, attemptId };
  });
}

async function finishAnnouncement(
  db,
  uid,
  claim,
  status,
  now,
  serverTimestamp
) {
  const ref = stateRef(db, uid, claim.periodKey, claim.kind);
  await db.runTransaction(async (tx) => {
    const [state, deletion, tombstone] = await Promise.all([
      tx.get(ref),
      tx.get(db.doc(`accountDeletionRequests/${uid}`)),
      tx.get(db.doc(`deletedAccounts/${uid}`)),
    ]);
    if (!state.exists || !writable(deletion, tombstone, now)) return;
    if (
      state.data()?.attemptId !== claim.attemptId ||
      state.data()?.status !== "sending"
    )
      return;
    // update, never recreate: account erasure can remove the claim while FCM
    // is in flight. A delayed delivery completion must not restore that data.
    tx.update(ref, { status, finishedAt: serverTimestamp });
  });
}

function deliveryStatus(batch, count) {
  if (
    !Array.isArray(batch?.responses) ||
    batch.responses.length !== count ||
    !batch.responses.every(
      (response) =>
        response?.success === true ||
        (response?.success === false &&
          typeof response.error?.code === "string" &&
          response.error.code.length > 0)
    )
  )
    return "uncertain";
  return batch.responses.some((response) => response.success)
    ? "sent"
    : "retryable";
}

function buildAnnouncementMessage(uid, claim, now) {
  const reminder = claim.kind === "reminder";
  return withNativePushAlert(
    {
      data: {
        type: reminder ? "challengeReminders" : "challenges",
        route: "/social",
        challengeId: reminder ? claim.definitions[0].id : claim.definition.id,
        title: reminder
          ? "Monthly challenges end soon"
          : "New monthly challenges",
        body: reminder
          ? "Your joined monthly goals wrap up soon. Take a look at your progress in Tropos."
          : `${claim.definition.name} is ready. Choose a goal in Tropos.`,
      },
      // A queued campaign should not surface weeks later or overnight.
      webpush: { headers: { TTL: "3600" } },
      apns: {
        headers: {
          "apns-expiration": String(Math.floor(now.getTime() / 1000) + 3600),
          "apns-collapse-id": `challenges-${reminder ? "ending-" : ""}${claim.periodKey}`,
        },
      },
    },
    uid
  );
}

/**
 * Atomic claim precedes FCM. Concurrent/retried cron deliveries cannot send
 * twice. A transport exception/crash after claim is ambiguous and consumes
 * this month's campaign; prefer a missed reminder over duplicate alerts.
 * Only explicit zero-accepted FCM results may retry on a later local
 * morning within that campaign's three-day window. Any accepted recipient
 * completes the campaign.
 */
async function maybeSendAnnouncement({
  db,
  uid,
  now,
  serverTimestamp,
  leaseRegistrations,
  releaseRegistrations,
  send,
  prune,
  profile,
  reminder = false,
}) {
  const facts = profile || (await db.doc(`users/${uid}`).get()).data();
  if (!isLocalSendHour(now, facts?.timezone, LOCAL_HOUR)) return false;
  const consent = (await db.doc(`users/${uid}/settings/push`).get()).data();
  const candidate = reminder
    ? reminderCandidate(facts, consent, now)
    : announcementCandidate(facts, consent, now);
  if (!candidate) return false;
  const registrations = await leaseRegistrations(uid);
  if (registrations.length === 0) return false;
  let batch;
  let status;
  try {
    const claim = await (reminder ? claimReminder : claimAnnouncement)(
      db,
      uid,
      candidate,
      now,
      serverTimestamp
    );
    if (!claim) return false;
    try {
      batch = await send({
        tokens: registrations.map((registration) => registration.token),
        ...buildAnnouncementMessage(uid, claim, now),
      });
      status = deliveryStatus(batch, registrations.length);
    } catch {
      // Do not retry an ambiguous send: FCM may have accepted it before the
      // caller lost its response. No raw transport/token error is logged.
      status = "uncertain";
    }
    await finishAnnouncement(db, uid, claim, status, now, serverTimestamp);
  } finally {
    await releaseRegistrations(uid, registrations);
  }
  if (batch && status !== "uncertain") await prune(uid, registrations, batch);
  return status === "sent";
}

/** Bounded pages, no lastActiveAt prerequisite: an opted-in lapsed account
 * still gets its monthly invitation. Failures surface; a later scheduled
 * catchup sweep can resume safely from the start of the user list. */
async function sweepAnnouncementUsers({
  db,
  now,
  documentId,
  perUser,
  pageSize = 200,
  includeReminders = false,
}) {
  if (!isSweepWindow(now) && !(includeReminders && isReminderSweepWindow(now)))
    return;
  let after;
  let failures = 0;
  for (let page = 0; page < 1000; page++) {
    let query = db.collection("users").orderBy(documentId).limit(pageSize);
    if (after) query = query.startAfter(after);
    const snapshot = await query.get();
    for (let offset = 0; offset < snapshot.docs.length; offset += 10) {
      await Promise.all(
        snapshot.docs.slice(offset, offset + 10).map(async (doc) => {
          try {
            await perUser(doc.id, doc.data());
          } catch {
            failures++;
          }
        })
      );
    }
    if (snapshot.docs.length < pageSize) {
      if (failures) throw new Error("Challenge announcement sweep incomplete");
      return;
    }
    after = snapshot.docs.at(-1);
  }
  throw new Error("Challenge announcement sweep page limit reached");
}

module.exports = {
  LOCAL_HOUR,
  CATCHUP_DAYS,
  isSweepWindow,
  isReminderSweepWindow,
  announcementCandidate,
  reminderCandidate,
  matchesCanonicalDefinition,
  deliveryStatus,
  buildAnnouncementMessage,
  claimAnnouncement,
  claimReminder,
  finishAnnouncement,
  maybeSendAnnouncement,
  maybeSendReminder: (args) =>
    maybeSendAnnouncement({ ...args, reminder: true }),
  sweepAnnouncementUsers,
};

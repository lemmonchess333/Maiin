"use strict";

const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { buildCurrentChallenges } = require("./challengeDefs");
const { localDateKeyInTz } = require("./streakNudge");
const { isLocalSendHour } = require("./pushSchedule");
const { mayTargetUserConsent } = require("./pushConsent");
const { withNativePushAlert } = require("./pushSend");
const { isValidDateKey } = require("./challengeActivityWindow");
const deletionStatus = require("./accountDeletionStatus");

const LOCAL_HOUR = 9;
const CATCHUP_DAYS = 3;

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
    challenge.id.startsWith("featured-monthly-"),
  );
  return definition
    ? { dayKey, periodKey: dayKey.slice(0, 7), definition }
    : null;
}

function matchesCanonicalDefinition(actual, definition) {
  if (!actual) return false;
  for (const field of ["name", "metric", "type", "tiers"])
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

function stateRef(db, uid, periodKey) {
  return db.doc(`users/${uid}/settings/challengeAnnouncement-${periodKey}`);
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
  serverTimestamp,
) {
  const ref = stateRef(db, uid, claim.periodKey);
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
          response.error.code.length > 0),
    )
  )
    return "uncertain";
  return batch.responses.some((response) => response.success)
    ? "sent"
    : "retryable";
}

function buildAnnouncementMessage(uid, claim, now) {
  return withNativePushAlert(
    {
      data: {
        type: "challenges",
        route: "/social",
        challengeId: claim.definition.id,
        title: "New monthly challenges",
        body: `${claim.definition.name} is ready. Choose a goal in Tropos.`,
      },
      // A queued campaign should not surface weeks later or overnight.
      webpush: { headers: { TTL: "3600" } },
      apns: {
        headers: {
          "apns-expiration": String(Math.floor(now.getTime() / 1000) + 3600),
          "apns-collapse-id": `challenges-${claim.periodKey}`,
        },
      },
    },
    uid,
  );
}

/**
 * Atomic claim precedes FCM. Concurrent/retried cron deliveries cannot send
 * twice. A transport exception/crash after claim is ambiguous and consumes
 * this month's announcement; prefer a missed promotion over duplicate alerts.
 * Only explicit zero-accepted FCM results may retry, once on a later local
 * morning within days1–3. Any accepted recipient completes the campaign.
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
}) {
  const facts = profile || (await db.doc(`users/${uid}`).get()).data();
  if (!isLocalSendHour(now, facts?.timezone, LOCAL_HOUR)) return false;
  const consent = (await db.doc(`users/${uid}/settings/push`).get()).data();
  const candidate = announcementCandidate(facts, consent, now);
  if (!candidate) return false;
  const registrations = await leaseRegistrations(uid);
  if (registrations.length === 0) return false;
  let batch;
  let status;
  try {
    const claim = await claimAnnouncement(
      db,
      uid,
      candidate,
      now,
      serverTimestamp,
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
}) {
  if (!isSweepWindow(now)) return;
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
        }),
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
  announcementCandidate,
  matchesCanonicalDefinition,
  deliveryStatus,
  buildAnnouncementMessage,
  claimAnnouncement,
  finishAnnouncement,
  maybeSendAnnouncement,
  sweepAnnouncementUsers,
};

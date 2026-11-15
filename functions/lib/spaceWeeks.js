"use strict";

/**
 * A Space's week in totals (Run27 call 11): "412 km by 38 members this
 * week", a figure that names no one, as the community goal's does.
 *
 * WHAT IS STORED (server-written only; firestore.rules lets no client write
 * either, and no client reads the credits)
 *
 *   users/{uid}/spaceWeeks/{spaceId}_{weekKey}
 *       { uid, spaceId, weekKey, spaceWeek, sessions, meters, updatedAt }:
 *       one member's week in one Space, counted from their own saved
 *       sessions as the league and the challenges count them
 *       (weekTally.tallyWeek: every saved workout, every run the challenges
 *       would credit). `spaceWeek` is `${spaceId}_${weekKey}`, the one field
 *       the Space's count filters on. Present only while the member is in
 *       the Space, is not restricted and saved at least one counted session
 *       that week.
 *   spaces/{spaceId}/weeks/{weekKey}
 *       { weekKey, members, sessions, meters, updatedAt }, or
 *       { weekKey, quiet: true, updatedAt } while fewer than
 *       SPACE_WEEK_MIN_MEMBERS members trained: the Space's week. Any
 *       signed-in person reads it.
 *
 * - Every figure is counted again, never incremented. A member's credit is
 *   their week's sessions read again whenever one of them is saved, changed
 *   or deleted, and whenever they join or leave the Space or a restriction
 *   is set or lifted. The Space's week is then a count and two sums over
 *   the credits (`readSpaceWeek`), taken again after each credit write. A
 *   retried or doubled delivery reads the same sessions and the same
 *   credits and stores the same figures.
 * - `updatedAt` is when the Space's figures were true, the earliest read
 *   time of the three aggregations. Two recounts can finish out of order,
 *   so a count read before the one stored is dropped (`shouldStoreCount`,
 *   as raceCohorts and followCounts do).
 * - Below SPACE_WEEK_MIN_MEMBERS the server stores no figure at all, not a
 *   figure the app hides: a sum over two or three people's weeks would tell
 *   anyone who knows the others' weeks what the last one did, sessions they
 *   shared with nobody included.
 * - A restricted account adds nothing, as on the community goal and the
 *   pulse (a restriction refuses adding to what other people see), and an
 *   account being deleted keeps no credit.
 * - A week is the member's own Monday to Sunday of their saved local day
 *   keys, as the league's is, so a Space's `weekKey` names every member's
 *   week; "this week" is the one holding the viewer's local today.
 * - The count needs indexes in firestore.indexes.json: the collection-group
 *   field `spaceWeeks.spaceWeek` for the count, and (spaceWeek, sessions)
 *   and (spaceWeek, meters) for the two sums, since Firestore sums a field
 *   from an index holding it. Each figure is its own aggregation, so each
 *   needs only its own index. The emulator answers without them and
 *   production refuses, so they are pinned in __tests__/spaceWeeks.test.js.
 */

const admin = require("./adminSdk");
const { SPACE_IDS } = require("./spaceIds");
const { joinedSpaceIds } = require("./spaceFeed");
const { tallyWeek, weekKeyOf, currentWeek } = require("./weekTally");
const { isValidDateKey } = require("./challengeActivityWindow");
const { transactionAccountsLive } = require("./deletionTransactionGuard");
const { millisOf, shouldStoreCount } = require("./raceCohorts");

const CREDITS = "spaceWeeks";
const WEEKS = "weeks";
const KNOWN_SPACES = new Set(SPACE_IDS);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tropos heuristic: a Space's week shows figures only once at least five
 * members trained in it. It is the floor a Space's member count already
 * has (SPACE_MEMBER_COUNT_MIN_VISIBLE in spaceDefs.ts, Spc1c), so the
 * Space never shows a number of people below five anywhere; and a sum over
 * fewer would let a few people who know each other's weeks read off the
 * last person's, sessions shared with nobody included.
 * spaceWeekTotals.cross.test.ts pins it to the app's copy.
 */
const SPACE_WEEK_MIN_MEMBERS = 5;

function addDays(dayKey, n) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function spaceWeekKey(spaceId, weekKey) {
  return `${spaceId}_${weekKey}`;
}

function creditRef(db, uid, spaceId, weekKey) {
  return db
    .collection("users")
    .doc(uid)
    .collection("spaceWeeks")
    .doc(spaceWeekKey(spaceId, weekKey));
}

function weekRef(db, spaceId, weekKey) {
  return db.collection("spaces").doc(spaceId).collection("weeks").doc(weekKey);
}

/**
 * The Space's week read from its credits: how many there are, and the sum
 * of their sessions and of their metres. Three aggregations, one per
 * figure, each the one-filter shape whose index firestore.indexes.json
 * holds (the filter alone for the count, the filter and the summed field
 * for each sum), rather than one query asking for all three. `observedMs`
 * is the earliest of the three read times, so a later count always wins.
 */
async function readSpaceWeek(db, spaceId, weekKey, now) {
  const { AggregateField } = admin.firestore;
  const credits = db
    .collectionGroup("spaceWeeks")
    .where("spaceWeek", "==", spaceWeekKey(spaceId, weekKey));
  const [members, sessions, meters] = await Promise.all([
    credits.aggregate({ value: AggregateField.count() }).get(),
    credits.aggregate({ value: AggregateField.sum("sessions") }).get(),
    credits.aggregate({ value: AggregateField.sum("meters") }).get(),
  ]);
  const value = (snap) => Number((snap.data() || {}).value) || 0;
  const times = [members, sessions, meters].map(
    (snap) => millisOf(snap.readTime) || now
  );
  return {
    members: value(members),
    sessions: Math.round(value(sessions)),
    meters: Math.round(value(meters)),
    observedMs: Math.min(...times),
  };
}

/**
 * Write or delete `uid`'s credit in each of `spaceIds` for `weekKey`, from
 * their saved sessions that week, in one transaction that also reads their
 * memberships, their restriction and the deletion freeze. Resolves to the
 * Spaces whose credit changed.
 */
async function writeCredits(
  db,
  uid,
  spaceIds,
  weekKey,
  { now = Date.now() } = {}
) {
  const spaces = [...new Set(spaceIds)].filter((id) => KNOWN_SPACES.has(id));
  if (!uid || spaces.length === 0 || !isValidDateKey(weekKey)) return [];
  const user = db.collection("users").doc(uid);
  const endKey = addDays(weekKey, 7);
  const inWeek = (kind) =>
    user
      .collection(kind)
      .where("date", ">=", weekKey)
      .where("date", "<", endKey);
  const members = spaces.map((spaceId) =>
    db.collection("spaces").doc(spaceId).collection("members").doc(uid)
  );
  const credits = spaces.map((spaceId) => creditRef(db, uid, spaceId, weekKey));

  return db.runTransaction(async (tx) => {
    const [restricted, live, workouts, runs, memberSnaps, creditSnaps] =
      await Promise.all([
        tx.get(db.collection("globalRestrictedUids").doc(uid)),
        transactionAccountsLive({ firestore: db, tx, uids: [uid] }),
        tx.get(inWeek("workouts")),
        tx.get(inWeek("runs")),
        Promise.all(members.map((ref) => tx.get(ref))),
        Promise.all(credits.map((ref) => tx.get(ref))),
      ]);
    const tally = tallyWeek(
      workouts.docs.map((d) => d.data()),
      runs.docs.map((d) => d.data())
    );
    const counts = !restricted.exists && live && tally.sessions > 0;
    const changed = [];
    spaces.forEach((spaceId, i) => {
      const stored = creditSnaps[i].exists ? creditSnaps[i].data() || {} : null;
      if (!counts || !memberSnaps[i].exists) {
        if (stored) {
          tx.delete(credits[i]);
          changed.push(spaceId);
        }
        return;
      }
      if (
        stored &&
        stored.sessions === tally.sessions &&
        stored.meters === tally.distanceM
      )
        return;
      tx.set(credits[i], {
        uid,
        spaceId,
        weekKey,
        spaceWeek: spaceWeekKey(spaceId, weekKey),
        sessions: tally.sessions,
        meters: tally.distanceM,
        updatedAt: new Date(now),
      });
      changed.push(spaceId);
    });
    return changed;
  });
}

/**
 * Count `spaceId`'s week again from its members' credits and store it,
 * unless a later count is stored already. Resolves to
 * `{ spaceId, weekKey, members, written }`.
 */
async function recountSpaceWeek(
  db,
  spaceId,
  weekKey,
  { now = Date.now() } = {}
) {
  if (!KNOWN_SPACES.has(spaceId) || !isValidDateKey(weekKey)) {
    return { spaceId, weekKey, members: 0, written: false };
  }
  const { members, sessions, meters, observedMs } = await readSpaceWeek(
    db,
    spaceId,
    weekKey,
    now
  );
  const value =
    members >= SPACE_WEEK_MIN_MEMBERS
      ? {
          weekKey,
          members,
          sessions,
          meters,
          updatedAt: new Date(observedMs),
        }
      : { weekKey, quiet: true, updatedAt: new Date(observedMs) };
  const ref = weekRef(db, spaceId, weekKey);
  const written = await db.runTransaction(async (tx) => {
    const stored = await tx.get(ref);
    const data = stored.exists ? stored.data() || {} : {};
    if (!shouldStoreCount(observedMs, millisOf(data.updatedAt))) return false;
    tx.set(ref, value);
    return true;
  });
  return { spaceId, weekKey, members, written };
}

async function recountAll(db, pairs, { now }) {
  for (const [spaceId, weekKey] of pairs) {
    await recountSpaceWeek(db, spaceId, weekKey, { now });
  }
}

/**
 * For a session trigger: `uid`'s credit in every Space they are in, for
 * each week the event's days fall in, then those Spaces' weeks counted
 * again. Someone in no Space costs one query.
 */
async function refreshMemberWeeks(
  db,
  uid,
  activityDays,
  { now = Date.now() } = {}
) {
  const weekKeys = [
    ...new Set((activityDays || []).filter(isValidDateKey).map(weekKeyOf)),
  ].sort();
  if (!uid || weekKeys.length === 0) return { recounted: 0 };
  const spaceIds = await joinedSpaceIds(db, uid);
  if (spaceIds.length === 0) return { recounted: 0 };
  const pairs = [];
  for (const weekKey of weekKeys) {
    await writeCredits(db, uid, spaceIds, weekKey, { now });
    spaceIds.forEach((spaceId) => pairs.push([spaceId, weekKey]));
  }
  await recountAll(db, pairs, { now });
  return { recounted: pairs.length };
}

/** The weeks `uid` holds a credit for in `spaceId` (or in any Space). */
async function creditedWeeks(db, uid, spaceId) {
  let query = db.collection("users").doc(uid).collection("spaceWeeks");
  if (spaceId) query = query.where("spaceId", "==", spaceId);
  const snap = await query.get();
  return snap.docs
    .map((doc) => doc.data() || {})
    .filter((c) => KNOWN_SPACES.has(c.spaceId) && isValidDateKey(c.weekKey))
    .map((c) => [c.spaceId, c.weekKey]);
}

async function userCurrentWeekKey(db, uid, now) {
  const user = await db.collection("users").doc(uid).get();
  const timezone = user.exists ? (user.data() || {}).timezone : null;
  return currentWeek(timezone, now).weekKey;
}

/**
 * A join or a leave: on a join, the member's current week counts in the
 * Space at once; on a leave, every credit they held in it goes. Either way
 * the weeks touched are counted again.
 */
async function syncMemberWeeks(db, spaceId, uid, { now = Date.now() } = {}) {
  if (!KNOWN_SPACES.has(spaceId) || typeof uid !== "string" || !uid) {
    return { recounted: 0 };
  }
  const weeks = new Set(
    (await creditedWeeks(db, uid, spaceId)).map(([, weekKey]) => weekKey)
  );
  weeks.add(await userCurrentWeekKey(db, uid, now));
  const pairs = [];
  for (const weekKey of [...weeks].sort()) {
    await writeCredits(db, uid, [spaceId], weekKey, { now });
    pairs.push([spaceId, weekKey]);
  }
  await recountAll(db, pairs, { now });
  return { recounted: pairs.length };
}

/**
 * A restriction set or lifted: `uid`'s credits in every Space are written
 * again (removed while restricted, back for the current week once lifted),
 * and each week touched is counted again.
 */
async function syncAuthorWeeks(db, uid, { now = Date.now() } = {}) {
  if (typeof uid !== "string" || !uid) return { recounted: 0 };
  const held = await creditedWeeks(db, uid, null);
  const current = await userCurrentWeekKey(db, uid, now);
  const joined = await joinedSpaceIds(db, uid);
  const byWeek = new Map();
  const add = (spaceId, weekKey) => {
    if (!byWeek.has(weekKey)) byWeek.set(weekKey, new Set());
    byWeek.get(weekKey).add(spaceId);
  };
  held.forEach(([spaceId, weekKey]) => add(spaceId, weekKey));
  joined.forEach((spaceId) => add(spaceId, current));
  const pairs = [];
  for (const [weekKey, spaces] of [...byWeek].sort()) {
    await writeCredits(db, uid, [...spaces], weekKey, { now });
    [...spaces].sort().forEach((spaceId) => pairs.push([spaceId, weekKey]));
  }
  await recountAll(db, pairs, { now });
  return { recounted: pairs.length };
}

module.exports = {
  CREDITS,
  WEEKS,
  SPACE_WEEK_MIN_MEMBERS,
  spaceWeekKey,
  writeCredits,
  recountSpaceWeek,
  refreshMemberWeeks,
  syncMemberWeeks,
  syncAuthorWeeks,
};

"use strict";

/**
 * Weekly leagues (Soc15 call 3, owner-locked 3 November 2026): groups of
 * about twenty, scored on sessions done against each person's own plan,
 * so a three-day lifter can beat a marathoner. The rules are in
 * leagueRules.js and the planned count in leaguePlanned.js; this module
 * reads and writes.
 *
 * WHAT IS STORED (all server-written; firestore.rules lets no client write)
 *
 *   users/{uid}.leagueOptIn      true once the person joins, false once they
 *                                leave; set only by setLeagueSharing
 *   leagueMembers/{uid}          { uid, tier, groupId, weekKey, joinedAt }:
 *                                their tier, and the group they are in this
 *                                week (null between weeks). Owner read.
 *   leagueGroups/{groupId}       { weekKey, tier, memberUids, size }. Read
 *                                by its members.
 *     standings/{uid}            { uid, name, photo, tier, points, done,
 *                                planned, reachedAt }: a member's week, read
 *                                by the members of the group. `name` is the
 *                                first word of their public name.
 *   users/{uid}/leagueResults/{weekKey}
 *                                { weekKey, tier, newTier, rank, of, points,
 *                                outcome }: how a settled week went. Owner
 *                                read.
 *   leagueWeeks/{weekKey}        the turn's step markers and counts, so a
 *                                second run of the same turn does nothing
 *                                twice. Server only. Names no one.
 *   leagueStatus/current         { joined, needed, open, weekKey }: the
 *                                figure the locked card shows. Any signed-in
 *                                person reads it. Names no one.
 *
 * OPT-IN. A league shows a first name, a photo and a week's points to
 * about twenty people who may be strangers, so nobody is in one unless they
 * said yes, as with the friends board (which reaches only followers). A
 * restricted account cannot join (S4e) and is never placed; an account on
 * the discovery-hidden list is never placed. Leaving deletes the person's
 * standing and takes them out of their group at once.
 *
 * A WEEK. Each member's week is their own Monday to Sunday: sessions are
 * counted by their saved local day keys, which every member shares
 * (2026-11-09 is the same Monday everywhere), so a group's `weekKey` names
 * every member's week. `weeklyLeagueTurn` runs on Monday at 12:15 UTC,
 * after every timezone's Sunday has ended: it settles last week's groups,
 * forms this week's and writes the figure. Groups form after some people's
 * Monday began, so a standing is always recomputed from the sessions, never
 * incremented: whatever was saved before the group existed counts.
 *
 * A STANDING. `done` counts sessions as the friends board does (every saved
 * workout, every run the challenges would credit: friendsBoard.tallyWeek).
 * `planned` is read from the plan while the week is the member's current
 * one; once it is over the stored figure stands, because the plan's run
 * days are regenerated each Monday and no longer hold last week's.
 * `reachedAt` moves only when the points do.
 *
 * Settled groups are deleted once each member has their result: what a
 * week leaves behind is the member's own leagueResults record.
 */

const rules = require("./leagueRules");
const { leaguePlanned } = require("./leaguePlanned");
const { tallyWeek, weekKeyOf, currentWeek } = require("./friendsBoard");
const { isValidDateKey } = require("./challengeActivityWindow");
const { utcDateString, parseUtcDate } = require("./dateUtils");
const { transactionAccountsLive } = require("./deletionTransactionGuard");
const { carriedName } = require("./identityResync");
const { publicPhotoUrl } = require("./publicPhotoUrl");
const { isRestricted } = require("./restriction");
const accountDeletionLocks = require("./accountDeletionLocks");

const MEMBERS = "leagueMembers";
const GROUPS = "leagueGroups";
const STANDINGS = "standings";
const RESULTS = "leagueResults";
const WEEKS = "leagueWeeks";
const STATUS = "leagueStatus";
const STATUS_DOC = "current";
/** The sender a result notification names: the league, not a person. */
const LEAGUE_SENDER = "tropos-leagues";

const DAY_MS = 86400000;
/** People read at once while a turn looks them up. */
const CONCURRENCY = 8;
/** Groups placed at once. */
const GROUP_CONCURRENCY = 4;
/** Writes in one batch, inside Firestore's 500. */
const BATCH_WRITES = 400;

function addDays(dayKey, n) {
  return utcDateString(new Date(parseUtcDate(dayKey).getTime() + n * DAY_MS));
}

/** The Monday of the UTC day `now` falls in: the turn's week. */
function turnWeekKey(now) {
  return weekKeyOf(utcDateString(new Date(now)));
}

/** The first word of a public name, carried only when the word filter
 *  passes the whole name (identityResync.carriedName). */
function leagueFirstName(displayName) {
  const name = carriedName(displayName);
  if (!name) return null;
  const first = name.split(/\s+/)[0] || "";
  return first ? first.slice(0, 30) : null;
}

/** The name and photo a standing carries, from the public profile. */
function standingIdentity(publicProfile) {
  const data = publicProfile || {};
  const out = {};
  const name = leagueFirstName(data.displayName);
  if (name) out.name = name;
  const photo = publicPhotoUrl(data.photoURL);
  if (photo) out.photo = photo;
  return out;
}

/** Writes as batches of at most BATCH_WRITES, each `(batch) => …`. */
async function commitInChunks(db, writes) {
  for (let i = 0; i < writes.length; i += BATCH_WRITES) {
    const batch = db.batch();
    writes.slice(i, i + BATCH_WRITES).forEach((write) => write(batch));
    await batch.commit();
  }
}

async function inBatches(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

/**
 * A standing's figures: `{ done, planned, points, reachedAt }`. Pure.
 * `weekIsCurrent` says whether the plan may be read for the week (see the
 * header); `stored` is the standing as it is, or null.
 */
function standingFigures({
  profile,
  programState,
  workouts,
  runs,
  weekKey,
  stored,
  weekIsCurrent,
  now,
}) {
  const done = tallyWeek(workouts, runs).sessions;
  const keepPlanned =
    !weekIsCurrent && stored && Number.isInteger(stored.planned) && stored.planned > 0;
  const planned = keepPlanned
    ? stored.planned
    : leaguePlanned(profile, programState, weekKey).planned;
  const points = rules.leaguePoints(done, planned);
  const reachedAt =
    stored && stored.points === points && stored.reachedAt
      ? stored.reachedAt
      : new Date(now);
  return { done, planned, points, reachedAt };
}

/** The reads a standing is computed from, inside a transaction. */
function sourceReads(db, tx, uid, weekKey) {
  const user = db.collection("users").doc(uid);
  const endKey = addDays(weekKey, 7);
  const inWeek = (kind) =>
    user
      .collection(kind)
      .where("date", ">=", weekKey)
      .where("date", "<", endKey);
  return Promise.all([
    tx.get(user),
    tx.get(user.collection("programState").doc("current")),
    tx.get(inWeek("workouts")),
    tx.get(inWeek("runs")),
  ]);
}

/**
 * Recompute one member's standing in their group, from the sources, in a
 * transaction. Writes only while the person is still in the group, still
 * opted in and not being deleted, and only when a figure changed.
 */
async function writeStanding(db, uid, groupId, weekKey, { now, weekIsCurrent }) {
  const groupRef = db.collection(GROUPS).doc(groupId);
  const standingRef = groupRef.collection(STANDINGS).doc(uid);
  const memberRef = db.collection(MEMBERS).doc(uid);
  return db.runTransaction(async (tx) => {
    const [group, member, stored, live, sources] = await Promise.all([
      tx.get(groupRef),
      tx.get(memberRef),
      tx.get(standingRef),
      transactionAccountsLive({ firestore: db, tx, uids: [uid] }),
      sourceReads(db, tx, uid, weekKey),
    ]);
    const [user, programState, workouts, runs] = sources;
    if (!live || !group.exists || !member.exists) return { written: false };
    const g = group.data() || {};
    const m = member.data() || {};
    if (g.settledAt || g.weekKey !== weekKey) return { written: false };
    if (!(g.memberUids || []).includes(uid) || m.groupId !== groupId)
      return { written: false };
    if (!user.exists || user.data().leagueOptIn !== true) return { written: false };
    const prev = stored.exists ? stored.data() : null;
    const figures = standingFigures({
      profile: user.data(),
      programState: programState.exists ? programState.data() : null,
      workouts: workouts.docs.map((d) => d.data()),
      runs: runs.docs.map((d) => d.data()),
      weekKey,
      stored: prev,
      weekIsCurrent:
        typeof weekIsCurrent === "boolean"
          ? weekIsCurrent
          : currentWeek(user.data().timezone, now).weekKey === weekKey,
      now,
    });
    if (
      prev &&
      prev.done === figures.done &&
      prev.planned === figures.planned &&
      prev.points === figures.points
    )
      return { written: false };
    tx.set(
      standingRef,
      { uid, ...figures, updatedAt: new Date(now) },
      { merge: true }
    );
    return { written: true };
  });
}

/**
 * For a session trigger: the member's standing in their current group,
 * when one of the days the event touched is in that group's week.
 */
async function refreshLeagueStanding(db, uid, activityDays, { now = Date.now() } = {}) {
  const days = (activityDays || []).filter(isValidDateKey);
  if (!uid || days.length === 0) return { written: false };
  const member = await db.collection(MEMBERS).doc(uid).get();
  if (!member.exists) return { written: false };
  const { groupId, weekKey } = member.data() || {};
  if (typeof groupId !== "string" || !groupId || !isValidDateKey(weekKey))
    return { written: false };
  if (!days.some((day) => weekKeyOf(day) === weekKey)) return { written: false };
  if (
    !(await accountDeletionLocks.shouldSystemWriteProceed(db, uid, "leagueStanding"))
  )
    return { written: false };
  return writeStanding(db, uid, groupId, weekKey, { now });
}

/** How many people have joined and trained in the last ACTIVE_DAYS days. */
async function countJoined(db, now) {
  const cutoff = new Date(now - rules.ACTIVE_DAYS * DAY_MS);
  const snap = await db
    .collection("users")
    .where("leagueOptIn", "==", true)
    .where("lastActiveAt", ">=", cutoff)
    .count()
    .get();
  return snap.data().count;
}

/** The figure's count, refreshed after a join or a leave. */
async function refreshJoinedCount(db, { now = Date.now() } = {}) {
  const joined = await countJoined(db, now);
  await db
    .collection(STATUS)
    .doc(STATUS_DOC)
    .set(
      { joined, needed: rules.GROUP_MIN, updatedAt: new Date(now) },
      { merge: true }
    );
  return joined;
}

/**
 * The person's answer (the setLeagueSharing callable). Joining stores the
 * answer and a Bronze membership with no group yet: groups are made on
 * Monday. Leaving stores the answer, deletes their standing, takes them out
 * of their group's members and deletes their membership, all at once.
 */
async function setLeagueSharing(db, uid, join, { now = Date.now() } = {}) {
  const userRef = db.collection("users").doc(uid);
  const memberRef = db.collection(MEMBERS).doc(uid);
  await db.runTransaction(async (tx) => {
    const member = await tx.get(memberRef);
    const m = member.exists ? member.data() || {} : {};
    const groupRef =
      !join && typeof m.groupId === "string" && m.groupId
        ? db.collection(GROUPS).doc(m.groupId)
        : null;
    const group = groupRef ? await tx.get(groupRef) : null;
    tx.set(userRef, { leagueOptIn: join }, { merge: true });
    if (join) {
      if (!member.exists) {
        tx.set(memberRef, {
          uid,
          tier: rules.STARTING_TIER,
          groupId: null,
          weekKey: null,
          joinedAt: new Date(now),
        });
      }
      return;
    }
    if (group && group.exists) {
      const memberUids = (group.data().memberUids || []).filter((u) => u !== uid);
      tx.update(groupRef, { memberUids, size: memberUids.length });
      tx.delete(groupRef.collection(STANDINGS).doc(uid));
    }
    if (member.exists) tx.delete(memberRef);
  });
  return { joined: await refreshJoinedCount(db, { now }) };
}

/* ── The turn ─────────────────────────────────────────────────────── */

/**
 * Settle one group: recompute every standing (the plan's figure kept,
 * the week being over), rank, and write each member's result and new tier
 * in one transaction that marks the group settled. Then each member is
 * told, and the group and its standings are deleted. A group already
 * settled is told and deleted only, so a second run neither writes a
 * result twice nor sends a second notification (`notify` is keyed on the
 * week).
 */
async function settleOneGroup(db, groupRef, weekKey, { now, notify }) {
  const first = await groupRef.get();
  if (!first.exists) return { results: 0 };
  const memberUids = (first.data().memberUids || []).slice();
  if (!first.data().settledAt) {
    // Side by side: each standing is its own document and its transaction
    // only reads the group, so members do not contend. One at a time, a
    // turn of a few thousand people ran past the function's 540 s.
    await inBatches(memberUids, CONCURRENCY, (uid) =>
      writeStanding(db, uid, groupRef.id, weekKey, {
        now,
        weekIsCurrent: false,
      })
    );
  }

  const results = await db.runTransaction(async (tx) => {
    const group = await tx.get(groupRef);
    if (!group.exists) return [];
    const g = group.data() || {};
    const uids = g.memberUids || [];
    const [standings, members, lives] = await Promise.all([
      Promise.all(uids.map((u) => tx.get(groupRef.collection(STANDINGS).doc(u)))),
      Promise.all(uids.map((u) => tx.get(db.collection(MEMBERS).doc(u)))),
      Promise.all(
        uids.map((u) => transactionAccountsLive({ firestore: db, tx, uids: [u] }))
      ),
    ]);
    const ranked = rules.settleGroup(
      standings
        .filter((s) => s.exists)
        .map((s) => {
          const d = s.data() || {};
          return {
            uid: s.id,
            tier: d.tier,
            points: d.points,
            reachedAt: d.reachedAt,
          };
        })
    );
    if (g.settledAt) return ranked.filter((r) => lives[uids.indexOf(r.uid)]);
    const settled = [];
    for (const result of ranked) {
      const i = uids.indexOf(result.uid);
      if (!lives[i]) continue;
      tx.set(
        db.collection("users").doc(result.uid).collection(RESULTS).doc(weekKey),
        { weekKey, ...result, settledAt: new Date(now) }
      );
      const member = members[i];
      if (member.exists && (member.data() || {}).groupId === groupRef.id) {
        tx.set(
          member.ref,
          { tier: result.newTier, groupId: null, weekKey: null },
          { merge: true }
        );
      }
      settled.push(result);
    }
    tx.update(groupRef, { settledAt: new Date(now) });
    return settled;
  });

  if (notify) {
    for (const result of results) {
      // One person's notification failing must not stop the week: the
      // result is already written, and the turn would fail on it again
      // at every retry, leaving the week's groups unformed.
      try {
        await notify(result.uid, { ...result, weekKey });
      } catch (err) {
        console.error(
          `leagues: could not tell ${result.uid} their ${weekKey} result:`,
          err && err.message ? err.message : String(err)
        );
      }
    }
  }
  const standings = await groupRef.collection(STANDINGS).get();
  const batch = db.batch();
  standings.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(groupRef);
  await batch.commit();
  return { results: results.length };
}

/** Settle every group of `weekKey`, and any of an earlier week still
 *  standing: a turn cut off part way leaves its unsettled groups behind,
 *  and the next turn's week is a later one, so settling only `weekKey`
 *  would leave them, and their members' places, for good. Each group is
 *  settled in its own week. */
async function settleWeek(db, weekKey, { now, notify }) {
  const groups = await db.collection(GROUPS).where("weekKey", "<=", weekKey).get();
  let results = 0;
  await inBatches(groups.docs, GROUP_CONCURRENCY, async (group) => {
    const own = (group.data() || {}).weekKey;
    const out = await settleOneGroup(
      db,
      group.ref,
      typeof own === "string" ? own : weekKey,
      { now, notify }
    );
    results += out.results;
  });
  return { groups: groups.docs.length, results };
}

/** Everyone who joined and trained in the last ACTIVE_DAYS days, with their
 *  tier: `{ joined, people }`, `joined` the figure's count and `people`
 *  those who may be placed (not restricted, not discovery-hidden). */
async function eligiblePeople(db, { now, isHidden }) {
  const cutoff = now - rules.ACTIVE_DAYS * DAY_MS;
  const snap = await db.collection("users").where("leagueOptIn", "==", true).get();
  const active = snap.docs
    .filter((d) => rules.millis((d.data() || {}).lastActiveAt) >= cutoff)
    .map((d) => d.id);
  const people = [];
  await inBatches(active, CONCURRENCY, async (uid) => {
    if (isHidden(uid)) return;
    if (await isRestricted(db, uid)) return;
    const member = await db.collection(MEMBERS).doc(uid).get();
    const tier = rules.normaliseTier(member.exists ? member.data().tier : null);
    people.push({ uid, tier });
  });
  return { joined: active.length, people };
}

/** Every blocked pair among `uids`, either way round, as pair keys. Each
 *  person's own list and the server's copy of who blocked them are both
 *  read, so a block is seen from either end. */
async function blockedPairsAmong(db, uids) {
  const among = new Set(uids);
  const pairs = new Set();
  await inBatches(uids, CONCURRENCY, async (uid) => {
    const [mine, theirs] = await Promise.all([
      db.collection("blocks").doc(uid).collection("users").get(),
      db.collection("blockedBy").doc(uid).collection("users").get(),
    ]);
    for (const d of [...mine.docs, ...theirs.docs]) {
      if (d.id !== uid && among.has(d.id)) pairs.add(rules.pairKey(uid, d.id));
    }
  });
  return pairs;
}

/**
 * Place one member: their membership points at the group and their
 * standing is computed from the sessions saved so far. Someone who left or
 * is being deleted since the groups were drawn is taken out of the group.
 */
async function placeMember(db, groupRef, uid, tier, weekKey, now) {
  const memberRef = db.collection(MEMBERS).doc(uid);
  const standingRef = groupRef.collection(STANDINGS).doc(uid);
  const publicRef = db.collection("users").doc(uid).collection("public").doc("profile");
  return db.runTransaction(async (tx) => {
    const [group, member, stored, profile, live, sources] = await Promise.all([
      tx.get(groupRef),
      tx.get(memberRef),
      tx.get(standingRef),
      tx.get(publicRef),
      transactionAccountsLive({ firestore: db, tx, uids: [uid] }),
      sourceReads(db, tx, uid, weekKey),
    ]);
    const [user, programState, workouts, runs] = sources;
    if (!group.exists) return false;
    const uids = group.data().memberUids || [];
    if (!uids.includes(uid)) return false;
    const optedIn = user.exists && user.data().leagueOptIn === true;
    if (!live || !optedIn) {
      const rest = uids.filter((u) => u !== uid);
      tx.update(groupRef, { memberUids: rest, size: rest.length });
      if (stored.exists) tx.delete(standingRef);
      return false;
    }
    const memberTier = rules.normaliseTier(member.exists ? member.data().tier : tier);
    tx.set(
      memberRef,
      {
        uid,
        tier: memberTier,
        groupId: groupRef.id,
        weekKey,
        ...(member.exists ? {} : { joinedAt: new Date(now) }),
      },
      { merge: true }
    );
    const prev = stored.exists ? stored.data() : null;
    const figures = standingFigures({
      profile: user.data(),
      programState: programState.exists ? programState.data() : null,
      workouts: workouts.docs.map((d) => d.data()),
      runs: runs.docs.map((d) => d.data()),
      weekKey,
      stored: prev,
      weekIsCurrent: true,
      now,
    });
    tx.set(standingRef, {
      uid,
      ...standingIdentity(profile.exists ? profile.data() : null),
      tier: memberTier,
      ...figures,
      updatedAt: new Date(now),
    });
    return true;
  });
}

/**
 * Form `weekKey`'s groups. Two steps, each safe to run again: the groups
 * are drawn and written (the draw is the plan, written whole before anyone
 * is placed, and a second draw replaces a first that never finished), then
 * each member is placed from what was drawn.
 */
async function formWeek(db, weekKey, { now, rng, isHidden, markerRef }) {
  const marker = (await markerRef.get()).data() || {};
  let drawn = marker.drawn || null;
  let joined = marker.joined ?? null;
  if (!drawn) {
    const eligible = await eligiblePeople(db, { now, isHidden });
    joined = eligible.joined;
    const stale = await db.collection(GROUPS).where("weekKey", "==", weekKey).get();
    let groups = [];
    let unplaced = eligible.people.map((p) => p.uid);
    if (eligible.people.length >= rules.GROUP_MIN) {
      const pairs = await blockedPairsAmong(
        db,
        eligible.people.map((p) => p.uid)
      );
      ({ groups, unplaced } = rules.formGroups(eligible.people, {
        isBlockedPair: (a, b) => pairs.has(rules.pairKey(a, b)),
        rng,
      }));
    }
    const ids = groups.map((_, i) => `${weekKey}-${String(i + 1).padStart(3, "0")}`);
    const writes = [];
    stale.docs.forEach((d) => {
      if (!ids.includes(d.id)) writes.push((batch) => batch.delete(d.ref));
    });
    groups.forEach((group, i) => {
      writes.push((batch) =>
        batch.set(db.collection(GROUPS).doc(ids[i]), {
          weekKey,
          tier: group.tier,
          memberUids: group.memberUids,
          size: group.memberUids.length,
          createdAt: new Date(now),
        })
      );
    });
    await commitInChunks(db, writes);
    drawn = { groups: ids.length, unplaced: unplaced.length };
    await markerRef.set({ drawn, joined }, { merge: true });
  }

  const groups = await db.collection(GROUPS).where("weekKey", "==", weekKey).get();
  let placed = 0;
  // Groups side by side; a group's members one at a time, since each may
  // take themselves out of the group's list.
  await inBatches(groups.docs, GROUP_CONCURRENCY, async (group) => {
    const g = group.data() || {};
    for (const uid of (g.memberUids || []).slice()) {
      if (await placeMember(db, group.ref, uid, g.tier, weekKey, now)) placed += 1;
    }
  });
  return { groups: groups.docs.length, placed, unplaced: drawn.unplaced, joined };
}

/**
 * The week's turn (weeklyLeagueTurn), keyed by this week's Monday in
 * leagueWeeks/{weekKey}: (a) settle last week, (b) form this week, (c)
 * write the figure. Each of (a) and (b) is marked done once it finishes,
 * and each is safe to run again if a run stops part way, so running the
 * turn twice does nothing twice. The schedule runs it again each hour on
 * Monday, so a run cut off part way is finished the same day; once the
 * week is finished a run does nothing at all, since the figure's count
 * has moved on with each join and leave since (refreshJoinedCount).
 */
async function runLeagueTurn(
  db,
  { now = Date.now(), rng = Math.random, isHidden = () => false, notify } = {}
) {
  const weekKey = turnWeekKey(now);
  const lastWeek = addDays(weekKey, -7);
  const markerRef = db.collection(WEEKS).doc(weekKey);
  const marker = (await markerRef.get()).data() || {};
  const summary = { weekKey, settled: marker.settled || null, formed: marker.formed || null };
  if (marker.finishedAt) return { ...summary, alreadyFinished: true };

  if (!marker.settled) {
    summary.settled = await settleWeek(db, lastWeek, { now, notify });
    await markerRef.set(
      { weekKey, settledWeekKey: lastWeek, settled: summary.settled, settledAt: new Date(now) },
      { merge: true }
    );
  }
  if (!marker.formed) {
    summary.formed = await formWeek(db, weekKey, { now, rng, isHidden, markerRef });
    await markerRef.set(
      { formed: summary.formed, formedAt: new Date(now) },
      { merge: true }
    );
  }
  const open = (summary.formed && summary.formed.groups > 0) || false;
  await db
    .collection(STATUS)
    .doc(STATUS_DOC)
    .set({
      joined: (summary.formed && summary.formed.joined) ?? 0,
      needed: rules.GROUP_MIN,
      open,
      weekKey: open ? weekKey : null,
      updatedAt: new Date(now),
    });
  await markerRef.set({ finishedAt: new Date(now) }, { merge: true });
  return summary;
}

/* ── Account deletion ─────────────────────────────────────────────── */

/**
 * Everything of a deleted account's in the leagues: its standing and its
 * place in every group that lists it, and its membership. Its results go
 * with users/{uid} (USER_SUBCOLLECTIONS).
 */
async function removeLeagueTraces(db, uid) {
  const groups = await db
    .collection(GROUPS)
    .where("memberUids", "array-contains", uid)
    .get();
  for (const group of groups.docs) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(group.ref);
      if (!fresh.exists) return;
      const memberUids = (fresh.data().memberUids || []).filter((u) => u !== uid);
      tx.update(group.ref, { memberUids, size: memberUids.length });
      tx.delete(group.ref.collection(STANDINGS).doc(uid));
    });
  }
  await db.doc(`${MEMBERS}/${uid}`).delete();
  return { groups: groups.docs.length };
}

module.exports = {
  MEMBERS,
  GROUPS,
  STANDINGS,
  RESULTS,
  WEEKS,
  STATUS,
  STATUS_DOC,
  LEAGUE_SENDER,
  turnWeekKey,
  leagueFirstName,
  standingIdentity,
  standingFigures,
  writeStanding,
  refreshLeagueStanding,
  countJoined,
  refreshJoinedCount,
  setLeagueSharing,
  settleWeek,
  eligiblePeople,
  blockedPairsAmong,
  formWeek,
  runLeagueTurn,
  removeLeagueTraces,
};

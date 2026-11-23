"use strict";

/**
 * Segments (Run26 call 3): what is stored, who writes it and who sees it.
 *
 * A runner makes a segment from a stretch of one of their own saved runs.
 * Every run saved after that is matched to the segments it could have run
 * (lib/segmentMatch.js), and each match is an effort. A run's page shows
 * its efforts; a segment's page shows the person's own efforts and a board
 * of the people they follow who have run it. There is no board of
 * everyone and no crown (Run26 call 3).
 *
 * WHAT IS STORED
 *
 *   segments/{segmentId}
 *       { name, lengthMeters, points, start, end, startCell, bbox,
 *         createdAtMs }. Read one at a time by anyone signed in, since
 *       anyone's run may be timed on it; never listed. It names nobody:
 *       its line is a stretch of the maker's run, and who runs where is
 *       theirs to share.
 *   segmentOwners/{segmentId}
 *       { uid, sourceRunId, createdAtMs }: who made it. Its owner reads it
 *       (the app's Delete); nobody else does.
 *   users/{uid}/segmentEfforts/{effortId}
 *       { uid, segmentId, runId, lap, elapsedSeconds, startedAtMs, day,
 *         start, end, createdAtMs }: every effort the person made, private
 *         or not. Their own to read; written only here.
 *   segments/{segmentId}/board/{uid}
 *       The runner's fastest effort on the segment that may be shown to
 *       the people who follow them, with the post it came from. Server
 *       only: the board is read through `readSegmentBoard`, which checks
 *       everything again as it reads.
 *
 * WHAT REACHES A BOARD. An effort is shown only to people who follow the
 * runner (an accepted follow: `following/` holds no requests), and only:
 *   - from a run shared with followers or with everyone: the run's
 *     `sharedActivityId` names a post of theirs whose visibility is
 *     `followers` or `public`. A run never shared, or shared privately, is
 *     seen by nobody else, so neither are its efforts. Strava keeps an
 *     "Only You" activity off every leaderboard;
 *   - when neither its start nor its end lies in one of the runner's
 *     privacy zones. Strava keeps such a match "private": visible on your
 *     own activity, never on a leaderboard (Strava support, "Segment
 *     Matching Issues");
 *   - with no block between the viewer and the runner either way, and
 *     when the runner is not restricted.
 * The first two are judged when the entry is written (`refreshBoardEntry`,
 * after every change to the runner's efforts, the run's post link or their
 * zones) and all four again on every read, so a post made private, a zone
 * drawn or a block made hides the entry at once.
 *
 * WHAT IS MATCHED. A run saved after the segment, from its trace as saved
 * (500 points at most), when it is a GPS run that counts
 * (`isVolumeEligibleRun`, not on a treadmill). The run is compared only
 * with the segments that start in a cell it passes (`traceCells`, about
 * 1.2 km by 0.6 km) and whose box fits its own (`boxCouldMatch`). A segment
 * whose maker is restricted times nobody else's runs: a restriction
 * refuses adding to what other people see. A new segment is matched with
 * its maker's own last BACKFILL_RUNS runs; other people's earlier runs are
 * not searched.
 *
 * DELETION. Deleting a run deletes its efforts and recomputes the boards
 * they were on (`removeRunEfforts`). Deleting a segment deletes it, every
 * effort on it in everyone's tree, its board and its owner record, the
 * owner record last so a failed attempt can be tried again
 * (`removeSegment`). Deleting an account does that for every segment it
 * made and deletes its board entries everywhere
 * (`removeSegmentTracesForUser`); its own efforts go with its tree
 * (USER_SUBCOLLECTIONS in accountDeletion.js).
 *
 * IDEMPOTENCY. An effort's id is `{runId}_{segmentId}_{lap}`, so a retried
 * trigger writes the same documents. A board entry is recomputed from the
 * runner's efforts in a transaction, never adjusted. Every write reads the
 * account's deletion state in the transaction that makes it.
 */

const { isVolumeEligibleRun, isTreadmillRun } = require("./runEligibility");
const { sourceActivityDateKey } = require("./challengeActivityWindow");
const { transactionAccountsLive } = require("./deletionTransactionGuard");
const { displayNameRefusal } = require("./objectionableText");
const { isDocumentId } = require("./documentId");
const { carriedName } = require("./identityResync");
const { publicPhotoUrl } = require("./publicPhotoUrl");
const { RESTRICTED_MESSAGE, RESTRICTED_REASON } = require("./restriction");
const {
  SEGMENT_NAME_MAX,
  haversine,
  traceCells,
  stretchOf,
  segmentShape,
} = require("./segmentGeometry");
const {
  ENDPOINT_TOLERANCE_M,
  traceOf,
  matchSegment,
  boxCouldMatch,
} = require("./segmentMatch");

const SEGMENTS = "segments";
const BOARD = "board";
const OWNERS = "segmentOwners";
const EFFORTS = "segmentEfforts";

/** A post's visibilities that the people following its author can see. */
const SHOWN_VISIBILITIES = Object.freeze(["followers", "public"]);

/** The most segments one account can make. A Tropos heuristic: far more
 *  than a runner's own routes, few enough that one account cannot fill a
 *  city. */
const MAX_SEGMENTS_PER_ACCOUNT = 200;
/** How many of the maker's own latest runs a new segment is matched with. */
const BACKFILL_RUNS = 50;
/** How many of a runner's fastest efforts on a segment are looked through
 *  for one that may be shown. */
const BOARD_SCAN = 50;
/** The most rows a board returns. */
const BOARD_MAX_ROWS = 100;
/** The most efforts one run writes, across every segment. */
const MAX_EFFORTS_PER_RUN_TOTAL = 400;
/** A privacy zone's radius when its document has none, as the app reads
 *  one (src/hooks/usePrivacyZones.ts). */
const DEFAULT_ZONE_RADIUS_M = 500;
/** Firestore's limit on an `in` query's values. */
const IN_LIMIT = 30;
const BATCH_WRITES = 400;

/** A refusal the callables pass on: `code` is the HttpsError's. */
function refusal(code, message) {
  const err = new Error(message);
  err.code = code;
  err.refusal = true;
  return err;
}

const REFUSALS = Object.freeze({
  noName: "Give the segment a name.",
  longName: `A name can be at most ${SEGMENT_NAME_MAX} characters.`,
  noRun: "That run isn’t saved any more.",
  notGps: "A segment is made from an outdoor run with GPS.",
  invalidRun: "A run saved despite invalid figures can’t make a segment.",
  zone: "A segment can’t pass through one of your privacy zones.",
  tooMany: `You can make up to ${MAX_SEGMENTS_PER_ACCOUNT} segments. Delete one to make another.`,
  notYours: "That segment isn’t there any more.",
});

const segmentsCol = (db) => db.collection(SEGMENTS);
const ownersCol = (db) => db.collection(OWNERS);
const boardCol = (db, segmentId) =>
  segmentsCol(db).doc(segmentId).collection(BOARD);
/** The person's efforts. Spelled out, not built from a constant, so the
 *  account-deletion sweep's guard (accountDeletionSubcollections.test.js)
 *  can read the path. */
function efforts(db, uid) {
  return db.collection("users").doc(uid).collection("segmentEfforts");
}
const zonesCol = (db, uid) =>
  db.collection("users").doc(uid).collection("privacyZones");

function effortId(runId, segmentId, lap) {
  return `${runId}_${segmentId}_${lap}`;
}

/** Whether a saved run is matched to segments at all. */
function isMatchableRun(data) {
  return (
    !!data &&
    isVolumeEligibleRun(data) &&
    !isTreadmillRun(data) &&
    Array.isArray(data.points) &&
    data.points.length > 1
  );
}

/** A privacy zone as the app reads one, or null. */
function zoneOf(data) {
  if (!data || typeof data.lat !== "number" || typeof data.lon !== "number")
    return null;
  if (!Number.isFinite(data.lat) || !Number.isFinite(data.lon)) return null;
  const radius =
    typeof data.radiusMeters === "number" && data.radiusMeters > 0
      ? data.radiusMeters
      : DEFAULT_ZONE_RADIUS_M;
  return { lat: data.lat, lon: data.lon, radius };
}

function inAnyZone(point, zones) {
  if (!point || typeof point.lat !== "number" || typeof point.lon !== "number")
    return true; // an end that can't be placed can't be shown to be outside
  return zones.some(
    (z) => haversine(point.lat, point.lon, z.lat, z.lon) <= z.radius
  );
}

function zonesFrom(snap) {
  return snap.docs.map((d) => zoneOf(d.data())).filter(Boolean);
}

/** An effort as stored, or null when it can't be read. */
function effortOf(doc) {
  const data = doc.data() || {};
  if (
    typeof data.elapsedSeconds !== "number" ||
    !(data.elapsedSeconds > 0) ||
    typeof data.runId !== "string"
  )
    return null;
  return { id: doc.id, ...data };
}

/** Fastest first; of two the same, the earlier. */
function fasterFirst(a, b) {
  return (
    a.elapsedSeconds - b.elapsedSeconds ||
    (a.startedAtMs || 0) - (b.startedAtMs || 0)
  );
}

/** A segment's name as it is kept, or the refusal. */
function segmentName(value) {
  const name =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!name) throw refusal("invalid-argument", REFUSALS.noName);
  if ([...name].length > SEGMENT_NAME_MAX)
    throw refusal("invalid-argument", REFUSALS.longName);
  const objectionable = displayNameRefusal(name);
  if (objectionable) throw refusal("failed-precondition", objectionable);
  return name;
}

/* ───────────── Matching ───────────── */

/** The segments that start in any of `cells`. */
async function segmentsStartingIn(db, cells) {
  const found = [];
  for (let i = 0; i < cells.length; i += IN_LIMIT) {
    const snap = await segmentsCol(db)
      .where("startCell", "in", cells.slice(i, i + IN_LIMIT))
      .get();
    for (const doc of snap.docs) found.push({ id: doc.id, data: doc.data() });
  }
  return found;
}

/**
 * Of the segments a run matched, the ones it may be timed on: those still
 * owned (a segment part way through deletion has lost nothing else yet,
 * but its owner record goes last), made by the runner or by someone who is
 * not restricted.
 */
async function segmentsOpenTo(db, uid, segmentIds) {
  if (segmentIds.length === 0) return new Set();
  const owners = await db.getAll(
    ...segmentIds.map((id) => ownersCol(db).doc(id))
  );
  const ownerOf = new Map();
  owners.forEach((snap, i) => {
    const owner = snap.exists ? snap.data().uid : null;
    if (typeof owner === "string" && owner) ownerOf.set(segmentIds[i], owner);
  });
  const others = [...new Set([...ownerOf.values()])].filter((o) => o !== uid);
  const restricted = new Set();
  if (others.length > 0) {
    const snaps = await db.getAll(
      ...others.map((o) => db.collection("globalRestrictedUids").doc(o))
    );
    snaps.forEach((snap, i) => {
      if (snap.exists) restricted.add(others[i]);
    });
  }
  return new Set(
    segmentIds.filter((id) => {
      const owner = ownerOf.get(id);
      return !!owner && (owner === uid || !restricted.has(owner));
    })
  );
}

/** Writes one run's efforts on the segments in `matches`, replacing any it
 *  had, in one transaction that reads the account's deletion state and
 *  each segment (one deleted meanwhile takes none). */
async function writeRunEfforts(db, { uid, runId, data, matches, nowMs }) {
  const day = sourceActivityDateKey(data);
  return db.runTransaction(async (tx) => {
    const [live, existing, ...segmentSnaps] = await Promise.all([
      transactionAccountsLive({ firestore: db, tx, uids: [uid] }),
      tx.get(efforts(db, uid).where("runId", "==", runId)),
      ...matches.map((m) => tx.get(segmentsCol(db).doc(m.segmentId))),
    ]);
    if (!live) return [];
    const written = new Set();
    const kept = [];
    let count = 0;
    matches.forEach((m, i) => {
      if (!segmentSnaps[i].exists) return;
      const shown = [];
      for (const e of m.efforts) {
        if (count >= MAX_EFFORTS_PER_RUN_TOTAL) break;
        const id = effortId(runId, m.segmentId, e.lap);
        tx.set(efforts(db, uid).doc(id), {
          uid,
          segmentId: m.segmentId,
          runId,
          lap: e.lap,
          elapsedSeconds: e.elapsedSeconds,
          startedAtMs: e.startMs,
          day: day || null,
          start: e.start,
          end: e.end,
          createdAtMs: nowMs,
        });
        written.add(id);
        shown.push(id);
        count += 1;
      }
      if (shown.length > 0) kept.push(m.segmentId);
    });
    for (const doc of existing.docs) {
      if (!written.has(doc.id)) tx.delete(doc.ref);
    }
    return kept;
  });
}

/**
 * Matches a saved run to every segment it ran and records its efforts,
 * then recomputes the runner's board entries on those segments. Called by
 * onRunCreated; safe to run again.
 *
 * @returns {Promise<{ segmentIds: string[] }>}
 */
async function matchRunToSegments(db, { uid, runId, data, nowMs = Date.now() }) {
  if (!uid || !runId || !isMatchableRun(data)) return { segmentIds: [] };
  const trace = traceOf(data.points);
  if (trace.length < 2) return { segmentIds: [] };
  const cells = traceCells(trace, ENDPOINT_TOLERANCE_M + 10);
  const candidates = await segmentsStartingIn(db, cells);
  const matched = [];
  for (const segment of candidates) {
    if (!boxCouldMatch(segment.data.bbox, trace)) continue;
    const found = matchSegment(segment.data, trace);
    if (found.length > 0) matched.push({ segmentId: segment.id, efforts: found });
  }
  if (matched.length === 0) return { segmentIds: [] };
  const open = await segmentsOpenTo(
    db,
    uid,
    matched.map((m) => m.segmentId)
  );
  const matches = matched.filter((m) => open.has(m.segmentId));
  const segmentIds = await writeRunEfforts(db, {
    uid,
    runId,
    data,
    matches,
    nowMs,
  });
  for (const segmentId of segmentIds)
    await refreshBoardEntry(db, uid, segmentId, { nowMs });
  return { segmentIds };
}

/** The segments a run has efforts on. */
async function segmentIdsOfRun(db, uid, runId) {
  const snap = await efforts(db, uid).where("runId", "==", runId).get();
  return { snap, segmentIds: [...new Set(snap.docs.map((d) => d.data().segmentId))] };
}

/**
 * Deletes a deleted run's efforts and recomputes the boards they were on.
 * Called by onRunDeleted.
 */
async function removeRunEfforts(db, { uid, runId, nowMs = Date.now() }) {
  if (!uid || !runId) return { removed: 0 };
  const { snap, segmentIds } = await segmentIdsOfRun(db, uid, runId);
  for (let i = 0; i < snap.docs.length; i += BATCH_WRITES) {
    const batch = db.batch();
    snap.docs.slice(i, i + BATCH_WRITES).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  for (const segmentId of segmentIds)
    if (typeof segmentId === "string" && segmentId)
      await refreshBoardEntry(db, uid, segmentId, { nowMs });
  return { removed: snap.docs.length };
}

/**
 * Recomputes the board entries for every segment a run has efforts on:
 * after its post link changes (shared, or the share taken back) or its
 * validity does. Called by onRunUpdated.
 */
async function refreshRunBoardEntries(db, { uid, runId, nowMs = Date.now() }) {
  if (!uid || !runId) return { segmentIds: [] };
  const { segmentIds } = await segmentIdsOfRun(db, uid, runId);
  for (const segmentId of segmentIds)
    if (typeof segmentId === "string" && segmentId)
      await refreshBoardEntry(db, uid, segmentId, { nowMs });
  return { segmentIds };
}

/** Whether an edit to a saved run can change which of its efforts may be
 *  shown: its post link, or what makes it count. */
function boardMayHaveChanged(before, after) {
  const b = before || {};
  const a = after || {};
  return (
    (b.sharedActivityId || null) !== (a.sharedActivityId || null) ||
    isVolumeEligibleRun(b) !== isVolumeEligibleRun(a)
  );
}

/** Recomputes every board entry the person has: after a privacy zone is
 *  drawn, moved or removed. Called by onPrivacyZoneWritten. */
async function refreshAllBoardEntries(db, uid, { nowMs = Date.now() } = {}) {
  if (!uid) return { segmentIds: [] };
  const snap = await efforts(db, uid).select("segmentId").get();
  const segmentIds = [
    ...new Set(snap.docs.map((d) => d.data().segmentId)),
  ].filter((id) => typeof id === "string" && id);
  for (const segmentId of segmentIds)
    await refreshBoardEntry(db, uid, segmentId, { nowMs });
  return { segmentIds };
}

/** The id of the run's post when the people following its author may see
 *  it, else null. Read in the transaction, each run and post once. */
async function shownPostOf(tx, db, uid, runId, cache) {
  if (cache.has(runId)) return cache.get(runId);
  let post = null;
  const run = isDocumentId(runId)
    ? await tx.get(db.collection("users").doc(uid).collection("runs").doc(runId))
    : null;
  const data = run && run.exists ? run.data() : null;
  const activityId = data && data.sharedActivityId;
  if (data && isVolumeEligibleRun(data) && isDocumentId(activityId)) {
    const activity = await tx.get(db.collection("activities").doc(activityId));
    const a = activity.exists ? activity.data() : null;
    if (
      a &&
      a.authorId === uid &&
      SHOWN_VISIBILITIES.includes(a.visibility)
    )
      post = activityId;
  }
  cache.set(runId, post);
  return post;
}

/**
 * Writes the runner's board entry on a segment from their efforts as they
 * are now: the fastest one from a run shared with followers or everyone
 * whose ends are outside the runner's privacy zones, or no entry at all.
 */
async function refreshBoardEntry(db, uid, segmentId, { nowMs = Date.now() } = {}) {
  if (!uid || !isDocumentId(segmentId)) return { written: false };
  const segmentRef = segmentsCol(db).doc(segmentId);
  const entryRef = boardCol(db, segmentId).doc(uid);
  return db.runTransaction(async (tx) => {
    const [live, segmentSnap, entrySnap, effortsSnap, zonesSnap] =
      await Promise.all([
        transactionAccountsLive({ firestore: db, tx, uids: [uid] }),
        tx.get(segmentRef),
        tx.get(entryRef),
        tx.get(efforts(db, uid).where("segmentId", "==", segmentId)),
        tx.get(zonesCol(db, uid)),
      ]);
    if (!live) return { written: false };
    let best = null;
    if (segmentSnap.exists) {
      const zones = zonesFrom(zonesSnap);
      const ranked = effortsSnap.docs
        .map(effortOf)
        .filter(Boolean)
        .sort(fasterFirst)
        .slice(0, BOARD_SCAN);
      const posts = new Map();
      for (const effort of ranked) {
        if (inAnyZone(effort.start, zones) || inAnyZone(effort.end, zones))
          continue;
        const activityId = await shownPostOf(tx, db, uid, effort.runId, posts);
        if (!activityId) continue;
        best = { effort, activityId };
        break;
      }
    }
    if (best) {
      const { effort, activityId } = best;
      tx.set(entryRef, {
        uid,
        segmentId,
        effortId: effort.id,
        runId: effort.runId,
        activityId,
        elapsedSeconds: effort.elapsedSeconds,
        startedAtMs: effort.startedAtMs || null,
        day: effort.day || null,
        start: effort.start,
        end: effort.end,
        updatedAtMs: nowMs,
      });
      return { written: true };
    }
    if (entrySnap.exists) tx.delete(entryRef);
    return { written: false };
  });
}

/* ───────────── The board ───────────── */

async function countOf(query) {
  const snap = await query.count().get();
  return Number(snap.data().count) || 0;
}

/**
 * The board of a segment as `viewerUid` may see it: the fastest shown
 * effort of each person they follow who has run it, fastest first, at
 * most BOARD_MAX_ROWS. The viewer's own row is the app's to add from their
 * own efforts. Null when there is no such segment.
 *
 * Reads whichever is shorter, the board or the viewer's following list,
 * so neither a popular segment nor a long list makes every view expensive.
 */
async function readSegmentBoard(db, { viewerUid, segmentId }) {
  if (!viewerUid || !isDocumentId(segmentId)) return null;
  const segmentSnap = await segmentsCol(db).doc(segmentId).get();
  if (!segmentSnap.exists) return null;
  const board = boardCol(db, segmentId);
  const following = db.collection("following").doc(viewerUid).collection("users");
  const [followingCount, boardCount] = await Promise.all([
    countOf(following),
    countOf(board),
  ]);
  if (followingCount === 0 || boardCount === 0) return { entries: [] };

  let rows = [];
  if (boardCount <= followingCount) {
    const snap = await board.get();
    const others = snap.docs.filter((d) => d.id !== viewerUid);
    if (others.length > 0) {
      const edges = await db.getAll(...others.map((d) => following.doc(d.id)));
      rows = others
        .filter((_, i) => edges[i].exists)
        .map((d) => ({ ...d.data(), uid: d.id }));
    }
  } else {
    const followed = (await following.get()).docs
      .map((d) => d.id)
      .filter((id) => id !== viewerUid && isDocumentId(id));
    for (let i = 0; i < followed.length; i += IN_LIMIT) {
      const snap = await board
        .where("uid", "in", followed.slice(i, i + IN_LIMIT))
        .get();
      for (const d of snap.docs) rows.push({ ...d.data(), uid: d.id });
    }
  }
  rows = rows.filter(
    (r) =>
      typeof r.elapsedSeconds === "number" &&
      r.elapsedSeconds > 0 &&
      isDocumentId(r.activityId)
  );
  if (rows.length === 0) return { entries: [] };

  const uids = rows.map((r) => r.uid);
  const [viewerBlocks, blockedViewer, restricted, profiles, posts] =
    await Promise.all([
      db.collection("blocks").doc(viewerUid).collection("users").get(),
      db.getAll(
        ...uids.map((u) =>
          db.collection("blocks").doc(u).collection("users").doc(viewerUid)
        )
      ),
      db.getAll(
        ...uids.map((u) => db.collection("globalRestrictedUids").doc(u))
      ),
      db.getAll(
        ...uids.map((u) =>
          db.collection("users").doc(u).collection("public").doc("profile")
        )
      ),
      db.getAll(
        ...rows.map((r) => db.collection("activities").doc(r.activityId))
      ),
    ]);
  const blocked = new Set(viewerBlocks.docs.map((d) => d.id));
  const candidates = rows
    .map((row, i) => ({ row, i }))
    .filter(({ row, i }) => {
      if (blocked.has(row.uid) || blockedViewer[i].exists) return false;
      if (restricted[i].exists || !profiles[i].exists) return false;
      const post = posts[i].exists ? posts[i].data() : null;
      return (
        !!post &&
        post.authorId === row.uid &&
        SHOWN_VISIBILITIES.includes(post.visibility)
      );
    });
  // The zones are read for the rows still standing, all at once.
  const zoneSnaps = await Promise.all(
    candidates.map(({ row }) => zonesCol(db, row.uid).get())
  );
  const shown = [];
  candidates.forEach(({ row, i }, k) => {
    const zones = zonesFrom(zoneSnaps[k]);
    if (inAnyZone(row.start, zones) || inAnyZone(row.end, zones)) return;
    const profile = profiles[i].data() || {};
    shown.push({
      uid: row.uid,
      name: carriedName(profile.displayName) || null,
      photoURL: publicPhotoUrl(profile.photoURL) || null,
      elapsedSeconds: row.elapsedSeconds,
      startedAtMs: typeof row.startedAtMs === "number" ? row.startedAtMs : null,
      day: typeof row.day === "string" ? row.day : null,
      activityId: row.activityId,
    });
  });
  shown.sort(fasterFirst);
  return { entries: shown.slice(0, BOARD_MAX_ROWS) };
}

/* ───────────── Making and deleting a segment ───────────── */

/**
 * Matches the maker's own latest runs, the one it was cut from among them,
 * with a new segment, and writes their board entry on it.
 */
async function matchOwnRuns(db, { uid, segmentId, segment, sourceRunId, nowMs }) {
  const latest = await db
    .collection("users")
    .doc(uid)
    .collection("runs")
    .orderBy("completedAt", "desc")
    .limit(BACKFILL_RUNS)
    .get();
  const runs = latest.docs.map((d) => ({ id: d.id, data: d.data() }));
  if (!runs.some((r) => r.id === sourceRunId)) {
    const source = await db
      .collection("users")
      .doc(uid)
      .collection("runs")
      .doc(sourceRunId)
      .get();
    if (source.exists) runs.push({ id: source.id, data: source.data() });
  }
  let count = 0;
  for (const run of runs) {
    if (!isMatchableRun(run.data)) continue;
    const found = matchSegment(segment, traceOf(run.data.points));
    if (found.length === 0) continue;
    // Each run's efforts on the new segment only: the run's efforts on
    // other segments stay as they are.
    await db.runTransaction(async (tx) => {
      const [live, segmentSnap] = await Promise.all([
        transactionAccountsLive({ firestore: db, tx, uids: [uid] }),
        tx.get(segmentsCol(db).doc(segmentId)),
      ]);
      if (!live || !segmentSnap.exists) return;
      const day = sourceActivityDateKey(run.data);
      for (const e of found) {
        tx.set(efforts(db, uid).doc(effortId(run.id, segmentId, e.lap)), {
          uid,
          segmentId,
          runId: run.id,
          lap: e.lap,
          elapsedSeconds: e.elapsedSeconds,
          startedAtMs: e.startMs,
          day: day || null,
          start: e.start,
          end: e.end,
          createdAtMs: nowMs,
        });
      }
    });
    count += found.length;
  }
  if (count > 0) await refreshBoardEntry(db, uid, segmentId, { nowMs });
  return count;
}

/**
 * Makes a segment from the stretch of the person's saved run between two
 * of its points, both included. Throws a refusal (`err.refusal`, with the
 * callable's `code` and the sentence the person reads) when it can't.
 *
 * The caller has checked the account: signed in, email verified, not
 * restricted, not being deleted. The restriction and the deletion state
 * are read again in the transaction that writes.
 *
 * @returns {Promise<{ segmentId: string, efforts: number }>}
 */
async function createSegment(
  db,
  { uid, runId, startIndex, endIndex, name, nowMs = Date.now() }
) {
  if (!uid) throw refusal("unauthenticated", "Sign in first.");
  const segmentNameValue = segmentName(name);
  if (!isDocumentId(runId)) throw refusal("invalid-argument", REFUSALS.noRun);
  const runSnap = await db
    .collection("users")
    .doc(uid)
    .collection("runs")
    .doc(runId)
    .get();
  if (!runSnap.exists) throw refusal("not-found", REFUSALS.noRun);
  const run = runSnap.data() || {};
  if (isTreadmillRun(run) || !Array.isArray(run.points) || run.points.length < 2)
    throw refusal("failed-precondition", REFUSALS.notGps);
  if (!isVolumeEligibleRun(run))
    throw refusal("failed-precondition", REFUSALS.invalidRun);
  const stretch = stretchOf(run.points, startIndex, endIndex);
  if (stretch.refusal) throw refusal("failed-precondition", stretch.refusal);
  const zones = zonesFrom(await zonesCol(db, uid).get());
  if (stretch.points.some((p) => inAnyZone(p, zones)))
    throw refusal("failed-precondition", REFUSALS.zone);
  const made = await countOf(ownersCol(db).where("uid", "==", uid));
  if (made >= MAX_SEGMENTS_PER_ACCOUNT)
    throw refusal("resource-exhausted", REFUSALS.tooMany);

  const shape = segmentShape(stretch);
  const segmentRef = segmentsCol(db).doc();
  const segmentId = segmentRef.id;
  const segment = { name: segmentNameValue, ...shape, createdAtMs: nowMs };
  await db.runTransaction(async (tx) => {
    const [live, restricted] = await Promise.all([
      transactionAccountsLive({ firestore: db, tx, uids: [uid] }),
      tx.get(db.collection("globalRestrictedUids").doc(uid)),
    ]);
    if (!live)
      throw refusal("failed-precondition", "Account deletion is in progress.");
    if (restricted.exists) {
      const err = refusal("permission-denied", RESTRICTED_MESSAGE);
      err.reason = RESTRICTED_REASON;
      throw err;
    }
    tx.set(segmentRef, segment);
    tx.set(ownersCol(db).doc(segmentId), {
      uid,
      sourceRunId: runId,
      createdAtMs: nowMs,
    });
  });
  const count = await matchOwnRuns(db, {
    uid,
    segmentId,
    segment,
    sourceRunId: runId,
    nowMs,
  });
  return { segmentId, efforts: count };
}

/** Deletes a query's documents in pages until none are left. */
async function deleteAllOf(db, query, keep = () => true) {
  let removed = 0;
  for (;;) {
    const snap = await query.limit(BATCH_WRITES).get();
    const refs = snap.docs.filter(keep).map((d) => d.ref);
    if (refs.length > 0) {
      const batch = db.batch();
      refs.forEach((ref) => batch.delete(ref));
      await batch.commit();
      removed += refs.length;
    }
    if (snap.docs.length < BATCH_WRITES || refs.length === 0) return removed;
  }
}

const EFFORT_PATH = /^users\/[^/]+\/segmentEfforts\/[^/]+$/;
const BOARD_PATH = /^segments\/[^/]+\/board\/[^/]+$/;

/**
 * Deletes a segment and everything that hangs off it: the segment first,
 * so no run is matched to it again, then every effort on it in everyone's
 * tree, its board, and its owner record last, so an attempt that fails
 * part way finds the segment still owned and can be made again.
 */
async function removeSegment(db, segmentId) {
  if (!isDocumentId(segmentId)) return { efforts: 0 };
  await segmentsCol(db).doc(segmentId).delete();
  const removedEfforts = await deleteAllOf(
    db,
    db.collectionGroup(EFFORTS).where("segmentId", "==", segmentId),
    (d) => EFFORT_PATH.test(d.ref.path)
  );
  await deleteAllOf(db, boardCol(db, segmentId));
  await ownersCol(db).doc(segmentId).delete();
  return { efforts: removedEfforts };
}

/** The owner deleting their segment. */
async function deleteOwnSegment(db, { uid, segmentId }) {
  if (!isDocumentId(segmentId))
    throw refusal("invalid-argument", REFUSALS.notYours);
  const owner = await ownersCol(db).doc(segmentId).get();
  if (!owner.exists || owner.data().uid !== uid)
    throw refusal("not-found", REFUSALS.notYours);
  return removeSegment(db, segmentId);
}

/**
 * Account deletion's step: every segment the account made, with every
 * effort on it, and the account's board entries on anyone's segments.
 * Its own efforts go with users/{uid} (USER_SUBCOLLECTIONS).
 */
async function removeSegmentTracesForUser(db, uid) {
  if (!uid) return { segments: 0, entries: 0 };
  const owned = await ownersCol(db).where("uid", "==", uid).get();
  for (const doc of owned.docs) await removeSegment(db, doc.id);
  const entries = await deleteAllOf(
    db,
    db.collectionGroup(BOARD).where("uid", "==", uid),
    (d) => BOARD_PATH.test(d.ref.path)
  );
  return { segments: owned.docs.length, entries };
}

module.exports = {
  SEGMENTS,
  BOARD,
  OWNERS,
  EFFORTS,
  SHOWN_VISIBILITIES,
  MAX_SEGMENTS_PER_ACCOUNT,
  BACKFILL_RUNS,
  BOARD_MAX_ROWS,
  REFUSALS,
  isMatchableRun,
  boardMayHaveChanged,
  segmentName,
  matchRunToSegments,
  removeRunEfforts,
  refreshRunBoardEntries,
  refreshAllBoardEntries,
  refreshBoardEntry,
  readSegmentBoard,
  createSegment,
  deleteOwnSegment,
  removeSegment,
  removeSegmentTracesForUser,
};

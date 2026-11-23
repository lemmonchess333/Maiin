"use strict";

/**
 * Lift boards (Run30 call 3): the heaviest set of each person you follow on
 * one lift, copied from Hevy's per-exercise leaderboard, under the rules of
 * a segment board (Run26 call 3, lib/segments.js).
 *
 * WHICH LIFTS. Every exercise in the catalogue whose equipment is a barbell
 * (`BOARD_LIFTS`, pinned to src/lib/exercises.ts by
 * src/lib/__tests__/liftBoard.cross.test.ts). A barbell's weight means the
 * same lift in every gym; a machine's stack, a cable's pulleys and a pair
 * of dumbbells logged per hand or together do not. Hevy's boards are 38
 * movements, nearly all of them barbell lifts.
 *
 * WHAT "BEST" IS. The heaviest weight on a set of at least one rep, as
 * Hevy ranks ("Leaderboard - Heaviest Weight"; help.hevyapp.com article
 * 38224023680407: "a ranking of you and your followers based on the
 * heaviest weight lifted"). Warm-up sets do not count, nor a timed hold,
 * nor a load past MAX_LOAD_KG, which no barbell lift has reached. Of two
 * sets the same weight, more reps; then the earlier day.
 *
 * WHAT IS STORED
 *
 *   users/{uid}/liftEfforts/{workoutId}_{exerciseId}
 *       { uid, exerciseId, workoutId, weightKg, reps, day, createdAtMs }:
 *       a workout's heaviest set of each board lift, private or not.
 *       Server only (the app reads its own sets from the workouts); written
 *       only here, from the workout as saved.
 *   liftBoards/{exerciseId}/lifters/{uid}
 *       The lifter's heaviest effort that may be shown to the people who
 *       follow them, with the post it came from. Server only: the board is
 *       read through `readLiftBoard`, which checks everything again.
 *
 * WHAT REACHES A BOARD. An effort is shown only to people who follow the
 * lifter (an accepted follow: `following/` holds no requests), as a segment
 * board's is, and only:
 *   - from a workout shared with followers or with everyone: its
 *     `sharedActivityId` names a post of theirs whose visibility is
 *     `followers` or `public`. A workout never shared, or shared privately,
 *     is seen by nobody else, so neither is its heaviest set;
 *   - with no block between the viewer and the lifter either way, when the
 *     lifter is not restricted and their account is not being deleted.
 * The first is judged when the entry is written (`refreshBoardEntry`, after
 * every change to the lifter's workouts, a workout's post link or the
 * post's visibility) and all of them again on every read, so a post made
 * private, an unfollow, a block or a restriction hides the entry at once.
 * The entry is one per lifter and every viewer reads the same one, so who
 * may see it is decided on the read, not by deleting it.
 *
 * DELETION. Deleting a workout deletes its efforts and recomputes the
 * boards they were on (`removeWorkoutEfforts`). Deleting an account deletes
 * its entries on every board (`removeLiftBoardTracesForUser`); its own
 * efforts go with its tree (USER_SUBCOLLECTIONS in accountDeletion.js).
 *
 * IDEMPOTENCY. An effort's id is `{workoutId}_{exerciseId}`, so a retried
 * trigger writes the same documents. A board entry is recomputed from the
 * lifter's efforts in a transaction, never adjusted. Every write reads the
 * account's deletion state in the transaction that makes it.
 */

const { sourceActivityDateKey } = require("./challengeActivityWindow");
const { transactionAccountsLive } = require("./deletionTransactionGuard");
const { isStatusActive, isTombstoneLive } = require("./accountDeletionStatus");
const { isDocumentId } = require("./documentId");
const { carriedName } = require("./identityResync");
const { publicPhotoUrl } = require("./publicPhotoUrl");

const LIFT_BOARDS = "liftBoards";
const LIFTERS = "lifters";
const EFFORTS = "liftEfforts";

/** Every barbell exercise in the catalogue, by id, with its name: older
 *  workouts named an exercise and carried no id. */
const BOARD_LIFTS = Object.freeze({
  "bench-press": "Bench Press",
  "incline-bench": "Incline Bench Press",
  "decline-bench": "Decline Bench Press",
  "barbell-floor-press": "Barbell Floor Press",
  deadlift: "Deadlift",
  "barbell-row": "Barbell Row",
  "pendlay-row": "Pendlay Row",
  "meadows-row": "Meadows Row",
  "t-bar-row": "T-Bar Row",
  "rack-pull": "Rack Pull",
  "overhead-press": "Overhead Press",
  "barbell-upright-row": "Barbell Upright Row",
  "barbell-shrug": "Barbell Shrug",
  "landmine-press": "Landmine Press",
  "barbell-curl": "Barbell Curl",
  "ez-bar-curl": "EZ Bar Curl",
  "preacher-curl": "Preacher Curl",
  "reverse-barbell-curl": "Reverse Barbell Curl",
  "skull-crushers": "Skull Crushers",
  "close-grip-bench": "Close Grip Bench Press",
  "jm-press": "JM Press",
  squat: "Barbell Squat",
  "front-squat": "Front Squat",
  "romanian-deadlift": "Romanian Deadlift",
  "sumo-deadlift": "Sumo Deadlift",
  "trap-bar-deadlift": "Trap Bar Deadlift",
  "barbell-step-ups": "Barbell Step-Ups",
  "hip-thrust": "Hip Thrust",
  "clean-and-press": "Clean and Press",
  thrusters: "Thrusters",
  "landmine-squat": "Landmine Squat",
  "zercher-squat": "Zercher Squat",
});
const BOARD_LIFT_IDS = Object.freeze(Object.keys(BOARD_LIFTS));
const ID_BY_NAME = new Map(
  Object.entries(BOARD_LIFTS).map(([id, name]) => [name, id])
);

/** A post's visibilities that the people following its author can see. */
const SHOWN_VISIBILITIES = Object.freeze(["followers", "public"]);

/** The heaviest load a set may carry and still count, in kg. A Tropos
 *  bound: past every barbell record (the heaviest deadlift and squat are
 *  near 500 kg), so a typed extra digit never tops a board. */
const MAX_LOAD_KG = 600;
/** How many of a lifter's heaviest efforts on a lift are looked through
 *  for one that may be shown. */
const BOARD_SCAN = 50;
/** The most rows a board returns. */
const BOARD_MAX_ROWS = 100;
/** Firestore's limit on an `in` query's values. */
const IN_LIMIT = 30;
const BATCH_WRITES = 400;

const boardCol = (db, exerciseId) =>
  db.collection(LIFT_BOARDS).doc(exerciseId).collection(LIFTERS);
/** The person's efforts. Spelled out, not built from a constant, so the
 *  account-deletion sweep's guard (accountDeletionSubcollections.test.js)
 *  can read the path. */
function efforts(db, uid) {
  return db.collection("users").doc(uid).collection("liftEfforts");
}

function effortId(workoutId, exerciseId) {
  return `${workoutId}_${exerciseId}`;
}

function isBoardLift(exerciseId) {
  return (
    typeof exerciseId === "string" &&
    Object.prototype.hasOwnProperty.call(BOARD_LIFTS, exerciseId)
  );
}

/** The board lift a stored exercise is, or null: by its id, or by the
 *  catalogue name an older workout saved without one. */
function boardLiftOf(exercise) {
  if (!exercise || typeof exercise !== "object") return null;
  if (isBoardLift(exercise.exerciseId)) return exercise.exerciseId;
  if (typeof exercise.exerciseId === "string" && exercise.exerciseId)
    return null;
  const name =
    typeof exercise.exerciseName === "string"
      ? exercise.exerciseName
      : typeof exercise.name === "string"
        ? exercise.name
        : null;
  return (name && ID_BY_NAME.get(name)) || null;
}

/** Heaviest first; of two the same weight, more reps. */
function heavierFirst(a, b) {
  return b.weightKg - a.weightKg || b.reps - a.reps;
}

/**
 * The heaviest set that counts among `sets`, as `{ weightKg, reps }`, or
 * null: a set of at least one rep at a load above 0 and at most
 * MAX_LOAD_KG, never a warm-up. Older sets carried their load as `weight`.
 * The app's copy is `heaviestSet` in src/lib/liftBoard.ts.
 */
function heaviestSet(sets) {
  if (!Array.isArray(sets)) return null;
  let best = null;
  for (const set of sets) {
    if (!set || typeof set !== "object" || set.type === "warmup") continue;
    const weightKg = Number(
      typeof set.weightKg === "number" ? set.weightKg : set.weight
    );
    const reps = Math.floor(Number(set.reps));
    if (!Number.isFinite(weightKg) || !(weightKg > 0) || weightKg > MAX_LOAD_KG)
      continue;
    if (!Number.isFinite(reps) || reps < 1) continue;
    const candidate = { weightKg, reps };
    if (!best || heavierFirst(candidate, best) < 0) best = candidate;
  }
  return best;
}

/**
 * A saved workout's heaviest set of each board lift, as
 * `Map<exerciseId, { weightKg, reps }>`. A timed exercise (`repUnit`
 * "seconds") counts nothing: its reps are seconds.
 */
function workoutLiftBests(data) {
  const bests = new Map();
  const exercises = data && Array.isArray(data.exercises) ? data.exercises : [];
  for (const exercise of exercises) {
    if (!exercise || exercise.repUnit === "seconds") continue;
    const exerciseId = boardLiftOf(exercise);
    if (!exerciseId) continue;
    const set = heaviestSet(exercise.sets);
    if (!set) continue;
    const held = bests.get(exerciseId);
    if (!held || heavierFirst(set, held) < 0) bests.set(exerciseId, set);
  }
  return bests;
}

/** Whether an edit to a saved workout can change its efforts or which of
 *  them may be shown: its sets, its day or its post link. */
function workoutBoardMayHaveChanged(before, after) {
  const b = before || {};
  const a = after || {};
  if ((b.sharedActivityId || null) !== (a.sharedActivityId || null))
    return true;
  if (sourceActivityDateKey(b) !== sourceActivityDateKey(a)) return true;
  const key = (data) =>
    JSON.stringify(
      [...workoutLiftBests(data)].sort(([x], [y]) => (x < y ? -1 : 1))
    );
  return key(b) !== key(a);
}

/** Whether a write to a post can change a board: a lift post made, removed,
 *  or moved between who may see it. Every other write (props, a comment
 *  count) returns before reading anything. */
function postMayMoveBoards(before, after) {
  const b = before || null;
  const a = after || null;
  const isLift = (p) => !!p && p.type === "workout";
  if (!isLift(b) && !isLift(a)) return false;
  if (!b || !a) return true;
  return (
    b.visibility !== a.visibility ||
    b.authorId !== a.authorId ||
    b.type !== a.type
  );
}

/* ───────────── Efforts ───────────── */

/**
 * Writes a saved workout's efforts from it as it is now, replacing any it
 * had, in one transaction that reads the account's deletion state and the
 * workout, then recomputes the lifter's entry on every lift it had or has.
 * Called by onWorkoutCreated and onWorkoutUpdated; safe to run again.
 * `refresh: false` leaves the entries to the caller (the backfill, which
 * recomputes each lift once after all of a lifter's workouts).
 *
 * @returns {Promise<{ exerciseIds: string[] }>}
 */
async function syncWorkoutEfforts(
  db,
  { uid, workoutId, nowMs = Date.now(), refresh = true }
) {
  if (!uid || !isDocumentId(workoutId)) return { exerciseIds: [] };
  const workoutRef = db
    .collection("users")
    .doc(uid)
    .collection("workouts")
    .doc(workoutId);
  const touched = await db.runTransaction(async (tx) => {
    const [live, workoutSnap, existing] = await Promise.all([
      transactionAccountsLive({ firestore: db, tx, uids: [uid] }),
      tx.get(workoutRef),
      tx.get(efforts(db, uid).where("workoutId", "==", workoutId)),
    ]);
    if (!live) return [];
    const ids = new Set(existing.docs.map((d) => d.data().exerciseId));
    const data = workoutSnap.exists ? workoutSnap.data() : null;
    const bests = data ? workoutLiftBests(data) : new Map();
    const day = data ? sourceActivityDateKey(data) : null;
    const written = new Set();
    for (const [exerciseId, set] of bests) {
      const id = effortId(workoutId, exerciseId);
      tx.set(efforts(db, uid).doc(id), {
        uid,
        exerciseId,
        workoutId,
        weightKg: set.weightKg,
        reps: set.reps,
        day: day || null,
        createdAtMs: nowMs,
      });
      written.add(id);
      ids.add(exerciseId);
    }
    for (const doc of existing.docs)
      if (!written.has(doc.id)) tx.delete(doc.ref);
    return [...ids].filter(isBoardLift);
  });
  if (refresh)
    for (const exerciseId of touched)
      await refreshBoardEntry(db, uid, exerciseId, { nowMs });
  return { exerciseIds: touched };
}

/**
 * Deletes a deleted workout's efforts and recomputes the boards they were
 * on. Called by onWorkoutDeleted.
 */
async function removeWorkoutEfforts(
  db,
  { uid, workoutId, nowMs = Date.now() }
) {
  if (!uid || !isDocumentId(workoutId)) return { removed: 0 };
  const snap = await efforts(db, uid).where("workoutId", "==", workoutId).get();
  const exerciseIds = [
    ...new Set(snap.docs.map((d) => d.data().exerciseId)),
  ].filter(isBoardLift);
  for (let i = 0; i < snap.docs.length; i += BATCH_WRITES) {
    const batch = db.batch();
    snap.docs.slice(i, i + BATCH_WRITES).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  for (const exerciseId of exerciseIds)
    await refreshBoardEntry(db, uid, exerciseId, { nowMs });
  return { removed: snap.docs.length };
}

/**
 * A lift post made, deleted, or seen by different people now: the entries
 * of the workouts that link to it are recomputed. Called by
 * onLiftPostWritten with the post as it was and as it is.
 */
async function refreshPostEntries(
  db,
  { activityId, before, after, nowMs = Date.now() }
) {
  if (!isDocumentId(activityId)) return { exerciseIds: [] };
  const authors = [
    ...new Set(
      [before, after]
        .map((p) => p && p.authorId)
        .filter((uid) => isDocumentId(uid))
    ),
  ];
  const exerciseIds = new Set();
  for (const uid of authors) {
    const workouts = await db
      .collection("users")
      .doc(uid)
      .collection("workouts")
      .where("sharedActivityId", "==", activityId)
      .get();
    for (const workout of workouts.docs) {
      const snap = await efforts(db, uid)
        .where("workoutId", "==", workout.id)
        .get();
      const lifts = [
        ...new Set(snap.docs.map((d) => d.data().exerciseId)),
      ].filter(isBoardLift);
      for (const exerciseId of lifts) {
        await refreshBoardEntry(db, uid, exerciseId, { nowMs });
        exerciseIds.add(exerciseId);
      }
    }
  }
  return { exerciseIds: [...exerciseIds] };
}

/** The id of the workout's post when the people following its author may
 *  see it, else null. Read in the transaction, each workout and post once. */
async function shownPostOf(tx, db, uid, workoutId, cache) {
  if (cache.has(workoutId)) return cache.get(workoutId);
  let post = null;
  const workout = isDocumentId(workoutId)
    ? await tx.get(
        db.collection("users").doc(uid).collection("workouts").doc(workoutId)
      )
    : null;
  const data = workout && workout.exists ? workout.data() : null;
  const activityId = data && data.sharedActivityId;
  if (data && isDocumentId(activityId)) {
    const activity = await tx.get(db.collection("activities").doc(activityId));
    const a = activity.exists ? activity.data() : null;
    if (a && a.authorId === uid && SHOWN_VISIBILITIES.includes(a.visibility))
      post = activityId;
  }
  cache.set(workoutId, post);
  return post;
}

/** An effort as stored, or null when it can't be read. */
function effortOf(doc) {
  const data = doc.data() || {};
  if (
    typeof data.weightKg !== "number" ||
    !(data.weightKg > 0) ||
    typeof data.reps !== "number" ||
    !(data.reps >= 1) ||
    typeof data.workoutId !== "string"
  )
    return null;
  return { id: doc.id, ...data };
}

/** Heaviest first, then more reps, then the earlier day. */
function boardOrder(a, b) {
  return (
    heavierFirst(a, b) ||
    String(a.day || "9999").localeCompare(String(b.day || "9999"))
  );
}

/**
 * Writes the lifter's entry on a lift's board from their efforts as they
 * are now: the heaviest one from a workout shared with followers or
 * everyone, or no entry at all.
 */
async function refreshBoardEntry(
  db,
  uid,
  exerciseId,
  { nowMs = Date.now() } = {}
) {
  if (!uid || !isBoardLift(exerciseId)) return { written: false };
  const entryRef = boardCol(db, exerciseId).doc(uid);
  return db.runTransaction(async (tx) => {
    const [live, entrySnap, effortsSnap] = await Promise.all([
      transactionAccountsLive({ firestore: db, tx, uids: [uid] }),
      tx.get(entryRef),
      tx.get(efforts(db, uid).where("exerciseId", "==", exerciseId)),
    ]);
    if (!live) return { written: false };
    const ranked = effortsSnap.docs
      .map(effortOf)
      .filter(Boolean)
      .sort(boardOrder)
      .slice(0, BOARD_SCAN);
    const posts = new Map();
    let best = null;
    for (const effort of ranked) {
      const activityId = await shownPostOf(
        tx,
        db,
        uid,
        effort.workoutId,
        posts
      );
      if (!activityId) continue;
      best = { effort, activityId };
      break;
    }
    if (best) {
      const { effort, activityId } = best;
      tx.set(entryRef, {
        uid,
        exerciseId,
        effortId: effort.id,
        workoutId: effort.workoutId,
        activityId,
        weightKg: effort.weightKg,
        reps: effort.reps,
        day: effort.day || null,
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
 * The board of a lift as `viewerUid` may see it: the heaviest shown set of
 * each person they follow who has done it, heaviest first, at most
 * BOARD_MAX_ROWS. The viewer's own row is the app's to add from their own
 * workouts. Null when the lift has no board.
 *
 * Reads whichever is shorter, the board or the viewer's following list,
 * so neither a popular lift nor a long list makes every view expensive.
 */
async function readLiftBoard(db, { viewerUid, exerciseId }) {
  if (!viewerUid || !isBoardLift(exerciseId)) return null;
  const board = boardCol(db, exerciseId);
  const following = db
    .collection("following")
    .doc(viewerUid)
    .collection("users");
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
      typeof r.weightKg === "number" &&
      r.weightKg > 0 &&
      typeof r.reps === "number" &&
      r.reps >= 1 &&
      isDocumentId(r.activityId)
  );
  if (rows.length === 0) return { entries: [] };

  const uids = rows.map((r) => r.uid);
  const each = (path) => db.getAll(...uids.map((u) => db.doc(path(u))));
  const [
    viewerBlocks,
    blockedViewer,
    restricted,
    deleting,
    tombstones,
    profiles,
    posts,
  ] = await Promise.all([
    db.collection("blocks").doc(viewerUid).collection("users").get(),
    each((u) => `blocks/${u}/users/${viewerUid}`),
    each((u) => `globalRestrictedUids/${u}`),
    each((u) => `accountDeletionRequests/${u}`),
    each((u) => `deletedAccounts/${u}`),
    each((u) => `users/${u}/public/profile`),
    db.getAll(
      ...rows.map((r) => db.collection("activities").doc(r.activityId))
    ),
  ]);
  const blocked = new Set(viewerBlocks.docs.map((d) => d.id));
  const shown = [];
  rows.forEach((row, i) => {
    if (blocked.has(row.uid) || blockedViewer[i].exists) return;
    if (restricted[i].exists || !profiles[i].exists) return;
    if (deleting[i].exists && isStatusActive(deleting[i].data()?.status))
      return;
    if (tombstones[i].exists && isTombstoneLive(tombstones[i].data())) return;
    const post = posts[i].exists ? posts[i].data() : null;
    if (
      !post ||
      post.authorId !== row.uid ||
      !SHOWN_VISIBILITIES.includes(post.visibility)
    )
      return;
    const profile = profiles[i].data() || {};
    shown.push({
      uid: row.uid,
      name: carriedName(profile.displayName) || null,
      photoURL: publicPhotoUrl(profile.photoURL) || null,
      weightKg: row.weightKg,
      reps: row.reps,
      day: typeof row.day === "string" ? row.day : null,
      activityId: row.activityId,
    });
  });
  shown.sort(boardOrder);
  return { entries: shown.slice(0, BOARD_MAX_ROWS) };
}

/* ───────────── The one-off backfill ───────────── */

const BACKFILL_PAGE = 200;

/**
 * Every account's workouts saved before the triggers were deployed, put
 * through the triggers' own steps (functions/scripts/backfill-lift-boards.js).
 * With `apply`, each workout's efforts are written as onWorkoutCreated
 * writes them (`syncWorkoutEfforts`), then each lift the lifter has done is
 * recomputed once (`refreshBoardEntry`), so who reaches a board is decided
 * exactly as it is for a workout saved today. Without it nothing is
 * written, and the totals say what would be read: accounts, workouts,
 * workouts with a barbell lift, and lifters with a barbell lift in a
 * workout linked to a post (an upper bound on the entries: the post's
 * visibility is read only when writing).
 *
 * Safe to run again and beside the live triggers: every write recomputes
 * from the documents as they are, and an account being deleted is
 * skipped by the deletion read in each transaction.
 */
async function backfillLiftBoards(
  db,
  {
    apply = false,
    nowMs = Date.now(),
    // admin.firestore.FieldPath.documentId; the bare name works as well.
    documentId = () => "__name__",
    pageSize = BACKFILL_PAGE,
  } = {}
) {
  const totals = {
    dryRun: !apply,
    accounts: 0,
    workouts: 0,
    liftWorkouts: 0,
    sharedLifters: 0,
    entriesWritten: 0,
  };
  const users = db.collection("users");
  let last = null;
  for (;;) {
    let page = users.orderBy(documentId()).limit(pageSize);
    if (last) page = page.startAfter(last);
    const snap = await page.get();
    for (const user of snap.docs) {
      totals.accounts += 1;
      const workouts = await users.doc(user.id).collection("workouts").get();
      const lifts = new Set();
      let shared = false;
      for (const workout of workouts.docs) {
        totals.workouts += 1;
        if (!isDocumentId(workout.id)) continue;
        const data = workout.data() || {};
        const bests = workoutLiftBests(data);
        if (bests.size === 0) continue;
        totals.liftWorkouts += 1;
        if (isDocumentId(data.sharedActivityId)) shared = true;
        if (!apply) continue;
        const { exerciseIds } = await syncWorkoutEfforts(db, {
          uid: user.id,
          workoutId: workout.id,
          nowMs,
          refresh: false,
        });
        for (const id of exerciseIds) lifts.add(id);
      }
      if (shared) totals.sharedLifters += 1;
      for (const exerciseId of lifts) {
        const { written } = await refreshBoardEntry(db, user.id, exerciseId, {
          nowMs,
        });
        if (written) totals.entriesWritten += 1;
      }
    }
    if (snap.docs.length < pageSize) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return totals;
}

/* ───────────── Account deletion ───────────── */

const ENTRY_PATH = /^liftBoards\/[^/]+\/lifters\/[^/]+$/;

/**
 * Account deletion's step: the account's entries on every lift's board.
 * Its own efforts go with users/{uid} (USER_SUBCOLLECTIONS).
 */
async function removeLiftBoardTracesForUser(db, uid) {
  if (!uid) return { entries: 0 };
  let removed = 0;
  for (;;) {
    const snap = await db
      .collectionGroup(LIFTERS)
      .where("uid", "==", uid)
      .limit(BATCH_WRITES)
      .get();
    const refs = snap.docs
      .filter((d) => ENTRY_PATH.test(d.ref.path))
      .map((d) => d.ref);
    if (refs.length > 0) {
      const batch = db.batch();
      refs.forEach((ref) => batch.delete(ref));
      await batch.commit();
      removed += refs.length;
    }
    if (snap.docs.length < BATCH_WRITES || refs.length === 0)
      return { entries: removed };
  }
}

module.exports = {
  LIFT_BOARDS,
  LIFTERS,
  EFFORTS,
  BOARD_LIFTS,
  BOARD_LIFT_IDS,
  SHOWN_VISIBILITIES,
  MAX_LOAD_KG,
  BOARD_MAX_ROWS,
  isBoardLift,
  heaviestSet,
  workoutLiftBests,
  workoutBoardMayHaveChanged,
  postMayMoveBoards,
  syncWorkoutEfforts,
  removeWorkoutEfforts,
  refreshPostEntries,
  refreshBoardEntry,
  readLiftBoard,
  removeLiftBoardTracesForUser,
  backfillLiftBoards,
};

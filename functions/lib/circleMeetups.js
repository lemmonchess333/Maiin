/**
 * Meet-ups in a Circle (Run26 call 4): a member plans a run or a lift
 * with a time and a place, and the other members say whether they are in.
 * It is the weekly club run Strava's group events carry, kept inside a
 * Circle, where a time and a place reach only people the organiser
 * invited (GsPb1: invite-only, at most eight).
 *
 * GsPb1's fence holds. Nothing here is anyone's training data: the place
 * is the words the organiser types, never coordinates; there is no
 * distance, pace or load; and no name or photo is copied, because every
 * reader is a member and reads names from the Circle's own member docs.
 *
 * Server-written only: the rules refuse every client write, so this
 * module, behind the circleMeetup callable, is the one writer. The
 * callable adds auth, the deletion actor-lock, restriction (planning and
 * saying you're in reach the other members; saying you can't make it and
 * calling one off do not) and the rate limit.
 *
 * goalSpaces/{spaceId}/meetups/{meetupId}
 *   organiserUid  the member who planned it
 *   sport         "run" | "lift"
 *   title         what it is, typed ("Saturday long run")
 *   place         where to meet, typed ("Tooting Lido gate")
 *   note          optional, typed, or null
 *   startsAt      the instant it starts, in ms
 *   timeZone      the organiser's IANA zone when they planned it
 *   going         member uids, the organiser first
 *   createdAt     ms
 *
 * A meet-up is deleted when it is called off, when its organiser leaves
 * or is removed, when the Circle ends, and with its organiser's account;
 * a member who leaves comes off every `going` list. Past ones go when the
 * next one is planned (PRUNE_AFTER_MS), so nothing waits on a TTL policy.
 *
 * The bounds are mirrored by src/features/goalSpace/circleMeetups.ts and
 * pinned to it by circleMeetups.cross.test.ts.
 */

const { GoalSpaceError, assertNoBlockedPair } = require("./goalSpaceMembership");
const { isDocumentId } = require("./documentId");

const MEETUP_SPORTS = Object.freeze(["run", "lift"]);
const MEETUP_TITLE_MAX = 60;
const MEETUP_PLACE_MAX = 80;
const MEETUP_NOTE_MAX = 200;
const MEETUP_TIME_ZONE_MAX = 64;

/** How far ahead a meet-up may be planned. A Tropos heuristic: two
 *  months covers a block's long runs without a list of far-off plans. */
const MEETUP_MAX_AHEAD_MS = 60 * 86_400_000;

/** How long after its start a meet-up still shows, and can still be
 *  joined. A Tropos heuristic: three hours covers a long run and the
 *  coffee after it; after that it is over for everyone. */
const MEETUP_SHOWN_AFTER_START_MS = 3 * 3_600_000;

/** How far in the past a start may be when it is planned: a phone's clock
 *  may run a little behind the server's. */
const START_SKEW_MS = 5 * 60_000;

/** How many meet-ups a Circle may have ahead at once. A Tropos
 *  heuristic: two a week for a month, which a group of eight will not
 *  outgrow, and a bound on what each member reads. */
const MEETUPS_AHEAD_MAX = 8;

/** Past meet-ups older than this are deleted when the next is planned. */
const PRUNE_AFTER_MS = 2 * 86_400_000;

/** At most this many past meet-ups go per planning, so one call stays
 *  bounded; the rest go on later ones. */
const PRUNE_BATCH = 20;

/** A defensive bound on `going`; a Circle has at most eight members. */
const GOING_MAX = 16;

const MEETUP_ACTIONS = Object.freeze(["plan", "going", "notGoing", "cancel"]);

function meetupsCollection(firestore, spaceId) {
  return firestore
    .collection("goalSpaces")
    .doc(spaceId)
    .collection("meetups");
}

/** One line of typed words: trimmed, runs of space (newlines included)
 *  made one space. */
function oneLine(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isTimeZone(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MEETUP_TIME_ZONE_MAX
  ) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The plan as it will be stored, or a refusal. `containsProfanity` is the
 * word filter every member-typed word meets before another member reads it.
 */
function normaliseMeetupInput(input, now, containsProfanity) {
  const data = input && typeof input === "object" ? input : {};
  if (!MEETUP_SPORTS.includes(data.sport)) {
    throw new GoalSpaceError("invalid-argument", "sport must be run or lift");
  }
  const title = oneLine(data.title);
  if (title.length === 0 || title.length > MEETUP_TITLE_MAX) {
    throw new GoalSpaceError("invalid-argument", "title missing or too long");
  }
  const place = oneLine(data.place);
  if (place.length === 0 || place.length > MEETUP_PLACE_MAX) {
    throw new GoalSpaceError("invalid-argument", "place missing or too long");
  }
  const noteText = typeof data.note === "string" ? data.note.trim() : "";
  if (noteText.length > MEETUP_NOTE_MAX) {
    throw new GoalSpaceError("invalid-argument", "note too long");
  }
  const note = noteText.length > 0 ? noteText : null;
  const startsAt = data.startsAt;
  if (!Number.isInteger(startsAt)) {
    throw new GoalSpaceError("invalid-argument", "startsAt required");
  }
  if (startsAt < now - START_SKEW_MS) {
    throw new GoalSpaceError("invalid-argument", "starts in the past");
  }
  if (startsAt > now + MEETUP_MAX_AHEAD_MS) {
    throw new GoalSpaceError("invalid-argument", "starts too far ahead");
  }
  if (!isTimeZone(data.timeZone)) {
    throw new GoalSpaceError("invalid-argument", "timeZone required");
  }
  if (
    typeof containsProfanity === "function" &&
    [title, place, note].some((text) => text && containsProfanity(text))
  ) {
    throw new GoalSpaceError("invalid-argument", "objectionable");
  }
  return {
    sport: data.sport,
    title,
    place,
    note,
    startsAt,
    timeZone: data.timeZone,
  };
}

/** The Circle and the caller's membership, or a refusal. */
async function readCircleForMember({ get, firestore, uid, spaceId }) {
  const [spaceSnap, memberSnap] = await Promise.all([
    get(firestore.doc(`goalSpaces/${spaceId}`)),
    get(firestore.doc(`goalSpaces/${spaceId}/members/${uid}`)),
  ]);
  if (!spaceSnap.exists) {
    throw new GoalSpaceError("not-found", "no such circle");
  }
  if (!memberSnap.exists) {
    throw new GoalSpaceError("permission-denied", "not a member");
  }
  return spaceSnap.data();
}

/**
 * Plan a meet-up. Returns { meetupId, recipients }: the other members,
 * whom the callable tells.
 */
async function planMeetup({
  firestore,
  uid,
  spaceId,
  input,
  now,
  makeId,
  containsProfanity,
}) {
  if (!isDocumentId(spaceId)) {
    throw new GoalSpaceError("invalid-argument", "spaceId required");
  }
  const meetup = normaliseMeetupInput(input, now, containsProfanity);
  const space = await readCircleForMember({
    get: (ref) => ref.get(),
    firestore,
    uid,
    spaceId,
  });
  if (space.active !== true) {
    throw new GoalSpaceError("failed-precondition", "circle has ended");
  }
  const meetups = meetupsCollection(firestore, spaceId);
  const ahead = await meetups
    .where("startsAt", ">=", now - MEETUP_SHOWN_AFTER_START_MS)
    .limit(MEETUPS_AHEAD_MAX)
    .get();
  if (ahead.size >= MEETUPS_AHEAD_MAX) {
    throw new GoalSpaceError("failed-precondition", "too many planned");
  }

  // Past ones go now, a bounded batch at a time.
  const past = await meetups
    .where("startsAt", "<", now - PRUNE_AFTER_MS)
    .limit(PRUNE_BATCH)
    .get();
  await Promise.all(past.docs.map((d) => d.ref.delete()));

  const meetupId = makeId();
  await meetups.doc(meetupId).set({
    organiserUid: uid,
    ...meetup,
    going: [uid],
    createdAt: now,
  });

  const membersSnap = await firestore
    .collection("goalSpaces")
    .doc(spaceId)
    .collection("members")
    .get();
  const recipients = membersSnap.docs
    .map((d) => d.id)
    .filter((memberUid) => memberUid !== uid);
  return { meetupId, recipients, sport: meetup.sport };
}

/**
 * Say you're in, or that you can't make it. Saying you're in needs a live
 * Circle, a meet-up not yet over, and no block between you and its
 * organiser (a block refuses backing a check-in the same way). Returns
 * { going }: the list as stored.
 */
async function setMeetupGoing({
  firestore,
  uid,
  spaceId,
  meetupId,
  going,
  now,
}) {
  if (!isDocumentId(spaceId)) {
    throw new GoalSpaceError("invalid-argument", "spaceId required");
  }
  if (!isDocumentId(meetupId)) {
    throw new GoalSpaceError("invalid-argument", "meetupId required");
  }
  if (typeof going !== "boolean") {
    throw new GoalSpaceError("invalid-argument", "going required");
  }
  return firestore.runTransaction(async (tx) => {
    const meetupRef = firestore.doc(`goalSpaces/${spaceId}/meetups/${meetupId}`);
    const [space, meetupSnap] = await Promise.all([
      readCircleForMember({
        get: (ref) => tx.get(ref),
        firestore,
        uid,
        spaceId,
      }),
      tx.get(meetupRef),
    ]);
    if (!meetupSnap.exists) {
      throw new GoalSpaceError("not-found", "no such meet-up");
    }
    const meetup = meetupSnap.data();
    if (meetup.organiserUid === uid) {
      // The organiser is in by planning it; not making it is calling it off.
      throw new GoalSpaceError("invalid-argument", "organiser is going");
    }
    const list = Array.isArray(meetup.going)
      ? meetup.going.filter((s) => typeof s === "string")
      : [];
    if (!going) {
      if (!list.includes(uid)) return { going: list };
      const next = list.filter((s) => s !== uid);
      tx.update(meetupRef, { going: next });
      return { going: next };
    }
    if (space.active !== true) {
      throw new GoalSpaceError("failed-precondition", "circle has ended");
    }
    if (meetup.startsAt + MEETUP_SHOWN_AFTER_START_MS < now) {
      throw new GoalSpaceError("failed-precondition", "meet-up is over");
    }
    await assertNoBlockedPair({
      tx,
      firestore,
      uid,
      memberUids: [meetup.organiserUid],
    });
    if (list.includes(uid)) return { going: list };
    if (list.length >= GOING_MAX) {
      throw new GoalSpaceError("failed-precondition", "going list full");
    }
    const next = [...list, uid];
    tx.update(meetupRef, { going: next });
    return { going: next };
  });
}

/**
 * Call a meet-up off: its organiser, or the Circle's owner. Returns
 * { notify, sport }: who said they were in, other than the caller, while
 * it has not started (after its start there is nobody to warn).
 */
async function cancelMeetup({ firestore, uid, spaceId, meetupId, now }) {
  if (!isDocumentId(spaceId)) {
    throw new GoalSpaceError("invalid-argument", "spaceId required");
  }
  if (!isDocumentId(meetupId)) {
    throw new GoalSpaceError("invalid-argument", "meetupId required");
  }
  return firestore.runTransaction(async (tx) => {
    const meetupRef = firestore.doc(`goalSpaces/${spaceId}/meetups/${meetupId}`);
    const [space, meetupSnap] = await Promise.all([
      readCircleForMember({
        get: (ref) => tx.get(ref),
        firestore,
        uid,
        spaceId,
      }),
      tx.get(meetupRef),
    ]);
    if (!meetupSnap.exists) return { notify: [], sport: null };
    const meetup = meetupSnap.data();
    if (meetup.organiserUid !== uid && space.ownerId !== uid) {
      throw new GoalSpaceError("permission-denied", "organiser or owner only");
    }
    tx.delete(meetupRef);
    const notify =
      meetup.startsAt > now && Array.isArray(meetup.going)
        ? meetup.going.filter((s) => typeof s === "string" && s !== uid)
        : [];
    return {
      notify,
      sport: MEETUP_SPORTS.includes(meetup.sport) ? meetup.sport : "run",
    };
  });
}

/**
 * A member's part in a Circle's meet-ups goes when they leave it, are
 * removed or delete their account: the ones they planned, and their place
 * on every other's list. Idempotent.
 */
async function sweepMemberMeetups({ firestore, spaceId, uid }) {
  const meetups = meetupsCollection(firestore, spaceId);
  const [planned, joined] = await Promise.all([
    meetups.where("organiserUid", "==", uid).get(),
    meetups.where("going", "array-contains", uid).get(),
  ]);
  for (const d of planned.docs) await d.ref.delete();
  const plannedIds = new Set(planned.docs.map((d) => d.id));
  for (const d of joined.docs) {
    if (plannedIds.has(d.id)) continue;
    const going = (d.data().going || []).filter((s) => s !== uid);
    await d.ref.update({ going });
  }
}

/** Every meet-up in a Circle that has ended. */
async function deleteCircleMeetups({ firestore, spaceId }) {
  const snap = await meetupsCollection(firestore, spaceId).get();
  for (const d of snap.docs) await d.ref.delete();
}

/**
 * After someone leaves a Circle: their part in its meet-ups goes, and if
 * their leaving ended it (the owner leaving does), every meet-up goes.
 */
async function afterMemberLeft({ firestore, spaceId, uid }) {
  await sweepMemberMeetups({ firestore, spaceId, uid });
  const spaceSnap = await firestore.doc(`goalSpaces/${spaceId}`).get();
  if (!spaceSnap.exists || spaceSnap.data().active !== true) {
    await deleteCircleMeetups({ firestore, spaceId });
  }
}

module.exports = {
  MEETUP_SPORTS,
  MEETUP_TITLE_MAX,
  MEETUP_PLACE_MAX,
  MEETUP_NOTE_MAX,
  MEETUP_TIME_ZONE_MAX,
  MEETUP_MAX_AHEAD_MS,
  MEETUP_SHOWN_AFTER_START_MS,
  MEETUPS_AHEAD_MAX,
  PRUNE_AFTER_MS,
  MEETUP_ACTIONS,
  normaliseMeetupInput,
  planMeetup,
  setMeetupGoing,
  cancelMeetup,
  sweepMemberMeetups,
  deleteCircleMeetups,
  afterMemberLeft,
};

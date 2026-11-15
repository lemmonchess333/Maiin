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
 *   paceGroups    a run's pace groups, typed on one line, or null
 *                 (Run27 call 10)
 *   repeat        "weekly", or null (Run27 call 10)
 *   startsAt      the instant it starts, in ms
 *   timeZone      the organiser's IANA zone when they planned it
 *   going         member uids, the organiser first
 *   createdAt     ms
 *   remindAt      when the reminder is due, in ms; absent once it has
 *                 gone, and on a meet-up planned too close to its start
 *   remindedAt    when the reminder went, in ms
 *   repeatAt      when a weekly one's next is planned, in ms: once it is
 *                 over; absent once that is done or the series has ended
 *
 * A meet-up is deleted when it is called off, when its organiser leaves
 * or is removed, when the Circle ends, and with its organiser's account;
 * a member who leaves comes off every `going` list. Past ones go when the
 * next one is planned (PRUNE_AFTER_MS), so nothing waits on a TTL policy.
 *
 * The reminder and the weekly repeat (Run27 call 10, Strava's club events:
 * "All RSVP'd athletes will receive an event notification 24 hours before
 * the start time of the event", and an event that repeats) are the server's
 * own, swept each hour by `sweepMeetups`:
 *   - About 24 hours before the start, everyone still in, and still a
 *     member, gets one notice under the Circles switch (`remindMeetup`).
 *     It names nobody and carries none of the organiser's words, so the
 *     tray keeps nothing of theirs after they delete their account.
 *   - A weekly one plans its next when it is over: the same time of day in
 *     the organiser's zone seven days on, with the organiser in and
 *     everyone else to say again (`repeatMeetup`). Calling it off, the
 *     organiser leaving, the Circle ending, a full Circle, a restricted or
 *     departing organiser, or words the filter now refuses end the series.
 * Each is marked on the meet-up once done, so a sweep run twice does
 * nothing twice, and nothing is sent for a meet-up called off, which is
 * deleted.
 *
 * The bounds are mirrored by src/features/goalSpace/circleMeetups.ts and
 * pinned to it by circleMeetups.cross.test.ts.
 */

const { GoalSpaceError, assertNoBlockedPair } = require("./goalSpaceMembership");
const { isDocumentId } = require("./documentId");
const { isBlockedBetween } = require("./blockGuard");
const { transactionAccountsLive } = require("./deletionTransactionGuard");

const MEETUP_SPORTS = Object.freeze(["run", "lift"]);
const MEETUP_TITLE_MAX = 60;
const MEETUP_PLACE_MAX = 80;
const MEETUP_NOTE_MAX = 200;
const MEETUP_TIME_ZONE_MAX = 64;

/** A run's pace groups, on one line (Run27 call 10). A Tropos heuristic:
 *  Strava allows four groups, and "5:00, 5:30, 6:00 and 6:30 /km" with a
 *  word for each still fits. */
const MEETUP_PACE_GROUPS_MAX = 80;

/** How a meet-up may repeat (Run27 call 10). */
const MEETUP_REPEATS = Object.freeze(["weekly"]);

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

/** How long before its start the reminder goes: Strava's "24 hours before
 *  the start time of the event". */
const MEETUP_REMINDER_LEAD_MS = DAY_MS;

/** How long a plan must stand before its reminder would go, or it gets
 *  none. A Tropos heuristic: a reminder an hour after the plan's own notice
 *  tells nobody anything, and someone planning within 30 hours of the start
 *  has just told everyone. */
const MEETUP_REMINDER_MIN_NOTICE_MS = 6 * 3_600_000;

/** Who the reminder is from: the meet-up, not a person, so the row names
 *  nobody, as the league's result comes from the league. */
const MEETUP_SENDER = "tropos-meetups";

/** The reminder's notice, one per member per meet-up. */
const MEETUP_REMINDER_TYPE = "circle_meetup_reminder";

/** Meet-ups each hourly sweep takes of each kind of work. A Tropos
 *  heuristic: far more than are due in an hour today, and a bound on one
 *  run; whatever is left goes in the next hour's. */
const SWEEP_BATCH = 200;

/** Meet-ups worked on at once in a sweep. */
const SWEEP_CONCURRENCY = 10;

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
  // Pace groups are a run's; a lift carries none, whatever was sent.
  const paceText = data.sport === "run" ? oneLine(data.paceGroups) : "";
  if (paceText.length > MEETUP_PACE_GROUPS_MAX) {
    throw new GoalSpaceError("invalid-argument", "pace groups too long");
  }
  const paceGroups = paceText.length > 0 ? paceText : null;
  if (
    data.repeat !== undefined &&
    data.repeat !== null &&
    !MEETUP_REPEATS.includes(data.repeat)
  ) {
    throw new GoalSpaceError("invalid-argument", "repeat must be weekly");
  }
  const repeat = MEETUP_REPEATS.includes(data.repeat) ? data.repeat : null;
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
    typedWords({ title, place, note, paceGroups }).some((text) =>
      containsProfanity(text)
    )
  ) {
    throw new GoalSpaceError("invalid-argument", "objectionable");
  }
  return {
    sport: data.sport,
    title,
    place,
    note,
    paceGroups,
    repeat,
    startsAt,
    timeZone: data.timeZone,
  };
}

/** Every piece of a meet-up a member typed, for the word filter. */
function typedWords({ title, place, note, paceGroups }) {
  return [title, place, note, paceGroups].filter(
    (text) => typeof text === "string" && text.length > 0
  );
}

/**
 * When a meet-up's server work falls due: its reminder, MEETUP_REMINDER_LEAD_MS
 * before it starts, unless that is less than MEETUP_REMINDER_MIN_NOTICE_MS
 * after `now` (the plan is fresh news); and, for a weekly one, planning the
 * next, once it is over. An absent field is no work.
 */
function meetupSchedule({ startsAt, repeat, now }) {
  const remindAt = startsAt - MEETUP_REMINDER_LEAD_MS;
  return {
    ...(remindAt - now >= MEETUP_REMINDER_MIN_NOTICE_MS ? { remindAt } : {}),
    ...(repeat === "weekly"
      ? { repeatAt: startsAt + MEETUP_SHOWN_AFTER_START_MS }
      : {}),
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
    ...meetupSchedule({ startsAt: meetup.startsAt, repeat: meetup.repeat, now }),
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

// ── The reminder and the weekly repeat (Run27 call 10) ────────────────────

const MEETUP_PATH = /^goalSpaces\/([^/]+)\/meetups\/([^/]+)$/;

/** The Circle and the meet-up a collection-group hit names, or null for a
 *  document called `meetups` anywhere else. */
function meetupPath(ref) {
  const match = MEETUP_PATH.exec((ref && ref.path) || "");
  return match ? { spaceId: match[1], meetupId: match[2] } : null;
}

/** Wall-clock time in `timeZone` at `instant`, as if it were UTC, minus the
 *  instant: the zone's offset then, in ms (whole seconds). */
function zoneOffsetMs(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type) => Number(parts.find((p) => p.type === type).value);
  const wall = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second")
  );
  return wall - (instant - (((instant % 1000) + 1000) % 1000));
}

/**
 * The start a week on, at the same time of day in the organiser's zone: a
 * Saturday 08:00 stays 08:00 across the clocks changing, which seven days
 * of milliseconds would not. A time the clocks skip that night lands on
 * the hour after it.
 */
function nextWeeklyStart(startsAt, timeZone) {
  const wall = startsAt + zoneOffsetMs(startsAt, timeZone) + WEEK_DAYS * DAY_MS;
  let at = wall - zoneOffsetMs(startsAt, timeZone);
  at = wall - zoneOffsetMs(at, timeZone);
  return wall - zoneOffsetMs(at, timeZone);
}

/** The person's own zone when it is a real one, else the meet-up's. */
function readerTimeZone(stored, fallback) {
  return isTimeZone(stored) ? stored : fallback;
}

/**
 * The reminder's sentence, in the reader's zone: "Group run on Saturday at
 * 08:00. You and 3 others are in." The day is named rather than called
 * tomorrow, so the row still reads true the next day. Nobody is named and
 * none of the organiser's words are in it (the module header says why).
 */
function meetupReminderMessage({ sport, startsAt, timeZone, othersIn }) {
  const at = new Date(startsAt);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
  }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  const what = sport === "lift" ? "Group lift" : "Group run";
  const who =
    othersIn > 0
      ? `You and ${othersIn} ${othersIn === 1 ? "other" : "others"} are in.`
      : "You’re in.";
  return `${what} on ${day} at ${time}. ${who}`;
}

/** The reminder's notice id for one meet-up: the same for every member and
 *  every sweep, so a member gets it once. */
function meetupReminderNotificationId(spaceId, meetupId) {
  return `${MEETUP_REMINDER_TYPE}_${spaceId}_${meetupId}`;
}

/**
 * How the sweep tells a member: through `createNotification`, the one
 * writer of the tray, which holds the recipient's Circles switch, the
 * block check and the deletion freeze. `keepExisting` with the fixed id is
 * what makes it once: a second sweep finds the row and writes nothing, so
 * no second push follows it (socialPush.js pushes a new row only).
 */
function meetupReminderNotifier({ firestore, createNotification, serverTimestamp }) {
  return (toUid, { notificationId, message }) =>
    createNotification({
      firestore,
      fromUid: MEETUP_SENDER,
      toUid,
      notificationId,
      keepExisting: true,
      data: { type: MEETUP_REMINDER_TYPE, message },
      serverTimestamp,
    });
}

/**
 * Send one meet-up's reminder, if it is due, to everyone in it who is still
 * a member, then mark it sent. Nothing goes for a meet-up that has started,
 * in a Circle that has ended, or (it is deleted) one called off; nothing
 * goes to someone with a block between them and the organiser, as saying
 * you're in is refused across one.
 *
 * Marked after the sends, not before: a sweep cut off part way sends the
 * rest on the next one, and the fixed notice id keeps everyone at one.
 * Returns { sent }: how many members were told now.
 */
async function remindMeetup({ firestore, ref, now, notify, deleteField }) {
  const where = meetupPath(ref);
  if (!where) return { sent: 0 };
  const snap = await ref.get();
  if (!snap.exists) return { sent: 0 };
  const meetup = snap.data() || {};
  if (typeof meetup.remindAt !== "number" || meetup.remindAt > now) {
    return { sent: 0 };
  }
  const done = () =>
    firestore.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists) return;
      tx.update(ref, { remindAt: deleteField(), remindedAt: now });
    });
  if (
    typeof meetup.remindedAt === "number" ||
    !(meetup.startsAt > now) ||
    !Array.isArray(meetup.going)
  ) {
    await done();
    return { sent: 0 };
  }
  const [spaceSnap, membersSnap] = await Promise.all([
    firestore.doc(`goalSpaces/${where.spaceId}`).get(),
    firestore.collection(`goalSpaces/${where.spaceId}/members`).get(),
  ]);
  if (!spaceSnap.exists || (spaceSnap.data() || {}).active !== true) {
    await done();
    return { sent: 0 };
  }
  const members = new Set(membersSnap.docs.map((d) => d.id));
  const going = [
    ...new Set(
      meetup.going.filter((s) => typeof s === "string" && members.has(s))
    ),
  ];
  const notificationId = meetupReminderNotificationId(
    where.spaceId,
    where.meetupId
  );
  let sent = 0;
  for (const uid of going) {
    if (
      uid !== meetup.organiserUid &&
      (await isBlockedBetween(firestore, uid, meetup.organiserUid))
    ) {
      continue;
    }
    const profile = await firestore.doc(`users/${uid}`).get();
    const timeZone = readerTimeZone(
      profile.exists ? (profile.data() || {}).timezone : null,
      meetup.timeZone
    );
    await notify(uid, {
      notificationId,
      message: meetupReminderMessage({
        sport: meetup.sport,
        startsAt: meetup.startsAt,
        timeZone,
        othersIn: going.length - 1,
      }),
    });
    sent += 1;
  }
  await done();
  return { sent };
}

/**
 * Plan a weekly meet-up's next one, once it is over: the same words, the
 * same time of day in the organiser's zone a week on (or the first such
 * week still ahead, after a sweep that did not run), with the organiser in
 * and everyone else to say again. The finished one goes in the same
 * transaction, so a sweep run twice plans one.
 *
 * The series ends instead (its `repeatAt` cleared, nothing planned) when
 * the Circle has ended, the organiser has left it, is restricted or is
 * deleting their account, the words meet a filter that now refuses them,
 * or the Circle already has MEETUPS_AHEAD_MAX ahead. No notice goes: the
 * members were told of the series when it was planned, and the Circle's
 * row on Together reads its next one.
 *
 * Returns { meetupId } for the one planned, or { ended } with the reason.
 */
async function repeatMeetup({
  firestore,
  ref,
  now,
  makeId,
  deleteField,
  isRestricted,
  containsProfanity,
}) {
  const where = meetupPath(ref);
  if (!where) return { ended: "path" };
  const first = await ref.get();
  if (!first.exists) return { ended: "gone" };
  const organiserUid = (first.data() || {}).organiserUid;
  const restricted =
    typeof organiserUid === "string" && organiserUid
      ? await isRestricted(organiserUid)
      : true;
  const meetups = meetupsCollection(firestore, where.spaceId);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ended: "gone" };
    const m = snap.data() || {};
    if (typeof m.repeatAt !== "number" || m.repeatAt > now) {
      return { ended: "not-due" };
    }
    const [spaceSnap, organiserSnap, ahead] = await Promise.all([
      tx.get(firestore.doc(`goalSpaces/${where.spaceId}`)),
      tx.get(
        firestore.doc(`goalSpaces/${where.spaceId}/members/${m.organiserUid}`)
      ),
      tx.get(
        meetups
          .where("startsAt", ">=", now - MEETUP_SHOWN_AFTER_START_MS)
          .limit(MEETUPS_AHEAD_MAX + 1)
      ),
    ]);
    const live = await transactionAccountsLive({
      firestore,
      tx,
      uids: [m.organiserUid],
    });
    const end = (reason) => {
      tx.update(ref, { repeatAt: deleteField() });
      return { ended: reason };
    };
    if (m.repeat !== "weekly") return end("not-weekly");
    if (!spaceSnap.exists || (spaceSnap.data() || {}).active !== true) {
      return end("circle-ended");
    }
    if (!organiserSnap.exists) return end("organiser-left");
    if (restricted) return end("restricted");
    if (!live) return end("deleting");
    if (
      !MEETUP_SPORTS.includes(m.sport) ||
      !isTimeZone(m.timeZone) ||
      !Number.isFinite(m.startsAt)
    ) {
      return end("malformed");
    }
    const words = {
      title: m.title,
      place: m.place,
      note: m.note ?? null,
      paceGroups: m.paceGroups ?? null,
    };
    if (
      typeof containsProfanity === "function" &&
      typedWords(words).some((text) => containsProfanity(text))
    ) {
      return end("objectionable");
    }
    const others = ahead.docs.filter((d) => d.id !== where.meetupId);
    if (others.length >= MEETUPS_AHEAD_MAX) return end("full");
    let startsAt = nextWeeklyStart(m.startsAt, m.timeZone);
    for (let week = 0; startsAt <= now && week < 60; week++) {
      startsAt = nextWeeklyStart(startsAt, m.timeZone);
    }
    if (!(startsAt > now) || startsAt > now + MEETUP_MAX_AHEAD_MS) {
      return end("no-next");
    }
    const meetupId = makeId();
    tx.set(meetups.doc(meetupId), {
      organiserUid: m.organiserUid,
      sport: m.sport,
      ...words,
      repeat: "weekly",
      startsAt,
      timeZone: m.timeZone,
      going: [m.organiserUid],
      createdAt: now,
      ...meetupSchedule({ startsAt, repeat: "weekly", now }),
    });
    tx.delete(ref);
    return { meetupId };
  });
}

/** Run `work` on each item, a few at a time; a failure is counted, not
 *  thrown, so one bad meet-up never stops the rest. */
async function eachBounded(items, work) {
  let failed = 0;
  for (let i = 0; i < items.length; i += SWEEP_CONCURRENCY) {
    await Promise.all(
      items.slice(i, i + SWEEP_CONCURRENCY).map(async (item) => {
        try {
          await work(item);
        } catch (err) {
          failed += 1;
          console.error("sweepMeetups: one meet-up failed", {
            message: err && err.message,
          });
        }
      })
    );
  }
  return failed;
}

/**
 * The hourly sweep (`hourlyMeetupSweep`): weekly meet-ups that are over plan
 * their next, and reminders that are due go. Each is found by its own due
 * field (`repeatAt`, `remindAt`), which a meet-up carries only while that
 * work waits, through a collection-group index on each
 * (firestore.indexes.json), SWEEP_BATCH at a time.
 */
async function sweepMeetups({
  firestore,
  now,
  notify,
  makeId,
  deleteField,
  isRestricted,
  containsProfanity,
}) {
  const due = (field) =>
    firestore
      .collectionGroup("meetups")
      .where(field, "<=", now)
      .limit(SWEEP_BATCH)
      .get();
  const repeats = (await due("repeatAt")).docs.filter((d) => meetupPath(d.ref));
  let repeated = 0;
  const repeatFailed = await eachBounded(repeats, async (d) => {
    const out = await repeatMeetup({
      firestore,
      ref: d.ref,
      now,
      makeId,
      deleteField,
      isRestricted,
      containsProfanity,
    });
    if (out.meetupId) repeated += 1;
  });
  const reminders = (await due("remindAt")).docs.filter((d) =>
    meetupPath(d.ref)
  );
  let reminded = 0;
  let told = 0;
  const remindFailed = await eachBounded(reminders, async (d) => {
    const { sent } = await remindMeetup({
      firestore,
      ref: d.ref,
      now,
      notify,
      deleteField,
    });
    reminded += 1;
    told += sent;
  });
  return {
    repeated,
    reminded,
    told,
    failed: repeatFailed + remindFailed,
  };
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
  MEETUP_PACE_GROUPS_MAX,
  MEETUP_REPEATS,
  MEETUP_REMINDER_LEAD_MS,
  MEETUP_REMINDER_MIN_NOTICE_MS,
  MEETUP_SENDER,
  MEETUP_REMINDER_TYPE,
  SWEEP_BATCH,
  normaliseMeetupInput,
  meetupSchedule,
  nextWeeklyStart,
  meetupReminderMessage,
  meetupReminderNotificationId,
  meetupReminderNotifier,
  remindMeetup,
  repeatMeetup,
  sweepMeetups,
  planMeetup,
  setMeetupGoing,
  cancelMeetup,
  sweepMemberMeetups,
  deleteCircleMeetups,
  afterMemberLeft,
};

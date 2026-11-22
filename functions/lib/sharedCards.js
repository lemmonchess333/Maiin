"use strict";

/* ─────────────────────────────────────────────
   A shared card's own page (Soc17 call 1).

   A card that is not of a public post links to
   https://troposfit.com/card/<token>, where <token> is 128 random bits the
   sharer's app made when the share sheet opened. The page draws the card
   from a stored copy of what it showed: `sharedCards/{token}`, written
   here and only here. firestore.rules refuses every client read and
   write of it; the page reads it with the Admin SDK (sharedCardPage.js).

   The copy is the card's figures and words as drawn, field by field from
   the list below, the owner's uid, the session or post it shows and when.
   Never a run's route, its line or any coordinate, never the photo a card
   was drawn on, never a name (the page reads the sharer's first name
   when it is opened, so a new name follows), and never a figure the
   sharer hid with the sheet's eye toggles.

   The copy goes with the post or saved session it shows (the delete
   triggers call `removeCardsShowing`), with the account (the deletion
   executor queries `ownerUid`), and when the share sheet was cancelled
   (the `sharedCard` callable's remove). The page also checks the session
   is still there each time it is opened, so a delete the trigger has not
   reached yet already shows nothing. A card that shows no session or post
   (a day's food, a week) lasts 30 days (owner, Soc17): its copy carries
   `expiresAt`, the page answers it as unavailable once that has passed,
   and Firestore's TTL policy on `sharedCards.expiresAt`
   (firestore.indexes.json) deletes it.

   A lift card's drawing is kept as its exercise id (`art`), which must be
   a released cut-out (cardArt.js); the page draws the website's own copy
   of that cut-out, never an address the phone sent.

   Joining from the page goes through the sharer's invite code (Soc17
   call 2), the code they had when they shared. The page shows it only
   while it is still theirs: New code, or the renewal a block makes,
   stops every card page shared before it from carrying a code, as it
   stops every invite link (Soc15 STATUS lines).
   ───────────────────────────────────────────── */

const { isDocumentId } = require("./documentId");
const { transactionAccountsLive } = require("./deletionTransactionGuard");
const { isRestricted } = require("./restriction");
const { isAccountDeleting, isTombstoned } = require("./accountDeletionStatus");
const { firstNameOf, normaliseInviteCode } = require("./inviteCodes");
const { cardArtSrc } = require("./cardArt");

/** Where the copies live. */
const SHARED_CARDS = "sharedCards";

/** A token: 16 random bytes in URL-safe base64, no padding. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** The templates the share sheet draws. An anniversary has its own share
 *  and no sheet, so it has no page. */
const TEMPLATES = Object.freeze(["run", "lift", "hybrid", "nutrition", "recap"]);

/** A run, a lift or both is a session: its copy names the session or post
 *  it shows, and goes when that does. A day's food and a week have none. */
const SESSION_TEMPLATES = Object.freeze(["run", "lift", "hybrid"]);

/** The figures each template draws (ShareCardRenderer). Anything else in
 *  a request is left out. */
const TEMPLATE_FIGURES = Object.freeze({
  run: ["distanceKm", "durationSec", "paceSecPerKm", "elevationM", "splits"],
  lift: [
    "totalVolumeKg",
    "totalReps",
    "durationSec",
    "exerciseCount",
    "prCount",
    "prExercise",
  ],
  hybrid: ["totalVolumeKg", "distanceKm", "durationSec"],
  nutrition: ["calories", "calorieTarget", "protein", "carbs", "fat"],
  recap: ["sessionsCount", "distanceKm", "totalVolumeKg", "streakDays"],
});

/** Each eye toggle and the figures it hides, per template. The keys are
 *  the sheet's (TOGGLEABLE_STATS in src/lib/shareCard/statToggles.ts);
 *  sharedCards.cross.test.ts holds the two equal. A hidden figure is not
 *  stored: the sharer chose not to show it. */
const HIDDEN_FIGURES = Object.freeze({
  run: {
    distance: ["distanceKm"],
    duration: ["durationSec"],
    pace: ["paceSecPerKm"],
    splits: ["splits"],
    elevation: ["elevationM"],
  },
  lift: {
    volume: ["totalVolumeKg", "totalReps"],
    exercises: ["exerciseCount"],
    duration: ["durationSec"],
    prs: ["prCount", "prExercise"],
  },
  hybrid: {
    liftVolume: ["totalVolumeKg"],
    runDistance: ["distanceKm"],
    totalTime: ["durationSec"],
  },
  nutrition: {
    calories: ["calories", "calorieTarget"],
    macros: ["protein", "carbs", "fat"],
  },
  recap: {
    sessions: ["sessionsCount"],
    runDistance: ["distanceKm"],
    liftVolume: ["totalVolumeKg"],
    streak: ["streakDays"],
  },
});

/** The largest each number may be. A year's recap is the largest card. */
const FIGURE_MAX = Object.freeze({
  distanceKm: 100000,
  durationSec: 366 * 86400,
  paceSecPerKm: 3600,
  elevationM: 1000000,
  totalVolumeKg: 100000000,
  totalReps: 10000000,
  exerciseCount: 500,
  prCount: 1000,
  calories: 50000,
  calorieTarget: 50000,
  protein: 5000,
  carbs: 5000,
  fat: 5000,
  sessionsCount: 5000,
  streakDays: 20000,
});

/** Counts, kept whole. */
const WHOLE = new Set([
  "totalReps",
  "exerciseCount",
  "prCount",
  "sessionsCount",
  "streakDays",
]);

/** The card's words and how long each may be. Each passes the word
 *  filter or is left off the copy. */
const TEXT_MAX = Object.freeze({
  headline: 80,
  line: 200,
  prExercise: 60,
  recapTitle: 40,
  date: 40,
});

/** The words each template draws besides its figures. */
const TEMPLATE_TEXT = Object.freeze({
  run: ["headline", "line"],
  lift: ["headline", "line"],
  hybrid: [],
  nutrition: [],
  recap: ["recapTitle"],
});

/** The finish's colours (FinishTone in src/lib/finishMoment.ts). */
const TONES = Object.freeze(["achievement", "lifting", "running"]);

/** A run card's splits: the card draws six. */
const MAX_SPLITS = 6;

/** A card's date as the app writes it ("22 Nov 2026", "Saturday 22
 *  November"): letters, digits and a few marks, nothing else. */
const DATE_TEXT = /^[\p{L}\p{N} .,:·/’'-]+$/u;

/** How long a request's card may be once written out, before reading it. */
const MAX_CARD_JSON = 4000;

/** How long a card that shows no session or post keeps its page (owner,
 *  Soc17): a day's food, a week. */
const UNSOURCED_CARD_DAYS = 30;
const DAY_MS = 86_400_000;

/** A stored time in milliseconds: a Timestamp, a Date or a number. */
function timeMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === "function") return value.toMillis();
  return undefined;
}

class SharedCardError extends Error {
  constructor(code, reason) {
    super(reason);
    this.code = code;
    this.reason = reason;
  }
}

function isToken(value) {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

function isUid(value) {
  return isDocumentId(value) && value.length <= 128;
}

/** A source id: a document id of the length Firestore's own are. */
function sourceId(value) {
  return isDocumentId(value) && value.length <= 128 ? value : undefined;
}

/** A number in [0, max], or undefined. */
function figure(value, max) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= max
    ? value
    : undefined;
}

/** Text trimmed, capped and passed by the word filter, or undefined. A
 *  no-break space is kept, so the page breaks the card's line where the
 *  phone did ("80 kg × 8" stays on one line, `keepTogether`); the filter
 *  reads every space as a space, since it splits words on spaces alone. */
function words(value, max, containsProfanity) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/[^\S ]+/g, " ");
  if (!trimmed || trimmed.length > max) return undefined;
  if (
    typeof containsProfanity === "function" &&
    containsProfanity(trimmed.replace(/\s+/g, " "))
  ) {
    return undefined;
  }
  return trimmed;
}

/** A run's splits as the card draws them, or undefined when any is not
 *  one: a lap number and a pace. */
function splitsOf(value) {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const out = [];
  for (const raw of value.slice(0, MAX_SPLITS)) {
    const split = raw && typeof raw === "object" ? raw : {};
    const lap = figure(split.lap, 1000);
    const pace = figure(split.paceSecPerKm, FIGURE_MAX.paceSecPerKm);
    if (lap === undefined || !Number.isInteger(lap) || lap < 1 || !pace) {
      return undefined;
    }
    out.push({ lap, paceSecPerKm: pace });
  }
  return out;
}

/**
 * The card as it is kept, from what a request (or a stored copy) says, or
 * null when it is not a card the page can draw. Only the fields listed
 * above, each checked; the figures a hidden toggle covers are left out;
 * words the filter refuses are left off.
 *
 * @param {unknown} raw
 * @param {(text: string) => boolean} [containsProfanity]
 */
function cardCopy(raw, containsProfanity) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  let size;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return null;
  }
  if (size > MAX_CARD_JSON) return null;
  const template =
    typeof raw.template === "string" && TEMPLATES.includes(raw.template)
      ? raw.template
      : null;
  if (!template) return null;

  const toggles = HIDDEN_FIGURES[template];
  const hidden = Array.isArray(raw.hiddenStats)
    ? [
        ...new Set(
          raw.hiddenStats.filter(
            (key) => typeof key === "string" && Object.hasOwn(toggles, key)
          )
        ),
      ].sort()
    : [];
  const left = new Set(hidden.flatMap((key) => toggles[key]));

  const card = {
    template,
    format: raw.format === "square" ? "square" : "story",
    // A photo stays on the sharer's phone: its card is drawn on the brand's
    // stage here.
    background: ["dark", "transparent"].includes(raw.background)
      ? raw.background
      : "brand",
    unit: raw.unit === "mi" ? "mi" : "km",
    liftUnit: raw.liftUnit === "lbs" ? "lbs" : "kg",
    hiddenStats: hidden,
  };

  const date = words(raw.date, TEXT_MAX.date, containsProfanity)?.replace(
    /\s/g,
    " "
  );
  if (date && DATE_TEXT.test(date)) card.date = date;

  for (const key of TEMPLATE_FIGURES[template]) {
    if (left.has(key)) continue;
    if (key === "splits") {
      const splits = splitsOf(raw.splits);
      if (splits) card.splits = splits;
      continue;
    }
    if (key === "prExercise") {
      const name = words(raw.prExercise, TEXT_MAX.prExercise, containsProfanity);
      if (name) card.prExercise = name;
      continue;
    }
    const value = figure(raw[key], FIGURE_MAX[key]);
    if (value !== undefined) card[key] = WHOLE.has(key) ? Math.round(value) : value;
  }

  for (const key of TEMPLATE_TEXT[template]) {
    const text = words(raw[key], TEXT_MAX[key], containsProfanity);
    if (text) card[key] = text;
  }
  if (SESSION_TEMPLATES.includes(template) && TONES.includes(raw.tone)) {
    card.tone = raw.tone;
  }
  // A lift's drawing, by a released cut-out's id: never an address.
  if (template === "lift" && cardArtSrc(raw.art)) card.art = raw.art;
  return card;
}

/** The post or sessions a request names, each a document id. */
function sourcesOf(raw) {
  const value = raw && typeof raw === "object" ? raw : {};
  const sources = {};
  for (const key of ["postId", "workoutId", "runId"]) {
    const id = sourceId(value[key]);
    if (id) sources[key] = id;
  }
  return sources;
}

/**
 * Whether each source is the owner's and still there: their post, which
 * no moderation flag holds back, their saved workout, their saved run.
 * Throws when a read fails.
 */
async function sourcesLive(firestore, uid, sources) {
  const reads = [];
  if (sources.postId) {
    reads.push(
      firestore
        .collection("activities")
        .doc(sources.postId)
        .get()
        .then((snap) => {
          const post = snap.exists ? snap.data() || {} : null;
          return !!post && post.authorId === uid && post.flagged !== true;
        })
    );
  }
  const userRef = firestore.collection("users").doc(uid);
  if (sources.workoutId) {
    reads.push(
      userRef
        .collection("workouts")
        .doc(sources.workoutId)
        .get()
        .then((snap) => snap.exists)
    );
  }
  if (sources.runId) {
    reads.push(
      userRef
        .collection("runs")
        .doc(sources.runId)
        .get()
        .then((snap) => snap.exists)
    );
  }
  return (await Promise.all(reads)).every(Boolean);
}

/**
 * Keep the copy of a card the caller is sharing, under the token their app
 * made. The callable has checked the caller is signed in, not restricted
 * and not being deleted; the deletion freeze is read again in the
 * transaction that writes. The same token again, from the same person,
 * replaces their copy (a retry, or the choices changed); a token someone
 * else holds is refused.
 *
 * @param {{
 *   firestore: FirebaseFirestore.Firestore,
 *   uid: string,
 *   token: unknown,
 *   card: unknown,
 *   sources: unknown,
 *   createdAt: unknown,
 *   nowMs?: number,
 *   containsProfanity?: (text: string) => boolean,
 *   inviteCodeFor?: (uid: string) => Promise<string | null>,
 *   logger?: { warn: Function },
 * }} args
 */
async function storeSharedCard({
  firestore,
  uid,
  token,
  card,
  sources,
  createdAt,
  nowMs = Date.now(),
  containsProfanity,
  inviteCodeFor,
  logger,
}) {
  if (!isUid(uid)) throw new SharedCardError("unauthenticated", "no-account");
  if (!isToken(token)) throw new SharedCardError("invalid-argument", "token");
  const copy = cardCopy(card, containsProfanity);
  if (!copy) throw new SharedCardError("invalid-argument", "card");
  const shows = sourcesOf(sources);
  const named = Object.keys(shows).length > 0;
  if (SESSION_TEMPLATES.includes(copy.template) && !named) {
    throw new SharedCardError("invalid-argument", "source");
  }
  if (named && !(await sourcesLive(firestore, uid, shows))) {
    throw new SharedCardError("not-found", "source");
  }

  // The code joining from the page uses (Soc17 call 2). A code that cannot
  // be had leaves the page without one, never without the card.
  let inviteCode = null;
  if (typeof inviteCodeFor === "function") {
    try {
      inviteCode = normaliseInviteCode(await inviteCodeFor(uid));
    } catch (err) {
      if (logger) logger.warn("sharedCard.invite_code_failed", { err: String(err) });
    }
  }

  const ref = firestore.collection(SHARED_CARDS).doc(token);
  await firestore.runTransaction(async (tx) => {
    const [existing, live] = await Promise.all([
      tx.get(ref),
      transactionAccountsLive({ firestore, tx, uids: [uid] }),
    ]);
    if (!live) {
      throw new SharedCardError("failed-precondition", "account-deleting");
    }
    const held = existing.exists ? existing.data() || {} : null;
    if (held && held.ownerUid !== uid) {
      throw new SharedCardError("already-exists", "token");
    }
    const doc = {
      ownerUid: uid,
      ...shows,
      card: copy,
      createdAt: held && held.createdAt ? held.createdAt : createdAt,
    };
    if (inviteCode) doc.inviteCode = inviteCode;
    // Nothing it shows can be deleted, so it lasts 30 days from when it
    // was first kept. The TTL policy reads a time, not a sentinel.
    if (!named) {
      doc.expiresAt =
        held && timeMs(held.expiresAt) !== undefined
          ? held.expiresAt
          : new Date(nowMs + UNSOURCED_CARD_DAYS * DAY_MS);
    }
    tx.set(ref, doc);
  });
  return { stored: true };
}

/** Take back the caller's copy under `token`: the share was cancelled, or
 *  the words went with another link. Someone else's copy is left alone. */
async function removeSharedCard({ firestore, uid, token }) {
  if (!isUid(uid) || !isToken(token)) return { removed: false };
  const ref = firestore.collection(SHARED_CARDS).doc(token);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || (snap.data() || {}).ownerUid !== uid) {
      return { removed: false };
    }
    tx.delete(ref);
    return { removed: true };
  });
}

/**
 * Delete every copy that shows a post or session just deleted: `field` is
 * "postId", "workoutId" or "runId". A post's id is the post's alone; a
 * session's is unique only within its owner's account, so those copies
 * must also be the owner's. Returns how many went.
 */
async function removeCardsShowing({ firestore, field, id, uid }) {
  if (!["postId", "workoutId", "runId"].includes(field) || !sourceId(id)) {
    return 0;
  }
  const snap = await firestore
    .collection(SHARED_CARDS)
    .where(field, "==", id)
    .get();
  const refs = snap.docs
    .filter((doc) => field === "postId" || (doc.data() || {}).ownerUid === uid)
    .map((doc) => doc.ref);
  for (let i = 0; i < refs.length; i += 400) {
    const batch = firestore.batch();
    for (const ref of refs.slice(i, i + 400)) batch.delete(ref);
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return refs.length;
}

const METRES_PER_MILE = 1609.344;
const KG_PER_LB = 0.45359237;

/** "26:41", "1:02:10". */
function clock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "4,200": a server has no reader's locale, so it names one. */
function whole(value) {
  return Math.round(value).toLocaleString("en-GB");
}

function distanceText(km, unit) {
  return unit === "mi"
    ? `${((km * 1000) / METRES_PER_MILE).toFixed(2)} mi`
    : `${km.toFixed(2)} km`;
}

function weightText(kg, liftUnit) {
  return liftUnit === "lbs" ? `${whole(kg / KG_PER_LB)} lb` : `${whole(kg)} kg`;
}

function plural(n, one, many) {
  return `${whole(n)} ${n === 1 ? one : many}`;
}

/**
 * The card's figures in one sentence, in the sharer's units: the link
 * preview's description and, on the page, what the card says to a screen
 * reader. Only what the card shows, so a hidden figure is never said.
 */
function cardSummary(card) {
  const parts = [];
  if (card.template === "run") {
    if (card.distanceKm !== undefined)
      parts.push(distanceText(card.distanceKm, card.unit));
    if (card.durationSec)
      parts.push(`${parts.length ? "in " : ""}${clock(card.durationSec)}`);
    if (card.paceSecPerKm) {
      const pace =
        card.unit === "mi"
          ? card.paceSecPerKm * (METRES_PER_MILE / 1000)
          : card.paceSecPerKm;
      parts.push(`${parts.length ? "at " : ""}${clock(pace)} /${card.unit}`);
    }
  } else if (card.template === "lift") {
    if (card.totalVolumeKg) {
      parts.push(`${weightText(card.totalVolumeKg, card.liftUnit)} lifted`);
    } else if (card.totalReps) {
      parts.push(plural(card.totalReps, "rep", "reps"));
    }
    if (card.exerciseCount) {
      parts.push(
        `${parts.length ? "across " : ""}${plural(card.exerciseCount, "exercise", "exercises")}`
      );
    }
    if (card.prCount) {
      parts.push(`${parts.length ? "with " : ""}${plural(card.prCount, "new best", "new bests")}`);
    }
  } else if (card.template === "hybrid") {
    if (card.totalVolumeKg)
      parts.push(`${weightText(card.totalVolumeKg, card.liftUnit)} lifted`);
    if (card.distanceKm !== undefined)
      parts.push(`${parts.length ? "and " : ""}${distanceText(card.distanceKm, card.unit)} run`);
  } else if (card.template === "nutrition") {
    if (card.calories !== undefined) {
      parts.push(
        card.calorieTarget
          ? `${whole(card.calories)} of ${whole(card.calorieTarget)} kcal`
          : `${whole(card.calories)} kcal`
      );
    }
    if (card.protein !== undefined) {
      parts.push(
        `${parts.length ? "with " : ""}${whole(card.protein)} g protein, ${whole(card.carbs || 0)} g carbs and ${whole(card.fat || 0)} g fat`
      );
    }
  } else if (card.template === "recap") {
    const facts = [];
    if (card.sessionsCount !== undefined)
      facts.push(plural(card.sessionsCount, "session", "sessions"));
    if (card.distanceKm)
      facts.push(`${distanceText(card.distanceKm, card.unit)} run`);
    if (card.totalVolumeKg)
      facts.push(`${weightText(card.totalVolumeKg, card.liftUnit)} lifted`);
    if (card.streakDays) facts.push(`a ${whole(card.streakDays)}-day streak`);
    if (facts.length) parts.push(facts.join(", "));
  }
  const fallback = {
    run: "A run",
    lift: "A workout",
    hybrid: "A lift and a run",
    nutrition: "A day of food",
    recap: "A week of training",
  }[card.template];
  const lead =
    card.template === "recap"
      ? card.recapTitle || "This week"
      : card.headline || "";
  const figures = parts.join(" ") || fallback;
  return `${lead ? `${lead}: ` : ""}${figures}.`;
}

/** What the card is of, in the preview's title: "Sam’s run on Tropos". */
function cardNoun(card) {
  if (card.template === "run") return "run";
  if (card.template === "lift") return "workout";
  if (card.template === "hybrid") return "training";
  if (card.template === "nutrition") return "day";
  return /year/i.test(card.recapTitle || "") ? "year" : "week";
}

/**
 * The card for its page, or null when it is not to be shown: an unknown
 * token, a copy that cannot be drawn, a session or post since deleted, a
 * card past its 30 days, and an owner who is restricted, being deleted or
 * gone. Each gets the same null, so the page never says why. Throws when a
 * read fails, so the caller can tell "not shown" from "could not tell".
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} token
 * @param {(text: string) => boolean} [containsProfanity]
 * @param {number} [nowMs]
 */
async function readSharedCard(db, token, containsProfanity, nowMs = Date.now()) {
  if (!isToken(token)) return null;
  const snap = await db.collection(SHARED_CARDS).doc(token).get();
  if (!snap.exists) return null;
  const stored = snap.data() || {};
  const ownerUid = stored.ownerUid;
  if (!isUid(ownerUid)) return null;
  // The TTL policy deletes a copy some time after it expires; the page
  // stops showing it at the time itself.
  const expiresMs = timeMs(stored.expiresAt);
  if (stored.expiresAt !== undefined && !(expiresMs > nowMs)) return null;
  const card = cardCopy(stored.card, containsProfanity);
  if (!card) return null;
  const shows = sourcesOf(stored);
  if (SESSION_TEMPLATES.includes(card.template) && !Object.keys(shows).length) {
    return null;
  }
  const code = normaliseInviteCode(stored.inviteCode);

  const userRef = db.collection("users").doc(ownerUid);
  const [user, profile, restricted, deleting, gone, live, codeDoc] =
    await Promise.all([
      userRef.get(),
      userRef.collection("public").doc("profile").get(),
      // Fails closed: a read it cannot make reads as restricted.
      isRestricted(db, ownerUid),
      isAccountDeleting(db, ownerUid),
      isTombstoned(db, ownerUid),
      sourcesLive(db, ownerUid, shows),
      code ? db.collection("inviteCodes").doc(code).get() : null,
    ]);
  if (!user.exists || restricted || deleting || gone || !live) return null;

  // The page draws the website's own copy of the drawing.
  const { art, ...shown } = card;
  if (art) shown.artSrc = cardArtSrc(art);
  const view = { token, card: shown };
  const firstName = firstNameOf(
    profile.exists ? (profile.data() || {}).displayName : null
  );
  if (firstName) view.firstName = firstName;
  if (code && codeDoc && codeDoc.exists && (codeDoc.data() || {}).uid === ownerUid) {
    view.inviteCode = code;
  }
  view.summary = cardSummary(card);
  return view;
}

module.exports = {
  SHARED_CARDS,
  UNSOURCED_CARD_DAYS,
  TOKEN_PATTERN,
  TEMPLATES,
  TEMPLATE_FIGURES,
  HIDDEN_FIGURES,
  SharedCardError,
  isToken,
  cardCopy,
  sourcesOf,
  storeSharedCard,
  removeSharedCard,
  removeCardsShowing,
  cardSummary,
  cardNoun,
  readSharedCard,
};

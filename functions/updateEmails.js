// The emails a person chose (App1 Q55): the weekly review and the emails
// after a break, sent through Resend as the account emails are, and the
// unsubscribe link every one of them carries.
//
// hourlyEmailSweep, every hour on UTC, finds the accounts that said yes to
// each email (`emailConsent.<kind>.on`) and, for each one whose morning it
// is, decides whether that email is due (lib/weeklyReviewEmail.js,
// lib/winBackEmail.js). Before each send, in this order: the account is
// not being deleted; it has an address it signs in with, and the address
// is verified (someone can sign up with an address that is not theirs, and
// consent from the account is not consent from that inbox); then, in one
// transaction, the yes is read again and the send is claimed, so a
// withdrawal made a moment ago is honoured and two runs cannot both send.
// Each send carries an idempotency key, so Resend sends a retried one once.
//
// emailUnsubscribe answers the link (lib/emailUnsubscribe.js), on
// troposfit.com through Hosting (firebase.json).
//
// 1st-gen, like every export here: firebase-functions/v1.
const functions = require("firebase-functions/v1");
const { defineSecret } = require("firebase-functions/params");
const admin = require("./lib/adminSdk");
const { SCHEDULED_CAP, DEFAULT_HTTP_CAP } = require("./lib/runtimeCaps");
const accountDeletionLocks = require("./lib/accountDeletionLocks");
const jobRuns = require("./lib/jobRuns");
const emailConsent = require("./lib/emailConsent");
const weeklyReviewEmail = require("./lib/weeklyReviewEmail");
const winBackEmail = require("./lib/winBackEmail");
const emailUnsubscribe = require("./lib/emailUnsubscribe");
const layout = require("./lib/updateEmailLayout");
const { localHourInTz, localWeekdayInTz } = require("./lib/pushSchedule");
const { localDateKeyInTz } = require("./lib/streakNudge");
const { SECURITY_HEADERS } = require("./lib/publicPost");
const { sendViaResend } = require("./email/accountEmails");

// Already provisioned and bound elsewhere (email/accountEmails.js);
// defineSecret registers by name.
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

/** Both emails go in the person's morning: first at 08:00, and an hour that
 *  could not send tries again until 11:59 (a run cut short, a refusal). */
const FIRST_SEND_HOUR = 8;
const LAST_SEND_HOUR = 11;
/** Monday, as `localWeekdayInTz` numbers it. */
const MONDAY = 1;

/** Accounts read a page at a time; a run stops in time to record itself. */
const PAGE_SIZE = 200;
const TIME_LIMIT_MS = 480_000;
/** Resend takes 10 requests a second for the whole team: well under. */
const SEND_SPACING_MS = 150;
/** A send whose answer never came is tried again, with the same key, an
 *  hour later; Resend keeps a key for 24 hours, so after 23 it is left. */
const RETRY_AFTER_MS = 50 * 60_000;
const IDEMPOTENCY_WINDOW_MS = 23 * 3_600_000;
/**
 * At most this many of these emails a UTC day, unless
 * `system/config.emailUpdatesPerDay` says otherwise. Resend's free plan
 * sends 100 a day across every email, and verification and password
 * resets must still go when the weekly review has gone to everyone, so
 * these take 60 of them. Raising it is the owner's call, with a paid plan
 * (docs/qa/pre-launch-backlog.md).
 */
const DEFAULT_DAILY_BUDGET = 60;

const DAY_MS = 86400000;

/** Anything shaped like an address, out of a line bound for the logs. */
function redact(message) {
  return String(message || "unknown").replace(/\S+@\S+/g, "[address]");
}

/** A stored time in milliseconds: a Timestamp, a Date or a number. */
function millisOf(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return null;
}

/* ── The send record on users/{uid}/settings/emailState ─────────────────
   One entry per email: the weekly review's for one week (`key` is its
   Monday), the ladder's for one break with an entry per step. A break is
   named by the instant of the last thing logged (`anchorMs`), not its
   day: a day depends on the time zone, and a person who flies east would
   otherwise start a new break and get its first email again. An entry is
   "pending" from the claim until Resend answers, then "sent" or "failed";
   a pending one whose answer never came is tried again with the same
   idempotency key. */

function ladderKey(key) {
  const [anchorMs, step] = key.split("/");
  return { anchorMs: Number(anchorMs), step };
}

function entryOf(state, kind, key) {
  if (kind === "weeklyReview") {
    const entry = state.weeklyReview;
    return entry && entry.key === key ? entry : null;
  }
  const { anchorMs, step } = ladderKey(key);
  const ladder = state.winBack;
  return ladder && ladder.anchorMs === anchorMs && ladder.steps
    ? ladder.steps[step] || null
    : null;
}

/** The kind's stored value with `entry` for `key` (or without it, null). */
function withEntry(state, kind, key, entry) {
  if (kind === "weeklyReview") {
    return entry ? { key, ...entry } : null;
  }
  const { anchorMs, step } = ladderKey(key);
  const ladder = state.winBack;
  const steps =
    ladder && ladder.anchorMs === anchorMs && ladder.steps
      ? { ...ladder.steps }
      : {};
  if (entry) steps[step] = entry;
  else delete steps[step];
  return { anchorMs, steps };
}

/**
 * Claim one send, in a transaction that reads the yes again. Returns
 * `{ token, previous }` (the unsubscribe token, made here with the first
 * email, and the entry the claim replaced, which a release puts back) or
 * `{ skip }`, why not.
 */
async function claimSend(db, uid, kind, key, nowMs) {
  const userRef = db.collection("users").doc(uid);
  const stateRef = userRef.collection("settings").doc("emailState");
  return db.runTransaction(async (tx) => {
    const [user, stateSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(stateRef),
    ]);
    if (!user.exists || !emailConsent.emailConsentOn(user.data(), kind)) {
      return { skip: "consent-off" };
    }
    const state = stateSnap.exists ? stateSnap.data() || {} : {};
    const entry = entryOf(state, kind, key);
    if (entry) {
      if (entry.state === "sent") return { skip: "sent" };
      if (entry.state === "failed") return { skip: "failed" };
      if (nowMs - entry.firstAttemptAt > IDEMPOTENCY_WINDOW_MS) {
        return { skip: "expired" };
      }
      if (nowMs - entry.lastAttemptAt < RETRY_AFTER_MS) {
        return { skip: "in-flight" };
      }
    }
    const token = emailUnsubscribe.isToken(state.unsubscribeToken)
      ? state.unsubscribeToken
      : emailUnsubscribe.newUnsubscribeToken();
    tx.set(
      stateRef,
      {
        unsubscribeToken: token,
        [kind]: withEntry(state, kind, key, {
          state: "pending",
          firstAttemptAt: entry ? entry.firstAttemptAt : nowMs,
          lastAttemptAt: nowMs,
        }),
      },
      { merge: true }
    );
    return { token, previous: entry };
  });
}

/**
 * Settle a claimed send: "sent" or "failed", or `{ release: previous }` to
 * let it go (nothing was sent): the entry it replaced comes back, so a
 * retry keeps the time of its first attempt and Resend's 24 hours are
 * still counted from it; a first attempt leaves nothing behind.
 */
async function settleSend(db, uid, kind, key, outcome) {
  const stateRef = db
    .collection("users")
    .doc(uid)
    .collection("settings")
    .doc("emailState");
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    const state = snap.exists ? snap.data() || {} : {};
    const entry = entryOf(state, kind, key);
    if (!entry) return;
    tx.set(
      stateRef,
      {
        [kind]: withEntry(
          state,
          kind,
          key,
          typeof outcome === "string"
            ? { ...entry, state: outcome }
            : outcome.release || null
        ),
      },
      { merge: true }
    );
  });
}

/** What Resend's refusal means for the send. */
function sendFailure(err) {
  const status = err && err.status;
  // The same key arrived before: the first went, or is going.
  if (status === 409) return "sent";
  // Too many a second, or the plan's day used up: stop, try next hour.
  if (status === 429) return "stop";
  // Refused for good (a bad address, a blocked recipient).
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return "failed";
  }
  // No answer, or Resend's own fault: try again with the same key.
  return "retry";
}

/** The saved sessions and meals of `week`, and the plan's runs marked
 *  done by hand. */
async function readWeek(db, uid, week) {
  const user = db.collection("users").doc(uid);
  const inWeek = (name) =>
    user
      .collection(name)
      .where("date", ">=", week.start)
      .where("date", "<=", week.end)
      .get()
      .then((snap) => snap.docs.map((d) => d.data() || {}));
  const [workouts, runs, meals, plan] = await Promise.all([
    inWeek("workouts"),
    inWeek("runs"),
    inWeek("meals"),
    user.collection("programState").doc("current").get(),
  ]);
  return {
    workouts,
    runs,
    meals,
    markedDoneMs: markedDoneTimes(plan.exists ? plan.data() : null),
  };
}

/** When each of the plan's runs was marked done by hand
 *  (`programState.manualCompletions`, the app's Mark done). */
function markedDoneTimes(programState) {
  const map =
    programState &&
    programState.manualCompletions &&
    typeof programState.manualCompletions === "object"
      ? programState.manualCompletions
      : {};
  return Object.values(map)
    .map((entry) => millisOf(entry && entry.completedAt))
    .filter((ms) => ms !== null);
}

/** The latest of the times the plan's runs were marked done, or null. */
async function latestMarkedDoneMs(db, uid) {
  const plan = await db
    .collection("users")
    .doc(uid)
    .collection("programState")
    .doc("current")
    .get();
  const times = markedDoneTimes(plan.exists ? plan.data() : null);
  return times.length > 0 ? Math.max(...times) : null;
}

/**
 * Whether `kind` is due for this person now, and what goes: `{ key,
 * build }`, or `{ skip }`. Reads nothing it does not need: the hour and
 * the day come first.
 */
async function dueEmail(kind, uid, data, deps) {
  const timezone = data.timezone || null;
  if (!timezone) return { skip: "no-timezone" };
  const now = new Date(deps.nowMs);
  const hour = localHourInTz(now, timezone);
  if (hour === null || hour < FIRST_SEND_HOUR || hour > LAST_SEND_HOUR) {
    return { skip: "not-now" };
  }
  if (kind === "weeklyReview") {
    if (localWeekdayInTz(now, timezone) !== MONDAY) return { skip: "not-now" };
    const week = weeklyReviewEmail.reviewedWeek(deps.nowMs, timezone);
    if (!week) return { skip: "no-timezone" };
    return {
      key: week.start,
      prepare: async () => {
        const figures = weeklyReviewEmail.weekFigures({
          ...(await readWeek(deps.db, uid, week)),
          week,
          timezone,
        });
        if (!weeklyReviewEmail.hasFigures(figures)) return null;
        return (unsubscribe) =>
          weeklyReviewEmail.buildWeeklyReviewEmail({
            figures,
            week,
            unit: data.preferredDistanceUnit === "mi" ? "mi" : "km",
            unsubscribe,
            postalAddress: deps.postalAddress,
          });
      },
    };
  }

  // The ladder: the last thing logged, a saved session, a meal or a planned
  // run marked done by hand. A recent session settles it with no reads;
  // otherwise the latest meal and the plan are read too.
  const today = localDateKeyInTz(now, timezone);
  const sessionMs = millisOf(data.lastActiveAt);
  const daysSince = (ms) =>
    winBackEmail.daysBetween(localDateKeyInTz(new Date(ms), timezone), today);
  const firstStep = winBackEmail.WIN_BACK_STEPS[0];
  if (sessionMs !== null && daysSince(sessionMs) < firstStep) {
    return { skip: "not-due" };
  }
  const [mealMs, markedMs] = await Promise.all([
    deps.latestMealMs(deps.db, uid),
    latestMarkedDoneMs(deps.db, uid),
  ]);
  const anchorMs = winBackEmail.lastLoggedMs(sessionMs, mealMs, markedMs);
  if (anchorMs === null) return { skip: "never-logged" };
  const daysAway = daysSince(anchorMs);
  const step = winBackEmail.winBackStepDue(daysAway, []);
  if (step === null) return { skip: "not-due" };
  return {
    key: `${anchorMs}/${step}`,
    prepare: async () => (unsubscribe) =>
      winBackEmail.buildWinBackEmail({
        step,
        unsubscribe,
        postalAddress: deps.postalAddress,
      }),
  };
}

/** One person, one email. Returns what happened, as a fixed code. */
async function emailOne(kind, uid, data, deps) {
  const due = await dueEmail(kind, uid, data, deps);
  if (due.skip) return due.skip;
  // An email goes only with a link that works (lib/emailUnsubscribe.js).
  if (!emailUnsubscribe.isLinkableUid(uid)) return "no-link";
  if (!(await deps.shouldProceed(deps.db, uid))) return "account-deleting";
  const account = await deps.getAccount(uid);
  if (!account || !account.email) return "no-email";
  if (account.disabled) return "disabled";
  if (!account.emailVerified) return "unverified";
  const build = await due.prepare();
  if (!build) return "quiet-week";

  const claim = await claimSend(deps.db, uid, kind, due.key, deps.nowMs);
  if (claim.skip) return claim.skip;
  if (!(await deps.claimBudget())) {
    await settleSend(deps.db, uid, kind, due.key, { release: claim.previous });
    return "budget";
  }
  const link = layout.unsubscribeUrl(uid, claim.token);
  const message = build(link);
  try {
    await deps.sendEmail({
      to: account.email,
      ...message,
      headers: layout.unsubscribeHeaders(link),
      idempotencyKey: `${kind}/${uid}/${due.key}`,
    });
  } catch (err) {
    const failure = sendFailure(err);
    deps.logger.warn("hourlyEmailSweep: send refused", {
      uid,
      kind,
      failure,
      error: redact(err && err.message),
    });
    if (failure === "sent") {
      await settleSend(deps.db, uid, kind, due.key, "sent");
      return "sent";
    }
    if (failure === "stop") {
      await settleSend(deps.db, uid, kind, due.key, {
        release: claim.previous,
      });
      return "stop";
    }
    if (failure === "failed") {
      await settleSend(deps.db, uid, kind, due.key, "failed");
      return "refused";
    }
    return "retry";
  }
  await settleSend(deps.db, uid, kind, due.key, "sent");
  return "sent";
}

/**
 * The accounts that said yes to `kind`, a page at a time, in id order from
 * `pivot` round to it again. Each run starts somewhere new, so when the
 * day's allowance or the time limit ends a run early, it is not the same
 * people left out every time.
 */
async function* consentingAccounts(db, kind, pivot) {
  const base = db
    .collection("users")
    .where(`emailConsent.${kind}.on`, "==", true)
    .orderBy("__name__")
    // Only what deciding needs: the yes is read again in the claim.
    .select("timezone", "lastActiveAt", "preferredDistanceUnit");
  for (const pass of ["from-pivot", "to-pivot"]) {
    let cursor =
      pass === "from-pivot" ? db.collection("users").doc(pivot) : null;
    for (;;) {
      let query = base.limit(PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      for (const doc of page.docs) {
        if (pass === "to-pivot" && doc.id > pivot) return;
        yield doc;
      }
      if (page.docs.length < PAGE_SIZE) break;
      cursor = page.docs[page.docs.length - 1];
    }
  }
}

/** One run: each email, every account that said yes to it. */
async function runSweep(deps) {
  const started = deps.clock();
  const outcomes = {};
  const note = (code) => {
    outcomes[code] = (outcomes[code] || 0) + 1;
  };
  for (const kind of emailConsent.EMAIL_KINDS) {
    for await (const doc of consentingAccounts(deps.db, kind, deps.pivot)) {
      if (deps.clock() - started > TIME_LIMIT_MS) {
        note("stopped-at-time-limit");
        return outcomes;
      }
      let outcome;
      try {
        outcome = await emailOne(kind, doc.id, doc.data() || {}, deps);
      } catch (err) {
        outcome = "error";
        deps.logger.error("hourlyEmailSweep: email failed", {
          uid: doc.id,
          kind,
          error: redact(err && err.message),
        });
      }
      if (outcome === "not-now") continue;
      note(`${kind}:${outcome}`);
      if (outcome === "stop" || outcome === "budget") return outcomes;
      if (outcome === "sent") await deps.sleep(SEND_SPACING_MS);
    }
  }
  return outcomes;
}

/** The address the person signs in with, whether it is verified, and
 *  whether the account is disabled; null when there is no such account. */
async function authAccount(uid) {
  try {
    const user = await admin.auth().getUser(uid);
    return {
      email: typeof user.email === "string" && user.email ? user.email : null,
      emailVerified: user.emailVerified === true,
      disabled: user.disabled === true,
    };
  } catch (err) {
    if (err && err.code === "auth/user-not-found") return null;
    throw err;
  }
}

/** The time of the person's latest meal, by when it was logged. */
async function latestMealMs(db, uid) {
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("meals")
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();
  return snap.empty ? null : millisOf((snap.docs[0].data() || {}).createdAt);
}

/** The day's allowance of these emails, claimed one at a time. */
function dailyBudget(db, nowMs, perDay) {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const ref = db.collection("rateLimits").doc(`emailUpdates_${day}`);
  return () =>
    db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? Number(snap.data().count) || 0 : 0;
      if (count >= perDay) return false;
      tx.set(ref, {
        count: count + 1,
        // The rateLimits TTL policy deletes it a day after its day.
        expiresAt: new Date(Date.parse(`${day}T00:00:00Z`) + 2 * DAY_MS),
      });
      return true;
    });
}

/**
 * The owner's settings for these emails, on `system/config` (set in the
 * Firestore console, no deploy): `emailUpdatesPerDay`, the day's allowance
 * (the default without it), and `emailPostalAddress`, Tropos's postal
 * address for every footer (none without it).
 */
async function emailConfig(db) {
  let data = {};
  try {
    const snap = await db.collection("system").doc("config").get();
    data = snap.exists ? snap.data() || {} : {};
  } catch {
    data = {};
  }
  const perDay = data.emailUpdatesPerDay;
  const address = data.emailPostalAddress;
  return {
    perDay:
      Number.isInteger(perDay) && perDay >= 0 ? perDay : DEFAULT_DAILY_BUDGET,
    postalAddress:
      typeof address === "string" && address.trim()
        ? address.trim().slice(0, 200)
        : null,
  };
}

async function productionDeps(nowMs) {
  const db = admin.firestore();
  const config = await emailConfig(db);
  return {
    db,
    nowMs,
    clock: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    logger: functions.logger,
    shouldProceed: (database, uid) =>
      accountDeletionLocks.shouldSystemWriteProceed(
        database,
        uid,
        "hourlyEmailSweep"
      ),
    getAccount: authAccount,
    latestMealMs,
    claimBudget: dailyBudget(db, nowMs, config.perDay),
    postalAddress: config.postalAddress,
    // Where this run starts in the list of accounts (consentingAccounts).
    pivot: emailUnsubscribe.newUnsubscribeToken().slice(0, 20),
    sendEmail: sendViaResend,
  };
}

// Hourly, on UTC: each email goes in the person's own morning.
exports.hourlyEmailSweep = functions
  .runWith({ ...SCHEDULED_CAP, secrets: [RESEND_API_KEY] })
  .pubsub.schedule("0 * * * *")
  .timeZone("Etc/UTC")
  .onRun(() =>
    // Recorded in jobRuns/hourlyEmailSweep with the count of each outcome;
    // a failed run is recorded as failed (lib/jobRuns.js).
    jobRuns.recordJobRun(admin.firestore(), "hourlyEmailSweep", async () => {
      try {
        const outcomes = await runSweep(await productionDeps(Date.now()));
        functions.logger.log("hourlyEmailSweep: done", outcomes);
        return outcomes;
      } catch (err) {
        functions.logger.error("hourlyEmailSweep: run failed", {
          error: redact(err && err.message),
        });
        throw err;
      }
    })
  );

// The link in every one of these emails (lib/emailUnsubscribe.js). Hosting
// sends troposfit.com/email/unsubscribe here (firebase.json).
exports.emailUnsubscribe = functions
  .runWith(DEFAULT_HTTP_CAP)
  .https.onRequest(async (req, res) => {
    const link = emailUnsubscribe.readUnsubscribeQuery(req.query);
    const answer = await emailUnsubscribe.handleUnsubscribe({
      method: req.method,
      query: req.query,
      // The button posts back to the link itself, rebuilt from what was
      // checked rather than echoed.
      action: link
        ? `?u=${encodeURIComponent(link.uid)}&t=${encodeURIComponent(link.token)}`
        : "",
      db: admin.firestore(),
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.set(emailUnsubscribe.headers(SECURITY_HEADERS));
    if (answer.allow) res.set("Allow", answer.allow);
    res.status(answer.status).send(req.method === "HEAD" ? "" : answer.html);
  });

exports._internals = {
  FIRST_SEND_HOUR,
  LAST_SEND_HOUR,
  DEFAULT_DAILY_BUDGET,
  RETRY_AFTER_MS,
  IDEMPOTENCY_WINDOW_MS,
  claimSend,
  settleSend,
  sendFailure,
  dueEmail,
  emailOne,
  runSweep,
  consentingAccounts,
  markedDoneTimes,
  dailyBudget,
  emailConfig,
  redact,
};

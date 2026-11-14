"use strict";

/**
 * Pushes from people (App1 Q18, owner, 13 November 2026): "Person-to-person
 * events send a push: comments, follow requests, an invite joined, a league
 * result. Props arrive as one daily bundle."
 *
 * `createNotification` (socialFanout.js) stays the one writer of
 * `notifications/{uid}/items`, and holds the block check and the
 * recipient's switch (notificationPreferences.js). The push follows the row
 * it writes: `onNotificationItemWritten` sends it when a row of a type
 * below is new (written, or written again as a new notice under the same
 * id), so a kind that is switched off, blocked or self-sent has no row and
 * no push. Social pushes are outside App1 Q60's budget for pushes not from
 * a person (pushBudget.js). Each push is checked again when it goes: the
 * account takes push (`settings/push.enabled`), the switch is still on, no
 * block either way since, and the sender is not restricted.
 *
 * What a push says: the row's own sentence, which carries the sender's
 * public name ("Maya commented on your activity"), never a comment's words.
 * Between 22:00 and 08:00 in the recipient's time zone (pushSchedule.js)
 * it is delivered quietly: into Notification Centre, with no sound and no
 * lit screen.
 *
 * Which rows push, and which do not:
 *   comment, space_post_comment  a comment on your session or Space post
 *   follow_request, follow_accepted  a request, both ways (one switch)
 *   invite_joined                someone joined from your link or code
 *   league_result                Monday's result, for a league member
 *   kudos                        props, gathered into one push a day
 * Not pushed, in the tray only: a new follower (off by default, S3), a like
 * on a Space post, and the Circle events (backing is anonymous; the rest
 * are a group's news, not one person to another).
 *
 * THE PROPS BUNDLE. Props come together once a day, at 19:00 in the
 * recipient's time zone: most sessions are posted by the evening, so it
 * carries the day's props; it is outside working hours, three hours clear
 * of quiet hours, and an hour clear of the evening streak reminder's
 * default 20:00. The first props after a bundle starts the next one, due
 * at the next 19:00 (`propsBundleDueAt`), on
 * `users/{uid}/settings/propsBundle`; `hourlyPropsBundle` sends the bundles
 * that are due. "Maya gave you props" for one person, "3 people gave props
 * to your run" for more.
 */

const { withinQuietHours, localHourInTz } = require("./pushSchedule");

/** Rows that push as they are written. */
const SOCIAL_PUSH_TYPES = Object.freeze([
  "comment",
  "space_post_comment",
  "follow_request",
  "follow_accepted",
  "invite_joined",
  "league_result",
]);

/** Rows gathered into the daily bundle. */
const BUNDLED_PUSH_TYPE = "kudos";

/** The local hour the props bundle goes. */
const PROPS_BUNDLE_HOUR = 19;

/** `users/{uid}/settings/{this}`: the props bundle waiting to go. */
const PROPS_BUNDLE_DOC = "propsBundle";

/** Bounds on one bundle, whatever happens. */
const MAX_BUNDLE_ENTRIES = 100;

/** How long a social push may wait for a phone that is off. */
const SOCIAL_PUSH_TTL_SECONDS = 86_400;

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

const TITLES = Object.freeze({
  comment: "New comment",
  space_post_comment: "New comment",
  follow_request: "Follow request",
  follow_accepted: "Follow request accepted",
  invite_joined: "Joined from your invite",
  league_result: "Your league week",
});

/** A stored time as milliseconds: a Timestamp (or its plain copy), a Date
 *  or a number. */
function millisOf(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const seconds =
    typeof value.seconds === "number" ? value.seconds : value._seconds;
  const nanos =
    typeof value.seconds === "number" ? value.nanoseconds : value._nanoseconds;
  if (typeof seconds === "number")
    return seconds * 1000 + (Number(nanos) || 0) / 1e6;
  return null;
}

/**
 * Whether this write is a new notice: the row was created, or written
 * again under its id as a new notice (a new `createdAt`). A read, a name
 * carried over, the push's own receipt: none is news.
 */
function isNewNotice(before, after) {
  if (!after) return false;
  if (!before) return true;
  const was = millisOf(before.createdAt);
  const now = millisOf(after.createdAt);
  return now !== null && now !== was;
}

/** The key a row's push is claimed under: its notice's time. */
function noticeKey(item) {
  const ms = millisOf(item && item.createdAt);
  return ms === null ? null : String(Math.round(ms));
}

function safe(id) {
  return typeof id === "string" && SAFE_ID.test(id);
}

/**
 * Where a tap opens, as the tray's row does (src/lib/notificationTarget.ts):
 * a comment opens its post with the comments, a request or an invite the
 * person, a league result the league. Every id is checked, and anything
 * else opens Social.
 */
function socialPushRoute(item) {
  const type = item && item.type;
  if (type === "comment" && safe(item.activityId))
    return `/activity/${item.activityId}?comments=1`;
  if (
    type === "space_post_comment" &&
    safe(item.spaceId) &&
    safe(item.postId)
  )
    return `/space/${item.spaceId}/post/${item.postId}?comments=1`;
  if (
    (type === "follow_request" ||
      type === "follow_accepted" ||
      type === "invite_joined") &&
    safe(item.fromUserId)
  )
    return `/user/${item.fromUserId}`;
  if (type === "league_result") return "/league";
  return "/social";
}

/** A message delivered quietly: into Notification Centre, no sound, no lit
 *  screen (iOS's passive interruption level; the web shows it silent). */
function quietly(message) {
  const aps = { ...message.apns.payload.aps, "interruption-level": "passive" };
  delete aps.sound;
  return {
    ...message,
    data: { ...message.data, silent: "1" },
    apns: { ...message.apns, payload: { ...message.apns.payload, aps } },
  };
}

/** Whether a push to this person now goes quietly: inside their quiet
 *  hours, or with no known time zone. */
function quietNow(now, timezone) {
  const hour = localHourInTz(now, timezone);
  return hour === null || withinQuietHours(hour);
}

/**
 * The push for one row, before `withNativePushAlert` (pushSend.js). Data
 * only, as every Tropos push is, so the web's service worker shows it.
 * Null for a row that does not push.
 */
function socialPushMessage(item) {
  if (!item || !SOCIAL_PUSH_TYPES.includes(item.type)) return null;
  const body =
    typeof item.message === "string" && item.message.trim()
      ? item.message.trim()
      : null;
  if (!body) return null;
  return {
    data: {
      type: "social",
      kind: item.type,
      route: socialPushRoute(item),
      title: TITLES[item.type],
      body,
    },
  };
}

/** What a social push carries for delivery: a day to arrive, then gone. */
function withSocialDelivery(message, now) {
  return {
    ...message,
    webpush: { headers: { TTL: String(SOCIAL_PUSH_TTL_SECONDS) } },
    apns: {
      ...message.apns,
      headers: {
        ...(message.apns && message.apns.headers),
        "apns-expiration": String(
          Math.floor(now.getTime() / 1000) + SOCIAL_PUSH_TTL_SECONDS
        ),
      },
    },
  };
}

// ── The props bundle ──────────────────────────────────────────────────────

/**
 * When a bundle started now goes: the next top of the hour after `now`
 * whose local hour is PROPS_BUNDLE_HOUR (the sweep runs on the hour). Null
 * with no time zone: no bundle without one.
 */
function propsBundleDueAt(now, timezone) {
  if (localHourInTz(now, timezone) === null) return null;
  const next = new Date(now.getTime());
  next.setUTCMinutes(0, 0, 0);
  for (let step = 0; step < 50; step++) {
    next.setUTCHours(next.getUTCHours() + 1);
    if (localHourInTz(next, timezone) === PROPS_BUNDLE_HOUR) return next;
  }
  return null;
}

function bundleEntries(bundle) {
  return bundle && Array.isArray(bundle.entries)
    ? bundle.entries.filter(
        (entry) =>
          entry &&
          typeof entry.from === "string" &&
          typeof entry.activityId === "string"
      )
    : [];
}

/** The bundle with one more props in it. `name` is the row's own copy of
 *  the sender's name, already held to the name rules. */
function withProps(bundle, { from, activityId, name }) {
  const entries = bundleEntries(bundle).filter(
    (entry) => !(entry.from === from && entry.activityId === activityId)
  );
  entries.push({
    from,
    activityId,
    ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
  });
  return entries.slice(-MAX_BUNDLE_ENTRIES);
}

/** The bundle without props that were taken back (their row deleted). */
function withoutProps(bundle, { from, activityId }) {
  return bundleEntries(bundle).filter(
    (entry) => !(entry.from === from && entry.activityId === activityId)
  );
}

const SESSION_WORDS = Object.freeze({ run: "run", workout: "workout" });

/**
 * The bundle's push. `entries` are the props still to tell (blocks and
 * restricted senders taken out); `sessionTypes` each session's type ("run",
 * "workout").
 */
function propsBundleMessage(entries, { sessionTypes = {} } = {}) {
  const people = [...new Set(entries.map((entry) => entry.from))];
  if (people.length === 0) return null;
  const sessions = [...new Set(entries.map((entry) => entry.activityId))];
  const one = sessions.length === 1 ? sessions[0] : null;
  const word = one ? SESSION_WORDS[sessionTypes[one]] || "session" : null;
  const name = entries.find((entry) => entry.from === people[0])?.name;
  const body =
    people.length === 1
      ? `${name || "Someone"} gave you props`
      : `${people.length} people gave props to your ${word || "sessions"}`;
  return {
    data: {
      type: "social",
      kind: BUNDLED_PUSH_TYPE,
      route: one && safe(one) ? `/activity/${one}` : "/social",
      title: "Props",
      body,
    },
  };
}

module.exports = {
  SOCIAL_PUSH_TYPES,
  BUNDLED_PUSH_TYPE,
  PROPS_BUNDLE_HOUR,
  PROPS_BUNDLE_DOC,
  SOCIAL_PUSH_TTL_SECONDS,
  millisOf,
  isNewNotice,
  noticeKey,
  socialPushRoute,
  socialPushMessage,
  withSocialDelivery,
  quietly,
  quietNow,
  propsBundleDueAt,
  withProps,
  withoutProps,
  bundleEntries,
  propsBundleMessage,
};

"use strict";

/* ─────────────────────────────────────────────
   A shared post's public page (App1, Q50 and Q51, 13 November 2026).

   A shared card's words end with https://troposfit.com/activity/<id>
   when the card is of a public post. On a phone with Tropos that address
   opens the app (the universal-links file, scripts/ios/universal-links.ts).
   Anywhere else Firebase Hosting hands it to `publicPostPage`
   (firebase.json), which answers with the web app's own page, its head
   naming the post so a pasted link gets a preview of its own, and the
   post's public figures in a data block the page reads
   (src/lib/publicPost.ts). `?format=json` answers the same figures alone,
   for a page that arrived without the block (the GitHub Pages preview, a
   visitor who signed out on the page).

   Why a function and not the rules: Firestore lets no signed-out visitor
   read a post, and opening `activities` to everyone would hand out every
   field of every public post, its route among them. This reads with the
   Admin SDK and hands out only what the card draws.

   Who is shown: only a post whose own visibility is public, which no
   moderation flag holds back, by an account that is not restricted, not
   being deleted and not gone. Anything else gets the answer a post that
   never existed gets, so the page never says why. Never a route or a map,
   whatever the author's privacy zones: the card's figures only.
   ───────────────────────────────────────────── */

const { isRestricted } = require("./restriction");
const { isAccountDeleting, isTombstoned } = require("./accountDeletionStatus");
const { publicPhotoUrl } = require("./publicPhotoUrl");

/** The production web app, as src/lib/publicLinks.ts names it. */
const PUBLIC_ORIGIN = "https://troposfit.com";

/** The id of the data block the page reads (src/lib/publicPost.ts). */
const DATA_ELEMENT_ID = "tropos-public-post";

/** A post's address. A Firestore id is 20 letters and digits; the
 *  pattern allows a little more, never anything a path or HTML needs
 *  escaping for. */
const POST_PATH = /^\/activity\/([A-Za-z0-9_-]{1,64})\/?$/;

/** How long one copy of the web app's page is used before it is fetched
 *  again. A deploy replaces the page's asset names, so a copy kept long
 *  would point at files that are gone. */
const SHELL_TTL_MS = 60 * 1000;

/** The preview's picture: the app icon, an absolute address as previews
 *  need. A picture of the card itself would need a renderer here. */
const PREVIEW_IMAGE = `${PUBLIC_ORIGIN}/icons/icon-512x512.png`;

/** Tropos's Apple ID (docs/app-store/listing.md), for Safari's banner: on
 *  an iPhone with Tropos it offers Open, which hands the app this address,
 *  and without it Get. Universal links do not fire for an address opened
 *  in Safari itself, so the banner is that case's way into the app. */
const APP_STORE_ID = "6762416918";

/** firebase.json's headers for every Hosting response, sent here too: the
 *  page is the app's own, and Hosting's own list is not relied on for a
 *  function's answer. publicPost.test.js holds the two lists equal. */
const SECURITY_HEADERS = Object.freeze({
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Permissions-Policy":
    "camera=(self), geolocation=(self), microphone=(), accelerometer=(), gyroscope=(), magnetometer=()",
});

const METRES_PER_MILE = 1609.344;
const KG_PER_LB = 0.45359237;

/** The post id in a request's path, or null. */
function postIdFromPath(path) {
  if (typeof path !== "string") return null;
  const match = POST_PATH.exec(path);
  return match ? match[1] : null;
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

/** Text as a reader sees it, trimmed and capped, or undefined. */
function text(value, max) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/** A stored time in milliseconds: a Timestamp, a Date or a number. */
function timeMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === "function") return value.toMillis();
  return undefined;
}

/**
 * The post as its public page draws it, or null when it is not to be
 * shown. Throws when a read fails, so the caller can tell "not shown"
 * from "could not tell".
 *
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} activityId
 */
async function readPublicPost(db, activityId) {
  const snap = await db.collection("activities").doc(activityId).get();
  if (!snap.exists) return null;
  const post = snap.data() || {};
  if (post.visibility !== "public" || post.flagged === true) return null;
  if (post.type !== "run" && post.type !== "workout") return null;
  const authorId = typeof post.authorId === "string" ? post.authorId : "";
  if (!authorId) return null;

  const userRef = db.collection("users").doc(authorId);
  const [user, profile, restricted, deleting, gone] = await Promise.all([
    userRef.get(),
    userRef.collection("public").doc("profile").get(),
    // Fails closed: a read it cannot make reads as restricted.
    isRestricted(db, authorId),
    isAccountDeleting(db, authorId),
    isTombstoned(db, authorId),
  ]);
  if (!user.exists || restricted || deleting || gone) return null;

  const account = user.data() || {};
  const shown = (profile.exists && profile.data()) || {};
  const view = {
    id: activityId,
    type: post.type,
    authorName:
      text(shown.displayName, 50) || text(post.authorName, 50) || "Someone",
    unit: account.preferredDistanceUnit === "mi" ? "mi" : "km",
    liftUnit: account.liftingWeightUnit === "lbs" ? "lbs" : "kg",
  };
  const photo = publicPhotoUrl(shown.photoURL);
  if (photo) view.authorPhotoURL = photo;
  const title = text(
    post.activityTitle ||
      (post.type === "run" ? post.runName : post.workoutName),
    80
  );
  if (title) view.title = title;
  const createdAt = timeMs(post.createdAt);
  if (createdAt !== undefined) view.createdAt = createdAt;
  const durationSec = figure(post.duration, 86400);
  if (durationSec !== undefined) view.durationSec = durationSec;

  if (post.type === "run") {
    const distanceM = figure(post.distance, 500000);
    if (distanceM !== undefined) view.distanceM = distanceM;
    // A pace is seconds a kilometre; an older post's "5:34" text is
    // not converted. Without one, the time over the distance.
    const pace =
      figure(post.avgPace, 3600) ||
      (distanceM && durationSec ? durationSec / (distanceM / 1000) : undefined);
    if (pace) view.paceSecPerKm = Math.round(pace);
    const elevationM = figure(post.elevationGain, 20000);
    if (elevationM !== undefined) view.elevationM = elevationM;
  } else {
    const volume = figure(post.totalVolume, 1000000);
    if (volume !== undefined) view.totalVolumeKg = volume;
    const count =
      figure(post.exerciseCount, 200) ??
      (Array.isArray(post.exercises) ? post.exercises.length : undefined);
    if (count !== undefined) view.exerciseCount = Math.round(count);
    const prCount = figure(post.prCount, 1000);
    if (prCount) view.prCount = Math.round(prCount);
    const prExercise = text(post.prExercise, 60);
    if (prExercise && view.prCount) view.prExercise = prExercise;
  }
  view.summary = summaryOf(view);
  return view;
}

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

/**
 * The post's figures in one sentence, in its author's units: the preview's
 * description and, on the page, what the card says to a screen reader.
 * "Long run: 10.21 km in 52:10 at 5:06 /km."
 */
function summaryOf(view) {
  let figures;
  if (view.type === "run") {
    const distance =
      view.unit === "mi"
        ? `${((view.distanceM || 0) / METRES_PER_MILE).toFixed(2)} mi`
        : `${((view.distanceM || 0) / 1000).toFixed(2)} km`;
    figures = distance;
    if (view.durationSec) figures += ` in ${clock(view.durationSec)}`;
    if (view.paceSecPerKm) {
      const pace =
        view.unit === "mi"
          ? view.paceSecPerKm * (METRES_PER_MILE / 1000)
          : view.paceSecPerKm;
      figures += ` at ${clock(pace)} /${view.unit}`;
    }
  } else {
    const parts = [];
    if (view.totalVolumeKg) {
      parts.push(
        view.liftUnit === "lbs"
          ? `${whole(view.totalVolumeKg / KG_PER_LB)} lb lifted`
          : `${whole(view.totalVolumeKg)} kg lifted`
      );
    }
    if (view.exerciseCount) {
      const n = view.exerciseCount;
      parts.push(
        `${parts.length ? "across " : ""}${n} ${n === 1 ? "exercise" : "exercises"}`
      );
    }
    figures = parts.join(" ") || "A workout";
    if (view.prCount) {
      figures += `, ${view.prCount} new ${view.prCount === 1 ? "best" : "bests"}`;
    }
  }
  return `${view.title ? `${view.title}: ` : ""}${figures}.`;
}

/** The preview's title: "Sam’s run on Tropos". */
function previewTitle(view) {
  return `${view.authorName}’s ${view.type === "run" ? "run" : "workout"} on Tropos`;
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** JSON that cannot close the script element it sits in. */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** What the page and `?format=json` are told about a post. */
function answerFor(activityId, view) {
  return view
    ? { id: activityId, available: true, post: view }
    : { id: activityId || "", available: false };
}

/** The tags a pasted link's preview reads. */
function previewTags(activityId, view) {
  const title = escapeAttr(previewTitle(view));
  const description = escapeAttr(view.summary);
  const url = escapeAttr(`${PUBLIC_ORIGIN}/activity/${activityId}`);
  return [
    `<meta name="description" content="${description}" />`,
    `<meta property="og:site_name" content="Tropos" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${PREVIEW_IMAGE}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${PREVIEW_IMAGE}" />`,
  ].join("\n    ");
}

/** The page's own description and preview tags, which a post's replace. */
const PREVIEW_META =
  /<meta\s+(?:name|property)="(?:description|og:[\w:]+|twitter:[\w:]+)"[^>]*>\s*/g;

/**
 * The web app's page for one post: its preview tags naming the post when
 * it is shown, and the data block the page reads. A post that is not
 * shown keeps the app's own preview, so the head says nothing about it.
 * `view` undefined means the read failed: the page is left as it is and
 * fetches the figures itself.
 */
function renderShell(shell, activityId, view) {
  const at = shell.lastIndexOf("</head>");
  if (!activityId || view === undefined || at === -1) return shell;
  const head = view
    ? shell.slice(0, at).replace(PREVIEW_META, "")
    : shell.slice(0, at);
  const tags = view ? `${previewTags(activityId, view)}\n    ` : "";
  const banner = `<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=${PUBLIC_ORIGIN}/activity/${activityId}" />\n    `;
  const data = `<script type="application/json" id="${DATA_ELEMENT_ID}">${jsonForScript(
    answerFor(activityId, view)
  )}</script>`;
  return `${head}${tags}${banner}${data}\n  ${shell.slice(at)}`;
}

/** When the web app's page cannot be had: the preview still works, and a
 *  person gets the way to Tropos. */
function fallbackPage(activityId, view) {
  const tags = view ? previewTags(activityId, view) : "";
  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "    <title>Tropos</title>",
    tags ? `    ${tags}` : "",
    "  </head>",
    "  <body>",
    `    <p><a href="${PUBLIC_ORIGIN}/">Open Tropos</a></p>`,
    "  </body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * The web app's page, fetched from Hosting and kept for a minute. When a
 * fetch fails, the last copy is used; with none, it throws.
 */
function shellLoader({
  fetchImpl = (...args) => fetch(...args),
  now = Date.now,
} = {}) {
  let cached = null;
  let fetchedAt = 0;
  return async function loadShell() {
    if (cached && now() - fetchedAt < SHELL_TTL_MS) return cached;
    try {
      const response = await fetchImpl(`${PUBLIC_ORIGIN}/index.html`, {
        redirect: "error",
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) throw new Error(`shell answered ${response.status}`);
      const html = await response.text();
      if (!html.includes("</head>")) throw new Error("shell has no head");
      cached = html;
      fetchedAt = now();
      return cached;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  };
}

function setHeaders(res, headers) {
  for (const [key, value] of Object.entries(headers)) res.set(key, value);
}

/**
 * The handler behind `/activity/**` (functions/index.js `publicPostPage`).
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {{ db: FirebaseFirestore.Firestore,
 *           loadShell: () => Promise<string>,
 *           logger?: { warn: Function } }} deps
 */
async function servePublicPost(req, res, { db, loadShell, logger }) {
  setHeaders(res, SECURITY_HEADERS);
  // Never kept by Hosting's cache: a post made private, or an account
  // restricted, stops showing on the next visit.
  res.set("Cache-Control", "no-cache");
  const json = !!req.query && req.query.format === "json";
  if (json) res.set("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "GET, HEAD");
    res.status(204).send("");
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.set("Allow", "GET, HEAD");
    res.status(405).send("");
    return;
  }

  const activityId = postIdFromPath(req.path);
  let view = null;
  if (activityId) {
    try {
      view = await readPublicPost(db, activityId);
    } catch (err) {
      view = undefined;
      if (logger) logger.warn("publicPost.read_failed", { activityId, err: String(err) });
    }
  }

  if (json) {
    if (view === undefined) {
      res.status(503).json({ error: "unavailable" });
      return;
    }
    res.status(200).json(answerFor(activityId, view));
    return;
  }

  let shell = null;
  try {
    shell = await loadShell();
  } catch (err) {
    if (logger) logger.warn("publicPost.shell_failed", { err: String(err) });
  }
  res.set("Content-Type", "text/html; charset=utf-8");
  res
    .status(200)
    .send(
      shell
        ? renderShell(shell, activityId, view)
        : fallbackPage(activityId, view || null)
    );
}

module.exports = {
  APP_STORE_ID,
  PUBLIC_ORIGIN,
  DATA_ELEMENT_ID,
  SECURITY_HEADERS,
  SHELL_TTL_MS,
  servePublicPost,
  shellLoader,
};

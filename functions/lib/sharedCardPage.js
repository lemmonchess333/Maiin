"use strict";

/* ─────────────────────────────────────────────
   A shared card's page (Soc17 calls 1 to 3).

   Firebase Hosting hands `/card/<token>` to `sharedCardPage`
   (firebase.json), which answers as `publicPostPage` does for a post: the
   website's own page, its head naming the card so a pasted link gets a
   preview of its own, and the card in a data block the page reads
   (src/lib/sharedCardPage.ts). `?format=json` answers the same alone.

   What it shows: the card from its stored copy (sharedCards.js), the
   sharer's first name and their invite code while it is still theirs.
   Nothing else about them: no photo, no full name, no uid. A token that
   is unknown, deleted, or whose owner is restricted, being deleted or
   gone gets one answer, the one a token that never existed gets.

   Kept out of search, as a post's page is: a robots tag in the page and
   an `X-Robots-Tag` header on every answer. The link's preview picture is
   the app icon, as a post's is: a picture of the card would have to be
   drawn on the sharer's phone and uploaded, and Messages and WhatsApp
   fetch the preview the moment the link is pasted, before an upload made
   after the share sheet opens could land.
   ───────────────────────────────────────────── */

const {
  APP_STORE_ID,
  PUBLIC_ORIGIN,
  SECURITY_HEADERS,
  NO_INDEX,
  ROBOTS_TAG,
  ROBOTS_META,
  PREVIEW_META,
  PREVIEW_IMAGE,
  escapeAttr,
  jsonForScript,
  setHeaders,
} = require("./publicPost");
const { readSharedCard, cardNoun } = require("./sharedCards");

/** The id of the data block the page reads (src/lib/sharedCardPage.ts). */
const CARD_DATA_ELEMENT_ID = "tropos-shared-card";

/** A card's address: a token, 22 URL-safe characters. */
const CARD_PATH = /^\/card\/([A-Za-z0-9_-]{22})\/?$/;

/** The token in a request's path, or null. */
function tokenFromPath(path) {
  if (typeof path !== "string") return null;
  const match = CARD_PATH.exec(path);
  return match ? match[1] : null;
}

/** The card's own address, as the share sheet's words carry it. */
function cardUrl(token) {
  return `${PUBLIC_ORIGIN}/card/${token}`;
}

/** What the page and `?format=json` are told about a card. */
function answerFor(token, view) {
  return view
    ? { token, available: true, view }
    : { token: token || "", available: false };
}

/** The preview's title: "Sam’s run on Tropos". */
function previewTitle(view) {
  const noun = cardNoun(view.card);
  return view.firstName
    ? `${view.firstName}’s ${noun} on Tropos`
    : `A ${noun} on Tropos`;
}

/** The tags a pasted link's preview reads. */
function previewTags(token, view) {
  const title = escapeAttr(previewTitle(view));
  const description = escapeAttr(view.summary);
  const url = escapeAttr(cardUrl(token));
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

/**
 * The website's page for one card: its preview tags naming the card when
 * it is shown, Safari's banner, and the data block. A card not shown keeps
 * the website's own preview, so the head says nothing about it. `view`
 * undefined means the read failed: the page is left as it is and fetches
 * the card itself. Every answer asks search engines not to index it.
 *
 * The banner's argument is the card's own address. The iPhone app does
 * not open a card (the universal-links file does not name `/card/`), so
 * its Open starts the app as it is.
 */
function renderShell(shell, token, view) {
  const at = shell.lastIndexOf("</head>");
  if (at === -1) return shell;
  let head = shell.slice(0, at).replace(ROBOTS_META, "");
  const robots = `${ROBOTS_TAG}\n    `;
  if (!token || view === undefined) return `${head}${robots}${shell.slice(at)}`;
  if (view) head = head.replace(PREVIEW_META, "");
  const tags = view ? `${previewTags(token, view)}\n    ` : "";
  const banner = `<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=${cardUrl(token)}" />\n    `;
  const data = `<script type="application/json" id="${CARD_DATA_ELEMENT_ID}">${jsonForScript(
    answerFor(token, view)
  )}</script>`;
  return `${head}${robots}${tags}${banner}${data}\n  ${shell.slice(at)}`;
}

/** When the website's page cannot be had: the preview still works, and a
 *  person gets the way to Tropos. */
function fallbackPage(token, view) {
  const tags = view ? previewTags(token, view) : "";
  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "    <title>Tropos</title>",
    `    ${ROBOTS_TAG}`,
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
 * The handler behind `/card/**` (functions/index.js `sharedCardPage`).
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {{ db: FirebaseFirestore.Firestore,
 *           loadShell: () => Promise<string>,
 *           containsProfanity?: (text: string) => boolean,
 *           logger?: { warn: Function } }} deps
 */
async function serveSharedCard(
  req,
  res,
  { db, loadShell, containsProfanity, logger }
) {
  setHeaders(res, SECURITY_HEADERS);
  res.set("X-Robots-Tag", NO_INDEX);
  // Never kept by Hosting's cache: a card deleted with its session, or an
  // account restricted, stops showing on the next visit.
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

  const token = tokenFromPath(req.path);
  let view = null;
  if (token) {
    try {
      view = await readSharedCard(db, token, containsProfanity);
    } catch (err) {
      view = undefined;
      if (logger) logger.warn("sharedCard.read_failed", { err: String(err) });
    }
  }

  if (json) {
    if (view === undefined) {
      res.status(503).json({ error: "unavailable" });
      return;
    }
    res.status(200).json(answerFor(token, view));
    return;
  }

  let shell = null;
  try {
    shell = await loadShell();
  } catch (err) {
    if (logger) logger.warn("sharedCard.shell_failed", { err: String(err) });
  }
  res.set("Content-Type", "text/html; charset=utf-8");
  res
    .status(200)
    .send(
      shell
        ? renderShell(shell, token, view)
        : fallbackPage(token, view || null)
    );
}

module.exports = {
  CARD_DATA_ELEMENT_ID,
  serveSharedCard,
  tokenFromPath,
};

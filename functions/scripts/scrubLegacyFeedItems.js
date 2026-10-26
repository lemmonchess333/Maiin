#!/usr/bin/env node
"use strict";

/** Replace historical feed copies with routing-only indexes. Never run as
 * part of deploy: review the dry run for an explicitly selected project.
 *
 * node functions/scripts/scrubLegacyFeedItems.js --project PROJECT_ID
 * node functions/scripts/scrubLegacyFeedItems.js --project PROJECT_ID --apply
 * Optional: --max-pages 10 --after feeds/UID/items/DOC_ID
 *
 * Prints a checkpoint after each completed page. Restarting from the start
 * is also safe. No names, summaries or photo URLs are printed. */

const { FieldPath } = require("firebase-admin/firestore");
const {
  FEED_INDEX_VERSION,
  FEED_COPY_RETENTION_DAYS,
  FEED_COPY_PATH,
  buildFeedIndex,
} = require("../lib/feedIndex");
const { transactionAccountsLive } = require("../lib/deletionTransactionGuard");

const PAGE_SIZE = 200;
const INDEX_FIELDS = [
  "schemaVersion",
  "activityId",
  "authorId",
  "createdAt",
  "expiresAt",
];

function millis(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === "function") return value.toMillis();
  return NaN;
}

function validId(value) {
  return typeof value === "string" && value.length > 0 && !value.includes("/");
}

/** null means an unusable row: delete only this secondary index, never
 * its activity. Retain its original order and expiry, including auto-id
 * copies from before deterministic fanout ids were introduced. */
function scrubbedIndex(data) {
  if (
    !validId(data.activityId) ||
    !validId(data.authorId) ||
    !Number.isFinite(millis(data.createdAt))
  ) {
    return null;
  }
  const expiresAt = Number.isFinite(millis(data.expiresAt))
    ? data.expiresAt
    : new Date(millis(data.createdAt) + FEED_COPY_RETENTION_DAYS * 86_400_000);
  return buildFeedIndex({
    activityId: data.activityId,
    authorId: data.authorId,
    createdAt: data.createdAt,
    expiresAt,
  });
}

function isCurrentIndex(data) {
  return (
    data.schemaVersion === FEED_INDEX_VERSION &&
    Object.keys(data).length === INDEX_FIELDS.length &&
    Object.keys(data).every((key) => INDEX_FIELDS.includes(key)) &&
    scrubbedIndex(data) !== null &&
    Number.isFinite(millis(data.expiresAt))
  );
}

async function scrubLegacyFeedItems({
  firestore,
  apply = false,
  after = null,
  maxPages = Infinity,
  onPage = () => {},
}) {
  const report = {
    scanned: 0,
    foreign: 0,
    current: 0,
    candidates: 0,
    rewritten: 0,
    removed: 0,
    pages: 0,
    cursor: after,
    dryRun: !apply,
  };
  const query = firestore
    .collectionGroup("items")
    .orderBy(FieldPath.documentId())
    .limit(PAGE_SIZE);
  let cursor = after ? firestore.doc(after) : null;
  for (; report.pages < maxPages; ) {
    const page = await (cursor ? query.startAfter(cursor) : query).get();
    if (page.docs.length === 0) break;
    for (const doc of page.docs) {
      report.scanned += 1;
      if (!FEED_COPY_PATH.test(doc.ref.path)) {
        report.foreign += 1;
        continue;
      }
      if (isCurrentIndex(doc.data())) {
        report.current += 1;
        continue;
      }
      report.candidates += 1;
      if (!apply) continue;
      const outcome = await firestore.runTransaction(async (tx) => {
        // Re-read: do not resurrect a row deleted by its owner, a post's
        // delete trigger, TTL, or the account-deletion executor mid-scan.
        const latest = await tx.get(doc.ref);
        if (!latest.exists || isCurrentIndex(latest.data())) return "skipped";
        const index = scrubbedIndex(latest.data());
        if (
          !index ||
          !(await transactionAccountsLive({
            firestore,
            tx,
            uids: [index.authorId, doc.ref.path.split("/")[1]],
          }))
        ) {
          tx.delete(doc.ref);
          return "removed";
        }
        // Replace rather than merge, so every historical display field is
        // actually erased. This same transaction retains the deletion freeze.
        tx.set(doc.ref, index);
        return "rewritten";
      });
      if (outcome === "rewritten" || outcome === "removed")
        report[outcome] += 1;
    }
    cursor = page.docs[page.docs.length - 1].ref;
    report.cursor = cursor.path;
    report.pages += 1;
    await onPage({ ...report });
    if (page.docs.length < PAGE_SIZE) break;
  }
  return report;
}

function parseArgs(args) {
  const options = {
    apply: false,
    projectId: null,
    after: null,
    maxPages: Infinity,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--project") options.projectId = args[++i];
    else if (arg === "--after") options.after = args[++i];
    else if (arg === "--max-pages") options.maxPages = Number(args[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.projectId || !/^[a-z][a-z0-9-]+$/.test(options.projectId)) {
    throw new Error("An explicit --project PROJECT_ID is required.");
  }
  if (
    options.after !== null &&
    (typeof options.after !== "string" ||
      options.after.split("/").length % 2 !== 0)
  ) {
    throw new Error(
      "--after must be the full last-document path from a completed page."
    );
  }
  if (
    options.maxPages !== Infinity &&
    (!Number.isInteger(options.maxPages) || options.maxPages < 1)
  ) {
    throw new Error("--max-pages must be a positive integer.");
  }
  return options;
}

module.exports = {
  scrubbedIndex,
  isCurrentIndex,
  scrubLegacyFeedItems,
  parseArgs,
};

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const options = parseArgs(process.argv.slice(2));
      const admin = require("firebase-admin");
      admin.initializeApp({ projectId: options.projectId });
      const report = await scrubLegacyFeedItems({
        ...options,
        firestore: admin.firestore(),
        onPage: (checkpoint) => console.log(JSON.stringify(checkpoint)),
      });
      console.log(
        JSON.stringify({ projectId: options.projectId, ...report }, null, 2)
      );
    })
    .catch((error) => {
      console.error("Feed scrub failed:", error.message);
      process.exitCode = 1;
    });
}

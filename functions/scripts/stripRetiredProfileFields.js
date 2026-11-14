#!/usr/bin/env node
"use strict";

/**
 * Strip the retired fields from every stored profile (App1 Q24,
 * operator-run).
 *
 * App1's grill, Q24: "Fields that do nothing are deleted, one PR per
 * document, with a script that strips stored copies." The profile document
 * `users/{uid}` lost the fields that nothing read, and the `startWeight`
 * key inside its `program` map. No build from that release on writes them; this
 * removes the copies already stored, and exactly those paths:
 * `RETIRED_PROFILE_FIELDS` in functions/profileSanitizer.js (pinned to the
 * registry's `retired` entries, src/lib/profileFieldRegistry.ts) and
 * `program.startWeight`. Nothing else on a profile is touched.
 *
 * Every `users` document is read rather than queried for the fields:
 * several are stored as `null` (`lastLogDate` on every sign-up), and a
 * query finds a document by one field's value, not by any of a list of
 * fields being present. Only the retired paths are fetched (`select`).
 *
 * Usage, from the repo root, once Deploy production has shipped the release
 * that stopped writing them:
 *
 *   node functions/scripts/stripRetiredProfileFields.js --project PROJECT_ID
 *   node functions/scripts/stripRetiredProfileFields.js --project PROJECT_ID --apply
 *   Optional: --after users/UID (resume after a checkpoint), --max-pages N
 *
 * Requirements: `npm ci` in functions/, and GOOGLE_APPLICATION_CREDENTIALS
 * pointing at a service account with Firestore access, or gcloud ADC
 * (`gcloud auth application-default login`).
 *
 * Without `--apply` it is a dry run and writes nothing: it reports how many
 * profiles hold each path. With `--apply` it deletes them with
 * `FieldValue.delete()`, one batch per page of 200 profiles, and prints a
 * checkpoint after each page (the counts so far and the last profile's
 * path). `--after` with that path resumes after it. A batch is all or
 * nothing, so a page that fails (a profile deleted while the run reached
 * it, say) writes nothing, and running again from the last checkpoint
 * finishes it. Running again from the start is safe as well: a stripped
 * profile has nothing left to delete and is not written. The output is
 * counts and the checkpoint path, nothing else about an account.
 *
 * An older build still running writes some of these fields again (the
 * rules allow them until `config/client.minSupportedVersion` is raised past
 * this release), so a dry run after raising it shows what came back, and a
 * second `--apply` removes it.
 *
 * Each profile written fires `onRaceGoalWritten` (the trigger on
 * `users/{uid}`) once. It returns before reading anything, because the
 * write leaves the race goal as it was, so a strip costs one short
 * invocation for each profile that held a retired field.
 */

const { FieldPath } = require("firebase-admin/firestore");
const { RETIRED_PROFILE_FIELDS } = require("../profileSanitizer");

/** One batch per page, well under Firestore's 500 writes. */
const PAGE_SIZE = 200;

/** Every path this script deletes: the retired fields, and a retired key
 *  inside a field that stays. */
const RETIRED_PROFILE_PATHS = Object.freeze([
  ...RETIRED_PROFILE_FIELDS,
  "program.startWeight",
]);

function holds(value, key) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

/** The retired paths a stored profile holds, a stored `null` included. */
function storedRetiredPaths(data) {
  return RETIRED_PROFILE_PATHS.filter((path) => {
    let at = data;
    for (const key of path.split(".")) {
      if (!holds(at, key)) return false;
      at = at[key];
    }
    return true;
  });
}

/**
 * `fieldDelete` is `FieldValue.delete()`, passed in so the logic runs
 * against a fake without the Admin SDK.
 */
async function stripRetiredProfileFields({
  firestore,
  fieldDelete,
  apply = false,
  after = null,
  maxPages = Infinity,
  onPage = () => {},
}) {
  const report = {
    scanned: 0,
    holding: 0,
    fields: Object.fromEntries(RETIRED_PROFILE_PATHS.map((path) => [path, 0])),
    stripped: 0,
    pages: 0,
    cursor: after,
    dryRun: !apply,
  };
  const query = firestore
    .collection("users")
    .orderBy(FieldPath.documentId())
    .select(...RETIRED_PROFILE_PATHS)
    .limit(PAGE_SIZE);
  let cursor = after ? firestore.doc(after) : null;
  while (report.pages < maxPages) {
    const page = await (cursor ? query.startAfter(cursor) : query).get();
    if (page.docs.length === 0) break;
    const batch = apply ? firestore.batch() : null;
    let writes = 0;
    for (const doc of page.docs) {
      report.scanned += 1;
      const paths = storedRetiredPaths(doc.data() || {});
      if (paths.length === 0) continue;
      report.holding += 1;
      for (const path of paths) report.fields[path] += 1;
      if (!batch) continue;
      // A dotted key in an update is a path into the map, so this removes
      // `program.startWeight` and leaves the rest of `program` alone.
      batch.update(
        doc.ref,
        Object.fromEntries(paths.map((path) => [path, fieldDelete]))
      );
      writes += 1;
    }
    if (writes > 0) {
      await batch.commit();
      report.stripped += writes;
    }
    cursor = page.docs[page.docs.length - 1].ref;
    report.cursor = cursor.path;
    report.pages += 1;
    await onPage({ ...report, fields: { ...report.fields } });
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
  if (options.after !== null && !/^users\/[^/]+$/.test(String(options.after))) {
    throw new Error(
      "--after must be a checkpoint's path, users/UID, from a completed page."
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
  RETIRED_PROFILE_PATHS,
  storedRetiredPaths,
  stripRetiredProfileFields,
  parseArgs,
};

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const options = parseArgs(process.argv.slice(2));
      const admin = require("../lib/adminSdk");
      admin.initializeApp({ projectId: options.projectId });
      const report = await stripRetiredProfileFields({
        ...options,
        firestore: admin.firestore(),
        fieldDelete: admin.firestore.FieldValue.delete(),
        onPage: (checkpoint) => console.log(JSON.stringify(checkpoint)),
      });
      console.log(
        JSON.stringify({ projectId: options.projectId, ...report }, null, 2)
      );
      console.log(
        report.dryRun
          ? `DRY RUN: ${report.holding} of ${report.scanned} profile(s) hold a retired field. Nothing was written; run again with --apply to strip them.`
          : `Stripped the retired fields from ${report.stripped} of ${report.scanned} profile(s).`
      );
    })
    .catch((error) => {
      console.error("Profile strip failed:", error.message);
      process.exitCode = 1;
    });
}

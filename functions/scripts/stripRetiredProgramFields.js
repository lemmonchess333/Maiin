#!/usr/bin/env node
/**
 * Strip the retired keys from every stored plan (App1 Q24, operator-run).
 *
 * `users/{uid}/programState/current` carried seven fields nothing reads or
 * writes now: `fatigueScore`, `plateauResponses`, the plan's own
 * `templateId` and `recoveringMuscles` at the top, and
 * `settings.microloading`, `trainingBlock.amnestyWeeksLeft` and
 * `deloadSnapshot.fatigueScore` inside. The list is the server's own
 * (`RETIRED_PROGRAM_STATE_KEYS` and `RETIRED_PROGRAM_STATE_SUBKEYS` in
 * lib/programStateSanitizer.js), which deletes them from every plan a
 * programme command writes; this removes the copies on every other plan.
 *
 * A run day's `templateId` is the run itself and is never touched: only the
 * plan's top-level `templateId` is deleted.
 *
 * Usage (run from repo root, after Deploy production has shipped the
 * change, so the server tolerates and deletes the keys before this runs):
 *
 *   node functions/scripts/stripRetiredProgramFields.js --project PROJECT_ID          # dry run: counts only
 *   node functions/scripts/stripRetiredProgramFields.js --project PROJECT_ID --apply  # strips
 *   Optional: --after users/UID/programState/current (resume) --max-pages N
 *
 * Requirements: GOOGLE_APPLICATION_CREDENTIALS pointing at a service
 * account with Firestore access, or gcloud ADC.
 *
 * Dry run by default: it counts the plans carrying each field and writes
 * nothing. With --apply it deletes only those fields, one batched update per
 * page of 200 plans, with `FieldValue.delete()` (a dotted path for a field
 * inside an object), and touches nothing else on a plan. An update never
 * makes a document, so a plan deleted mid-run is not brought back: its
 * page's batch fails instead, and running again (from the start, or from the
 * last printed checkpoint with --after) finishes the job. A second run finds
 * nothing. Nothing else is needed afterwards: an app from before the change
 * can still write `fatigueScore` back, and the server deletes it again on
 * that plan's next command.
 */
"use strict";

const {
  RETIRED_PROGRAM_STATE_KEYS,
  RETIRED_PROGRAM_STATE_SUBKEYS,
} = require("../lib/programStateSanitizer");

const PAGE_SIZE = 200; // one batch per page, under Firestore's 500-op cap
const PLAN_PATH = /^users\/[^/]+\/programState\/current$/;

/** Every field this can delete, as the update paths it uses. */
const RETIRED_FIELD_PATHS = [
  ...RETIRED_PROGRAM_STATE_KEYS,
  ...Object.entries(RETIRED_PROGRAM_STATE_SUBKEYS).flatMap(([parent, keys]) =>
    keys.map((key) => `${parent}.${key}`)
  ),
];

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/** The retired fields a stored plan carries, as update paths. */
function retiredFieldPaths(data) {
  if (!isPlainObject(data)) return [];
  const paths = [...RETIRED_PROGRAM_STATE_KEYS].filter((key) => has(data, key));
  for (const [parent, keys] of Object.entries(RETIRED_PROGRAM_STATE_SUBKEYS)) {
    if (!isPlainObject(data[parent])) continue;
    for (const key of keys) {
      if (has(data[parent], key)) paths.push(`${parent}.${key}`);
    }
  }
  return paths;
}

/**
 * `fieldDelete` is `FieldValue.delete()` and `documentId` returns
 * `FieldPath.documentId()`, passed in so the logic runs against a fake
 * without the Admin SDK.
 */
async function stripRetiredProgramFields({
  firestore,
  fieldDelete,
  documentId,
  apply = false,
  after = null,
  maxPages = Infinity,
  onPage = () => {},
}) {
  const report = {
    scanned: 0,
    plans: 0,
    carrying: 0,
    fields: Object.fromEntries(RETIRED_FIELD_PATHS.map((path) => [path, 0])),
    stripped: 0,
    pages: 0,
    cursor: after,
    dryRun: !apply,
  };
  const query = firestore
    .collectionGroup("programState")
    .orderBy(documentId())
    .limit(PAGE_SIZE);
  let cursor = after ? firestore.doc(after) : null;
  while (report.pages < maxPages) {
    const page = await (cursor ? query.startAfter(cursor) : query).get();
    if (page.docs.length === 0) break;
    const updates = [];
    for (const doc of page.docs) {
      report.scanned += 1;
      if (!PLAN_PATH.test(doc.ref.path)) continue;
      report.plans += 1;
      const paths = retiredFieldPaths(doc.data());
      if (paths.length === 0) continue;
      report.carrying += 1;
      for (const path of paths) report.fields[path] += 1;
      updates.push([doc.ref, paths]);
    }
    if (apply && updates.length > 0) {
      const batch = firestore.batch();
      for (const [ref, paths] of updates) {
        batch.update(
          ref,
          Object.fromEntries(paths.map((path) => [path, fieldDelete]))
        );
      }
      await batch.commit();
      report.stripped += updates.length;
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
  if (options.after !== null && !PLAN_PATH.test(String(options.after))) {
    throw new Error(
      "--after must be the cursor a completed page printed (users/UID/programState/current)."
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
  RETIRED_FIELD_PATHS,
  retiredFieldPaths,
  stripRetiredProgramFields,
  parseArgs,
};

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const options = parseArgs(process.argv.slice(2));
      const admin = require("../lib/adminSdk");
      admin.initializeApp({ projectId: options.projectId });
      const report = await stripRetiredProgramFields({
        ...options,
        firestore: admin.firestore(),
        fieldDelete: admin.firestore.FieldValue.delete(),
        documentId: () => admin.firestore.FieldPath.documentId(),
        onPage: (checkpoint) => console.log(JSON.stringify(checkpoint)),
      });
      console.log(
        JSON.stringify({ projectId: options.projectId, ...report }, null, 2)
      );
      console.log(
        report.dryRun
          ? `DRY RUN: ${report.carrying} of ${report.plans} plan(s) carry a retired field. Nothing was written.`
          : `Stripped the retired fields from ${report.stripped} plan(s).`
      );
    })
    .catch((error) => {
      console.error("Strip failed:", error.message);
      process.exitCode = 1;
    });
}

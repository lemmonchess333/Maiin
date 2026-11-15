#!/usr/bin/env node
/**
 * Count the accounts that still hold the retired "structured" run mode
 * (App1 Q25, operator-run). Read-only: it writes nothing.
 *
 * Run9 (3a) retired the structured run mode. Setup and Settings stopped
 * offering it, and the programme's loader moves an account it opens to
 * free running: the profile's `runMode` becomes "freeform" and the
 * structured plan and its run days are cleared. App1 Q25 takes the mode
 * out of the code once this count shows no account holds it.
 *
 * Where the mode is stored:
 *   - the profile: `users/{uid}.runMode`
 *   - the plan:    `users/{uid}/programState/current.runPlan.mode`
 * A saved run keeps the mode it was run under
 * (`users/{uid}/runs/{runId}.planMode`). That is the run's history: the
 * app reads it as "no race plan" either way, and it stays. It is counted
 * on a line of its own and does not hold the removal back.
 *
 * Usage (run from the repo root):
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node functions/scripts/countStructuredRunMode.js adaptive-fitness-af8bb
 *
 * Add `--uids` to list the accounts as well. Without it the report holds
 * counts only, never a uid.
 *
 * Requirements: a service account with Firestore read access, or gcloud
 * ADC. It reads every account's profile and plan once, and counts each
 * account's saved runs with one aggregation query.
 */
"use strict";

const RETIRED_RUN_MODE = "structured";
const PAGE_SIZE = 200;
const CONCURRENCY = 8;

/** Runs `worker` over `items`, at most `CONCURRENCY` at a time. */
async function eachLimited(items, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    })
  );
}

async function countStructuredRunMode(
  firestore,
  {
    // admin.firestore.FieldPath.documentId; the bare name works as well.
    documentId = () => "__name__",
    pageSize = PAGE_SIZE,
    listUids = false,
  } = {}
) {
  const uids = { profiles: [], plans: [], savedRuns: [] };
  const report = {
    accounts: 0,
    profiles: 0,
    plans: 0,
    holding: 0,
    savedRuns: { runs: 0, accounts: 0 },
  };

  const users = firestore.collection("users");
  let last = null;
  for (;;) {
    let page = users.orderBy(documentId()).limit(pageSize);
    if (last) page = page.startAfter(last);
    const snap = await page.get();
    await eachLimited(snap.docs, async (user) => {
      const [plan, runs] = await Promise.all([
        user.ref.collection("programState").doc("current").get(),
        user.ref
          .collection("runs")
          .where("planMode", "==", RETIRED_RUN_MODE)
          .count()
          .get(),
      ]);
      const inProfile = user.data()?.runMode === RETIRED_RUN_MODE;
      const inPlan =
        plan.exists && plan.data()?.runPlan?.mode === RETIRED_RUN_MODE;
      const savedRuns = runs.data().count;

      report.accounts += 1;
      if (inProfile) {
        report.profiles += 1;
        uids.profiles.push(user.id);
      }
      if (inPlan) {
        report.plans += 1;
        uids.plans.push(user.id);
      }
      if (inProfile || inPlan) report.holding += 1;
      if (savedRuns > 0) {
        report.savedRuns.runs += savedRuns;
        report.savedRuns.accounts += 1;
        uids.savedRuns.push(user.id);
      }
    });
    if (snap.docs.length < pageSize) break;
    last = snap.docs[snap.docs.length - 1];
  }

  if (listUids) {
    for (const list of Object.values(uids)) list.sort();
    report.uids = uids;
  }
  return report;
}

/** The line under the report: whether the removal may merge. */
function verdict(report) {
  if (report.holding === 0)
    return "No account holds the structured run mode: the removal can merge.";
  return (
    `${report.holding} account(s) still hold the structured run mode. ` +
    "Each moves to free running the next time it opens the app; " +
    "run this again before merging the removal."
  );
}

module.exports = { countStructuredRunMode, verdict, RETIRED_RUN_MODE };

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const args = process.argv.slice(2);
      const listUids = args.includes("--uids");
      const unknown = args.filter((a) => a.startsWith("--") && a !== "--uids");
      const projectId = args.find((a) => !a.startsWith("--"));
      if (unknown.length > 0)
        throw new Error(`Unknown option: ${unknown.join(" ")}`);
      if (!projectId)
        throw new Error("Pass the Firebase project id as the first argument.");
      const admin = require("../lib/adminSdk");
      admin.initializeApp({ projectId });
      const report = await countStructuredRunMode(admin.firestore(), {
        documentId: () => admin.firestore.FieldPath.documentId(),
        listUids,
      });
      console.log(JSON.stringify({ projectId, ...report }, null, 2));
      console.log(verdict(report));
    })
    .catch((error) => {
      console.error("Structured run mode count failed:", error.message);
      process.exitCode = 1;
    });
}

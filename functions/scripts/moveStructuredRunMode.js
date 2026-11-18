/**
 * Move the accounts still on the retired "structured" run mode to free
 * running (App1 Q25, operator-run).
 *
 * Run9 (3a) retired the mode, and the programme's loader moves an account
 * the next time it opens the app (useProgram.ts): the profile's `runMode`
 * becomes "freeform", and the account's plan, if it has one, loses its
 * orphaned `runDays` and `runPlan`. An account nobody opens again (an old
 * test account, say) keeps the mode for good and holds the mode's removal
 * back (countStructuredRunMode.js). This makes that same move, and nothing
 * else: no other profile field, and no plan is created for an account that
 * has none (the app builds one on its first open, as it does for anyone).
 *
 * Usage, from the repo root:
 *
 *   node functions/scripts/moveStructuredRunMode.js --project PROJECT_ID          # dry run: counts only
 *   node functions/scripts/moveStructuredRunMode.js --project PROJECT_ID --apply  # moves them
 *
 * Requirements: GOOGLE_APPLICATION_CREDENTIALS pointing at a service
 * account with Firestore access, or gcloud ADC.
 *
 * Each account moves in its own transaction, which reads the profile again
 * and leaves it alone if it is no longer structured (the app moved it in
 * the meantime). The report is counts only, never an account.
 */
"use strict";

const RETIRED_RUN_MODE = "structured";

async function moveStructuredRunMode(
  firestore,
  { apply = false, fieldDelete } = {}
) {
  if (apply && !fieldDelete)
    throw new Error("Applying needs FieldValue.delete() as fieldDelete.");
  const snap = await firestore
    .collection("users")
    .where("runMode", "==", RETIRED_RUN_MODE)
    .get();
  const report = {
    found: snap.docs.length,
    moved: 0,
    plansCleared: 0,
    dryRun: !apply,
  };
  if (!apply) return report;

  for (const user of snap.docs) {
    const planRef = user.ref.collection("programState").doc("current");
    const outcome = await firestore.runTransaction(async (tx) => {
      const [profile, plan] = await Promise.all([
        tx.get(user.ref),
        tx.get(planRef),
      ]);
      if (!profile.exists || profile.data()?.runMode !== RETIRED_RUN_MODE)
        return { moved: false, planCleared: false };
      tx.update(user.ref, { runMode: "freeform" });
      if (plan.exists) {
        tx.update(planRef, { runDays: [], runPlan: fieldDelete });
        return { moved: true, planCleared: true };
      }
      return { moved: true, planCleared: false };
    });
    if (outcome.moved) report.moved += 1;
    if (outcome.planCleared) report.plansCleared += 1;
  }
  return report;
}

function parseArgs(argv) {
  const options = { apply: false, projectId: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--project") options.projectId = argv[(i += 1)];
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!options.projectId) throw new Error("Pass --project PROJECT_ID.");
  return options;
}

module.exports = { moveStructuredRunMode, parseArgs, RETIRED_RUN_MODE };

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const options = parseArgs(process.argv.slice(2));
      const admin = require("../lib/adminSdk");
      admin.initializeApp({ projectId: options.projectId });
      const report = await moveStructuredRunMode(admin.firestore(), {
        apply: options.apply,
        fieldDelete: admin.firestore.FieldValue.delete(),
      });
      console.log(
        JSON.stringify({ projectId: options.projectId, ...report }, null, 2)
      );
      console.log(
        report.dryRun
          ? `DRY RUN: ${report.found} account(s) on the structured run mode. Nothing was written.`
          : `Moved ${report.moved} of ${report.found} account(s) to free running; cleared ${report.plansCleared} plan(s).`
      );
    })
    .catch((error) => {
      console.error("Structured run mode move failed:", error.message);
      process.exitCode = 1;
    });
}

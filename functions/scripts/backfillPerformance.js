#!/usr/bin/env node
/**
 * One-off backfill: recompute every active user's Performance Index with the
 * now-deployed GOAL-AWARE engine (functions/lib/perfScoring.js), correcting
 * stored PI docs that were written under the prior goal-blind server logic
 * (PR #1054) — immediately, rather than waiting up to ~7 days for the daily
 * refresh / weekly rollup crons to churn through.
 *
 * WHY: PR #1054 made the server PI engine goal-aware (recovery thresholds,
 * adherence calorie tolerance, lift/run weighting, default workouts target).
 * Existing perf docs for cut / lean-bulk users were computed goal-blind. They
 * self-heal on the next scheduled rollup; this forces the correction now.
 *
 * WHAT IT DOES — mirrors `weeklyPerformanceRollup` exactly (functions/index.js
 * sweepActiveUsers): a BOUNDED `lastActiveAt >= now - <cutoff>d` query (NEVER a
 * full users scan — the runaway-cost rail every sweep function honours),
 * batches of 10 for bounded concurrency, a per-uid tombstone guard, then
 * `computeAndWritePerformanceForUser(uid, null)` (today's compute key). It
 * REUSES the canonical engine — no re-derived scoring — so the backfill and
 * production write byte-identical docs.
 *
 * IDEMPOTENT: re-running overwrites today's perf doc with the same result.
 * Safe to run repeatedly. Per-user failures are logged and skipped, never
 * fatal to the run.
 *
 * Credentials (same convention as scripts/backfill-streak-mirror.ts):
 *   Local:  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   GCP VM: applicationDefault() works without setup.
 *
 * Usage — run from the functions/ directory so deps resolve against
 * functions/node_modules:
 *   cd functions && npm install            # if node_modules is absent
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json \
 *     node scripts/backfillPerformance.js [--dry-run] [--cutoff-days=30]
 *
 *   --dry-run        list the users that WOULD be recomputed; write nothing
 *   --cutoff-days=N  active-user window in days (default 30, matches the
 *                    weeklyPerformanceRollup cutoff)
 *
 * Recommended window: low-activity hours (02:00–05:00 UK) to minimise
 * contention with live trigger-driven recomputes.
 *
 * Log output contains UIDs and PI numbers only. Do not commit logs to the repo
 * or upload them externally without review.
 */

const BATCH_SIZE = 10; // matches sweepActiveUsers bounded concurrency

/**
 * Build the real production dependencies. Called ONLY from the CLI entrypoint
 * so importing this module for tests has no side effects (no admin init, no
 * applicationDefault credential lookup). performanceEngine is required AFTER
 * admin init because it calls admin.firestore() at module load.
 */
function buildDefaultDeps() {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  const db = admin.firestore();
  const { computeAndWritePerformanceForUser } = require("../performanceEngine");
  const accountDeletionLocks = require("../lib/accountDeletionLocks");
  return {
    db,
    Timestamp: admin.firestore.Timestamp,
    computeFn: computeAndWritePerformanceForUser,
    shouldProceed: (uid) =>
      accountDeletionLocks.shouldSystemWriteProceed(db, uid, "backfillPerformance"),
  };
}

function parseArgs(argv) {
  const args = { dryRun: false, cutoffDays: 30 };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a.startsWith("--cutoff-days=")) {
      const n = Number(a.split("=")[1]);
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Invalid --cutoff-days value: ${a}`);
        process.exit(1);
      }
      args.cutoffDays = n;
    } else {
      console.error(`Unknown argument: ${a}`);
      console.error("Usage: node scripts/backfillPerformance.js [--dry-run] [--cutoff-days=N]");
      process.exit(1);
    }
  }
  return args;
}

/**
 * @param {object} opts
 * @param {boolean} opts.dryRun
 * @param {number}  opts.cutoffDays
 * @param {object}  opts.db                Firestore instance
 * @param {object}  opts.Timestamp         admin.firestore.Timestamp
 * @param {Function} opts.computeFn        (uid, computeKey) => Promise<result>
 * @param {Function} opts.shouldProceed    (uid) => Promise<boolean> tombstone guard
 * @returns {Promise<{recomputed:number, skippedDeletion:number, errors:number}>}
 */
async function main({ dryRun, cutoffDays, db, Timestamp, computeFn, shouldProceed }) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cutoffDays);
  const cutoffTs = Timestamp.fromDate(cutoff);

  console.log(
    `[backfill-perf] ${dryRun ? "DRY RUN — " : ""}recompute PI for users active since ` +
      `${cutoff.toISOString()} (last ${cutoffDays}d)`
  );

  // Bounded query — mirrors sweepActiveUsers. NEVER fall back to a full users
  // scan: an unbounded recompute is the documented runaway-cost hazard.
  let usersSnap;
  try {
    usersSnap = await db
      .collection("users")
      .where("lastActiveAt", ">=", cutoffTs)
      .get();
  } catch (err) {
    console.error("[backfill-perf] lastActiveAt query failed, aborting:", err.message);
    throw err;
  }

  const uids = usersSnap.docs.map((d) => d.id);
  console.log(`[backfill-perf] ${uids.length} active user(s) in window`);

  const summary = { recomputed: 0, skippedDeletion: 0, errors: 0 };

  for (let i = 0; i < uids.length; i += BATCH_SIZE) {
    const batch = uids.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (uid) => {
        try {
          // Per-uid tombstone guard — the active-users list was read seconds
          // ago; a user may have started account deletion since. Recomputing
          // them would re-create orphan docs.
          if (!(await shouldProceed(uid))) {
            summary.skippedDeletion++;
            console.log(`  uid=${uid} skipped (deletion in progress)`);
            return;
          }

          if (dryRun) {
            console.log(`  uid=${uid} would recompute`);
            return;
          }

          const res = await computeFn(uid, null);
          summary.recomputed++;
          console.log(
            `  uid=${uid} PI=${res.performanceIndex} band=${res.loadBand} (${res.weekKey})`
          );
        } catch (err) {
          summary.errors++;
          console.error(`  uid=${uid} error: ${err.message}`);
        }
      })
    );
  }

  console.log("");
  console.log(
    `[backfill-perf] ${dryRun ? "DRY RUN complete" : "complete"}. ` +
      `${dryRun ? "Would recompute" : "Recomputed"}: ${summary.recomputed}. ` +
      `Skipped (deletion): ${summary.skippedDeletion}. Errors: ${summary.errors}.`
  );

  return summary;
}

// CLI entrypoint — only runs when invoked directly, so importing this module
// for tests has no side effects.
if (require.main === module) {
  main({ ...parseArgs(process.argv), ...buildDefaultDeps() })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[backfill-perf] fatal:", err);
      process.exit(1);
    });
}

module.exports = { main, parseArgs, buildDefaultDeps, BATCH_SIZE };

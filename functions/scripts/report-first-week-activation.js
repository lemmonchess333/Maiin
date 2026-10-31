#!/usr/bin/env node
/**
 * Read-only first-week activation report for completed onboarding cohorts.
 *
 * Example:
 *   node functions/scripts/report-first-week-activation.js \
 *     --project=tropos-prod --since=2026-10-01 --until=2026-10-08
 *
 * The range selects onboardingCompletedAt in [since, until), UTC. `until`
 * must be at least 14 days old so every account has the paid follow-up.
 * Reads current workout/run documents and uses each document's Firestore
 * createTime, not the client-authored activity timestamps. Deleted sessions
 * are excluded. The output contains aggregate counts only, never user IDs.
 * Billing outcomes come only from server-owned first provider observations.
 * Cohorts enrolled before those writers were deployed can undercount billing;
 * the output cannot repair missing historical purchase events.
 */
const admin = require("firebase-admin");
const {
  ACTIVATION_WINDOW_MS,
  activationSport,
  firstValidActivities,
} = require("../lib/firstWeekActivation");
const { validOnboardingPlatform } = require("../lib/activationBilling");

const DAY_ARG = /^\d{4}-\d{2}-\d{2}$/;
const SPORT_KEYS = ["runner", "lifter", "hybrid", "other"];
const CONCURRENCY = 6;
const PAID_WINDOW_MS = 14 * 86_400_000;
const PLATFORM_KEYS = ["ios", "web", "android", "unknown"];

function parseArgs(argv) {
  const options = Object.create(null);
  for (const arg of argv) {
    const match = /^--(project|since|until)=(.+)$/.exec(arg);
    if (!match || options[match[1]])
      throw new Error(`Unknown or repeated argument: ${arg}`);
    options[match[1]] = match[2];
  }
  if (!options.project || !options.since || !options.until)
    throw new Error(
      "Required: --project=ID --since=YYYY-MM-DD --until=YYYY-MM-DD"
    );
  for (const key of ["since", "until"]) {
    if (!DAY_ARG.test(options[key]))
      throw new Error(`${key} must be YYYY-MM-DD`);
    const parsed = new Date(`${options[key]}T00:00:00.000Z`);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== options[key]
    )
      throw new Error(`${key} is not a real UTC date`);
    options[`${key}Ms`] = parsed.getTime();
  }
  if (options.sinceMs >= options.untilMs)
    throw new Error("since must precede until");
  if (options.untilMs > Date.now() - PAID_WINDOW_MS)
    throw new Error("until must be at least 14 days before now");
  return options;
}

function emptyRow() {
  return {
    onboarded: 0,
    firstValidActivity: 0,
    firstValidWorkout: 0,
    firstValidRun: 0,
    verifiedTrialStarts: 0,
    verifiedPaidStarts: 0,
    activityAndTrial: 0,
    activityAndPaid: 0,
    activityLagHours: [],
  };
}

function verifiedStartWithinWindow(firsts, kind, onboardingAtMs, windowMs) {
  const start = firsts?.[kind];
  return Boolean(
    (start?.source === "ios_iap" || start?.source === "stripe") &&
    Number.isSafeInteger(start.atMs) &&
    start.atMs >= onboardingAtMs &&
    start.atMs <= onboardingAtMs + windowMs
  );
}

function addRow(row, first, onboardingAtMs, billingFirsts) {
  row.onboarded += 1;
  if (first.workoutAtMs !== null) row.firstValidWorkout += 1;
  if (first.runAtMs !== null) row.firstValidRun += 1;
  if (first.activityAtMs !== null) {
    row.firstValidActivity += 1;
    row.activityLagHours.push(
      (first.activityAtMs - onboardingAtMs) / 3_600_000
    );
  }
  const trial = verifiedStartWithinWindow(
    billingFirsts,
    "trial",
    onboardingAtMs,
    ACTIVATION_WINDOW_MS
  );
  const paid = verifiedStartWithinWindow(
    billingFirsts,
    "paid",
    onboardingAtMs,
    PAID_WINDOW_MS
  );
  if (trial) row.verifiedTrialStarts += 1;
  if (paid) row.verifiedPaidStarts += 1;
  if (first.activityAtMs !== null && trial) row.activityAndTrial += 1;
  if (first.activityAtMs !== null && paid) row.activityAndPaid += 1;
}

function presentRow(row) {
  const hours = row.activityLagHours.sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  const median = hours.length
    ? hours.length % 2
      ? hours[mid]
      : (hours[mid - 1] + hours[mid]) / 2
    : null;
  return {
    onboarded: row.onboarded,
    firstValidActivity: row.firstValidActivity,
    activationRate: row.onboarded
      ? Number((row.firstValidActivity / row.onboarded).toFixed(4))
      : null,
    firstValidWorkout: row.firstValidWorkout,
    firstValidRun: row.firstValidRun,
    verifiedTrialStarts: row.verifiedTrialStarts,
    verifiedPaidStarts: row.verifiedPaidStarts,
    trialStartRate: row.onboarded
      ? Number((row.verifiedTrialStarts / row.onboarded).toFixed(4))
      : null,
    paidStartRate: row.onboarded
      ? Number((row.verifiedPaidStarts / row.onboarded).toFixed(4))
      : null,
    activityAndTrial: row.activityAndTrial,
    activityAndPaid: row.activityAndPaid,
    medianHoursToFirstActivity:
      median === null ? null : Number(median.toFixed(2)),
  };
}

async function mapLimited(items, worker) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await worker(item);
      }
    })
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!admin.apps.length) admin.initializeApp({ projectId: args.project });
  const db = admin.firestore();
  const users = await db
    .collection("users")
    .where(
      "onboardingCompletedAt",
      ">=",
      admin.firestore.Timestamp.fromMillis(args.sinceMs)
    )
    .where(
      "onboardingCompletedAt",
      "<",
      admin.firestore.Timestamp.fromMillis(args.untilMs)
    )
    .get();

  const report = {
    cohortWindowUtc: { since: args.since, untilExclusive: args.until },
    activityWindowHours: 168,
    trialWindowHours: 168,
    paidWindowHours: 336,
    activityTimeSource: "Firestore document createTime",
    billingTimeSource: "provider purchase or billing period time",
    measurementNotes: [
      "Billing starts are provider-verified first observations, not checkout taps or current subscription state. RevenueCat confirms a non-trial subscription period, not the amount charged.",
      "Cohorts before deployment of the billing writers may undercount trial and paid starts; compare only fully instrumented cohorts.",
      "Onboarding platform is a client-reported value accepted and stamped once by the server for version 2; older cohorts are unknown.",
      "Training type is stamped on first setup for newly instrumented accounts; older accounts fall back to their current profile and may have changed type.",
      "Stripe is dormant at launch; web billing counts depend on signed Stripe events when web sales are enabled.",
      "Deleted accounts are absent from the current users query, so this report is not a historical all-signups ledger.",
    ],
    groups: {
      v2: { all: emptyRow() },
      legacy: { all: emptyRow() },
    },
    byOnboardingPlatform: { v2: {}, legacy: {} },
    bySportAndPlatform: { v2: {}, legacy: {} },
  };
  for (const cohort of ["v2", "legacy"]) {
    for (const sport of SPORT_KEYS) report.groups[cohort][sport] = emptyRow();
    for (const platform of PLATFORM_KEYS)
      report.byOnboardingPlatform[cohort][platform] = emptyRow();
    for (const sport of SPORT_KEYS) {
      report.bySportAndPlatform[cohort][sport] = {};
      for (const platform of PLATFORM_KEYS)
        report.bySportAndPlatform[cohort][sport][platform] = emptyRow();
    }
  }

  await mapLimited(users.docs, async (userDoc) => {
    const profile = userDoc.data();
    const onboardingAtMs = profile.onboardingCompletedAt?.toMillis?.();
    if (!Number.isFinite(onboardingAtMs))
      throw new Error(
        "Cohort query returned a non-timestamp onboardingCompletedAt"
      );
    const [workouts, runs] = await Promise.all([
      userDoc.ref.collection("workouts").get(),
      userDoc.ref.collection("runs").get(),
    ]);
    const entries = (snapshot) =>
      snapshot.docs.map((doc) => {
        const createdAtMs = doc.createTime?.toMillis?.();
        if (!Number.isFinite(createdAtMs))
          throw new Error("Activity document is missing Firestore createTime");
        return { createdAtMs, data: doc.data() };
      });
    const first = firstValidActivities(
      onboardingAtMs,
      entries(workouts),
      entries(runs)
    );
    const cohort = profile.activationJourneyVersion === 2 ? "v2" : "legacy";
    const sport = SPORT_KEYS.includes(profile.onboardingSport)
      ? profile.onboardingSport
      : activationSport(profile.athleteType);
    const platform = validOnboardingPlatform(profile.onboardingPlatform)
      ? profile.onboardingPlatform
      : "unknown";
    const firsts = profile.activationBillingFirsts;
    addRow(report.groups[cohort].all, first, onboardingAtMs, firsts);
    addRow(report.groups[cohort][sport], first, onboardingAtMs, firsts);
    addRow(
      report.byOnboardingPlatform[cohort][platform],
      first,
      onboardingAtMs,
      firsts
    );
    addRow(
      report.bySportAndPlatform[cohort][sport][platform],
      first,
      onboardingAtMs,
      firsts
    );
  });

  for (const cohort of ["v2", "legacy"]) {
    for (const key of ["all", ...SPORT_KEYS])
      report.groups[cohort][key] = presentRow(report.groups[cohort][key]);
    for (const platform of PLATFORM_KEYS)
      report.byOnboardingPlatform[cohort][platform] = presentRow(
        report.byOnboardingPlatform[cohort][platform]
      );
    for (const sport of SPORT_KEYS)
      for (const platform of PLATFORM_KEYS)
        report.bySportAndPlatform[cohort][sport][platform] = presentRow(
          report.bySportAndPlatform[cohort][sport][platform]
        );
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[first-week-activation] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  presentRow,
  addRow,
  verifiedStartWithinWindow,
  PAID_WINDOW_MS,
};

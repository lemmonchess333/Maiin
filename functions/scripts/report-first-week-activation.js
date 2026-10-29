#!/usr/bin/env node
/**
 * Read-only first-week activation report for completed onboarding cohorts.
 *
 * Example:
 *   node functions/scripts/report-first-week-activation.js \
 *     --project=tropos-prod --since=2026-10-01 --until=2026-10-08
 *
 * The range selects onboardingCompletedAt in [since, until), UTC. `until`
 * must be at least 168 hours old so every account has the full follow-up.
 * Reads current workout/run documents and uses each document's Firestore
 * createTime, not the client-authored activity timestamps. Deleted sessions
 * are excluded. The output contains aggregate counts only, never user IDs.
 * Verified trial starts and paid conversion require a UID-linked immutable
 * purchase-event history. `revenueCatEvents` currently has event type/results
 * but no UID, `stripeEvents` has type/claim time but no UID, and the profile's
 * `subscriptionTrial` is a current-state record cleared on conversion. This
 * report does not infer purchase outcomes from checkout taps or current Pro.
 * Onboarding platform is not persisted on the profile; subscriptionSource is
 * a later payment platform and cannot classify these onboarding cohorts.
 */
const admin = require("firebase-admin");
const {
  ACTIVATION_WINDOW_MS,
  activationSport,
  firstValidActivities,
} = require("../lib/firstWeekActivation");

const DAY_ARG = /^\d{4}-\d{2}-\d{2}$/;
const SPORT_KEYS = ["runner", "lifter", "hybrid", "other"];
const CONCURRENCY = 6;

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
  if (options.untilMs > Date.now() - ACTIVATION_WINDOW_MS)
    throw new Error("until must be at least 168 hours before now");
  return options;
}

function emptyRow() {
  return {
    onboarded: 0,
    firstValidActivity: 0,
    firstValidWorkout: 0,
    firstValidRun: 0,
    activityLagHours: [],
  };
}

function addRow(row, first, onboardingAtMs) {
  row.onboarded += 1;
  if (first.workoutAtMs !== null) row.firstValidWorkout += 1;
  if (first.runAtMs !== null) row.firstValidRun += 1;
  if (first.activityAtMs !== null) {
    row.firstValidActivity += 1;
    row.activityLagHours.push(
      (first.activityAtMs - onboardingAtMs) / 3_600_000
    );
  }
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
    timeSource: "Firestore document createTime",
    purchaseGuardrails: {
      verifiedTrialStarts: "unavailable: no immutable UID-linked verified start record",
      verifiedPaidStarts: "unavailable: no immutable UID-linked verified start record",
      requiredSource:
        "provider verified trial and paid start events with UID, event time and platform",
    },
    platformSegmentation: {
      status: "unavailable: onboarding platform is not persisted with the server cohort",
      requiredSource:
        "privacy-reviewed server-bound platform marker at onboarding or approved provider join",
    },
    groups: {
      v2: { all: emptyRow() },
      legacy: { all: emptyRow() },
    },
  };
  for (const cohort of ["v2", "legacy"]) {
    for (const sport of SPORT_KEYS) report.groups[cohort][sport] = emptyRow();
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
    const sport = activationSport(profile.athleteType);
    addRow(report.groups[cohort].all, first, onboardingAtMs);
    addRow(report.groups[cohort][sport], first, onboardingAtMs);
  });

  for (const cohort of ["v2", "legacy"]) {
    for (const key of ["all", ...SPORT_KEYS])
      report.groups[cohort][key] = presentRow(report.groups[cohort][key]);
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[first-week-activation] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, presentRow };

#!/usr/bin/env node
/**
 * Read-only report: how close Tropos's goal-race predictions came to the
 * times runners ran, across every account.
 *
 * Example:
 *   node functions/scripts/report-race-predictions.js \
 *     --project=adaptive-fitness-af8bb [--since=YYYY-MM-DD] [--until=YYYY-MM-DD] [--json]
 *
 * `since` and `until` select races by race date, both inclusive. With
 * application-default credentials for the project (`gcloud auth
 * application-default login`).
 *
 * What it reads: each account's goal-race runs, the runs the app saved with
 * a `racePrediction` record (src/lib/racePrediction.ts). A run is the goal
 * race by the server's race-day rule: on the race's date, valid, and at
 * least 95% of its distance. The record holds the predictions made before
 * the race started: the first, each change (a pace update, first paces
 * after a time trial), and the one in force going into race week, each
 * with the weeks of the plan done when it was made. The time run is the
 * run's own recorded time, as the run summary shows it.
 *
 * How a prediction is scored (standard forecasting practice; Hyndman and
 * Athanasopoulos, Forecasting: Principles and Practice, 3rd ed., section
 * 5.8): the error is the time run less the time predicted, and the
 * percentage error is 100 x error / time run. Signed, a plus means the
 * runner took longer than predicted; the mean of the signed errors is the
 * bias and their standard deviation (n - 1) the spread; the mean of the
 * absolute errors (MAPE) is how far off a prediction is on the day.
 *
 * Two views, each race counted once in each row:
 * - the last prediction before the race, by distance;
 * - the prediction that stood after 0, 4, 8, 12, 16 and 20 weeks of the
 *   plan (the latest made by then), for a race whose plan reached that
 *   week. Four-week steps are a Tropos heuristic for a table that reads.
 *
 * The output is aggregate counts and percentages only, never a user ID,
 * a name or a single runner's times.
 */

const DAY_ARG = /^\d{4}-\d{2}-\d{2}$/;
const DISTANCES = ["5k", "10k", "half", "marathon"];
const DISTANCE_LABEL = {
  "5k": "5K",
  "10k": "10K",
  half: "Half",
  marathon: "Marathon",
};
/** Weeks of the plan done, the checkpoints of the second view. */
const WEEK_CHECKPOINTS = [0, 4, 8, 12, 16, 20];
const CONCURRENCY = 6;

function parseArgs(argv) {
  const options = Object.create(null);
  for (const arg of argv) {
    if (arg === "--json") {
      if (options.json) throw new Error(`Repeated argument: ${arg}`);
      options.json = true;
      continue;
    }
    const match = /^--(project|since|until)=(.+)$/.exec(arg);
    if (!match || options[match[1]])
      throw new Error(`Unknown or repeated argument: ${arg}`);
    options[match[1]] = match[2];
  }
  if (!options.project)
    throw new Error(
      "Required: --project=ID (optional --since=YYYY-MM-DD --until=YYYY-MM-DD --json)"
    );
  for (const key of ["since", "until"]) {
    if (options[key] === undefined) continue;
    if (!DAY_ARG.test(options[key]))
      throw new Error(`${key} must be YYYY-MM-DD`);
    const parsed = new Date(`${options[key]}T00:00:00.000Z`);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== options[key]
    )
      throw new Error(`${key} is not a real date`);
  }
  if (options.since && options.until && options.since > options.until)
    throw new Error("since must not follow until");
  options.json = options.json === true;
  return options;
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * A goal race as the report reads it from a run document, or null for a
 * run it cannot score: no record (or one of another version), a run saved
 * anyway, no recorded time. Its predictions are in the order recorded.
 */
function goalRaceEntry(run) {
  if (!run || typeof run !== "object") return null;
  const record = run.racePrediction;
  if (!record || record.v !== 1 || !DISTANCES.includes(record.distance))
    return null;
  if (run.isInvalid === true || run.savedAnyway === true) return null;
  const ranS = finite(run.duration);
  if (ranS === null || ranS <= 0) return null;
  const predictions = (
    Array.isArray(record.predictions) ? record.predictions : []
  ).flatMap((p) => {
    const predictedS = finite(p && p.predictedS);
    if (predictedS === null || predictedS <= 0) return [];
    return [
      {
        predictedS,
        weeksDone: finite(p.weeksDone),
        planWeeks: finite(p.planWeeks),
      },
    ];
  });
  return {
    distance: record.distance,
    targetDate: typeof record.targetDate === "string" ? record.targetDate : "",
    ranS,
    predictions,
  };
}

/** Percentage error, signed: + when the runner took longer than predicted. */
function percentError(predictedS, ranS) {
  return (100 * (ranS - predictedS)) / ranS;
}

/** The prediction that stood after `weeks` weeks of the plan: the latest
 *  made by then. Null when none had been made. */
function predictionAfterWeeks(predictions, weeks) {
  let standing = null;
  for (const p of predictions) {
    if (p.weeksDone !== null && p.weeksDone <= weeks) standing = p;
  }
  return standing;
}

/** The plan's weeks, from its latest prediction that knows them. */
function planWeeksOf(predictions) {
  for (let i = predictions.length - 1; i >= 0; i--) {
    if (predictions[i].planWeeks !== null) return predictions[i].planWeeks;
  }
  return null;
}

function round(value, places) {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/** Count, mean signed, standard deviation (n - 1) and mean absolute of a
 *  set of percentage errors, to two places. */
function summarise(errors) {
  const n = errors.length;
  if (n === 0) return { n: 0, meanPct: null, sdPct: null, meanAbsPct: null };
  const mean = errors.reduce((a, b) => a + b, 0) / n;
  const sd =
    n > 1
      ? Math.sqrt(errors.reduce((a, e) => a + (e - mean) ** 2, 0) / (n - 1))
      : null;
  const meanAbs = errors.reduce((a, e) => a + Math.abs(e), 0) / n;
  return {
    n,
    meanPct: round(mean, 2),
    sdPct: sd === null ? null : round(sd, 2),
    meanAbsPct: round(meanAbs, 2),
  };
}

/**
 * The report from goal-race entries (`goalRaceEntry`), each tagged with an
 * opaque `runner` key that is counted and never shown.
 */
function buildReport(entries) {
  const runners = new Set(entries.map((e) => e.runner));
  const withPrediction = entries.filter((e) => e.predictions.length > 0);
  const latest = { all: [] };
  const afterWeeks = {};
  for (const d of DISTANCES) {
    latest[d] = [];
    afterWeeks[d] = {};
    for (const w of WEEK_CHECKPOINTS) afterWeeks[d][w] = [];
  }
  for (const e of withPrediction) {
    const last = e.predictions[e.predictions.length - 1];
    const error = percentError(last.predictedS, e.ranS);
    latest[e.distance].push(error);
    latest.all.push(error);
    const planWeeks = planWeeksOf(e.predictions);
    if (planWeeks === null) continue;
    for (const w of WEEK_CHECKPOINTS) {
      // The plan's last week is race week, its weeks less one done.
      if (w > planWeeks - 1) continue;
      const standing = predictionAfterWeeks(e.predictions, w);
      if (standing)
        afterWeeks[e.distance][w].push(
          percentError(standing.predictedS, e.ranS)
        );
    }
  }
  const lastBeforeRace = [...DISTANCES, "all"].map((d) => ({
    distance: d,
    ...summarise(latest[d]),
  }));
  const byWeeksDone = [];
  for (const d of DISTANCES) {
    for (const w of WEEK_CHECKPOINTS) {
      const s = summarise(afterWeeks[d][w]);
      if (s.n > 0) byWeeksDone.push({ distance: d, weeksDone: w, ...s });
    }
  }
  return {
    goalRaces: entries.length,
    runners: runners.size,
    withPrediction: withPrediction.length,
    withoutPrediction: entries.length - withPrediction.length,
    errorDefinition:
      "100 x (time run - time predicted) / time run; + means slower than predicted",
    lastBeforeRace,
    byWeeksDone,
  };
}

function pct(value, signed) {
  if (value === null) return "-";
  const text = `${value.toFixed(1)}%`;
  return signed && value > 0 ? `+${text}` : text;
}

function table(header, rows) {
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length))
  );
  const line = (cells) =>
    cells
      .map((c, i) =>
        i === 0 ? String(c).padEnd(widths[i]) : String(c).padStart(widths[i])
      )
      .join("  ")
      .trimEnd();
  return [line(header), ...rows.map(line)].join("\n");
}

/** The report as the table the owner reads. */
function formatReport(report) {
  const label = (d) => (d === "all" ? "All" : DISTANCE_LABEL[d]);
  const lines = [
    `Goal races: ${report.goalRaces} from ${report.runners} runner${report.runners === 1 ? "" : "s"}, ${report.withPrediction} with a prediction, ${report.withoutPrediction} without.`,
    `Error: ${report.errorDefinition}.`,
    "",
    "The last prediction before the race",
    table(
      ["Distance", "Races", "Mean", "SD", "Mean abs"],
      report.lastBeforeRace
        .filter((r) => r.n > 0 || r.distance === "all")
        .map((r) => [
          label(r.distance),
          r.n,
          pct(r.meanPct, true),
          pct(r.sdPct, false),
          pct(r.meanAbsPct, false),
        ])
    ),
    "",
    "The prediction that stood after N weeks of the plan",
    report.byWeeksDone.length === 0
      ? "(none yet)"
      : table(
          ["Distance", "Weeks", "Races", "Mean", "SD", "Mean abs"],
          report.byWeeksDone.map((r) => [
            label(r.distance),
            r.weeksDone,
            r.n,
            pct(r.meanPct, true),
            pct(r.sdPct, false),
            pct(r.meanAbsPct, false),
          ])
        ),
  ];
  return `${lines.join("\n")}\n`;
}

function inRange(targetDate, options) {
  if (options.since && !(targetDate >= options.since)) return false;
  if (options.until && !(targetDate <= options.until)) return false;
  return true;
}

async function mapLimited(items, worker) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        await worker(items[index], index);
      }
    })
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Loaded here, not at the top, so the report's maths can be required
  // (by its tests and the app's cross-test) without the Admin SDK.
  const admin = require("../lib/adminSdk");
  if (!admin.apps.length) admin.initializeApp({ projectId: args.project });
  const db = admin.firestore();
  // Every account, by reference only: a goal race lives under its runner.
  const users = await db.collection("users").select().get();
  const entries = [];
  await mapLimited(users.docs, async (userDoc, runner) => {
    const runs = await userDoc.ref
      .collection("runs")
      .where("racePrediction.v", "==", 1)
      .get();
    for (const run of runs.docs) {
      const entry = goalRaceEntry(run.data());
      if (entry && inRange(entry.targetDate, args))
        entries.push({ runner, ...entry });
    }
  });
  const report = buildReport(entries);
  process.stdout.write(
    args.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report)
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[race-predictions] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  WEEK_CHECKPOINTS,
  parseArgs,
  goalRaceEntry,
  percentError,
  predictionAfterWeeks,
  summarise,
  buildReport,
  formatReport,
  inRange,
};

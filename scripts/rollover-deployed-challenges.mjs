/**
 * Run the existing Scheduler job after source verification, then read back the
 * current canonical definitions. Only rolloverChallenges writes challenge docs;
 * this release script never writes Firestore or participant progress.
 *
 * Use Scheduler's supported run API. The gen1 functions.call API is documented
 * for testing/debugging only, so it is not part of the production release path.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

const PROJECT = "adaptive-fitness-af8bb";
const FUNCTION = "rolloverChallenges";
const requireFunctions = createRequire(
  new URL("../functions/package.json", import.meta.url)
);
const { buildCurrentChallenges } = requireFunctions("./lib/challengeDefs.js");

class ChallengeReleaseError extends Error {}

export function releaseFailureMessage(error) {
  return error instanceof ChallengeReleaseError
    ? error.message
    : "Challenge release verification failed";
}

function timestampMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === "function") return value.toMillis();
  return NaN;
}

export function definitionProblems(definitions, documents) {
  const problems = [];
  for (const definition of definitions) {
    const actual = documents.get(definition.id);
    if (!actual) {
      problems.push(`${definition.id}: missing`);
      continue;
    }
    for (const field of [
      "metric",
      "tiers",
      "name",
      "type",
      "targetDistance",
      "collectiveTarget",
    ]) {
      if (!isDeepStrictEqual(actual[field], definition[field])) {
        problems.push(`${definition.id}: ${field} differs`);
      }
    }
    for (const field of ["startDate", "endDate"]) {
      if (timestampMillis(actual[field]) !== definition[field].getTime()) {
        problems.push(`${definition.id}: ${field} differs`);
      }
    }
  }
  return problems;
}

export function selectRolloverJob(metadata, jobs) {
  const topic = metadata?.eventTrigger?.resource;
  if (
    metadata?.status !== "ACTIVE" ||
    metadata?.entryPoint !== FUNCTION ||
    typeof topic !== "string" ||
    !topic.startsWith(`projects/${PROJECT}/topics/`) ||
    !metadata?.eventTrigger?.eventType?.includes("pubsub")
  ) {
    throw new ChallengeReleaseError(
      "rolloverChallenges is not an active Pub/Sub function"
    );
  }
  if (!Array.isArray(jobs))
    throw new ChallengeReleaseError("Scheduler did not return a job list");
  const matches = jobs.filter((job) => job?.pubsubTarget?.topicName === topic);
  if (matches.length !== 1)
    throw new ChallengeReleaseError(
      "Expected exactly one Scheduler job for rolloverChallenges"
    );
  const job = matches[0];
  const prefix = `projects/${PROJECT}/locations/`;
  if (
    typeof job.name !== "string" ||
    !job.name.startsWith(prefix) ||
    !/^[a-z0-9-]+\/jobs\/[A-Za-z0-9_-]+$/.test(job.name.slice(prefix.length)) ||
    job.state !== "ENABLED"
  ) {
    throw new ChallengeReleaseError(
      "rolloverChallenges Scheduler job is invalid or disabled"
    );
  }
  return job;
}

async function jsonRequest(url, token, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ChallengeReleaseError(
      "Challenge release API request did not complete"
    );
  }
  if (!response.ok)
    throw new ChallengeReleaseError(
      `Challenge release API refused the request (HTTP ${response.status})`
    );
  try {
    return await response.json();
  } catch {
    throw new ChallengeReleaseError(
      "Challenge release API returned invalid JSON"
    );
  }
}

function schedulerJobs() {
  // Firebase gen1 scheduled jobs use the App Engine location. gcloud discovers
  // that location when --location is absent; do not assume the function region.
  // Capture stdout/stderr so job metadata or CLI authentication errors do not
  // print tokens, headers or configuration into release logs.
  try {
    return JSON.parse(
      execFileSync(
        "gcloud",
        [
          "scheduler",
          "jobs",
          "list",
          `--project=${PROJECT}`,
          "--format=json",
          "--quiet",
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 60_000,
        }
      )
    );
  } catch {
    throw new ChallengeReleaseError(
      "Could not discover the existing challenge Scheduler job"
    );
  }
}

export async function runRolloverAndVerify({
  token,
  readDefinitions,
  request = jsonRequest,
  listJobs = schedulerJobs,
  now = () => new Date(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  attempts = 24,
  interval = 5000,
  log = console.log,
}) {
  const metadata = await request(
    `https://cloudfunctions.googleapis.com/v1/projects/${PROJECT}/locations/us-central1/functions/${FUNCTION}`,
    token
  );
  const job = selectRolloverJob(metadata, await listJobs());
  const response = await request(
    `https://cloudscheduler.googleapis.com/v1/${job.name}:run`,
    token,
    { method: "POST" }
  );
  if (response?.error || response?.name !== job.name) {
    throw new ChallengeReleaseError(
      "Scheduler did not confirm the challenge rollover request"
    );
  }
  log("Requested the existing challenge rollover job");
  let problems = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    const definitions = buildCurrentChallenges(now());
    problems = definitionProblems(
      definitions,
      await readDefinitions(definitions)
    );
    if (problems.length === 0) {
      log(
        `Verified ${definitions.length} current challenge definitions after rollover`
      );
      return;
    }
    if (attempt + 1 < attempts) await sleep(interval);
  }
  throw new ChallengeReleaseError(
    `Current challenge definitions did not match after rollover: ${problems.join("; ")}`
  );
}

export async function main() {
  const { initializeApp, applicationDefault, deleteApp } =
    requireFunctions("firebase-admin/app");
  const { getFirestore } = requireFunctions("firebase-admin/firestore");
  const credential = applicationDefault();
  const app = initializeApp({ credential, projectId: PROJECT });
  try {
    const { access_token: token } = await credential.getAccessToken();
    const firestore = getFirestore(app);
    await runRolloverAndVerify({
      token,
      readDefinitions: async (definitions) => {
        const snapshots = await firestore.getAll(
          ...definitions.map(({ id }) => firestore.doc(`challenges/${id}`))
        );
        return new Map(
          snapshots
            .filter((snapshot) => snapshot.exists)
            .map((snapshot) => [snapshot.id, snapshot.data()])
        );
      },
    });
  } finally {
    await deleteApp(app);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    // SDK errors may contain credentials/configuration: print only our own
    // deliberately limited release failures, never an arbitrary SDK message.
    console.error(releaseFailureMessage(error));
    process.exitCode = 1;
  });
}

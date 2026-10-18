/**
 * Run the existing Scheduler job after source verification, then read back the
 * current canonical definitions. Only rolloverChallenges writes challenge docs;
 * this release script never writes Firestore or participant progress.
 *
 * Use Scheduler's supported run API. The gen1 functions.call API is documented
 * for testing/debugging only, so it is not part of the production release path.
 */
import { createRequire } from "node:module";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";

const PROJECT = "adaptive-fitness-af8bb";
const FUNCTION = "rolloverChallenges";
const SCHEDULER_API = "https://cloudscheduler.googleapis.com/v1";
const MAX_DISCOVERY_PAGES = 256;
const MAX_DISCOVERY_LOCATIONS = 100;
const MAX_DISCOVERY_JOBS = 50_000;
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

function requestOperation(url) {
  const path = new URL(url).pathname;
  if (path.endsWith("/locations")) return "Scheduler locations list";
  const jobs = path.match(/\/locations\/([a-z0-9-]+)\/jobs$/);
  if (jobs) return `Scheduler jobs list (${jobs[1]})`;
  if (path.endsWith(":run")) return "Scheduler dispatch";
  return "Function metadata";
}

async function jsonRequest(url, token, options = {}) {
  const operation = requestOperation(url);
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ChallengeReleaseError(`${operation} request did not complete`);
  }
  if (!response.ok)
    throw new ChallengeReleaseError(
      `${operation} request refused (HTTP ${response.status})`
    );
  try {
    return await response.json();
  } catch {
    throw new ChallengeReleaseError(`${operation} returned invalid JSON`);
  }
}

function nextPageToken(page, seen, operation) {
  if (page.nextPageToken === undefined || page.nextPageToken === "") return "";
  const token = page.nextPageToken;
  if (
    typeof token !== "string" ||
    token.length > 4096 ||
    !token.trim() ||
    /[\u0000-\u001f\u007f]/.test(token) ||
    seen.has(token)
  )
    throw new ChallengeReleaseError(`${operation} returned invalid pagination`);
  seen.add(token);
  return token;
}

/** Explicit regional REST discovery needs neither gcloud nor an App Engine
 * application. Do not infer a Scheduler region from the function's region.
 * Both lists are paginated; opaque page tokens are encoded as query values.
 * Any failed region aborts discovery, since it could hide another match. */
export async function schedulerJobs({ token, request = jsonRequest }) {
  let pages = 0;
  async function listPages(resource, field, pageSize, validate) {
    const operation = requestOperation(`${SCHEDULER_API}/${resource}`);
    const seenTokens = new Set();
    const results = [];
    let pageToken = "";
    do {
      if (++pages > MAX_DISCOVERY_PAGES)
        throw new ChallengeReleaseError(
          "Scheduler discovery exceeded its page limit"
        );
      const url = new URL(`${SCHEDULER_API}/${resource}`);
      url.searchParams.set("pageSize", String(pageSize));
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      let page;
      try {
        page = await request(url.href, token);
      } catch (error) {
        if (error instanceof ChallengeReleaseError) throw error;
        // Never expose arbitrary SDK/network errors, tokens or response bodies.
        throw new ChallengeReleaseError(
          `${operation} request did not complete`
        );
      }
      if (
        !page ||
        typeof page !== "object" ||
        Array.isArray(page) ||
        page.error !== undefined ||
        (page[field] !== undefined && !Array.isArray(page[field]))
      )
        throw new ChallengeReleaseError(
          `${operation} returned an invalid response`
        );
      for (const item of page[field] || []) {
        validate(item);
        results.push(item);
      }
      pageToken = nextPageToken(page, seenTokens, operation);
    } while (pageToken);
    return results;
  }

  const locationIds = new Set();
  const locations = await listPages(
    `projects/${PROJECT}/locations`,
    "locations",
    100,
    (location) => {
      const id = location?.locationId;
      if (
        typeof id !== "string" ||
        !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) ||
        locationIds.has(id)
      )
        throw new ChallengeReleaseError(
          "Scheduler locations list returned an invalid resource"
        );
      locationIds.add(id);
      if (locationIds.size > MAX_DISCOVERY_LOCATIONS)
        throw new ChallengeReleaseError(
          "Scheduler discovery exceeded its location limit"
        );
    }
  );

  const jobs = [];
  const jobNames = new Set();
  for (const location of locations) {
    // Location.name is implementation-defined. Only the validated canonical
    // id selects a region; every request remains scoped to our fixed project.
    const resource = `projects/${PROJECT}/locations/${location.locationId}/jobs`;
    const prefix = `${resource}/`;
    jobs.push(
      ...(await listPages(resource, "jobs", 500, (job) => {
        if (
          typeof job?.name !== "string" ||
          !job.name.startsWith(prefix) ||
          !/^[A-Za-z0-9_-]+$/.test(job.name.slice(prefix.length)) ||
          jobNames.has(job.name)
        )
          throw new ChallengeReleaseError(
            "Scheduler jobs list returned an invalid resource"
          );
        jobNames.add(job.name);
        if (jobNames.size > MAX_DISCOVERY_JOBS)
          throw new ChallengeReleaseError(
            "Scheduler discovery exceeded its job limit"
          );
      }))
    );
  }
  return jobs;
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
  const job = selectRolloverJob(metadata, await listJobs({ token, request }));
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

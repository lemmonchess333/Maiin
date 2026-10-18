import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  definitionProblems,
  selectRolloverJob,
  runRolloverAndVerify,
  releaseFailureMessage,
} from "./rollover-deployed-challenges.mjs";

const requireFunctions = createRequire(
  new URL("../functions/package.json", import.meta.url)
);
const { buildCurrentChallenges } = requireFunctions("./lib/challengeDefs.js");
const instant = new Date("2026-10-18T12:00:00Z");
const definitions = buildCurrentChallenges(instant);
const topic =
  "projects/adaptive-fitness-af8bb/topics/firebase-schedule-rolloverChallenges-us-central1";
const metadata = {
  status: "ACTIVE",
  entryPoint: "rolloverChallenges",
  eventTrigger: { resource: topic, eventType: "google.pubsub.topic.publish" },
};
const job = {
  name: "projects/adaptive-fitness-af8bb/locations/europe-west2/jobs/existing-rollover",
  state: "ENABLED",
  pubsubTarget: { topicName: topic },
};

function documents() {
  return new Map(
    definitions.map((definition) => [
      definition.id,
      {
        ...definition,
        tiers: { ...definition.tiers },
        startDate: { toMillis: () => definition.startDate.getTime() },
        endDate: { toMillis: () => definition.endDate.getTime() },
        participantCount: 42,
      },
    ])
  );
}

function options(overrides = {}) {
  const calls = [];
  return {
    calls,
    token: "not-logged",
    listJobs: async () => [job],
    now: () => instant,
    readDefinitions: async () => documents(),
    log: () => {},
    sleep: async () => {},
    attempts: 2,
    request: async (url, token, request) => {
      calls.push({ url, token, request });
      return request?.method === "POST" ? { name: job.name } : metadata;
    },
    ...overrides,
  };
}

test("canonical current definitions match persisted Timestamps without reading participation", () => {
  const stored = documents();
  const before = JSON.stringify([...stored]);
  assert.deepEqual(definitionProblems(definitions, stored), []);
  assert.equal(JSON.stringify([...stored]), before);
  assert.ok(
    [...stored.values()].every(
      (definition) => definition.participantCount === 42
    )
  );
});

test("missing definitions and stale metric, tiers or dates are refused", () => {
  for (const field of ["metric", "tiers", "startDate", "endDate"]) {
    const stored = documents();
    stored.get(definitions[0].id)[field] =
      field === "tiers" ? { bronze: 0 } : "stale";
    assert.ok(
      definitionProblems(definitions, stored).some((problem) =>
        problem.includes(`${field} differs`)
      )
    );
  }
  assert.equal(
    definitionProblems(definitions, new Map()).length,
    definitions.length
  );
});

test("discovers the actual target job without assuming the function region", () => {
  assert.equal(selectRolloverJob(metadata, [job]).name, job.name);
  const other = {
    ...job,
    name: "projects/adaptive-fitness-af8bb/locations/us-central1/jobs/unrelated",
    pubsubTarget: { topicName: "other" },
  };
  assert.equal(selectRolloverJob(metadata, [other, job]).name, job.name);
});

test("missing, ambiguous, disabled, foreign and non-Pub/Sub jobs fail closed", () => {
  for (const jobs of [
    [],
    [job, job],
    [{ ...job, state: "PAUSED" }],
    [{ ...job, name: "projects/other/locations/europe-west2/jobs/foreign" }],
    {},
  ]) {
    assert.throws(() => selectRolloverJob(metadata, jobs));
  }
  for (const actual of [
    { ...metadata, status: "OFFLINE" },
    { ...metadata, entryPoint: "other" },
    { ...metadata, eventTrigger: { resource: topic, eventType: "http" } },
  ]) {
    assert.throws(() => selectRolloverJob(actual, [job]));
  }
});

test("requests one existing Scheduler run, then verifies every canonical current challenge", async () => {
  const actual = options();
  let checked;
  actual.readDefinitions = async (current) => {
    checked = current;
    return documents();
  };
  await runRolloverAndVerify(actual);
  assert.deepEqual(
    checked.map(({ id }) => id),
    definitions.map(({ id }) => id)
  );
  assert.equal(actual.calls.length, 2);
  assert.equal(
    actual.calls[1].url,
    `https://cloudscheduler.googleapis.com/v1/${job.name}:run`
  );
  assert.deepEqual(actual.calls[1].request, { method: "POST" });
});

test("allows asynchronous materialization without issuing a second run or writing docs", async () => {
  let reads = 0;
  let sleeps = 0;
  const actual = options({
    readDefinitions: async () => (++reads === 1 ? new Map() : documents()),
    sleep: async () => {
      sleeps++;
    },
  });
  await runRolloverAndVerify(actual);
  assert.equal(reads, 2);
  assert.equal(sleeps, 1);
  assert.equal(
    actual.calls.filter(({ request }) => request?.method === "POST").length,
    1
  );
});

test("an accepted run with stale persisted definitions still blocks the web release", async () => {
  const stored = documents();
  const featured = definitions.find(({ id }) =>
    id.startsWith("featured-monthly-")
  );
  stored.get(featured.id).metric = "previous-metric";
  await assert.rejects(
    runRolloverAndVerify(options({ readDefinitions: async () => stored })),
    /metric differs/
  );
  assert.equal(stored.get(featured.id).metric, "previous-metric");
});

test("failed or malformed Scheduler responses never pass on existing docs", async () => {
  for (const response of [{ error: "refused" }, {}, { name: "other" }]) {
    let reads = 0;
    const actual = options({
      readDefinitions: async () => {
        reads++;
        return documents();
      },
      request: async (_url, _token, request) =>
        request?.method === "POST" ? response : metadata,
    });
    await assert.rejects(runRolloverAndVerify(actual), /did not confirm/);
    assert.equal(reads, 0);
  }
});

test("Scheduler dispatch errors abort rather than treating readback as an implicit success", async () => {
  const actual = options({
    request: async (_url, _token, request) => {
      if (request?.method === "POST") throw new Error("HTTP 403");
      return metadata;
    },
  });
  await assert.rejects(runRolloverAndVerify(actual), /HTTP 403/);
});

test("API refusals and unexpected SDK errors do not leak response bodies or credentials", async (context) => {
  context.mock.method(globalThis, "fetch", async () => ({
    ok: false,
    status: 403,
    json: () => {
      throw new Error("private response body");
    },
  }));
  const actual = options();
  delete actual.request;
  await assert.rejects(runRolloverAndVerify(actual), (error) => {
    assert.equal(
      releaseFailureMessage(error),
      "Challenge release API refused the request (HTTP 403)"
    );
    return true;
  });
  assert.equal(
    releaseFailureMessage(new Error("SDK leaked private-token")),
    "Challenge release verification failed"
  );
  assert.equal(
    releaseFailureMessage(
      new Error("Current challenge definitions private-token")
    ),
    "Challenge release verification failed"
  );
});

test("release workflow runs offline tests and gates materialization after exact source verification", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/deploy-functions.yml", import.meta.url),
    "utf8"
  );
  const checks = workflow.indexOf(
    "node --test scripts/rollover-deployed-challenges.test.mjs"
  );
  const deploy = workflow.indexOf("run: firebase deploy --only functions");
  const verify = workflow.indexOf(
    "run: python3 scripts/verify-deployed-functions-source.py"
  );
  const rollover = workflow.indexOf(
    "run: node scripts/rollover-deployed-challenges.mjs"
  );
  assert.ok(
    checks >= 0 && deploy > checks && verify > deploy && rollover > verify
  );
  assert.ok(!workflow.slice(verify, rollover).includes("continue-on-error"));
});

test("a rollover-script-only fix runs the backend release gate", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/deploy-production.yml", import.meta.url),
    "utf8"
  );
  const pattern = workflow.match(/grep -qE '([^']+)' changed-paths\.txt/)?.[1];
  assert.ok(pattern, "production release backend detector is missing");
  const changedPathRunsBackend = new RegExp(pattern);
  for (const path of [
    "scripts/rollover-deployed-challenges.mjs",
    "functions/lib/challengeDefs.js",
    "functions/lib/challengeParticipationProgress.js",
    "scripts/verify-deployed-functions-source.py",
    "firestore.rules",
    ".github/workflows/deploy-functions.yml",
  ]) {
    assert.ok(
      changedPathRunsBackend.test(path),
      `${path} must run backend verification`
    );
  }
  for (const path of [
    "src/features/challenges/ChallengeCard.tsx",
    "scripts/rollover-deployed-challenges.test.mjs",
    "scripts/rollover-deployed-challenges.mjs.bak",
  ]) {
    assert.ok(
      !changedPathRunsBackend.test(path),
      `${path} is not a backend runtime change`
    );
  }
});

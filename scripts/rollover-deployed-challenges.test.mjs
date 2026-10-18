import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  definitionProblems,
  selectRolloverJob,
  runRolloverAndVerify,
  releaseFailureMessage,
  schedulerJobs,
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
      "Function metadata request refused (HTTP 403)"
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

const location = (id) => ({
  name: `projects/adaptive-fitness-af8bb/locations/${id}`,
  locationId: id,
});
const firstLocation = location("us-east1");
const targetLocation = location("europe-west2");

test("default production discovery paginates locations and every explicit region with ADC REST", async () => {
  const calls = [];
  const locationToken = "locations/+?=opaque";
  const jobsToken = "jobs/+?=opaque";
  let readbacks = 0;
  const actual = options({
    request: async (input, token, request) => {
      const url = new URL(input);
      calls.push({ url, token, request });
      if (url.hostname === "cloudfunctions.googleapis.com") return metadata;
      if (request?.method === "POST") return { name: job.name };
      if (url.pathname.endsWith("/locations")) {
        assert.equal(url.searchParams.get("pageSize"), "100");
        if (!url.searchParams.has("pageToken"))
          return { locations: [firstLocation], nextPageToken: locationToken };
        assert.equal(url.searchParams.get("pageToken"), locationToken);
        return { locations: [targetLocation] };
      }
      assert.equal(url.searchParams.get("pageSize"), "500");
      if (url.pathname === `/v1/${firstLocation.name}/jobs`) {
        if (!url.searchParams.has("pageToken"))
          return {
            jobs: [
              {
                ...job,
                name: `${firstLocation.name}/jobs/unrelated`,
                pubsubTarget: { topicName: "other" },
              },
            ],
            nextPageToken: jobsToken,
          };
        assert.equal(url.searchParams.get("pageToken"), jobsToken);
        return {};
      }
      assert.equal(url.pathname, `/v1/${targetLocation.name}/jobs`);
      return { jobs: [job] };
    },
    readDefinitions: async () => {
      readbacks++;
      return documents();
    },
  });
  // Exercise the production default, not a test-only discovery replacement.
  delete actual.listJobs;
  await runRolloverAndVerify(actual);
  assert.equal(calls.length, 7);
  assert.equal(
    calls.filter(({ request }) => request?.method === "POST").length,
    1
  );
  assert.ok(calls.every(({ token }) => token === actual.token));
  assert.ok(calls.every(({ url }) => !url.pathname.includes("/locations/-")));
  assert.equal(readbacks, 1);
  const source = readFileSync(
    new URL("./rollover-deployed-challenges.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /node:child_process|execFileSync|"gcloud"/);
});

test("default REST discovery detects an ambiguous match in a later region before dispatch", async () => {
  let dispatches = 0;
  const actual = options({
    request: async (input, _token, request) => {
      const url = new URL(input);
      if (url.hostname === "cloudfunctions.googleapis.com") return metadata;
      if (request?.method === "POST") {
        dispatches++;
        return { name: job.name };
      }
      if (url.pathname.endsWith("/locations"))
        return { locations: [firstLocation, targetLocation] };
      const parent = url.pathname.slice(4, -5);
      return { jobs: [{ ...job, name: `${parent}/jobs/also-matches` }] };
    },
  });
  delete actual.listJobs;
  await assert.rejects(
    runRolloverAndVerify(actual),
    /exactly one Scheduler job/
  );
  assert.equal(dispatches, 0);
});

test("default REST discovery rejects missing jobs without assuming any region", async () => {
  const actual = options({
    request: async (input) =>
      new URL(input).hostname === "cloudfunctions.googleapis.com"
        ? metadata
        : new URL(input).pathname.endsWith("/locations")
          ? { locations: [targetLocation] }
          : {},
  });
  delete actual.listJobs;
  await assert.rejects(
    runRolloverAndVerify(actual),
    /exactly one Scheduler job/
  );
});

for (const operation of ["locations", "jobs"]) {
  test(`default REST ${operation} discovery reports safe HTTP status on ADC refusal`, async (context) => {
    context.mock.method(globalThis, "fetch", async (input) => {
      const url = new URL(input);
      const refused =
        operation === "locations"
          ? url.pathname.endsWith("/locations")
          : url.pathname.endsWith("/jobs");
      return {
        ok: !refused,
        status: refused ? 403 : 200,
        json: async () => {
          if (refused) throw new Error("private response body and token");
          return url.hostname === "cloudfunctions.googleapis.com"
            ? metadata
            : { locations: [targetLocation] };
        },
      };
    });
    const actual = options();
    delete actual.request;
    delete actual.listJobs;
    await assert.rejects(runRolloverAndVerify(actual), (error) => {
      const expectedOperation =
        operation === "locations"
          ? "Scheduler locations list"
          : "Scheduler jobs list (europe-west2)";
      assert.equal(
        releaseFailureMessage(error),
        `${expectedOperation} request refused (HTTP 403)`
      );
      assert.doesNotMatch(
        releaseFailureMessage(error),
        /private|token|projects\//
      );
      return true;
    });
  });
}

test("canonical location ids ignore variable names and always query the fixed project", async () => {
  for (const description of [
    { ...targetLocation, name: "projects/123456789/locations/europe-west2" },
    { ...targetLocation, name: "implementation-specific-location" },
    { ...targetLocation, name: "https://elsewhere.invalid/steal-token" },
    { locationId: targetLocation.locationId },
  ]) {
    const visited = [];
    const actual = options({
      request: async (input, _token, request) => {
        const url = new URL(input);
        visited.push(url);
        if (url.hostname === "cloudfunctions.googleapis.com") return metadata;
        assert.equal(url.hostname, "cloudscheduler.googleapis.com");
        if (request?.method === "POST") return { name: job.name };
        if (url.pathname.endsWith("/locations"))
          return { locations: [description] };
        assert.equal(url.pathname, `/v1/${targetLocation.name}/jobs`);
        return { jobs: [job] };
      },
    });
    delete actual.listJobs;
    await runRolloverAndVerify(actual);
    assert.equal(visited.length, 4);
    assert.ok(
      visited.every((url) =>
        url.pathname.includes("projects/adaptive-fitness-af8bb/")
      )
    );
  }
});

test("malformed and duplicate canonical location ids fail discovery", async () => {
  for (const response of [
    null,
    [],
    { locations: {} },
    { locations: [null] },
    ...[undefined, null, 7, "", "-", "../elsewhere", "region?extra=1"].map(
      (locationId) => ({
        locations: [{ ...targetLocation, locationId }],
      })
    ),
    { locations: [targetLocation, targetLocation] },
    {
      locations: [
        targetLocation,
        { ...targetLocation, name: "different-implementation-name" },
      ],
    },
    { error: { message: "private server error" } },
  ]) {
    await assert.rejects(
      schedulerJobs({ token: "not-logged", request: async () => response }),
      /Scheduler locations list returned an invalid/
    );
  }
});

test("malformed, foreign-region and duplicate job resources fail discovery", async () => {
  for (const response of [
    { jobs: {} },
    { jobs: [null] },
    { jobs: [{ ...job, name: `${firstLocation.name}/jobs/foreign-region` }] },
    { jobs: [{ ...job, name: `${targetLocation.name}/jobs/../escape` }] },
    { jobs: [job, job] },
  ]) {
    await assert.rejects(
      schedulerJobs({
        token: "not-logged",
        request: async (input) =>
          new URL(input).pathname.endsWith("/locations")
            ? { locations: [targetLocation] }
            : response,
      }),
      /Scheduler jobs list.*returned an invalid/
    );
  }
});

test("both list endpoints reject malformed and cyclic opaque page tokens", async () => {
  for (const target of ["locations", "jobs"]) {
    for (const invalid of [null, 7, " ", "line\nbreak", "x".repeat(4097)]) {
      await assert.rejects(
        schedulerJobs({
          token: "not-logged",
          request: async (input) =>
            target === "jobs" && new URL(input).pathname.endsWith("/locations")
              ? { locations: [targetLocation] }
              : { nextPageToken: invalid },
        }),
        /returned invalid pagination/
      );
    }
    let pages = 0;
    await assert.rejects(
      schedulerJobs({
        token: "not-logged",
        request: async (input) => {
          if (
            target === "jobs" &&
            new URL(input).pathname.endsWith("/locations")
          )
            return { locations: [targetLocation] };
          pages++;
          return { nextPageToken: "repeated" };
        },
      }),
      /returned invalid pagination/
    );
    assert.equal(pages, 2);
  }
});

test("discovery bounds otherwise unique pagination and excessive locations", async () => {
  let requests = 0;
  await assert.rejects(
    schedulerJobs({
      token: "not-logged",
      request: async () => {
        if (++requests > 300) throw new Error("unguarded traversal");
        return { nextPageToken: `unique-${requests}` };
      },
    }),
    /exceeded its page limit/
  );
  assert.ok(requests > 1 && requests < 300);
  await assert.rejects(
    schedulerJobs({
      token: "not-logged",
      request: async () => ({
        locations: Array.from({ length: 101 }, (_, i) =>
          location(`test-region${i}`)
        ),
      }),
    }),
    /exceeded its location limit/
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

#!/usr/bin/env node
/**
 * Says what a TestFlight build is and who gets it, through the App Store
 * Connect API key the signing script already uses (asc-signing.mjs).
 * deploy-ios.yml runs it twice:
 *
 *   node scripts/ios/testflight-build.mjs check        before the archive
 *   node scripts/ios/testflight-build.mjs distribute   after the upload
 *
 * A connected training pilot (BUILD_KIND=pilot) is marked and kept apart.
 * Its "What to Test" starts with PILOT_WHATS_NEW, so whoever opens it in
 * TestFlight or App Store Connect reads that it is a pilot. It goes to its
 * own internal tester group, TESTFLIGHT_PILOT_GROUP_ID. `check` refuses the
 * run, before 20 minutes of archive, when that group is missing, is an
 * external group (one that needs Beta App Review), or another internal
 * group receives every build automatically and would get the pilot too.
 * Every App Store Connect call made for a pilot goes through
 * refuseSubmissions, which refuses any call that would put the build in
 * front of App Review, so no release or submission step built on this can
 * send a pilot.
 *
 * A standard build (BUILD_KIND=standard) carries the dispatch's notes as
 * its "What to Test", when there are any, and goes to
 * TESTFLIGHT_STANDARD_GROUP_ID when that is set.
 *
 * Environment: ASC_API_KEY_ID, ASC_API_ISSUER_ID, ASC_API_KEY_PATH (the
 * .p8), BUNDLE_ID, BUILD_KIND, TESTFLIGHT_NOTES, TESTFLIGHT_PILOT_GROUP_ID,
 * TESTFLIGHT_STANDARD_GROUP_ID, and for `distribute` BUILD_NUMBER and
 * MARKETING_VERSION (CFBundleVersion and CFBundleShortVersionString).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API, AppStoreConnectError, connect, makeToken } from "./asc-signing.mjs";

export const PILOT_WHATS_NEW =
  "Connected training pilot. Not for App Store release. This build turns on Apple Watch runs and saving runs to Apple Health, for the paired iPhone and Watch checks.";

/** TestFlight refuses a longer "What to Test". */
export const WHATS_NEW_MAX = 4000;

/** Calls that submit a build to App Review, for the App Store or for
 *  external TestFlight testers, or attach it to an App Store version. */
const SUBMISSION_PATHS = [
  /^\/v1\/betaAppReviewSubmissions\b/,
  /^\/v1\/appStoreVersionSubmissions\b/,
  /^\/v1\/reviewSubmissions\b/,
  /^\/v1\/reviewSubmissionItems\b/,
  /^\/v1\/appStoreVersions\/[^/]+\/relationships\/build\b/,
  /^\/v1\/appStoreVersions\/[^/]+$/,
  /^\/v1\/appStoreVersionReleaseRequests\b/,
];

export class PilotSubmissionRefused extends Error {}

/** The request function for a pilot build: anything that would submit it
 *  for review, or release it, is refused before it is sent. */
export function refuseSubmissions(request) {
  return async function pilotRequest(method, path, body) {
    const bare = path.replace(API, "").split("?")[0];
    if (method !== "GET" && SUBMISSION_PATHS.some((pattern) => pattern.test(bare))) {
      throw new PilotSubmissionRefused(
        `A connected training pilot is never submitted for review or released: refused ${method} ${bare}. Make a standard build for that.`
      );
    }
    return request(method, path, body);
  };
}

/** The build's "What to Test", or null when there is nothing to say. */
export function whatsNew(kind, notes) {
  const note = (notes ?? "").trim();
  const text = kind === "pilot" ? (note ? `${PILOT_WHATS_NEW}\n\n${note}` : PILOT_WHATS_NEW) : note || null;
  if (text && text.length > WHATS_NEW_MAX) {
    throw new Error(
      `The notes are too long for TestFlight's "What to Test": ${text.length} characters, ${WHATS_NEW_MAX} at most${kind === "pilot" ? " with the pilot's own line" : ""}.`
    );
  }
  return text;
}

async function listAll(request, path) {
  const items = [];
  let next = path;
  for (let page = 0; next && page < 10; page++) {
    const json = await request("GET", next);
    items.push(...(json?.data ?? []));
    const link = json?.links?.next;
    next = link ? link.replace(API, "") : null;
  }
  return items;
}

export async function findApp(request, bundleId) {
  const apps = await listAll(request, `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&limit=200`);
  const app = apps.find((a) => a.attributes?.bundleId === bundleId);
  if (!app) {
    throw new Error(`App Store Connect has no app for ${bundleId}. Make it under Apps before the first upload (docs/ios-release.md).`);
  }
  return app;
}

/** The group this build goes to, checked before anything is built. */
export async function checkGroups({ request, bundleId, kind, pilotGroupId, standardGroupId }) {
  if (kind !== "pilot" && kind !== "standard") {
    throw new Error(`The build kind must be pilot or standard, not "${kind}".`);
  }
  const app = await findApp(request, bundleId);
  const groups = await listAll(request, `/v1/apps/${app.id}/betaGroups?limit=200`);
  const named = (group) => `"${group.attributes?.name ?? group.id}"`;
  const pilotId = (pilotGroupId ?? "").trim();
  const standardId = (standardGroupId ?? "").trim();

  if (kind === "standard") {
    if (!standardId) return { app, group: null };
    const group = groups.find((g) => g.id === standardId);
    if (!group) {
      throw new Error(`TESTFLIGHT_STANDARD_GROUP_ID names no tester group of ${bundleId}'s app. Copy the id from the group's page in App Store Connect → TestFlight.`);
    }
    if (pilotId && standardId === pilotId) {
      throw new Error("TESTFLIGHT_STANDARD_GROUP_ID and TESTFLIGHT_PILOT_GROUP_ID name the same group. Pilot builds need a group of their own.");
    }
    return { app, group };
  }

  if (!pilotId) {
    throw new Error("A connected training pilot needs its own tester group: set the repository variable TESTFLIGHT_PILOT_GROUP_ID (docs/ios-release.md).");
  }
  const group = groups.find((g) => g.id === pilotId);
  if (!group) {
    throw new Error(`TESTFLIGHT_PILOT_GROUP_ID names no tester group of ${bundleId}'s app. Copy the id from the group's page in App Store Connect → TestFlight.`);
  }
  if (group.attributes?.isInternalGroup !== true) {
    throw new Error(`The pilot group ${named(group)} is an external group, which needs Beta App Review, and a pilot is never submitted for review. Use an internal group.`);
  }
  const automatic = groups.filter(
    (g) => g.id !== group.id && g.attributes?.isInternalGroup === true && g.attributes?.hasAccessToAllBuilds === true
  );
  if (automatic.length) {
    throw new Error(
      `${automatic.map(named).join(", ")} ${automatic.length === 1 ? "gets" : "get"} every build automatically, so the pilot would reach ${automatic.length === 1 ? "it" : "them"} too. Turn off automatic distribution there (App Store Connect → TestFlight → the group), and set TESTFLIGHT_STANDARD_GROUP_ID for standard builds instead.`
    );
  }
  return { app, group };
}

const sleepFor = (ms) => new Promise((done) => setTimeout(done, ms));

/** The uploaded build, once App Store Connect knows it, or once it is
 *  processed when `valid` is asked for. */
export async function waitForBuild({
  request,
  appId,
  buildNumber,
  marketingVersion,
  valid = false,
  timeoutMs = 40 * 60_000,
  intervalMs = 30_000,
  sleep = sleepFor,
  now = Date.now,
  log = () => {},
}) {
  const path =
    `/v1/builds?filter[app]=${encodeURIComponent(appId)}` +
    `&filter[version]=${encodeURIComponent(buildNumber)}` +
    `&filter[preReleaseVersion.version]=${encodeURIComponent(marketingVersion)}` +
    "&filter[preReleaseVersion.platform]=IOS&limit=10";
  const deadline = now() + timeoutMs;
  for (;;) {
    const builds = (await request("GET", path))?.data ?? [];
    const build = builds.find((b) => b.attributes?.version === String(buildNumber));
    const state = build?.attributes?.processingState;
    if (state === "FAILED" || state === "INVALID") {
      throw new Error(`App Store Connect could not process build ${marketingVersion} (${buildNumber}): ${state}. Its email to the account holder says why.`);
    }
    if (build && (!valid || state === "VALID")) return build;
    if (now() >= deadline) {
      throw new Error(
        `Build ${marketingVersion} (${buildNumber}) was ${build ? `still ${state}` : "not in App Store Connect"} after ${Math.round(timeoutMs / 60_000)} minutes. Finish this step by hand in App Store Connect → TestFlight (docs/ios-release.md).`
      );
    }
    log(build ? `Build ${buildNumber} is ${state}; waiting.` : `Build ${buildNumber} is not in App Store Connect yet; waiting.`);
    await sleep(intervalMs);
  }
}

/** Writes the build's "What to Test" in every language its test
 *  information has, or in the app's primary language when it has none. */
export async function setWhatsNew({ request, app, build, text }) {
  const localizations = await listAll(request, `/v1/builds/${build.id}/betaBuildLocalizations?limit=200`);
  if (!localizations.length) {
    await request("POST", "/v1/betaBuildLocalizations", {
      data: {
        type: "betaBuildLocalizations",
        attributes: { locale: app.attributes?.primaryLocale ?? "en-GB", whatsNew: text },
        relationships: { build: { data: { type: "builds", id: build.id } } },
      },
    });
    return;
  }
  for (const localization of localizations) {
    await request("PATCH", `/v1/betaBuildLocalizations/${localization.id}`, {
      data: { type: "betaBuildLocalizations", id: localization.id, attributes: { whatsNew: text } },
    });
  }
}

export async function distribute({
  request,
  bundleId,
  kind,
  notes,
  buildNumber,
  marketingVersion,
  pilotGroupId,
  standardGroupId,
  wait = {},
  log = () => {},
}) {
  const send = kind === "pilot" ? refuseSubmissions(request) : request;
  const text = whatsNew(kind, notes);
  const { app, group } = await checkGroups({ request: send, bundleId, kind, pilotGroupId, standardGroupId });
  if (!text && !group) {
    log("No notes and no tester group for this standard build; TestFlight shows it as uploaded.");
    return null;
  }
  const waitFor = (valid) =>
    waitForBuild({ request: send, appId: app.id, buildNumber, marketingVersion, valid, log, ...wait });
  // Marked as soon as App Store Connect knows the build, before processing
  // ends, so a pilot never sits there unmarked.
  let build = await waitFor(false);
  if (text) {
    await setWhatsNew({ request: send, app, build, text });
    log(`Set "What to Test" for ${marketingVersion} (${buildNumber}).`);
  }
  if (!group) return build;
  if (group.attributes?.hasAccessToAllBuilds === true) {
    log(`${group.attributes?.name ?? group.id} already gets every build.`);
    return build;
  }
  // A group takes a build once it is processed.
  build = await waitFor(true);
  await send("POST", `/v1/betaGroups/${group.id}/relationships/builds`, {
    data: [{ type: "builds", id: build.id }],
  });
  log(`Sent ${marketingVersion} (${buildNumber}) to ${group.attributes?.name ?? group.id}.`);
  return build;
}

export function explain(error) {
  if (!(error instanceof AppStoreConnectError)) return error.message;
  if (error.status === 401) {
    return `App Store Connect refused the API key (${error.detail}). ASC_API_KEY_ID, ASC_API_ISSUER_ID and the .p8 in ASC_API_KEY_P8_BASE64 must all come from the same team key.`;
  }
  if (error.status === 403) {
    return `The API key may not do this: ${error.call} (${error.detail}). TestFlight groups and notes need a team key with the App Manager or Admin role.`;
  }
  return error.message;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command] = process.argv.slice(2);
  const env = process.env;
  try {
    if (command !== "check" && command !== "distribute") {
      throw new Error(`Unknown command "${command}": check or distribute.`);
    }
    const request = connect({
      token: makeToken({
        keyId: env.ASC_API_KEY_ID.trim(),
        issuerId: env.ASC_API_ISSUER_ID.trim(),
        privateKey: readFileSync(env.ASC_API_KEY_PATH, "utf8"),
      }),
    });
    const options = {
      bundleId: env.BUNDLE_ID,
      kind: env.BUILD_KIND,
      pilotGroupId: env.TESTFLIGHT_PILOT_GROUP_ID,
      standardGroupId: env.TESTFLIGHT_STANDARD_GROUP_ID,
    };
    const log = (line) => console.log(line);
    if (command === "check") {
      whatsNew(env.BUILD_KIND, env.TESTFLIGHT_NOTES);
      const { group } = await checkGroups({
        request: env.BUILD_KIND === "pilot" ? refuseSubmissions(request) : request,
        ...options,
      });
      log(
        group
          ? `This ${env.BUILD_KIND} build will go to ${group.attributes?.name ?? group.id}.`
          : "This standard build goes to no group of its own; add testers in App Store Connect."
      );
    } else {
      await distribute({
        request,
        ...options,
        notes: env.TESTFLIGHT_NOTES,
        buildNumber: env.BUILD_NUMBER,
        marketingVersion: env.MARKETING_VERSION,
        log,
      });
    }
  } catch (error) {
    console.log(`::error::${explain(error)}`);
    process.exit(1);
  }
}

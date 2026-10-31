import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error Standalone Node .mjs script is outside the TS app project.
import * as tf from "./testflight-build.mjs";

type Call = { method: string; path: string; body?: unknown };
type Group = {
  id: string;
  attributes: {
    name: string;
    isInternalGroup: boolean;
    hasAccessToAllBuilds?: boolean;
  };
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workflowsDir = join(root, ".github/workflows");
const workflow = readFileSync(join(workflowsDir, "deploy-ios.yml"), "utf8");
const step = (name: string) => {
  const start = workflow.indexOf(`- name: ${name}`);
  if (start < 0) throw new Error(`no step named "${name}" in deploy-ios.yml`);
  const next = workflow.indexOf("- name:", start + 1);
  return workflow.slice(start, next < 0 ? undefined : next);
};

const PILOT: Group = {
  id: "G-PILOT",
  attributes: { name: "Watch pilot", isInternalGroup: true },
};
const TEAM: Group = {
  id: "G-TEAM",
  attributes: { name: "Team", isInternalGroup: true },
};
const PUBLIC: Group = {
  id: "G-PUBLIC",
  attributes: { name: "Public beta", isInternalGroup: false },
};

/** A fake App Store Connect for one app, recording every call. Builds are
 *  answered from `states`, one per poll. */
function account({
  groups = [PILOT, TEAM, PUBLIC] as Group[],
  states = ["VALID"] as (string | null)[],
  localizations = [{ id: "L-GB" }] as { id: string }[],
} = {}) {
  const calls: Call[] = [];
  let poll = 0;
  const request = async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    if (method === "GET" && path.startsWith("/v1/apps?")) {
      return {
        data: [
          { id: "A-OTHER", attributes: { bundleId: "com.tropos.app.other" } },
          {
            id: "A1",
            attributes: { bundleId: "com.tropos.app", primaryLocale: "en-GB" },
          },
        ],
      };
    }
    if (method === "GET" && path.startsWith("/v1/apps/A1/betaGroups")) {
      return { data: groups };
    }
    if (method === "GET" && path.startsWith("/v1/builds?")) {
      const state = states[Math.min(poll++, states.length - 1)];
      return {
        data: state
          ? [
              {
                id: "B42",
                attributes: { version: "42", processingState: state },
              },
            ]
          : [],
      };
    }
    if (method === "GET" && path.startsWith("/v1/builds/B42/betaBuildLocalizations")) {
      return { data: localizations };
    }
    if (method !== "GET") return null;
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { calls, request };
}

const base = {
  bundleId: "com.tropos.app",
  buildNumber: "42",
  marketingVersion: "1.2.0",
  pilotGroupId: "G-PILOT",
  wait: { sleep: async () => {}, intervalMs: 1 },
};

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

describe("a connected training pilot on TestFlight", () => {
  it("says it is a pilot, with the dispatch's notes after", () => {
    expect(tf.whatsNew("pilot", "")).toBe(tf.PILOT_WHATS_NEW);
    expect(tf.whatsNew("pilot", "  Try a locked-phone pause.  ")).toBe(
      `${tf.PILOT_WHATS_NEW}\n\nTry a locked-phone pause.`
    );
    expect(tf.PILOT_WHATS_NEW).toMatch(/^Connected training pilot\. Not for App Store release\./);
    expect(tf.whatsNew("standard", "  ")).toBeNull();
    expect(tf.whatsNew("standard", "Check the paywall")).toBe("Check the paywall");
    expect(() => tf.whatsNew("pilot", "x".repeat(tf.WHATS_NEW_MAX))).toThrow(
      /too long/
    );
  });

  it("marks the build, then sends it to the pilot group alone", async () => {
    const api = account({ states: [null, "PROCESSING", "VALID"] });
    await tf.distribute({ ...base, request: api.request, kind: "pilot", notes: "Pause from the Watch" });
    expect(writes(api.calls)).toEqual([
      {
        method: "PATCH",
        path: "/v1/betaBuildLocalizations/L-GB",
        body: {
          data: {
            type: "betaBuildLocalizations",
            id: "L-GB",
            attributes: { whatsNew: `${tf.PILOT_WHATS_NEW}\n\nPause from the Watch` },
          },
        },
      },
      {
        method: "POST",
        path: "/v1/betaGroups/G-PILOT/relationships/builds",
        body: { data: [{ type: "builds", id: "B42" }] },
      },
    ]);
    // Marked while still processing: before the poll that saw it VALID.
    const order = api.calls.map((c) => `${c.method} ${c.path.split("?")[0]}`);
    expect(order.indexOf("PATCH /v1/betaBuildLocalizations/L-GB")).toBeLessThan(
      order.lastIndexOf("GET /v1/builds")
    );
    const buildQuery = api.calls.find((c) => c.path.startsWith("/v1/builds?"))!.path;
    expect(buildQuery).toContain("filter[app]=A1");
    expect(buildQuery).toContain("filter[version]=42");
    expect(buildQuery).toContain("filter[preReleaseVersion.version]=1.2.0");
  });

  it("writes the note in the app's language when the build has none yet", async () => {
    const api = account({ localizations: [] });
    await tf.distribute({ ...base, request: api.request, kind: "pilot" });
    expect(writes(api.calls)[0]).toMatchObject({
      method: "POST",
      path: "/v1/betaBuildLocalizations",
      body: {
        data: {
          attributes: { locale: "en-GB", whatsNew: tf.PILOT_WHATS_NEW },
          relationships: { build: { data: { type: "builds", id: "B42" } } },
        },
      },
    });
  });

  it("refuses before the archive when the pilot has no group of its own", async () => {
    for (const [options, message] of [
      [{ pilotGroupId: "" }, /set the repository variable TESTFLIGHT_PILOT_GROUP_ID/],
      [{ pilotGroupId: "G-GONE" }, /names no tester group/],
      [{ pilotGroupId: "G-PUBLIC" }, /external group, which needs Beta App Review/],
    ] as const) {
      const api = account();
      await expect(
        tf.checkGroups({ ...base, ...options, request: api.request, kind: "pilot" })
      ).rejects.toThrow(message);
      expect(writes(api.calls)).toEqual([]);
    }
  });

  it("refuses when another internal group would get the pilot automatically", async () => {
    const api = account({
      groups: [
        PILOT,
        { ...TEAM, attributes: { ...TEAM.attributes, hasAccessToAllBuilds: true } },
        // External groups never get a build without review.
        { ...PUBLIC, attributes: { ...PUBLIC.attributes, hasAccessToAllBuilds: true } },
      ],
    });
    await expect(
      tf.checkGroups({ ...base, request: api.request, kind: "pilot" })
    ).rejects.toThrow(/^"Team" gets every build automatically/);
    // The pilot group may itself take every build; it is the only one that does.
    const own = account({
      groups: [{ ...PILOT, attributes: { ...PILOT.attributes, hasAccessToAllBuilds: true } }, TEAM],
    });
    await expect(
      tf.checkGroups({ ...base, request: own.request, kind: "pilot" })
    ).resolves.toMatchObject({ group: { id: "G-PILOT" } });
  });

  it("never sends a pilot for review or release, whatever asks", async () => {
    const calls: Call[] = [];
    const guarded = tf.refuseSubmissions(async (method: string, path: string) => {
      calls.push({ method, path });
      return null;
    });
    for (const path of [
      "/v1/betaAppReviewSubmissions",
      "/v1/appStoreVersionSubmissions",
      "/v1/reviewSubmissions",
      "/v1/reviewSubmissionItems",
      "/v1/appStoreVersions/V1/relationships/build",
      "/v1/appStoreVersionReleaseRequests",
      "https://api.appstoreconnect.apple.com/v1/reviewSubmissions?include=items",
    ]) {
      await expect(guarded("POST", path, {})).rejects.toBeInstanceOf(tf.PilotSubmissionRefused);
    }
    await expect(guarded("PATCH", "/v1/appStoreVersions/V1", {})).rejects.toThrow(
      /never submitted for review or released/
    );
    // Reading is fine, and so is the pilot's own work.
    await guarded("GET", "/v1/reviewSubmissions?filter[app]=A1");
    await guarded("POST", "/v1/betaGroups/G-PILOT/relationships/builds", {});
    expect(calls.map((c) => c.method)).toEqual(["GET", "POST"]);
  });

  it("stops when App Store Connect could not process the build, and when it never arrives", async () => {
    const failed = account({ states: ["FAILED"] });
    await expect(
      tf.distribute({ ...base, request: failed.request, kind: "pilot" })
    ).rejects.toThrow(/could not process build 1\.2\.0 \(42\): FAILED/);
    expect(writes(failed.calls)).toEqual([]);

    let clock = 0;
    const absent = account({ states: [null] });
    await expect(
      tf.waitForBuild({
        request: absent.request,
        appId: "A1",
        buildNumber: "42",
        marketingVersion: "1.2.0",
        timeoutMs: 60_000,
        intervalMs: 30_000,
        now: () => clock,
        sleep: async (ms: number) => {
          clock += ms;
        },
      })
    ).rejects.toThrow(/not in App Store Connect after 1 minutes/);
  });
});

describe("a standard TestFlight build", () => {
  it("carries the dispatch's notes and goes to its group when one is set", async () => {
    const api = account();
    await tf.distribute({
      ...base,
      request: api.request,
      kind: "standard",
      notes: "Check the paywall",
      standardGroupId: "G-TEAM",
    });
    expect(writes(api.calls).map((c) => [c.method, c.path, c.body])).toEqual([
      [
        "PATCH",
        "/v1/betaBuildLocalizations/L-GB",
        { data: { type: "betaBuildLocalizations", id: "L-GB", attributes: { whatsNew: "Check the paywall" } } },
      ],
      ["POST", "/v1/betaGroups/G-TEAM/relationships/builds", { data: [{ type: "builds", id: "B42" }] }],
    ]);
  });

  it("waits for nothing when it has no notes and no group", async () => {
    const api = account();
    await expect(
      tf.distribute({ ...base, request: api.request, kind: "standard", notes: "" })
    ).resolves.toBeNull();
    expect(api.calls.some((c) => c.path.startsWith("/v1/builds"))).toBe(false);
  });

  it("never shares the pilot's group", async () => {
    const api = account();
    await expect(
      tf.checkGroups({ ...base, request: api.request, kind: "standard", standardGroupId: "G-PILOT" })
    ).rejects.toThrow(/name the same group/);
  });
});

describe("deploy-ios.yml marks a pilot and keeps it from release", () => {
  it("makes a pilot only from Run workflow, and says which kind of build it is", () => {
    const mode = step("Select connected training build mode");
    expect(mode).toContain("EVENT_NAME: ${{ github.event_name }}");
    expect(mode).toMatch(/true\)\s*if \[ "\$EVENT_NAME" != workflow_dispatch \]; then[\s\S]*?exit 1/);
    expect(mode).toMatch(/true\)[\s\S]*?echo "kind=pilot"[\s\S]*?;;/);
    expect(mode).toMatch(/false\|""\)[\s\S]*?echo "kind=standard"/);
  });

  it("checks the group before the archive and marks the build after the upload", () => {
    const at = (name: string) => workflow.indexOf(`- name: ${name}`);
    expect(at("Check the TestFlight tester group")).toBeGreaterThan(-1);
    expect(at("Check the TestFlight tester group")).toBeLessThan(at("Archive"));
    expect(at("Mark the TestFlight build and send it to its group")).toBeGreaterThan(
      at("Upload to TestFlight")
    );
    expect(step("Check the TestFlight tester group")).toContain(
      "node scripts/ios/testflight-build.mjs check"
    );
    expect(step("Mark the TestFlight build and send it to its group")).toContain(
      "node scripts/ios/testflight-build.mjs distribute"
    );
    // A slow App Store Connect must not cost the build its crash symbols.
    expect(step("Upload to TestFlight")).toContain("id: upload");
    expect(step("Upload Crashlytics symbol files")).toContain(
      "if: ${{ !cancelled() && steps.upload.outcome == 'success' }}"
    );
  });

  it("passes the notes, the kind and the group ids through the environment", () => {
    for (const name of [
      "Check the TestFlight tester group",
      "Mark the TestFlight build and send it to its group",
    ]) {
      const body = step(name);
      expect(body).toContain("TESTFLIGHT_NOTES: ${{ inputs.notes }}");
      expect(body).toContain("BUILD_KIND: ${{ steps.training-mode.outputs.kind }}");
      expect(body).toContain("TESTFLIGHT_PILOT_GROUP_ID: ${{ vars.TESTFLIGHT_PILOT_GROUP_ID }}");
      expect(body).toContain("TESTFLIGHT_STANDARD_GROUP_ID: ${{ vars.TESTFLIGHT_STANDARD_GROUP_ID }}");
      expect(body).toMatch(/\*"-----BEGIN"\*\|\*"<\?xml"\*/);
    }
    // A note is typed by a person: it never becomes part of a command.
    const run = workflow.split("\n").filter((line) => !/^\s+[A-Z0-9_]+: \$\{\{/.test(line));
    expect(run.join("\n")).not.toContain("inputs.notes");
  });

  it("submits nothing for review anywhere but through the pilot's guard", () => {
    // Every workflow, so a release job added later meets this too. The
    // guard lives in testflight-build.mjs; a workflow that called App
    // Review some other way would bypass it.
    const submission =
      /betaAppReviewSubmissions|appStoreVersionSubmissions|reviewSubmissions|appStoreVersionReleaseRequests|upload_to_app_store|submit_for_review|fastlane\s+deliver/;
    const files = readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f));
    expect(files).toContain("deploy-ios.yml");
    for (const file of files) {
      expect(readFileSync(join(workflowsDir, file), "utf8"), file).not.toMatch(submission);
    }
  });
});

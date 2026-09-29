/**
 * The Storage deploy confirms its rules can read Firestore BEFORE it
 * releases them.
 *
 * storage.rules reads Firestore for the account-deletion write freeze,
 * and those reads work only once the Storage service agent holds
 * `roles/firebaserules.firestoreServiceAgent`. firebase-tools checks and
 * grants that role only in an interactive session, so a CI deploy
 * releases the rules without it and still reports success, while every
 * upload they guard is refused. The first release of the freeze
 * (2026-09-15) went out exactly that way, from CI with nothing checking
 * the role (CLAUDE.md, the packet-11 QA row).
 *
 * `scripts/verify_storage_rules_iam.py` is the check, and
 * `scripts/test_verify_storage_rules_iam.py` tests what it decides. This
 * file pins where it runs, which a Python test cannot see:
 *
 * 1. In the deploy job, after authentication and before the rules
 *    deploy. Run after the deploy, it could only report the damage.
 * 2. As a blocking step: no `continue-on-error`, no `if:`.
 * 3. Its offline tests run in the required `unit` job, so a change that
 *    breaks the check fails its PR rather than a release.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = "scripts/verify_storage_rules_iam.py";
const SCRIPT_TESTS = "test_verify_storage_rules_iam.py";

function workflow(file: string): string {
  return readFileSync(resolve(repoRoot, ".github/workflows", file), "utf8");
}

/** One top-level job's body: from its key to the next two-space key. */
function jobBody(source: string, name: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => l === `  ${name}:`);
  expect(start, `no job named "${name}"`).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}[a-z][\w-]*:\s*$/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** A job's steps, each as its own text, in order. */
function steps(body: string): string[] {
  return body
    .split(/\n(?= {6}- )/)
    .filter((step) => /^ {6}- /.test(step))
    .map((step) =>
      step
        .split("\n")
        // Comments above a step are prose, not configuration.
        .filter((line) => !/^\s*#/.test(line))
        .join("\n")
    );
}

describe("Storage deploy — the cross-service permission check", () => {
  const deploySteps = steps(jobBody(workflow("deploy-storage.yml"), "deploy"));
  const index = (pattern: RegExp) =>
    deploySteps.findIndex((step) => pattern.test(step));

  const auth = index(/uses: google-github-actions\/auth@/);
  const check = index(
    new RegExp(`run: python3 ${SCRIPT.replace(/\./g, "\\.")}\\s*$`, "m")
  );
  const release = index(/firebase deploy --only storage/);

  it("finds the check, the script and its tests", () => {
    expect(existsSync(resolve(repoRoot, SCRIPT))).toBe(true);
    expect(existsSync(resolve(repoRoot, "scripts", SCRIPT_TESTS))).toBe(true);
    expect(auth, "auth step").toBeGreaterThan(-1);
    expect(check, "check step").toBeGreaterThan(-1);
    expect(release, "deploy step").toBeGreaterThan(-1);
  });

  it("runs after authentication and before the rules are released", () => {
    expect(check).toBeGreaterThan(auth);
    expect(check).toBeLessThan(release);
  });

  it("blocks the deploy when it fails", () => {
    expect(deploySteps[check]).not.toMatch(/continue-on-error|^\s*if:/m);
  });

  it("has its offline tests in the required unit job", () => {
    const unit = jobBody(workflow("ci.yml"), "unit");
    const run = unit.match(
      /python3 -m unittest discover -s scripts -p '([^']+)'/
    );
    expect(run, "unit runs the scripts' unittest suite").not.toBeNull();
    const glob = new RegExp(
      `^${run![1].replace(/\./g, "\\.").replace(/\*/g, ".*")}$`
    );
    expect(SCRIPT_TESTS).toMatch(glob);
  });
});

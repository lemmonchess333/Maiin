/**
 * Every job that takes a runner sets its own `timeout-minutes`.
 *
 * GitHub's default is six hours. A job with no limit that hangs (a deploy
 * waiting on an API that never answers, an install stuck on a lock) keeps
 * its runner that long, and in a workflow with a concurrency group it
 * keeps the group. Deploy production queues each release behind the one
 * running (`production-release`, cancel-in-progress false), so a hung
 * Functions deploy would have held every later release for six hours,
 * with nothing failing to say so. Nine jobs had no limit, six of them in
 * the release chain.
 *
 * A job that calls a reusable workflow (`uses: ./…`) cannot set a
 * timeout; the called workflow's jobs carry it, and are read here like
 * any other job.
 *
 * Parsed as text, as the other workflow guards are: a job is a key at two
 * spaces under `jobs:`, and its own keys sit at four.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const workflowsDir = resolve(repoRoot, ".github/workflows");

interface Job {
  file: string;
  name: string;
  body: string;
}

function jobsIn(file: string): Job[] {
  const lines = readFileSync(resolve(workflowsDir, file), "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const start = lines.findIndex((l) => l === "jobs:");
  if (start === -1) return [];
  const jobs: Job[] = [];
  let current: { name: string; lines: string[] } | null = null;
  for (const line of lines.slice(start + 1)) {
    // A top-level key ends the jobs block.
    if (/^[^\s#]/.test(line)) break;
    const key = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (key) {
      if (current)
        jobs.push({ file, name: current.name, body: current.lines.join("\n") });
      current = { name: key[1], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current)
    jobs.push({ file, name: current.name, body: current.lines.join("\n") });
  return jobs;
}

const allJobs = readdirSync(workflowsDir)
  .filter((f) => /\.ya?ml$/.test(f))
  .sort()
  .flatMap(jobsIn);

/** Jobs that run on a runner, as opposed to calling a reusable workflow. */
const runnerJobs = allJobs.filter((j) => /^ {4}runs-on:/m.test(j.body));

describe("every job that takes a runner has a timeout", () => {
  it("reads the jobs, not nothing", () => {
    /* Anti-vacuity: a parser that found no jobs would pass the check
       below for every workflow. The release chain's reusable calls are
       the known non-runner jobs, so seeing them here means the job
       boundaries were read. */
    expect(runnerJobs.length).toBeGreaterThanOrEqual(25);
    const calls = allJobs.filter((j) => /^ {4}uses: \.\//m.test(j.body));
    expect(calls.map((j) => `${j.file}:${j.name}`)).toEqual(
      expect.arrayContaining([
        "deploy-production.yml:functions",
        "deploy-production.yml:hosting",
      ])
    );
  });

  it("sets timeout-minutes on the job itself, as a whole number", () => {
    /* A step-level timeout-minutes does not count: it bounds that step
       only, and a job can hang in any of the others. */
    const offenders = runnerJobs
      .filter((j) => !/^ {4}timeout-minutes: [1-9]\d*\s*(#.*)?$/m.test(j.body))
      .map((j) => `${j.file}: ${j.name}`);
    expect(
      offenders,
      "Give each job its own `timeout-minutes`, a few times its usual run, so a hang fails instead of holding the runner (and any concurrency group) for GitHub's six-hour default.\n  " +
        offenders.join("\n  ")
    ).toEqual([]);
  });
});

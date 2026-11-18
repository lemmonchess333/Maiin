#!/usr/bin/env node
// What a push or pull request changed, and so what CI has to run for it.
//
// Two callers. ci.yml's `changes` job runs it bare, on a sparse,
// blob-less checkout, for two answers every later job reads:
//
//   app   false only when EVERY changed file is documentation, a plan
//         file or the native iOS project. Nothing the web build, the
//         emulator suites or a browser spec reads lives there; the tests
//         that read those files as text run in `unit`, which runs the
//         whole suite on every pull request regardless.
//   mode  "related" when each unit variant may run only the tests a
//         change reaches; "full" when a change can reach every test
//         without an import (dependencies, the test config and setup,
//         `__mocks__`, the test wrapper and its preloads, scripts/ci,
//         ci.yml), when more than MAX_RELATED files changed, and on any
//         event this cannot diff (a schedule, a manual run, a new branch).
//
// And each unit variant's `variant-suite.mjs` imports it, on a full
// checkout, to say which tests a related run takes (`relatedInputs`) and
// whether the functions suite runs (`needsFunctions`).
//
// What changed is read from git, never guessed:
//   pull_request  the test-merge commit against its first parent,
//                 `git diff HEAD^1 HEAD`, which is what merging would
//                 change on main as it stands. Only when HEAD really has
//                 two parents; the checkouts use `fetch-depth: 2`.
//   push          the pushed range, `git diff <before> HEAD`, fetching
//                 `before` first. A new branch (`before` all zeros) or a
//                 `before` that cannot be fetched gives no list.
// No list means everything runs. Every answer fails OPEN.
//
// Usage: node scripts/ci/classify-changes.mjs   (writes app and mode to
//        $GITHUB_OUTPUT, and says why on stdout)

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Changes outside everything but `unit` (see `app` above). */
export const NOT_APP = [/\.md$/, /^docs\//, /^\.claude\/plans\//, /^ios\//];

/** Changes that can reach any test without an import. */
export const RUN_EVERYTHING = [
  /^package(-lock)?\.json$/,
  /^patches\//,
  /^vitest\.config\./,
  /^vite\.config\./,
  /^tsconfig[^/]*\.json$/,
  /^src\/test\/setup\.ts$/,
  /(^|\/)__mocks__\//,
  /^scripts\/run-unit-tests\.mjs$/,
  /^scripts\/fake-clock\.cjs$/,
  /^scripts\/deny-unit-network\.cjs$/,
  /^scripts\/ci\//,
  /^\.github\/workflows\/ci\.yml$/,
  /^\.nvmrc$/,
  /^\.node-version$/,
];

/** Above this many changed files, a variant runs the whole suite: the
 *  related walk would select most of it anyway. Tropos heuristic. */
export const MAX_RELATED = 150;

const TEST_FILE = /\.test\.(ts|tsx|js|mjs|cjs|jsx)$/;

/** Files vitest walks as modules; anything else under a `__tests__`
 *  directory is read by a test as text (a fixture or a trace). Snapshot
 *  files are left to vitest, which maps each to its test. */
const MODULE =
  /\.(ts|tsx|js|mjs|cjs|jsx|json|css|svg|png|jpe?g|webp|avif|snap)$/;

const ZERO_SHA = /^0+$/;

/**
 * The two answers for one list of changes, each `{ path, deleted }`
 * (repo-relative, forward slashes), or null when nothing could be read.
 */
export function classify(changes) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return { app: true, mode: "full", why: "no list of changes" };
  }
  const paths = changes.map((c) => c.path);
  const app = !paths.every((p) => NOT_APP.some((re) => re.test(p)));
  const trigger = paths.find((p) => RUN_EVERYTHING.some((re) => re.test(p)));
  if (trigger) return { app, mode: "full", why: `${trigger} changed` };
  if (paths.length > MAX_RELATED) {
    return { app, mode: "full", why: `${paths.length} files changed` };
  }
  return { app, mode: "related", why: `${paths.length} files changed` };
}

/** The strings a test that reads one of these files would contain. */
export function needlesFor(paths) {
  return [...new Set(paths.flatMap((p) => [p, basename(p)]))];
}

/**
 * What to hand `vitest related`, beyond what its import graph finds:
 *  - every changed path that still exists;
 *  - for a changed fixture a test reads as text (under `__tests__`, not a
 *    module), the test files in the nearest directory above it that has
 *    any;
 *  - every test file whose text names a changed path or its file name
 *    (`readersOf`), since a test that reads a file through readFileSync
 *    or createRequire is not in the graph.
 *
 * `listDir(dir)` gives a directory's entry names ([] if none) and
 * `readersOf(needles)` the test files containing any of them.
 */
export function relatedInputs(changes, { listDir, readersOf }) {
  const live = changes.filter((c) => !c.deleted).map((c) => c.path);
  const out = new Set(live);
  for (const file of live) {
    if (!/(^|\/)__tests__\//.test(file)) continue;
    if (TEST_FILE.test(file) || MODULE.test(file)) continue;
    const stop = file.slice(
      0,
      file.lastIndexOf("__tests__/") + "__tests__".length
    );
    let dir = dirname(file);
    for (;;) {
      const tests = listDir(dir).filter((name) => TEST_FILE.test(name));
      if (tests.length) {
        tests.forEach((name) => out.add(`${dir}/${name}`));
        break;
      }
      if (dir === stop || !dir.includes("/")) break;
      dir = dirname(dir);
    }
  }
  if (live.length) {
    for (const reader of readersOf(needlesFor(live))) out.add(reader);
  }
  return [...out].sort();
}

/**
 * Whether a unit variant runs the functions suite: on a full run, on any
 * change under functions/, and on any change a functions test names
 * (`functionsReadersOf`, a search of functions/__tests__), since those
 * tests read firestore.rules, the indexes, capacitor.config.ts and more
 * as text.
 */
export function needsFunctions(changes, mode, functionsReadersOf) {
  if (mode !== "related" || !Array.isArray(changes) || !changes.length)
    return true;
  if (changes.some((c) => c.path.startsWith("functions/"))) return true;
  const live = changes.filter((c) => !c.deleted).map((c) => c.path);
  return live.length > 0 && functionsReadersOf(needlesFor(live)).length > 0;
}

/** Parses `git diff --name-status --no-renames` output. */
export function parseNameStatus(out) {
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split("\t");
      return { path: rest.join("\t"), deleted: status.startsWith("D") };
    });
}

/**
 * What this checkout's event changed, or null when it cannot say (then
 * everything runs). `event` is the GitHub event name and `payload` its
 * JSON payload.
 */
export function changedFiles(cwd, event, payload) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  try {
    if (event === "pull_request") {
      const parents = git("rev-list", "--parents", "-n", "1", "HEAD").split(
        " "
      );
      if (parents.length !== 3) return null;
      return parseNameStatus(
        git("diff", "--name-status", "--no-renames", "HEAD^1", "HEAD")
      );
    }
    if (event === "push") {
      const before = String(payload?.before ?? "");
      if (!/^[0-9a-f]{40}$/.test(before) || ZERO_SHA.test(before)) return null;
      try {
        git("cat-file", "-e", `${before}^{commit}`);
      } catch {
        git(
          "fetch",
          "--no-tags",
          "--depth=1",
          "--filter=blob:none",
          "origin",
          before
        );
      }
      return parseNameStatus(
        git("diff", "--name-status", "--no-renames", before, "HEAD")
      );
    }
    return null;
  } catch {
    return null;
  }
}

/** The event this step runs for, from the runner's environment. */
export function currentEvent() {
  const event = process.env.GITHUB_EVENT_NAME ?? "";
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  } catch {
    payload = {};
  }
  return { event, payload };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const { event, payload } = currentEvent();
  const changes = changedFiles(root, event, payload);
  const answer = classify(changes);
  console.log(`event: ${event || "(none)"}`);
  if (changes) {
    console.log(`changed (${changes.length}):`);
    for (const c of changes)
      console.log(`  ${c.deleted ? "D" : "M"} ${c.path}`);
  } else {
    console.log("changed: cannot say for this event, so everything runs");
  }
  console.log(`app=${answer.app} mode=${answer.mode} (${answer.why})`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `app=${answer.app}\nmode=${answer.mode}\n`
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}

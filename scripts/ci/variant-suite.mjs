#!/usr/bin/env node
// The client suite for one unit variant (ci.yml: unit-timezone,
// unit-locale, unit-future, unit-shuffle), the whole of it or the tests a
// change reaches.
//
//   SUITE_MODE=related  `vitest related` on the changed files, plus the
//                       tests that read a changed file as text, so the
//                       variant's time zone, locale, clock or order is
//                       tried on every test the change can reach. `unit`
//                       runs everything, in UTC, on the same commit.
//   anything else       the whole suite, as `npm run test -- --run` does.
//
// Related falls back to the whole suite whenever this checkout cannot say
// what changed, or `classify-changes.mjs` would not call it related.
// Extra arguments go to vitest in both modes.
//
// It also decides whether the job's functions suite runs, and writes
// `functions=true|false` to $GITHUB_OUTPUT for the steps after it.
//
// A related run must not pass by running nothing it should have: it fails
// if a test file it selected (changed, beside a changed fixture, or naming
// a changed file) that vitest would collect is not among the files it ran.
// The step summary says how many it ran, of how many.
//
// Usage: SUITE_MODE=related node scripts/ci/variant-suite.mjs [vitest args]

import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  changedFiles,
  classify,
  currentEvent,
  needsFunctions,
  relatedInputs,
} from "./classify-changes.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** The test files vitest.config.ts collects (its projects' includes). */
export const VITEST_COLLECTS = [
  /^src\/.+\.test\.tsx?$/,
  /^scripts\/.+\.test\.tsx?$/,
  /^firestore\.[^/]+\.test\.ts$/,
  /^storage\.rules\.test\.ts$/,
];

const TEST_FILE = /\.test\.(ts|tsx|js|mjs|cjs|jsx)$/;

/**
 * The selected test files vitest would collect, and those of them a run
 * left out. `inputs` is everything handed to `vitest related` (changed
 * files, fixture neighbours, reader tests); `ran` holds the repo-relative
 * files the run reported.
 */
export function missedTests(inputs, ran) {
  const expected = inputs.filter((p) =>
    VITEST_COLLECTS.some((re) => re.test(p))
  );
  const seen = new Set(ran);
  return { expected, missed: expected.filter((p) => !seen.has(p)) };
}

/** Tracked files under `pathspecs` whose text holds any of `needles`. */
function grepFiles(needles, pathspecs) {
  if (!needles.length) return [];
  try {
    const out = execFileSync(
      "git",
      [
        "grep",
        "-l",
        "-F",
        ...needles.flatMap((n) => ["-e", n]),
        "--",
        ...pathspecs,
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
    );
    return out.split("\n").filter((f) => TEST_FILE.test(f));
  } catch (err) {
    // git grep exits 1 for "no match"; anything else is a real failure,
    // and a reader search that failed must not read as "no readers".
    if (err.status === 1) return [];
    throw err;
  }
}

const readersOf = (needles) =>
  grepFiles(needles, [":(glob)src/**/__tests__/**", ":(glob)scripts/**"]);
const functionsReadersOf = (needles) =>
  grepFiles(needles, [":(glob)functions/__tests__/**"]);
const listDir = (dir) => {
  const abs = join(root, dir);
  return existsSync(abs) ? readdirSync(abs) : [];
};

function output(line) {
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
}
function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

/** Runs the test wrapper, echoing its output and keeping its tail. */
function run(args) {
  console.log(`node scripts/run-unit-tests.mjs ${args.join(" ")}`);
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [join(root, "scripts/run-unit-tests.mjs"), ...args],
      { cwd: root, stdio: ["inherit", "pipe", "inherit"] }
    );
    let tail = "";
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      tail = (tail + chunk.toString()).slice(-65536);
    });
    child.on("error", fail);
    child.on("close", (code) => done({ code: code ?? 1, tail }));
  });
}

async function main() {
  const extra = process.argv.slice(2);
  const { event, payload } = currentEvent();
  const changes = changedFiles(root, event, payload);
  const related =
    process.env.SUITE_MODE === "related" &&
    changes !== null &&
    classify(changes).mode === "related";
  const mode = related ? "related" : "full";

  const functions = needsFunctions(changes, mode, functionsReadersOf);
  output(`functions=${functions}`);
  console.log(`functions suite: ${functions ? "runs" : "not reached"}`);

  if (!related) {
    if (process.env.SUITE_MODE === "related")
      console.log("cannot read what changed here; running the whole suite");
    summary(`Unit suite: the whole suite (${event || "no event"}).`);
    const { code } = await run(["run", ...extra]);
    process.exitCode = code;
    return;
  }

  const inputs = relatedInputs(changes, { listDir, readersOf });
  console.log(`tests reached from ${inputs.length} path(s):`);
  for (const f of inputs) console.log(`  ${f}`);
  const report = join(mkdtempSync(join(tmpdir(), "variant-")), "vitest.json");
  const { code, tail } = await run([
    "related",
    "--run",
    "--passWithNoTests",
    "--reporter=default",
    "--reporter=json",
    `--outputFile.json=${report}`,
    ...extra,
    ...inputs,
  ]);
  process.exitCode = code;

  const plain = tail.replace(/\x1b\[[0-9;]*m/g, "");
  const affected = /Affected\s+(\d+)\s+of\s+(\d+)\s+test files/.exec(plain);
  let ran = [];
  if (existsSync(report)) {
    const json = JSON.parse(readFileSync(report, "utf8"));
    ran = (json.testResults ?? []).map((r) => relative(root, r.name));
  }
  const { expected, missed } = missedTests(inputs, ran);

  summary(
    [
      `Unit suite: related to ${changes.length} changed file(s).`,
      affected
        ? `Affected ${affected[1]} of ${affected[2]} test files.`
        : `Ran ${ran.length} test files.`,
      missed.length
        ? `Selected test files NOT run: ${missed.join(", ")}`
        : `Every selected test file ran (${expected.length}).`,
    ].join("\n\n")
  );
  if (missed.length) {
    console.error(
      `::error::a related run left out test files it selected: ${missed.join(", ")}`
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

/**
 * `npm run verify:app`: the verify skill's entry point
 * (`.claude/skills/verify/SKILL.md` says when and how to use it).
 *
 *   npm run verify:app                       # features this branch touches
 *   npm run verify:app -- --diff <base>      # ...against another base
 *   npm run verify:app -- --features home,food
 *   npm run verify:app -- --all --repeat 3   # the whole map, three rounds
 *   npm run verify:app -- --list             # print the feature map
 *   npm run verify:app -- --down             # stop the emulators and server
 *
 * Other flags: --smoke (the smoke set), --out <dir>, --rebuild (ignore the
 * build cache), --motion (do not ask for reduced motion), --seed (seed
 * emulators this rig did not start).
 *
 * Exit codes: 0 pass, 1 fail or flaky, 2 incomplete (a feature could not
 * run here), 3 the rig could not start.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { driveFeature, launch, notRun, signIn, stillSignedIn } from "./drive";
import type { FeatureResult } from "./drive";
import { FEATURES, SMOKE, type Feature } from "./featureMap";
import {
  authStatePath,
  build,
  emulatorsDown,
  emulatorsUp,
  ensureSeeded,
  preflight,
  preview,
  previewDown,
  rememberAuthState,
  RigError,
  rigLogs,
  ROOT,
  STATE_DIR,
} from "./rig";
import { ACCOUNTS, type Account } from "./rigConfig";
import { renderReport, summarise, type RunMeta } from "./report";
import { selectFeatures, type Selection } from "./select";

export interface Args {
  mode: "diff" | "features" | "all" | "smoke" | "list" | "down";
  base: string;
  ids: string[];
  repeat: number;
  out?: string;
  rebuild: boolean;
  motion: boolean;
  seedExternal: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    mode: "diff",
    base: "origin/main",
    ids: [],
    repeat: 1,
    rebuild: false,
    motion: false,
    seedExternal: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--"))
        throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--diff") {
      args.mode = "diff";
      if (argv[i + 1] && !argv[i + 1].startsWith("--")) args.base = value();
    } else if (a === "--features") {
      args.mode = "features";
      args.ids = value()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      /* An empty list would drive nothing and exit 0: a pass for no work. */
      if (!args.ids.length)
        throw new Error("--features needs at least one feature id (--list)");
    } else if (a === "--all") args.mode = "all";
    else if (a === "--smoke") args.mode = "smoke";
    else if (a === "--list") args.mode = "list";
    else if (a === "--down") args.mode = "down";
    else if (a === "--repeat") {
      args.repeat = Number(value());
      if (!Number.isInteger(args.repeat) || args.repeat < 1)
        throw new Error("--repeat needs a whole number of rounds, 1 or more");
    } else if (a === "--out") args.out = value();
    else if (a === "--rebuild") args.rebuild = true;
    else if (a === "--motion") args.motion = true;
    else if (a === "--seed") args.seedExternal = true;
    else throw new Error(`Unknown flag ${a}. See scripts/verify/cli.ts.`);
  }
  return args;
}

function git(args: string[]): string[] {
  const out = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (out.status !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${out.stderr.trim()}`);
  return out.stdout.split("\n").filter(Boolean);
}

/**
 * This branch's changes against `base`, plus what is not committed yet.
 * `--no-renames`: a renamed file is its old path deleted and its new one
 * added, so both select their features (git would otherwise list the new
 * path only, and a feature claiming the old one would not run).
 */
export function changedFiles(base: string): string[] {
  const files = new Set([
    ...git(["diff", "--name-only", "--no-renames", `${base}...HEAD`]),
    ...git(["diff", "--name-only", "--no-renames", "HEAD"]),
    ...git(["ls-files", "--others", "--exclude-standard"]),
  ]);
  return [...files].sort();
}

/** True when HEAD is `base` itself (or behind it) and nothing is uncommitted. */
function sameAsBase(base: string): boolean {
  const head = git(["rev-parse", "HEAD"])[0];
  const mergeBase = git(["merge-base", base, "HEAD"])[0];
  return head === mergeBase;
}

function choose(args: Args): Selection {
  const byIds = (ids: readonly string[]): Selection => {
    const unknown = ids.filter((id) => !FEATURES.some((f) => f.id === id));
    if (unknown.length)
      throw new Error(
        `No feature named ${unknown.join(", ")}. Run with --list.`
      );
    return {
      features: FEATURES.filter((f) => ids.includes(f.id)),
      because: {},
      unmapped: [],
      smoke: false,
    };
  };
  if (args.mode === "features") return byIds(args.ids);
  if (args.mode === "smoke") return byIds(SMOKE);
  if (args.mode === "all") return byIds(FEATURES.map((f) => f.id));
  return selectFeatures(changedFiles(args.base));
}

function printList(): void {
  for (const f of FEATURES)
    console.log(
      `${f.id.padEnd(22)} ${f.needs.padEnd(10)} ${f.route.padEnd(26)} ${f.title}`
    );
  console.log(`\n${FEATURES.length} features. Smoke set: ${SMOKE.join(", ")}`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const log = (line: string) => console.log(`[verify] ${line}`);
  if (args.mode === "list") {
    printList();
    return 0;
  }
  if (args.mode === "down") {
    await previewDown(log);
    await emulatorsDown(log);
    return 0;
  }

  const selection = choose(args);
  if (!selection.features.length) {
    if (
      args.mode === "diff" &&
      sameAsBase(args.base) &&
      !changedFiles(args.base).length
    )
      log(
        `nothing to drive: this branch has no changes against ${args.base} ` +
          "(HEAD is the base). Pass --features or --smoke to drive anyway."
      );
    else
      log(
        "nothing to drive: the change reaches no screen (tests, docs, CI or " +
          "scripts only). Say so in the commit's Verified line."
      );
    return 0;
  }
  log(
    `driving ${selection.features.length} feature(s): ` +
      selection.features.map((f) => f.id).join(", ")
  );

  const timings: Record<string, number> = {};
  const timed = async <T>(name: string, fn: () => T | Promise<T>) => {
    const t = Date.now();
    const v = await fn();
    timings[name] = Date.now() - t;
    return v;
  };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = args.out ?? join(STATE_DIR, "runs", stamp);
  mkdirSync(outDir, { recursive: true });
  /* The rig's logs travel with the report, so a failure read in CI (or by
     someone else) has them beside it, whatever happened below. */
  const keepLogs = () => {
    for (const p of rigLogs())
      try {
        copyFileSync(p, join(outDir, basename(p)));
      } catch {
        /* a log that cannot be copied is not the run's failure */
      }
  };
  try {
    return await drive(args, selection, outDir, timings, timed, log);
  } finally {
    keepLogs();
  }
}

async function drive(
  args: Args,
  selection: Selection,
  outDir: string,
  timings: Record<string, number>,
  timed: <T>(name: string, fn: () => T | Promise<T>) => Promise<T>,
  log: (line: string) => void
): Promise<number> {
  const pre = await timed("preflight", preflight);
  if (!pre.chromium)
    throw new RigError(
      "CHROMIUM",
      "No Chromium to drive. Set PW_CHROMIUM to a Chromium binary, or run " +
        "`npx playwright install chromium` where the network allows it."
    );
  const signedIn = selection.features.some((f) => f.needs === "signed-in");
  const up = await timed("emulators", () => emulatorsUp(pre, signedIn, log));
  const seeded = await timed("seed", () =>
    ensureSeeded(
      pre,
      up,
      { firestore: signedIn, seedExternal: args.seedExternal },
      log
    )
  );
  const emu = seeded.emu;
  const built = await timed("build", () => build(log, args.rebuild));
  const base = await timed("preview", () => preview(built.hash, log));

  const browser = await launch(pre.chromium);
  const results: FeatureResult[] = [];
  try {
    /* Each account the chosen features use signs in once, and its saved
       session is reused for as long as the emulators and seeds last. */
    const sessions = new Map<Account, { state?: string; error?: string }>();
    const session = async (account: Account) => {
      const known = sessions.get(account);
      if (known) return known;
      const auth = authStatePath(account, emu.lifetime, seeded.key);
      let got: { state?: string; error?: string };
      const t = Date.now();
      if (auth.valid && (await stillSignedIn(browser, base, auth.path))) {
        log(`sign-in (${account}): reusing the saved session`);
        got = { state: auth.path };
      } else {
        try {
          const ms = await signIn(browser, base, auth.path, ACCOUNTS[account]);
          rememberAuthState(account, emu.lifetime, seeded.key);
          log(`sign-in (${account}): ${ms} ms`);
          got = { state: auth.path };
        } catch (e) {
          got = { error: (e as Error).message.split("\n")[0] };
        }
      }
      timings[`sign-in ${account}`] = Date.now() - t;
      sessions.set(account, got);
      return got;
    };

    const t = Date.now();
    for (let round = 1; round <= args.repeat; round++) {
      for (const feature of selection.features as Feature[]) {
        const account = feature.account ?? "e2e";
        let r: FeatureResult;
        if (feature.needs === "signed-in" && !emu.firestore)
          r = notRun(
            feature,
            round,
            emu.diagnosis ?? "The Firestore emulator is not running."
          );
        else {
          const s =
            feature.needs === "signed-in" ? await session(account) : undefined;
          if (s?.error)
            r = {
              ...notRun(feature, round, ""),
              verdict: "fail",
              reason: `signing in as the seeded ${account} account failed: ${s.error}`,
            };
          else
            r = await driveFeature(browser, base, feature, {
              outDir,
              round,
              storageState: s?.state,
              motion: args.motion,
            });
        }
        results.push(r);
        log(
          `${round > 1 ? `round ${round} ` : ""}${feature.id}: ${r.verdict}` +
            (r.verdict === "pass" ? ` (${r.ms} ms)` : ` - ${r.reason}`)
        );
      }
    }
    timings.drive = Date.now() - t;
  } finally {
    await browser.close();
  }

  const summary = summarise(results);
  const meta: RunMeta = {
    base,
    build: built.hash,
    firestore: emu.firestore,
    diagnosis: [emu.diagnosis, seeded.note].filter(Boolean).join("\n\n"),
    timings,
    because: selection.because,
    unmapped: selection.unmapped,
  };
  writeFileSync(
    join(outDir, "trace.json"),
    JSON.stringify({ summary, meta, results }, null, 2)
  );
  const report = renderReport(results, summary, meta);
  writeFileSync(join(outDir, "report.md"), report);
  log(
    `${summary.verdict.toUpperCase()}: ${summary.passed.length} passed, ` +
      `${summary.failed.length} failed, ${summary.notRun.length} not run, ` +
      `${summary.flaky.length} flaky. Report: ${join(outDir, "report.md")}`
  );
  return summary.exitCode;
}

if (process.argv[1] && /cli\.ts$/.test(process.argv[1])) {
  main().then(
    (code) => process.exit(code),
    (e: unknown) => {
      if (e instanceof RigError)
        console.error(
          `[verify] the rig could not start (${e.code}): ${e.message}`
        );
      else console.error(`[verify] ${(e as Error).stack ?? String(e)}`);
      process.exit(3);
    }
  );
}

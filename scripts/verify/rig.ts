/**
 * The verify rig: the Firebase emulators, the seeded accounts, an emulator
 * build of the app and a preview server, each started once and reused.
 *
 * Every piece is idempotent and keyed, so the second run of the skill
 * costs only the driving:
 * - the emulators are reused while the process this rig started still
 *   answers on their ports;
 * - the seed chain runs once per emulator lifetime and seed key (the seed
 *   scripts' contents and the local date: the seeds write "today" and
 *   "last week"); on a new key the emulators restart empty and are seeded
 *   again;
 * - the build runs only when its inputs changed (`build.json` holds a
 *   hash of the files under src/ and public/, the config and .env files
 *   around them, and the VITE_ values the build sees);
 * - the preview server is reused while it serves that build.
 *
 * Where state lives: the emulators are one per machine (their ports are),
 * so their state (`emulators.json`, its log, `seeded.json`, the signed-in
 * sessions) is kept in the git common dir, `<common>/verify-rig/`, which
 * every worktree of the clone shares; a second worktree reuses the first's
 * emulators as the rig's own rather than as strangers. The build, the
 * preview and the runs are per worktree, in `.verify/` (git-ignored).
 * `--down` stops what the rig started, and only that: a pid is killed only
 * when its command line is still the emulators' or the preview's, so a
 * pid recycled after a container restore is never touched.
 *
 * Every wait polls for the thing it waits on; nothing sleeps a fixed time.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, request } from "node:http";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import {
  AUTH_HOST,
  BASE_PATH,
  BUILD_ENV,
  FIREBASE_TOOLS,
  FIRESTORE_HOST,
  PROJECT,
  SEED_CHAIN,
  SEED_ENV,
  SEED_EXTRA_INPUTS,
  type Account,
} from "./rigConfig";

export const ROOT = resolve(import.meta.dirname, "..", "..");
export const STATE_DIR = join(ROOT, ".verify");
export const DIST_DIR = join(STATE_DIR, "dist");

/** The emulators' state, shared by every worktree of this clone. */
function sharedDir(): string {
  const out = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const dir = out.status === 0 ? out.stdout.trim() : "";
  if (!dir) return STATE_DIR;
  return join(isAbsolute(dir) ? dir : join(ROOT, dir), "verify-rig");
}
export const SHARED_DIR = sharedDir();

export type Log = (line: string) => void;

/** A failure the rig can name, with what to do about it. */
export class RigError extends Error {
  readonly code: "CHROMIUM" | "EMULATORS" | "SEED" | "BUILD" | "PREVIEW";
  constructor(code: RigError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

function readState<T>(name: string, dir = STATE_DIR): T | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, name), "utf8")) as T;
  } catch {
    return undefined;
  }
}

function writeState(name: string, value: unknown, dir = STATE_DIR): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), JSON.stringify(value, null, 2));
}

function alive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The command line of a running process, or undefined. */
function commandOf(pid: number): string | undefined {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
  } catch {
    const out = spawnSync("ps", ["-o", "command=", "-p", String(pid)], {
      encoding: "utf8",
    });
    return out.status === 0 ? out.stdout.trim() || undefined : undefined;
  }
}

export const EMULATOR_COMMAND = /emulators:start/;
export const PREVIEW_COMMAND = /\bvite\b.*\bpreview\b/;

/**
 * True when `pid` is alive AND still runs the command the rig started
 * there. A stored pid can outlive its process (a container restored from
 * a snapshot, a reboot) and be handed to something else.
 */
export function ours(pid: number | undefined, command: RegExp): boolean {
  if (!pid || !alive(pid)) return false;
  return command.test(commandOf(pid) ?? "");
}

/** Signals the process group the rig started at `pid` (and the process
 *  itself, if it leads no group). */
function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      /* already gone */
    }
  }
}

/**
 * Stops what the rig started at `pid`: SIGTERM, then SIGKILL if it is
 * still there after `graceMs`. Refuses a pid whose command line is no
 * longer `command`. Returns whether it stopped anything.
 */
async function stopOurs(
  pid: number,
  command: RegExp,
  graceMs: number,
  gone: () => Promise<boolean> = async () => !alive(pid)
): Promise<boolean> {
  if (!ours(pid, command)) return false;
  signalGroup(pid, "SIGTERM");
  if (await until(gone, graceMs)) return true;
  signalGroup(pid, "SIGKILL");
  await until(gone, 10_000);
  return true;
}

/** Status code of a request to a loopback URL, or 0 when nothing answers. */
export function probe(
  url: string,
  timeoutMs = 1500,
  method = "GET"
): Promise<number> {
  return new Promise((done) => {
    const req = request(url, { method, timeout: timeoutMs }, (res) => {
      res.resume();
      done(res.statusCode ?? 0);
    });
    req.on("timeout", () => {
      req.destroy();
      done(0);
    });
    req.on("error", () => done(0));
    req.end();
  });
}

/** Polls `check` until it is true, the deadline passes, or `abort` says
 *  the thing being waited on has died. */
async function until(
  check: () => Promise<boolean>,
  deadlineMs: number,
  abort: () => boolean = () => false,
  everyMs = 250
): Promise<boolean> {
  const end = Date.now() + deadlineMs;
  while (Date.now() < end) {
    if (await check()) return true;
    if (abort()) return false;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return check();
}

/* ── Preflight ─────────────────────────────────────────────────── */

export interface Preflight {
  java: number | null;
  chromium: string | undefined;
  firebase: string[];
  firestoreJarCached: boolean;
}

function javaMajor(): number | null {
  const out = spawnSync("java", ["-version"], { encoding: "utf8" });
  if (out.error) return null;
  const m = /version "(\d+)(?:\.(\d+))?/.exec(`${out.stderr}${out.stdout}`);
  if (!m) return null;
  /* "1.8.0" is Java 8. */
  return m[1] === "1" ? Number(m[2]) : Number(m[1]);
}

/**
 * The Chromium to drive: `PW_CHROMIUM` (the capture specs' override), else
 * the build this Playwright asks for, else the newest pre-installed one
 * under `PLAYWRIGHT_BROWSERS_PATH`. Cloud sandboxes ship a Chromium for a
 * different Playwright than the repo's, so the second is often missing.
 */
export async function findChromium(): Promise<string | undefined> {
  const override = process.env.PW_CHROMIUM;
  if (override) return existsSync(override) ? override : undefined;
  const { chromium } = await import("@playwright/test");
  const own = chromium.executablePath();
  if (own && existsSync(own)) return own;
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    "/opt/pw-browsers",
    join(homedir(), ".cache", "ms-playwright"),
  ].filter((r): r is string => !!r && existsSync(r));
  for (const root of roots) {
    const builds = readdirSync(root)
      .map((d) => /^chromium-(\d+)$/.exec(d))
      .filter((m): m is RegExpExecArray => !!m)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
    for (const b of builds) {
      for (const sub of ["chrome-linux64", "chrome-linux"]) {
        const exe = join(root, b[0], sub, "chrome");
        if (existsSync(exe)) return exe;
      }
    }
  }
  return undefined;
}

function firebaseCommand(): string[] {
  const own = spawnSync("firebase", ["--version"], { encoding: "utf8" });
  return own.status === 0 ? ["firebase"] : ["npx", "-y", FIREBASE_TOOLS];
}

function firestoreJarCached(): boolean {
  const dir = join(homedir(), ".cache", "firebase", "emulators");
  return (
    existsSync(dir) &&
    readdirSync(dir).some((f) => /^cloud-firestore-emulator-.*\.jar$/.test(f))
  );
}

export async function preflight(): Promise<Preflight> {
  return {
    java: javaMajor(),
    chromium: await findChromium(),
    firebase: firebaseCommand(),
    firestoreJarCached: firestoreJarCached(),
  };
}

/* ── Emulators ─────────────────────────────────────────────────── */

export interface Emulators {
  /** False when only Auth runs: signed-in features cannot. */
  firestore: boolean;
  /** Identifies this emulator lifetime, for the seed and sign-in caches;
   *  "external" when the rig did not start them. */
  lifetime: string;
  /** Why Firestore is missing, when it is. */
  diagnosis?: string;
}

interface EmulatorState {
  pid: number;
  startedAt: string;
  firestore: boolean;
  /** The worktree whose firebase.json and rules the emulators loaded. */
  root: string;
  diagnosis?: string;
}

const authUp = async () => (await probe(`http://${AUTH_HOST}/`)) === 200;
const firestoreUp = async () =>
  (await probe(`http://${FIRESTORE_HOST}/`)) === 200;

/** The rig's emulators, if the recorded process is still them. */
function ourEmulators(): EmulatorState | undefined {
  const state = readState<EmulatorState>("emulators.json", SHARED_DIR);
  return state && ours(state.pid, EMULATOR_COMMAND) ? state : undefined;
}

function startEmulators(
  only: string,
  firebase: string[],
  log: Log
): { pid: number; logPath: string; exited: () => boolean } {
  mkdirSync(SHARED_DIR, { recursive: true });
  const logPath = join(SHARED_DIR, "emulators.log");
  const fd = openSync(logPath, "w");
  const [cmd, ...args] = firebase;
  const child = spawn(
    cmd,
    [...args, "emulators:start", "--only", only, "--project", PROJECT],
    { cwd: ROOT, detached: true, stdio: ["ignore", fd, fd] }
  );
  closeSync(fd);
  let exited = false;
  child.on("exit", () => (exited = true));
  child.unref();
  log(`emulators: starting ${only} (pid ${child.pid}, log ${logPath})`);
  return { pid: child.pid ?? 0, logPath, exited: () => exited };
}

/** Names why the Firestore emulator would not start, from its log. */
export function diagnoseFirestore(logText: string): string {
  if (/storage\.googleapis\.com/.test(logText))
    return (
      "The Firestore emulator's jar could not be downloaded from " +
      "storage.googleapis.com (a cloud sandbox's egress may block that " +
      "host; do not route around it). Signed-in features need it: run " +
      "them through the verify-app CI workflow, or on a machine with the " +
      "jar in ~/.cache/firebase/emulators. Signed-out features still run."
    );
  if (/java/i.test(logText) && /version|not found|JAVA_HOME/i.test(logText))
    return "The Firestore emulator needs Java 21 or newer on PATH.";
  const tail = logText.trim().split("\n").slice(-5).join("\n");
  return `The Firestore emulator did not start. Its log ends:\n${tail}`;
}

/**
 * Brings the emulators up, or reuses the rig's own that already answer.
 * Wants Firestore when `firestore` is true; falls back to Auth alone,
 * with a diagnosis, when Firestore cannot start.
 */
export async function emulatorsUp(
  pre: Preflight,
  firestore: boolean,
  log: Log
): Promise<Emulators> {
  const state = ourEmulators();
  const [a, f] = await Promise.all([authUp(), firestoreUp()]);
  /* Firestore already failed to start in this rig's lifetime, and nothing
     has changed since (no jar has appeared): asking again costs seconds
     and gets the same answer, so reuse the Auth-only rig. */
  const knownMissing = a && !f && !!state?.diagnosis && !pre.firestoreJarCached;
  if (a && (f || !firestore || knownMissing)) {
    log(
      `emulators: reusing (auth ${a}, firestore ${f}` +
        (state ? "" : ", not started by this rig") +
        ")"
    );
    if (state && state.root !== ROOT)
      log(`emulators: started from ${state.root}; its firestore.rules apply`);
    return {
      firestore: f,
      lifetime: state?.startedAt ?? "external",
      diagnosis: f ? undefined : state?.diagnosis,
    };
  }
  if (a || f) {
    /* Half a rig someone else started: don't fight it for the ports. */
    if (!state)
      throw new RigError(
        "EMULATORS",
        `Only ${a ? "Auth" : "Firestore"} answers on its port, and this ` +
          "rig did not start it. Stop that emulator or start both."
      );
    await emulatorsDown(log);
  }

  if (firestore && (pre.java === null || pre.java < 21)) {
    const diagnosis =
      `The Firestore emulator needs Java 21 or newer (found ` +
      `${pre.java ?? "none"}). Signed-out features still run.`;
    log(`emulators: ${diagnosis}`);
    return startAuthOnly(pre, log, diagnosis);
  }
  if (firestore) {
    const run = startEmulators("auth,firestore", pre.firebase, log);
    const up = await until(
      async () => (await authUp()) && (await firestoreUp()),
      180_000,
      run.exited
    );
    if (up) {
      const startedAt = new Date().toISOString();
      writeState(
        "emulators.json",
        {
          pid: run.pid,
          startedAt,
          firestore: true,
          root: ROOT,
        } satisfies EmulatorState,
        SHARED_DIR
      );
      return { firestore: true, lifetime: startedAt };
    }
    const diagnosis = diagnoseFirestore(readFileSync(run.logPath, "utf8"));
    await stopOurs(run.pid, EMULATOR_COMMAND, 15_000);
    log(`emulators: Firestore unavailable. ${diagnosis}`);
    return startAuthOnly(pre, log, diagnosis);
  }
  return startAuthOnly(pre, log);
}

async function startAuthOnly(
  pre: Preflight,
  log: Log,
  diagnosis?: string
): Promise<Emulators> {
  const run = startEmulators("auth", pre.firebase, log);
  const up = await until(authUp, 120_000, run.exited);
  if (!up)
    throw new RigError(
      "EMULATORS",
      `The Auth emulator did not start. See ${run.logPath}.`
    );
  const startedAt = new Date().toISOString();
  writeState(
    "emulators.json",
    {
      pid: run.pid,
      startedAt,
      firestore: false,
      root: ROOT,
      diagnosis,
    } satisfies EmulatorState,
    SHARED_DIR
  );
  return { firestore: false, lifetime: startedAt, diagnosis };
}

export async function emulatorsDown(log: Log): Promise<void> {
  const state = readState<EmulatorState>("emulators.json", SHARED_DIR);
  if (state) {
    const portsClosed = async () => !(await authUp()) && !(await firestoreUp());
    if (await stopOurs(state.pid, EMULATOR_COMMAND, 30_000, portsClosed))
      log(`emulators: stopped (pid ${state.pid})`);
    else if (alive(state.pid))
      log(`emulators: pid ${state.pid} is no longer the emulators; left alone`);
  }
  for (const f of ["emulators.json", "seeded.json"])
    rmSync(join(SHARED_DIR, f), { force: true });
  for (const f of readdirSafe(SHARED_DIR))
    if (/^auth-/.test(f)) rmSync(join(SHARED_DIR, f), { force: true });
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/* ── Seeds ─────────────────────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");

/** Today on the machine's clock, as the seeds count days. */
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * What the seeded data depends on: the seed scripts, the files they read
 * and the local date (they write "today", "this week" and "eight weeks
 * ago"). A run on a new key reseeds an emptied emulator.
 */
export function seedKey(now = new Date()): string {
  const h = createHash("sha256");
  h.update(localDate(now));
  const scripts = join(ROOT, "scripts");
  const files = [
    ...readdirSafe(scripts)
      .filter((f) => /^seed-.*\.ts$/.test(f))
      .sort()
      .map((f) => join("scripts", f)),
    ...SEED_EXTRA_INPUTS,
  ];
  for (const rel of files) {
    const abs = join(ROOT, rel);
    h.update(`${rel}\0`);
    if (existsSync(abs)) h.update(readFileSync(abs));
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  for (const s of SEED_CHAIN) h.update(`${s}\0${pkg.scripts[s] ?? ""}\n`);
  return h.digest("hex").slice(0, 16);
}

export interface SeedResult {
  emu: Emulators;
  ms: number;
  /** The key the signed-in sessions are valid for. */
  key: string;
  /** Said in the report when the data was not seeded by this run's rig. */
  note?: string;
}

/**
 * Runs the capture job's seed chain once per emulator lifetime and seed
 * key. A lifetime seeded under another key (the seeds changed, or the
 * day did) restarts the emulators empty first: the seeds add documents
 * dated from today, and running them over yesterday's would mix the two.
 * Emulators the rig did not start are never seeded unless `seedExternal`.
 */
export async function ensureSeeded(
  pre: Preflight,
  emu: Emulators,
  opts: { firestore: boolean; seedExternal: boolean },
  log: Log
): Promise<SeedResult> {
  const key = seedKey();
  if (!emu.firestore) return { emu, ms: 0, key };
  if (emu.lifetime === "external" && !opts.seedExternal) {
    const note =
      "The emulators were running already and this rig did not start " +
      "them, so it did not seed them; the signed-in features read whatever " +
      "they hold. Stop them, or pass --seed to seed them anyway.";
    log(`seed: skipped. ${note}`);
    return { emu, ms: 0, key: `external-${key}`, note };
  }
  const done = readState<{ lifetime: string; key: string }>(
    "seeded.json",
    SHARED_DIR
  );
  if (done && done.lifetime === emu.lifetime && done.key === key) {
    log("seed: already seeded for this emulator lifetime and seed key");
    return { emu, ms: 0, key };
  }
  let current = emu;
  if (done && done.lifetime === emu.lifetime) {
    log("seed: the seeds or the day changed; restarting the emulators empty");
    await emulatorsDown(log);
    current = await emulatorsUp(pre, opts.firestore, log);
    if (!current.firestore) return { emu: current, ms: 0, key };
  }
  const started = Date.now();
  for (const script of SEED_CHAIN) {
    const t = Date.now();
    const out = spawnSync("npm", ["run", "--silent", script], {
      cwd: ROOT,
      env: { ...process.env, ...SEED_ENV },
      encoding: "utf8",
    });
    if (out.status !== 0)
      throw new RigError(
        "SEED",
        `${script} failed:\n${`${out.stdout}${out.stderr}`.trim().split("\n").slice(-15).join("\n")}`
      );
    log(`seed: ${script} ${Date.now() - t} ms`);
  }
  writeState("seeded.json", { lifetime: current.lifetime, key }, SHARED_DIR);
  return { emu: current, ms: Date.now() - started, key };
}

/* ── Build ─────────────────────────────────────────────────────── */

const BUILD_INPUTS = [
  "src",
  "public",
  "scripts/art",
  "scripts/ios",
  "scripts/first-paint-fonts.ts",
  "scripts/verify/vite.verify.config.ts",
  "index.html",
  "vite.config.ts",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.app.json",
  /* `vite build --mode=test` reads these. */
  ".env",
  ".env.local",
  ".env.test",
  ".env.test.local",
];

/**
 * Variables that change what `vite.config.ts` builds (a Capacitor bundle,
 * the Hosting base path) or that it refuses to build with (the App Check
 * debug token). The verify build is the emulator web build, whatever the
 * shell that started it has set.
 */
export const BUILD_ENV_REMOVED = [
  "HOSTING_TARGET",
  "CAPACITOR_BUILD",
  "VITE_APP_CHECK_DEBUG_TOKEN",
] as const;

/** The build's environment: the shell's, less the variables above, with
 *  the emulator values on top. */
export function buildEnv(
  base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, ...BUILD_ENV };
  for (const k of BUILD_ENV_REMOVED) delete env[k];
  return env;
}

/**
 * A hash of the build's inputs: the files by path, size and modification
 * time (public/ holds hundreds of megabytes of art, too much to read on
 * every run, and an edit moves the time; a checkout that moves times
 * without changing content costs one rebuild, never a stale one), and
 * every VITE_ value the build will see.
 */
export function buildHash(env: NodeJS.ProcessEnv = buildEnv()): string {
  const h = createHash("sha256");
  for (const [k, v] of Object.entries(env)
    .filter(([k]) => k.startsWith("VITE_"))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    h.update(`${k}=${v ?? ""}\n`);
  const visit = (rel: string) => {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) return;
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const name of readdirSync(abs).sort()) visit(join(rel, name));
    } else {
      h.update(`${rel}\0${st.size}\0${st.mtimeMs}\n`);
    }
  };
  for (const input of BUILD_INPUTS) visit(input);
  return h.digest("hex").slice(0, 16);
}

/** Builds the app against the emulators into `.verify/dist`, unless the
 *  last build had the same inputs. Returns the build's hash. */
export function build(log: Log, force = false): { hash: string; ms: number } {
  const env = buildEnv();
  const hash = buildHash(env);
  const last = readState<{ hash: string }>("build.json");
  if (
    !force &&
    last?.hash === hash &&
    existsSync(join(DIST_DIR, "index.html"))
  ) {
    log(`build: reusing ${hash}`);
    return { hash, ms: 0 };
  }
  const started = Date.now();
  log(`build: ${hash} (vite build --mode=test)`);
  /* A failed build must not leave the last build's state claiming this
     output; the hash is written only after the output is whole. */
  rmSync(join(STATE_DIR, "build.json"), { force: true });
  /* Take the links out before Vite empties the folder, so emptying it can
     never reach through one into public/. */
  if (existsSync(DIST_DIR))
    for (const name of readdirSync(DIST_DIR)) {
      const at = join(DIST_DIR, name);
      if (lstatSync(at).isSymbolicLink()) unlinkSync(at);
    }
  const out = spawnSync(
    "npx",
    [
      "vite",
      "build",
      "--config",
      join(ROOT, "scripts", "verify", "vite.verify.config.ts"),
      "--mode=test",
      "--outDir",
      DIST_DIR,
      "--emptyOutDir",
    ],
    { cwd: ROOT, env, encoding: "utf8" }
  );
  if (out.status !== 0)
    throw new RigError(
      "BUILD",
      `vite build failed:\n${`${out.stdout}${out.stderr}`.trim().split("\n").slice(-20).join("\n")}`
    );
  linkPublic();
  writeState("build.json", { hash });
  return { hash, ms: Date.now() - started };
}

/**
 * Links each entry of public/ into the build output, which the verify
 * build does not copy (`vite.verify.config.ts`). The links point at the
 * reviewed files; nothing writes through them, because the verify build
 * leaves out the one step that rewrites files in the output (the form
 * frames' shrinking).
 */
export function linkPublic(): void {
  const pub = join(ROOT, "public");
  for (const name of readdirSync(pub)) {
    const at = join(DIST_DIR, name);
    if (!existsSync(at)) symlinkSync(join(pub, name), at);
  }
}

/* ── Preview ───────────────────────────────────────────────────── */

interface PreviewState {
  pid: number;
  port: number;
  hash: string;
}

function freePort(preferred: number): Promise<number> {
  const tryPort = (port: number) =>
    new Promise<number>((done, fail) => {
      const srv = createServer();
      srv.once("error", fail);
      srv.listen(port, "127.0.0.1", () => {
        const got = (srv.address() as { port: number }).port;
        srv.close(() => done(got));
      });
    });
  return tryPort(preferred).catch(() => tryPort(0));
}

export const baseUrl = (port: number) => `http://127.0.0.1:${port}${BASE_PATH}`;

/** Serves `.verify/dist` with `vite preview`, reusing a server that
 *  already serves this build. Returns the app's base URL. */
export async function preview(hash: string, log: Log): Promise<string> {
  const state = readState<PreviewState>("preview.json");
  if (
    state &&
    state.hash === hash &&
    ours(state.pid, PREVIEW_COMMAND) &&
    (await probe(baseUrl(state.port))) === 200
  ) {
    log(`preview: reusing port ${state.port}`);
    return baseUrl(state.port);
  }
  if (state) await stopOurs(state.pid, PREVIEW_COMMAND, 5_000);
  const port = await freePort(4173);
  mkdirSync(STATE_DIR, { recursive: true });
  const fd = openSync(join(STATE_DIR, "preview.log"), "w");
  const child = spawn(
    "npx",
    [
      "vite",
      "preview",
      "--mode=test",
      "--outDir",
      DIST_DIR,
      "--port",
      String(port),
      "--strictPort",
      "--host",
      "127.0.0.1",
    ],
    { cwd: ROOT, detached: true, stdio: ["ignore", fd, fd] }
  );
  closeSync(fd);
  let exited = false;
  child.on("exit", () => (exited = true));
  child.unref();
  const up = await until(
    async () => (await probe(baseUrl(port))) === 200,
    60_000,
    () => exited
  );
  if (!up)
    throw new RigError(
      "PREVIEW",
      `vite preview did not serve ${baseUrl(port)}. See .verify/preview.log.`
    );
  writeState("preview.json", {
    pid: child.pid ?? 0,
    port,
    hash,
  } satisfies PreviewState);
  log(`preview: ${baseUrl(port)} (pid ${child.pid})`);
  return baseUrl(port);
}

export async function previewDown(log: Log): Promise<void> {
  const state = readState<PreviewState>("preview.json");
  if (state) {
    if (await stopOurs(state.pid, PREVIEW_COMMAND, 5_000))
      log(`preview: stopped (pid ${state.pid})`);
    else if (alive(state.pid))
      log(`preview: pid ${state.pid} is no longer the preview; left alone`);
  }
  rmSync(join(STATE_DIR, "preview.json"), { force: true });
}

/** The logs a run's report should carry, where they exist. */
export function rigLogs(): string[] {
  return [
    join(SHARED_DIR, "emulators.log"),
    join(STATE_DIR, "preview.log"),
  ].filter((p) => existsSync(p));
}

/* ── Signed-in sessions ────────────────────────────────────────── */

/** An account's signed-in browser state, valid for one emulator lifetime
 *  and seed key (a reseed recreates the accounts). */
export function authStatePath(
  account: Account,
  lifetime: string,
  key: string
): { path: string; valid: boolean } {
  const path = join(SHARED_DIR, `auth-${account}.json`);
  const stamp = readState<{ lifetime: string; key: string }>(
    `auth-${account}.key.json`,
    SHARED_DIR
  );
  return {
    path,
    valid:
      existsSync(path) &&
      lifetime !== "external" &&
      stamp?.lifetime === lifetime &&
      stamp?.key === key,
  };
}

export function rememberAuthState(
  account: Account,
  lifetime: string,
  key: string
): void {
  writeState(`auth-${account}.key.json`, { lifetime, key }, SHARED_DIR);
}

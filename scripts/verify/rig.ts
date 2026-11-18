/**
 * The verify rig: the Firebase emulators, the seeded account, an emulator
 * build of the app and a preview server, each started once and reused.
 *
 * Every piece is idempotent and keyed, so the second run of the skill
 * costs only the driving:
 * - the emulators are reused when their ports answer;
 * - the seed chain runs once per emulator lifetime (`seeded.json` holds
 *   the lifetime it seeded);
 * - the build runs only when its inputs changed (`build.json` holds a
 *   hash of every file under src/ and public/ and the config around them);
 * - the preview server is reused while it serves that build.
 *
 * State lives in `.verify/` at the repo root (git-ignored). `--down`
 * stops what the rig started.
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
import { join, resolve } from "node:path";
import {
  AUTH_HOST,
  BASE_PATH,
  BUILD_ENV,
  FIREBASE_TOOLS,
  FIRESTORE_HOST,
  PROJECT,
  SEED_CHAIN,
  SEED_ENV,
} from "./rigConfig";

export const ROOT = resolve(import.meta.dirname, "..", "..");
export const STATE_DIR = join(ROOT, ".verify");
export const DIST_DIR = join(STATE_DIR, "dist");

export type Log = (line: string) => void;

/** A failure the rig can name, with what to do about it. */
export class RigError extends Error {
  readonly code: "CHROMIUM" | "EMULATORS" | "SEED" | "BUILD" | "PREVIEW";
  constructor(code: RigError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

function readState<T>(name: string): T | undefined {
  try {
    return JSON.parse(readFileSync(join(STATE_DIR, name), "utf8")) as T;
  } catch {
    return undefined;
  }
}

function writeState(name: string, value: unknown): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(join(STATE_DIR, name), JSON.stringify(value, null, 2));
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

/** Status code of a GET to a loopback URL, or 0 when nothing answers. */
export function probe(url: string, timeoutMs = 1500): Promise<number> {
  return new Promise((done) => {
    const req = request(url, { method: "GET", timeout: timeoutMs }, (res) => {
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
  /** Identifies this emulator lifetime, for the seed and sign-in caches. */
  lifetime: string;
  /** Why Firestore is missing, when it is. */
  diagnosis?: string;
}

interface EmulatorState {
  pid: number;
  startedAt: string;
  firestore: boolean;
  diagnosis?: string;
}

const authUp = async () => (await probe(`http://${AUTH_HOST}/`)) === 200;
const firestoreUp = async () =>
  (await probe(`http://${FIRESTORE_HOST}/`)) === 200;

function startEmulators(
  only: string,
  firebase: string[],
  log: Log
): { pid: number; logPath: string; exited: () => boolean } {
  mkdirSync(STATE_DIR, { recursive: true });
  const logPath = join(STATE_DIR, "emulators.log");
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
 * Brings the emulators up, or reuses the ones already answering. Wants
 * Firestore when `firestore` is true; falls back to Auth alone, with a
 * diagnosis, when Firestore cannot start.
 */
export async function emulatorsUp(
  pre: Preflight,
  firestore: boolean,
  log: Log
): Promise<Emulators> {
  const state = readState<EmulatorState>("emulators.json");
  const [a, f] = await Promise.all([authUp(), firestoreUp()]);
  /* Firestore already failed to start in this rig's lifetime, and nothing
     has changed since (no jar has appeared): asking again costs seconds
     and gets the same answer, so reuse the Auth-only rig. */
  const knownMissing =
    a &&
    !f &&
    !!state?.diagnosis &&
    alive(state.pid) &&
    !pre.firestoreJarCached;
  if (a && (f || !firestore || knownMissing)) {
    const lifetime = state && alive(state.pid) ? state.startedAt : "external";
    log(`emulators: reusing (auth ${a}, firestore ${f})`);
    return {
      firestore: f,
      lifetime,
      diagnosis: f ? undefined : state?.diagnosis,
    };
  }
  if (a || f) {
    /* Half a rig someone else started: don't fight it for the ports. */
    if (!(state && alive(state.pid)))
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
      writeState("emulators.json", {
        pid: run.pid,
        startedAt,
        firestore: true,
      } satisfies EmulatorState);
      return { firestore: true, lifetime: startedAt };
    }
    const diagnosis = diagnoseFirestore(readFileSync(run.logPath, "utf8"));
    if (alive(run.pid)) killGroup(run.pid);
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
  writeState("emulators.json", {
    pid: run.pid,
    startedAt,
    firestore: false,
    diagnosis,
  } satisfies EmulatorState);
  return { firestore: false, lifetime: startedAt, diagnosis };
}

function killGroup(pid: number): void {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

export async function emulatorsDown(log: Log): Promise<void> {
  const state = readState<EmulatorState>("emulators.json");
  if (state && alive(state.pid)) {
    killGroup(state.pid);
    await until(
      async () => !(await authUp()) && !(await firestoreUp()),
      30_000
    );
    log(`emulators: stopped (pid ${state.pid})`);
  }
  for (const f of [
    "emulators.json",
    "seeded.json",
    "auth-state.json",
    "auth-state.key.json",
  ])
    rmSync(join(STATE_DIR, f), { force: true });
}

/* ── Seeds ─────────────────────────────────────────────────────── */

/** Runs the capture job's seed chain once per emulator lifetime. */
export function seed(emu: Emulators, log: Log): number {
  if (!emu.firestore) return 0;
  const done = readState<{ lifetime: string }>("seeded.json");
  if (done && done.lifetime === emu.lifetime && emu.lifetime !== "external") {
    log("seed: already seeded for this emulator lifetime");
    return 0;
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
  writeState("seeded.json", { lifetime: emu.lifetime });
  return Date.now() - started;
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
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.app.json",
];

/**
 * A hash of the build's inputs by path, size and modification time:
 * public/ holds hundreds of megabytes of art, too much to read on every
 * run, and an edit moves the time. A checkout that moves times without
 * changing content costs one rebuild, never a stale one.
 */
export function buildHash(): string {
  const h = createHash("sha256");
  h.update(JSON.stringify(BUILD_ENV));
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
  const hash = buildHash();
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
    {
      cwd: ROOT,
      env: { ...process.env, ...BUILD_ENV },
      encoding: "utf8",
    }
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
 * reviewed files; nothing writes through them, because the build's
 * frame-shrinking step runs before they exist and finds no frames.
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
    alive(state.pid) &&
    (await probe(baseUrl(state.port))) === 200
  ) {
    log(`preview: reusing port ${state.port}`);
    return baseUrl(state.port);
  }
  if (state && alive(state.pid)) killGroup(state.pid);
  const port = await freePort(4173);
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

export function previewDown(log: Log): void {
  const state = readState<PreviewState>("preview.json");
  if (state && alive(state.pid)) {
    killGroup(state.pid);
    log(`preview: stopped (pid ${state.pid})`);
  }
  rmSync(join(STATE_DIR, "preview.json"), { force: true });
}

/** The signed-in browser state's file, valid for one emulator lifetime. */
export function authStatePath(lifetime: string): {
  path: string;
  valid: boolean;
} {
  const path = join(STATE_DIR, "auth-state.json");
  const key = readState<{ lifetime: string }>("auth-state.key.json");
  return {
    path,
    valid:
      existsSync(path) && key?.lifetime === lifetime && lifetime !== "external",
  };
}

export function rememberAuthState(lifetime: string): void {
  writeState("auth-state.key.json", { lifetime });
}

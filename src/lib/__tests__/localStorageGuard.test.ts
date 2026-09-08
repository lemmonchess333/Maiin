/**
 * Single-door enforcement for local storage — the storage twin of
 * `firestoreWriteGuard`.
 *
 * `src/lib/localStore.ts` is the only module allowed to touch the
 * `localStorage` global. Storage can be absent (SSR, a Node test), refuse
 * the getter itself (a browser with site data blocked throws before any
 * method is reached), or throw per call (quota, private mode). A raw call
 * site has to remember all three; with the try/catch hand-rolled at over a
 * hundred sites some forgot it — the theme write on sign-out would have
 * thrown in private mode — and each one that remembered swallowed the
 * failure differently, so no caller could tell a refused write from a
 * landed one.
 *
 * The invariant: no reference to `localStorage` in any `.ts`/`.tsx` under
 * `src/`, nor any `.js` under `public/`, outside two structural exceptions:
 *   - `src/lib/localStore.ts` — DEFINES the door.
 *   - `public/init.js` — applies the theme before any bundle can load, so it
 *     cannot import the door. It reads one key and nothing else.
 *
 * Comments and quoted strings are stripped before matching so prose about
 * storage does not trip the scan. ALLOWLIST is empty on purpose: a second
 * door would put the failure modes back in two places — extend the wrapper
 * instead. `localStorageUidScoping.test.ts` is the companion: it walks the
 * door's call sites and asks whether each per-account key carries a uid.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

const SINGLE_DOOR = "src/lib/localStore.ts";
const BOOT_SCRIPT = "public/init.js";
/** Deliberately empty — see the header. A new entry is a reviewed decision. */
const ALLOWLIST: ReadonlySet<string> = new Set<string>();

const STORAGE_GLOBAL = /\blocalStorage\b/;

function sourceFiles(dir: string, exts: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__" || name === "test")
        continue;
      out.push(...sourceFiles(full, exts));
      continue;
    }
    if (!exts.test(name) || /\.(test|spec)\.[jt]sx?$/.test(name)) continue;
    out.push(full);
  }
  return out;
}

/** Comments and double/single-quoted strings are not references. Template
 *  literals are left alone: their `${…}` holes are real code. */
function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (s) => " ".repeat(s.length))
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

const files = [
  ...sourceFiles(resolve(repoRoot, "src"), /\.tsx?$/),
  ...sourceFiles(resolve(repoRoot, "public"), /\.js$/),
].map((f) => relative(repoRoot, f));

describe("single-door enforcement (no raw localStorage outside localStore.ts)", () => {
  it("scans a sane number of files (the walk isn't silently empty)", () => {
    expect(files.length).toBeGreaterThan(300);
    expect(files).toContain(SINGLE_DOOR);
    expect(files).toContain(BOOT_SCRIPT);
  });

  it("no file outside the door references the localStorage global", () => {
    const offenders: string[] = [];
    for (const rel of files) {
      if (rel === SINGLE_DOOR || rel === BOOT_SCRIPT || ALLOWLIST.has(rel))
        continue;
      const src = stripCommentsAndStrings(
        readFileSync(resolve(repoRoot, rel), "utf8")
      );
      src.split("\n").forEach((line, i) => {
        if (STORAGE_GLOBAL.test(line)) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(
      offenders,
      `Raw localStorage reference(s) found. Route through readString / ` +
        `writeString / remove / readJson / writeJson (src/lib/localStore.ts) — ` +
        `the door never throws and reports whether a write landed. There is ` +
        `no allow-list to extend; if the door cannot express the need, ` +
        `extend the door.\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("the door is still the door — localStore.ts references the global", () => {
    const src = stripCommentsAndStrings(
      readFileSync(resolve(repoRoot, SINGLE_DOOR), "utf8")
    );
    expect(STORAGE_GLOBAL.test(src)).toBe(true);
  });

  it("the boot script reads only the theme key, raw, because it runs before any bundle", () => {
    const raw = readFileSync(resolve(repoRoot, BOOT_SCRIPT), "utf8");
    const code = stripCommentsAndStrings(raw);
    expect(code.match(/\blocalStorage\b/g)).toHaveLength(1);
    expect(raw).toContain('localStorage.getItem("tropos-dark-mode")');
  });
});

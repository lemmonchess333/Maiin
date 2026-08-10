/**
 * Every `SettingsSection` in the analytics vocabulary must be emitted by
 * something.
 *
 * `settingsAnalytics.ts` declares a CLOSED union of settings sections so a
 * dashboard can map each event to a known control. A closed vocabulary is
 * only worth having if its members are actually reachable — and two of them
 * were not. `ai_usage` and `data_storage` sat in the union with no page
 * anywhere, because the Set1.2 nested-settings migration dropped the two
 * components that would have reported them.
 *
 * That is a silent failure in the direction nobody checks: the dashboard
 * shows zero for those sections, and zero is indistinguishable from "nobody
 * opens this". `TrackSettingsSectionView` itself was reached by nothing at
 * all, so in fact NO section reported, and the whole
 * `settings_section_viewed` event had never fired for any user.
 *
 * `SettingsIndex` already carries a `migrated` flag whose comment says it
 * exists so "any future un-nested section is forced to make an explicit
 * routing decision rather than silently 404ing". It could not catch this,
 * because the failure was omission from the catalogue rather than a false
 * flag — the section simply had no row to carry a flag on. This closes that
 * from the other end: the union is the source of truth, and every member
 * has to be wired.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

/** Roots that could plausibly render a tracked settings section. */
const CONSUMER_ROOTS = ["src/pages", "src/components"];

function isTestPath(p: string): boolean {
  return (
    p.includes("__tests__") || p.includes("/test/") || /\.test\.tsx?$/.test(p)
  );
}

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (!/\.tsx?$/.test(full) || isTestPath(full)) continue;
    out.push(full);
  }
  return out;
}

/** Members of the `SettingsSection` union, read from the declaration. */
function unionMembers(): string[] {
  const src = readFileSync(
    resolve(repoRoot, "src/lib/settingsAnalytics.ts"),
    "utf8"
  );
  const m = src.match(/export type SettingsSection =([\s\S]*?);/);
  if (!m) throw new Error("SettingsSection union not found");
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

const MEMBERS = unionMembers();
const SOURCES = CONSUMER_ROOTS.flatMap((r) => walk(resolve(repoRoot, r)))
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");

describe("settings section analytics coverage", () => {
  it("reads a plausible union", () => {
    // A regex that silently matched nothing would make the real assertion
    // vacuously pass — the failure mode these guards exist to avoid.
    expect(MEMBERS.length).toBeGreaterThan(8);
    expect(MEMBERS).toContain("account");
  });

  it("every union member is emitted by some rendered surface", () => {
    // `section="x"` — the prop `SettingsSection` and
    // `TrackSettingsSectionView` both take.
    const missing = MEMBERS.filter(
      (m) => !new RegExp(`section="${m}"`).test(SOURCES)
    );
    expect(
      missing,
      `These sections are in the analytics union but nothing reports them, ` +
        `so their dashboard number is a permanent zero that looks like ` +
        `data. Either wire a surface to emit them, or remove them from the ` +
        `union in settingsAnalytics.ts.`
    ).toEqual([]);
  });

  it("no SETTINGS surface emits a section the union does not declare", () => {
    // The other direction: a typo'd or retired id produces events no
    // dashboard can map — the same problem wearing a different hat.
    //
    // Scoped to the settings surfaces rather than all of src, because
    // `section="…"` is a prop in THREE unrelated vocabularies — Home's
    // `home_section_viewed` and the programme's own tracker use it too.
    // The first version of this assertion scanned everything and tried to
    // subtract the others with a hand-written allow-list; it was wrong on
    // its first run (it had never heard of `day_stepper` or
    // `session_card`). Scoping by directory is the fact, the allow-list
    // was a guess.
    const settingsOnly = CONSUMER_ROOTS.flatMap((r) =>
      walk(resolve(repoRoot, r))
    )
      .filter((p) => p.includes("/settings/"))
      .map((p) => readFileSync(p, "utf8"))
      .join("\n");

    const emitted = [
      ...new Set(
        [...settingsOnly.matchAll(/section="([a-z_]+)"/g)].map((m) => m[1])
      ),
    ];
    // Guard the guard: a directory filter that matched nothing would make
    // this pass while checking nothing at all.
    expect(emitted.length).toBeGreaterThan(0);
    expect(emitted.filter((e) => !MEMBERS.includes(e))).toEqual([]);
  });
});

/**
 * Component reachability — the third level the other two gates can't see.
 *
 * `mirrorCrossTestGate` asks whether a MODULE is imported by production
 * code. `symbolReachability` asks whether an exported FUNCTION has a
 * caller outside its own module. Neither looks at `src/components`:
 * DOMAIN_ROOTS is `src/lib`, `src/features`, `src/hooks`, `functions/lib`.
 * So a whole React component that nothing renders reads as fine, and ten
 * of them had accumulated.
 *
 * A component nobody renders is not a neutral cost. Every one of these is
 * indistinguishable, from the inside, from a shipped feature: it has a
 * header, imports, props, sometimes a passing test suite. The failure mode
 * is not wasted bytes — it is that reading it tells you something false
 * about what the app does.
 *
 * The four shapes that showed up, all of them worth naming because they
 * look different from each other and identical to working code:
 *
 *   superseded  — `BarcodeScanner` is a complete barcode implementation.
 *                 Barcode scanning WORKS; it runs in `FoodCameraModal`,
 *                 which does its own `import("@zxing/browser")`. Anyone
 *                 opening `BarcodeScanner.tsx` to fix a scanning bug would
 *                 be editing dead code. Same shape as the repo's #1
 *                 recurring mistake, one level up: the copy you read is
 *                 not the copy that runs.
 *
 *   unwired     — `NextBadgeCard` carries a header citing Kivetz 2006 and
 *                 Nunes & Drèze 2006 on goal-gradient retention, and
 *                 renders nowhere. The research is real, the component is
 *                 built, and no user has ever seen it.
 *
 *   half-staged — `HeartRateZonesSection` describes itself as "the
 *                 web-visible half of the HR groundwork". It is the ONLY
 *                 writer of `profile.maxHeartRate`, which three surfaces
 *                 read (`DayActionSheet`, `ProgrammeRunSection`,
 *                 `useHeartRate`). Not rendering it means the field can
 *                 never be set, so all three permanently fall back to the
 *                 Tanaka age estimate — and the web-visible half is not
 *                 visible, which is the exact failure CLAUDE.md's
 *                 "leave the seam, web-visible" rule exists to prevent.
 *
 *   silent-off  — `TrackSettingsSectionView` wraps a Settings section to
 *                 emit `settings_section_viewed`. Nothing wraps anything,
 *                 so that event has never fired. Instrumentation that
 *                 reads as present and emits nothing is worse than none:
 *                 the dashboard shows zero and that looks like data.
 *
 * A test suite does NOT make a component reachable, and three of these
 * have one. `CommentSection` is reached only by its own spec, which
 * asserts a visibility-DENIAL property — a security test passing against
 * code no user can get to. That is the same trap CLAUDE.md records for
 * deleted specs, inverted: there the prose claimed coverage that was gone;
 * here the coverage is real and the subject is unreachable.
 *
 * So: a component under `src/components` must be referenced by something
 * outside itself that is not a test, or be listed below with a reason.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

/** Where components live. */
const COMPONENT_ROOT = "src/components";
/** Everything that could plausibly render one. */
const CONSUMER_ROOTS = ["src", "e2e"];

/**
 * Components with nothing rendering them.
 *
 * DELETE-ONLY as a LIST: entries come off, none go on. It is a TRIAGE
 * QUEUE, not a delete list — the disposition of each is a product call
 * (wire it up, or drop it and its tests), and the four shapes above want
 * opposite answers. Deleting `HeartRateZonesSection` would remove the only
 * way to ever set a field three surfaces read; wiring up `BarcodeScanner`
 * would give the app two barcode implementations.
 *
 * Do not add entries. A new orphan means a component was built and never
 * rendered, which is the thing this exists to catch while it is still one
 * commit old rather than ten of them later.
 */
const KNOWN_ORPHAN_COMPONENTS: { path: string; why: string }[] = [
  {
    path: "src/components/settings/TrackSettingsSectionView.tsx",
    why: "silent-off — wraps a Settings section to emit settings_section_viewed. Nothing wraps anything, so the event has never fired and the dashboard's zero looks like data.",
  },
];

const PINNED = new Set(KNOWN_ORPHAN_COMPONENTS.map((o) => o.path));

function isTestPath(p: string): boolean {
  return (
    p.includes("__tests__") ||
    p.includes("/test/") ||
    /\.test\.tsx?$/.test(p) ||
    /\.spec\.tsx?$/.test(p)
  );
}

function walk(dir: string, keep: (p: string) => boolean): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      out.push(...walk(full, keep));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (keep(full)) out.push(full);
  }
  return out;
}

/**
 * Strip comments before matching. The symbolReachability gate learned this
 * the hard way: a name mentioned in prose counted as a use, which made it
 * UNDER-report. Every entry above would have been hidden by a single
 * mention in a doc comment — `HybridBalanceCard`'s only reference in the
 * whole repo is exactly that.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const componentFiles = walk(
  resolve(repoRoot, COMPONENT_ROOT),
  (p) => /\.tsx$/.test(p) && !isTestPath(p)
);

const consumers = CONSUMER_ROOTS.flatMap((root) =>
  walk(resolve(repoRoot, root), (p) => !isTestPath(p))
).map((p) => ({ path: p, text: stripComments(readFileSync(p, "utf8")) }));

function unrendered(): string[] {
  const out: string[] = [];
  for (const file of componentFiles) {
    const rel = relative(repoRoot, file);
    const name = rel
      .split("/")
      .pop()!
      .replace(/\.tsx$/, "");
    const pattern = new RegExp(`\\b${name}\\b`);
    const referenced = consumers.some(
      (c) => c.path !== file && pattern.test(c.text)
    );
    if (!referenced) out.push(rel);
  }
  return out;
}

describe("component reachability (src/components)", () => {
  it("scans a plausible number of components", () => {
    // A collapsed scan (bad root, changed extension) would make every
    // assertion below vacuously pass. Anchor on the shape, not a count
    // that rots — CLAUDE.md's note on file counts that drifted 3-7×.
    expect(componentFiles.length).toBeGreaterThan(100);
    expect(consumers.length).toBeGreaterThan(200);
  });

  it("no NEW component is rendered by nothing", () => {
    const offenders = unrendered().filter((p) => !PINNED.has(p));
    expect(
      offenders,
      `Component(s) that nothing renders. A component nobody renders is ` +
        `indistinguishable from a shipped feature when you read it — that ` +
        `is the cost, not the bytes. Either render it, or delete it with ` +
        `its tests. Do NOT add it to KNOWN_ORPHAN_COMPONENTS; that list is ` +
        `delete-only.`
    ).toEqual([]);
  });

  it("every pinned orphan is still an orphan", () => {
    // Staleness guard, matching symbolReachability. A pinned entry that
    // got wired up must come OFF the list, or the list slowly becomes a
    // set of claims nobody has checked — which is how the prose this gate
    // exists to catch got written in the first place.
    const stillOrphaned = new Set(unrendered());
    const revived = [...PINNED].filter((p) => !stillOrphaned.has(p));
    expect(
      revived,
      `Pinned as unrendered but now referenced — delete these entries from ` +
        `KNOWN_ORPHAN_COMPONENTS.`
    ).toEqual([]);
  });

  it("every pinned entry names a real file and gives a reason", () => {
    for (const { path, why } of KNOWN_ORPHAN_COMPONENTS) {
      expect(
        componentFiles.some((f) => relative(repoRoot, f) === path),
        `${path} is pinned but does not exist — remove the entry`
      ).toBe(true);
      // "No reason given" is the one state the symbolReachability doctrine
      // says must never persist: write the reason or delete the module.
      expect(why.length, `${path} needs a real reason`).toBeGreaterThan(40);
    }
  });
});

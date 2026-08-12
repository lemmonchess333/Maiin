/**
 * Hook-surface reachability — the level below `symbolReachability`.
 *
 * The gates stack, and each was written after the level beneath it shipped
 * something dead:
 *
 *   mirrorCrossTestGate   a dead MODULE   (the scheduledRunCompletion.js port)
 *   symbolReachability    a dead EXPORT   inside a live module
 *   this                  a dead PROPERTY on a live hook's return object
 *
 * A hook is imported, so its module is reachable. Its `useX` function is
 * called, so its export is reachable. Neither gate looks inside the object
 * it returns — and that object is the hook's actual API surface. The
 * instance that prompted this: `useAudioCues.announcePB` returned a
 * personal-best announcement no caller ever invoked, so the cue never fired
 * for anyone, and both gates read it as live (#1980). Chasing the rest of
 * the set found `useWorkouts.calculateExerciseCalories` — a SECOND calorie
 * estimator competing with the canonical MET formula, itself feeding a
 * THIRD in `exercises.ts` that had six tests of its own (#1981).
 *
 * DETECTION IS SHALLOW, deliberately, and matches `symbolReachability`'s
 * stated preference: "prefer the miss to the false alarm." It reads the
 * LAST top-level `return { … }` of each hook file and asks whether each
 * property name appears, comments and string literals stripped, in any
 * non-test file other than its own. A hook whose return is built some other
 * way is simply not scanned. Under-reporting is invisible; over-reporting
 * would fail CI on live code and get the gate deleted.
 *
 * Tests are excluded from the "used" side ON PURPOSE. A property only its
 * own suite touches is exactly the case worth surfacing — `saveWorkout` is
 * a documented pinned orphan, and `graduationToken` turned out to be a
 * feature whose UI half was never built.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const isTest = (p: string) => /__tests__|\.test\.|\.spec\./.test(p);

function walk(dir: string, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!/node_modules|dist|\.git/.test(e.name)) walk(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Comments and quoted strings: neither is a call site. Crude on purpose —
 *  it over-eats, which can only ever remove a match and push toward
 *  reporting MORE orphans (a visible failure, never a silent pass). */
function stripInert(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:[^`\\]|\\.)*`/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, " ")
    .replace(/'(?:[^'\\]|\\.)*'/g, " ");
}

/**
 * Accepted for now — each with the reason, because an unexplained pin is
 * how a gate turns into a rubber stamp. Format `path:property`.
 */
const PINNED_HOOK_PROPERTIES = [
  // Documented in CLAUDE.md as a pinned orphan: the offline-queue row calls
  // it out by name ("`useWorkouts.saveWorkout` is a pinned orphan") while
  // explaining that no WORKOUT surface routes through the offline queue.
  // Deliberate, and not mine to reverse.
  "src/hooks/useWorkouts.ts:saveWorkout",

  // Written, never read — but they are documented fields of the exported
  // `EffectiveTargets` interface that three components take as a prop type,
  // and `baseTarget` is referenced throughout that module's prose as the
  // pre-adaptive figure. Removing them is an interface change with a
  // readable-model cost, not a cleanup; held for a deliberate call.
  "src/hooks/useEffectiveTargets.ts:baseTarget",
  "src/hooks/useEffectiveTargets.ts:isRunDay",
];

interface HookProp {
  file: string;
  prop: string;
}

function collectReturnedProperties(): HookProp[] {
  const out: HookProp[] = [];
  for (const abs of walk(resolve(repoRoot, "src/hooks"))) {
    if (isTest(abs)) continue;
    const rel = abs.slice(repoRoot.length + 1);
    if (!/use[A-Z]|Provider/.test(rel)) continue;
    const src = stripInert(readFileSync(abs, "utf8"));
    const blocks = [...src.matchAll(/\n {2}return \{\n([\s\S]*?)\n {2}\};/g)];
    if (!blocks.length) continue;
    const body = blocks[blocks.length - 1][1];
    for (const m of body.matchAll(/^\s{4}([A-Za-z_$][\w$]*)\s*[,:]/gm)) {
      out.push({ file: rel, prop: m[1] });
    }
  }
  return out;
}

const PROPS = collectReturnedProperties();
const SOURCES = walk(resolve(repoRoot, "src"))
  .filter((p) => !isTest(p))
  .map((p) => ({ rel: p.slice(repoRoot.length + 1), text: stripInert(readFileSync(p, "utf8")) }));

function isUsedOutside(hp: HookProp): boolean {
  const re = new RegExp(`\\b${hp.prop}\\b`);
  return SOURCES.some((s) => s.rel !== hp.file && re.test(s.text));
}

describe("hook return surfaces are reachable", () => {
  it("scans enough of the hook layer to mean something", () => {
    /* Guards the guard twice over. A regex that stopped matching would
       make the sweep below assert nothing, and the failure would look
       exactly like success. */
    expect(PROPS.length).toBeGreaterThan(100);
    expect(new Set(PROPS.map((p) => p.file)).size).toBeGreaterThan(15);
  });

  it("detects an obviously-live property as reachable", () => {
    /* The positive control. If `isUsedOutside` were broken — a bad regex,
       an over-eager strip — everything would read as an orphan and the
       pinned list would silently become the whole surface. `loading` is
       consumed all over the app. */
    const loading = PROPS.find((p) => p.prop === "loading");
    expect(loading).toBeDefined();
    expect(isUsedOutside(loading!)).toBe(true);
  });

  it("has no unpinned dead properties", () => {
    const orphans = PROPS.filter((p) => !isUsedOutside(p))
      .map((p) => `${p.file}:${p.prop}`)
      .filter((k) => !PINNED_HOOK_PROPERTIES.includes(k))
      .sort();
    expect(orphans).toEqual([]);
  });

  it("keeps the pinned list honest — every pin is still an orphan", () => {
    /* A pin that has since been wired up is stale, and a stale pin is how
       the list grows into a place where dead code hides. Anything here
       that became reachable should be REMOVED from the list, not left. */
    const live = PINNED_HOOK_PROPERTIES.filter((k) => {
      const [file, prop] = k.split(":");
      return PROPS.some(
        (p) => p.file === file && p.prop === prop && isUsedOutside(p)
      );
    });
    expect(live).toEqual([]);
  });

  it("pins only properties that still exist", () => {
    // A renamed or deleted property leaves a pin pointing at nothing, which
    // reads as accepted debt that is actually already resolved.
    const missing = PINNED_HOOK_PROPERTIES.filter((k) => {
      const [file, prop] = k.split(":");
      return !PROPS.some((p) => p.file === file && p.prop === prop);
    });
    expect(missing).toEqual([]);
  });
});

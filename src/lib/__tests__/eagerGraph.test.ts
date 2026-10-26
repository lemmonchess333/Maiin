/**
 * What a signed-out visitor downloads before the login form paints.
 *
 * Every module reachable from `src/App.tsx` through STATIC imports lands
 * in the eager `index` chunk, which blocks first paint. A dynamic
 * `import()` does not — that is the whole difference between code the
 * login screen pays for and code it does not.
 *
 * Measured on 2026-09-07 against a 4x-CPU / 1.6 Mbps profile (a mid-tier
 * phone on 4G): FCP 3,308 ms, with 1,619 KB of JS+CSS ahead of it. The
 * eager chunk was 542 KB of app code, and attributing it by source
 * showed what a signed-out visitor was actually paying for: the whole
 * programme engine, the 152-exercise database, the run scheduler, the
 * streaks engine — and 81 KB of French profanity, because App.tsx
 * mounts `ShareComposerSheet` at the root for signed-out users too.
 *
 * None of that renders until someone signs in. This test is what keeps
 * it out. It walks the static graph and fails when a module on the
 * DEFERRED list becomes eagerly reachable again — with the import chain
 * that did it, because "something now imports the exercise database" is
 * unactionable without the path.
 *
 * Adding a heavy dependency to a root-level provider is the usual way
 * this regresses, and it is invisible in review: the diff shows one
 * import line, and the cost lands on every cold start.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";

const ROOT = process.cwd();
const SRC = resolve(ROOT, "src");
const ENTRY = resolve(SRC, "App.tsx");

/**
 * Modules that must stay off the pre-paint path, and why each is heavy.
 * A path here is matched against the repo-relative module path.
 */
const DEFERRED: { path: string; kb: number; why: string }[] = [
  {
    path: "src/lib/exercises.ts",
    kb: 105,
    why: "the 152-exercise database — needed by the workout surfaces, never by Login",
  },
  {
    path: "src/features/program/programEngine.ts",
    kb: 107,
    why: "the periodised programme generator",
  },
  {
    path: "src/features/program/runScheduler.ts",
    kb: 66,
    why: "the goal-driven run scheduler",
  },
  {
    path: "src/features/program/variationBank.ts",
    kb: 31,
    why: "the exercise variation database",
  },
  {
    path: "src/lib/firebase.ts",
    kb: 369,
    why:
      "the Firestore + Storage handles. Importing it pulls the firebase-db " +
      "chunk, which the login screen never reads a document from — take " +
      "`auth` from @/lib/firebaseApp instead",
  },
  {
    path: "src/lib/profanityFilter.ts",
    kb: 81,
    why: "pulls leo-profanity, whose bundled French word list alone is 81 KB",
  },
];

/**
 * Static `import ... from "x"` / `export ... from "x"`.
 *
 * Two things are deliberately NOT matched, because neither ships code:
 * `import("x")` (the deferral this file protects), and a whole-statement
 * `import type` / `export type`, which TypeScript erases. Missing the
 * second cost a false positive on the first run — `runResumeStorage`
 * takes `RunConfig` as a type and was reported as dragging the run
 * scheduler into the eager chunk. A guard that sends someone refactoring
 * against a cost that is not there is worse than no guard.
 *
 * An INLINE `import { type A, b }` still counts: `b` is real.
 */
const STATIC_IMPORT =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^;'"]*?\sfrom\s*)?["']([^"']+)["']/g;

function resolveSpecifier(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = resolve(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // node_modules — not walked; the DEFERRED list is app code
  for (const cand of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (existsSync(cand) && !cand.endsWith("/")) {
      try {
        if (readFileSync(cand)) return cand;
      } catch {
        /* a directory — keep trying */
      }
    }
  }
  return null;
}

/** Eagerly reachable modules, each mapped to the chain that reached it. */
function eagerGraph(entry = ENTRY): Map<string, string[]> {
  const seen = new Map<string, string[]>([[entry, [relative(ROOT, entry)]]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    const chain = seen.get(file)!;
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    /* Strip dynamic imports before matching: `lazyRetry(() => import("x"))`
       is precisely the deferral this test exists to protect, and its
       specifier must not be mistaken for a static one. */
    const staticOnly = src.replace(/\bimport\s*\(/g, "DYNAMIC_IMPORT(");
    STATIC_IMPORT.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = STATIC_IMPORT.exec(staticOnly))) {
      const target = resolveSpecifier(m[1], file);
      if (!target || seen.has(target)) continue;
      seen.set(target, [...chain, relative(ROOT, target)]);
      queue.push(target);
    }
  }
  return seen;
}

describe("eager import graph — what Login pays for", () => {
  const graph = eagerGraph();
  const reachable = new Set(
    [...graph.keys()].map((f) => relative(ROOT, f).replace(/\\/g, "/"))
  );

  it("walks a real graph, so an empty result cannot pass this file", () => {
    /* A resolver bug would make every assertion below vacuously true, so
       this is a floor rather than a target — the graph SHRINKING is the
       point of the file, and it has (77 modules before Firestore was
       deferred, 49 after). The containment check is the load-bearing half;
       the number only rules out a graph that collapsed to nothing. */
    expect(reachable.size).toBeGreaterThan(25);
    expect(reachable).toContain("src/lib/auth.tsx");
    expect(reachable).toContain("src/lib/firebaseApp.ts");
  });

  for (const { path, kb, why } of DEFERRED) {
    it(`does not eagerly reach ${path} (~${kb} KB)`, () => {
      const hit = [...graph.entries()].find(
        ([f]) => relative(ROOT, f).replace(/\\/g, "/") === path
      );
      expect(
        hit ? hit[1].join("\n    → ") : null,
        `${path} (~${kb} KB) is now reachable from App.tsx through STATIC ` +
          `imports, so it ships in the eager chunk and delays first paint ` +
          `for signed-out visitors. It is ${why}.\n` +
          `Import chain:\n    `
      ).toBeNull();
    });
  }
});

/**
 * Packages the eager graph imports statically, each mapped to the first
 * app module that does. The walk above stops at node_modules; this asks
 * the files it reached what they pull in.
 */
function eagerPackages(graph: Map<string, string[]>): Map<string, string> {
  const packages = new Map<string, string>();
  for (const file of graph.keys()) {
    let src: string;
    try {
      src = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const staticOnly = src.replace(/\bimport\s*\(/g, "DYNAMIC_IMPORT(");
    STATIC_IMPORT.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = STATIC_IMPORT.exec(staticOnly))) {
      const spec = m[1];
      if (spec.startsWith("@/") || spec.startsWith(".")) continue;
      if (!packages.has(spec)) packages.set(spec, relative(ROOT, file));
    }
  }
  return packages;
}

/** Packages that must stay off the pre-paint path, and why. */
const DEFERRED_PACKAGES: { spec: string; why: string }[] = [
  {
    spec: "firebase/messaging",
    why:
      "the web push SDK. Only a web push gesture and the signed-in " +
      "foreground listener use it, and the iPhone app never does (its push " +
      "is the native plugin); load it with import() where it is used",
  },
  {
    spec: "firebase/analytics",
    why:
      "the web analytics SDK. analyticsProvider starts it once the app " +
      "has, on the web only; nothing waits on it to draw",
  },
  {
    spec: "framer-motion",
    why:
      "the animation library, the largest chunk a new visitor would " +
      "fetch for nothing: Login and the legal pages draw without it. " +
      "Signed-in surfaces get its MotionConfig from MotionRoot, which " +
      "App.tsx loads lazily; render motion inside a lazy page, not at " +
      "the root",
  },
];

describe("eager import graph — packages Login pays for", () => {
  const packages = eagerPackages(eagerGraph());

  it("sees packages at all, so an empty result cannot pass this file", () => {
    expect(packages.has("react")).toBe(true);
    expect(packages.has("firebase/auth")).toBe(true);
  });

  for (const { spec, why } of DEFERRED_PACKAGES) {
    it(`does not eagerly import ${spec}`, () => {
      expect(
        packages.get(spec) ?? null,
        `${spec} is statically imported by an eagerly reachable module, ` +
          `so it loads on every cold start. It is ${why}.`
      ).toBeNull();
    });
  }
});

describe("Home programme loading", () => {
  it("reads the current plan without importing its editor or the race generator", () => {
    const graph = eagerGraph(resolve(SRC, "pages/Home.tsx"));
    expect(graph.has(resolve(SRC, "features/program/useHomeProgram.tsx"))).toBe(
      true
    );
    for (const path of [
      "features/program/useProgram.ts",
      "features/program/runScheduler.ts",
      "features/program/HomeProgramController.tsx",
    ]) {
      expect(
        graph.get(resolve(SRC, path)),
        `Home eagerly imports ${path}`
      ).toBeUndefined();
    }
  });
});

describe("the word filter's lists", () => {
  it("load only through wordFilter.ts, never with a static import", () => {
    /* About 100 KB of word lists. A static import anywhere puts them in
       that screen's first paint (they rode in through the Social tab, a
       run's finish screen, setup and the root share sheet); a composer
       takes the filter from useWordFilter or loadWordFilter instead. */
    const target = resolve(SRC, "lib/profanityFilter.ts");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, name.name);
        if (name.isDirectory()) {
          if (name.name !== "__tests__") walk(path);
        } else if (/\.tsx?$/.test(name.name) && !/\.test\./.test(name.name))
          files.push(path);
      }
    };
    walk(SRC);
    expect(files.length).toBeGreaterThan(200);
    const offenders = files.filter((file) => {
      const staticOnly = readFileSync(file, "utf8").replace(
        /\bimport\s*\(/g,
        "DYNAMIC_IMPORT("
      );
      STATIC_IMPORT.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = STATIC_IMPORT.exec(staticOnly)))
        if (resolveSpecifier(m[1], file) === target) return true;
      return false;
    });
    expect(offenders.map((f) => relative(ROOT, f))).toEqual([]);
  });
});

describe("Home's closed sheets", () => {
  it("draws Home without a sheet that is closed when it first draws", () => {
    /* The bottom sheet is vaul and Radix, and the badge modal is its own
       13 KB; none is open on Home's first paint. Load a new one with
       lazyRetry, as DayActionSheet is. */
    const graph = eagerGraph(resolve(SRC, "pages/Home.tsx"));
    for (const path of [
      "components/ui/BottomSheet.tsx",
      "features/streaks/BadgeEarnedModal.tsx",
    ]) {
      const chain = graph.get(resolve(SRC, path));
      expect(
        chain ? chain.join("\n    → ") : null,
        `Home eagerly imports ${path}:\n    `
      ).toBeNull();
    }
  });
});

describe("on-demand exercise guides", () => {
  it("keeps unopened exercise guides off the Programme import graph", () => {
    const graph = eagerGraph(resolve(SRC, "pages/Program.tsx"));
    expect(
      graph.has(resolve(SRC, "components/program/ExercisePicker.tsx"))
    ).toBe(true);
    expect(
      graph.get(resolve(SRC, "components/ExerciseFormContent.tsx"))
    ).toBeUndefined();
    expect(graph.get(resolve(SRC, "lib/bodyRig.ts"))).toBeUndefined();
  });

  it("renders the released still guides without importing the legacy renderer", () => {
    const graph = eagerGraph(
      resolve(SRC, "components/ExerciseFormContent.tsx")
    );
    expect(graph.has(resolve(SRC, "components/ExerciseFormFrames.tsx"))).toBe(
      true
    );
    expect(graph.has(resolve(SRC, "lib/formGuides.ts"))).toBe(true);
    expect(graph.get(resolve(SRC, "lib/bodyRig.ts"))).toBeUndefined();
    expect(
      graph.get(resolve(SRC, "components/LegacyExerciseRigDemo.tsx"))
    ).toBeUndefined();
  });
});

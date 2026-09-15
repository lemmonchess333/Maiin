/**
 * What production actually takes from the client PI engine.
 *
 * `performanceEngineParity.cross.test.ts` describes the client copy as an
 * oracle rather than something users see a number from. That is a claim about
 * import graphs, and the claim it replaced — that the client engine backed
 * "Home/analytics previews" — was false for long enough to be quoted in a PR.
 * Prose about reachability rots exactly like prose about behaviour, so this
 * asserts it instead.
 *
 * Two things would break the reasoning, and both should be loud:
 *
 *   - a component importing a SCORING export. That creates a second number
 *     on screen, derived client-side, free to disagree with the persisted one
 *     the server wrote. Whoever does it should have to say why here.
 *   - the seed script losing its call. `scripts/seed-rich-user.ts` is what
 *     gives the capture rig's Home hero a Performance value; without it the
 *     frames go empty and the parity seam loses its second reason to exist.
 *
 * Deliberately NOT a general reachability gate — `symbolReachability` owns
 * that, and it counts a test as a caller by design. This is narrower: which
 * symbols cross from this one module into shipped code.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

/** Every `.ts`/`.tsx` under a root, excluding tests and the engine itself. */
function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__" || entry === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (/\.test\.tsx?$/.test(entry)) continue;
      if (full.endsWith(join("src", "lib", "performanceEngine.ts"))) continue;
      out.push(full);
    }
  };
  walk(resolve(repoRoot, root));
  return out;
}

/** Named imports pulled from the client engine by one file. */
function importedSymbols(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const names: string[] = [];
  // Matches the three spellings in use: "@/lib/performanceEngine",
  // "./performanceEngine", "../src/lib/performanceEngine".
  const re =
    /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["'][^"']*performanceEngine["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    for (const raw of m[1].split(",")) {
      const name = raw
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0];
      if (name) names.push(name);
    }
  }
  return names;
}

function importsAcross(roots: string[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const root of roots) {
    for (const file of sourceFiles(root)) {
      const names = importedSymbols(file);
      if (names.length) {
        found.set(file.slice(repoRoot.length + 1), names.sort());
      }
    }
  }
  return found;
}

describe("client PI engine — production consumers", () => {
  it("the app imports only the two non-scoring helpers", () => {
    /* Asserted as the whole map, not as "does not include scorePerformance":
       a new scoring import under a name nobody thought to ban would pass the
       negative form. */
    expect(Object.fromEntries(importsAcross(["src"]))).toEqual({
      "src/hooks/useWeeklyReview.ts": ["weekKeyMinusN"],
      "src/lib/performanceDocFields.ts": ["computeLoadBand"],
    });
  });

  it("neither helper scores anything", () => {
    /* The point of the pair above is that they are a date function and a
       band classifier over an already-computed score — so no surface in the
       app derives a Performance Index of its own. */
    const engine = readFileSync(
      resolve(repoRoot, "src/lib/performanceEngine.ts"),
      "utf8"
    );
    /* Bounded at the next module-level declaration, not a fixed character
       window — a window long enough to cover the function also spills into
       its neighbours, which is how the first draft of this failed on
       `computeLiftLoadScore` sitting underneath. */
    const body = (name: string) => {
      const at = engine.indexOf(`export function ${name}`);
      expect(at, `${name} should be an exported function`).toBeGreaterThan(-1);
      const rest = engine.slice(at + `export function ${name}`.length);
      const end = rest.search(/\n(?:export |\/\* |\/\/ ── )/);
      return end === -1 ? rest : rest.slice(0, end);
    };
    expect(body("weekKeyMinusN")).not.toMatch(
      /Score|PI_WEIGHTS|performanceIndex|computeBaseline/
    );
    expect(body("computeLoadBand")).not.toMatch(
      /PI_WEIGHTS|performanceIndex|computeBaseline/
    );
  });

  it("the seed script is the one non-test caller of the scoring pipeline", () => {
    /* It manufactures perf docs so the capture rig's Home hero renders a
       number. If this moves, the frames go empty — and the reasoning in
       performanceEngineParity's header needs rewriting, not just this line. */
    expect(Object.fromEntries(importsAcross(["scripts"]))).toEqual({
      "scripts/seed-rich-user.ts": ["computePerformanceIndex"],
    });
  });

  it("e2e specs compute no Performance Index of their own", () => {
    expect(Object.fromEntries(importsAcross(["e2e"]))).toEqual({});
  });
});

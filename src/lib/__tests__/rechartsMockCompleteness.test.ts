import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { globSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

/**
 * A wholesale `vi.mock("recharts", …)` must export every recharts symbol
 * the component it renders imports.
 *
 * This is the repo's own standing gotcha — "adding an import to a
 * component breaks any suite that mocks that module wholesale" — and it
 * is worse for recharts than for most modules, because the failure does
 * not surface at the import. A missing key makes the component read as
 * `undefined`, React throws at the JSX call site, and the message names
 * the ELEMENT rather than the mock, so the reader is sent to the chart
 * instead of to the fixture.
 *
 * It bit three times in one sitting:
 *
 *   `chartAxisLocalDrift`  when `RunningHistorySection` gained Cell + Tooltip
 *   `piAxisRoom`           when `PerformanceIndexChart` gained ReferenceArea
 *   `piAxisRoom`           and Line, in the same change
 *
 * Every one was caught by the full suite rather than by the touched
 * subset, which is the expensive way to find it — the component's own
 * tests pass, so nothing goes red until a run that costs six minutes.
 * This is the cheap way.
 *
 * SCOPE, stated rather than discovered later. The check follows DIRECT
 * imports only: a test file's own default imports of components under
 * `src/`, and those components' own `from "recharts"` lists. A test that
 * renders a page which renders a chart three levels down is not covered,
 * and covering it would need a module graph. All three real instances
 * were direct, which is the shape this exists for.
 *
 * Mocks built with `importOriginal` are exempt and stay that way: they
 * spread the real module, so they cannot be missing a symbol. That is the
 * pattern `runningSectionRange` uses, and the reason it survived a change
 * that broke its sibling.
 */

const ROOT = process.cwd();

/** The `vi.mock("recharts", …)` form that REPLACES the module. */
const FACTORY = /vi\.mock\(\s*["']recharts["']\s*,\s*(async\s*)?\(([^)]*)\)/;

/** Default imports from a path inside the repo — `../Foo`, `@/components/Foo`. */
const LOCAL_DEFAULT_IMPORT =
  /import\s+([A-Z][A-Za-z0-9_]*)\s+from\s+["'](\.{1,2}\/[^"']+|@\/[^"']+)["']/g;

/** A component's own recharts import list. */
const RECHARTS_IMPORT = /import\s*\{([\s\S]*?)\}\s*from\s*["']recharts["']/;

/**
 * The keys of the object a mock factory RETURNS.
 *
 * Brace-matched rather than regexed to a closing line: these factories
 * declare helpers (`const Pass = …`) before the return, and several of
 * their values are inline arrow components carrying their own braces, so
 * a lazy match stops in the wrong place and silently reports two keys for
 * a ten-key mock — a guard that passes by not looking.
 */
function mockedSymbols(src: string): string[] {
  const at = src.search(FACTORY);
  if (at === -1) return [];
  const ret = src.indexOf("return {", at);
  if (ret === -1) return [];
  let depth = 0;
  let end = -1;
  for (let i = src.indexOf("{", ret); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [];
  /* Comments come out BEFORE the split. These factories annotate their
     keys — the `chartAxisLocalDrift` mock explains why Cell and Tooltip
     are stubs right above them — and a block comment sitting in front of
     a key makes the segment start with `/`, so the key regex misses and
     the symbol reads as absent. That is how this guard's first run
     reported a missing `Cell` that was there all along: a checker whose
     own parse is wrong invents work, which is worse than one that finds
     nothing. A comma inside a comment would break the depth split the
     same way. */
  const body = stripComments(src.slice(src.indexOf("{", ret) + 1, end));
  const keys: string[] = [];
  let d = 0;
  let line = "";
  for (const ch of body) {
    if (ch === "{" || ch === "(" || ch === "[") d++;
    else if (ch === "}" || ch === ")" || ch === "]") d--;
    if (ch === "," && d === 0) {
      const m = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
      if (m) keys.push(m[1]);
      line = "";
      continue;
    }
    line += ch;
  }
  const last = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
  if (last) keys.push(last[1]);
  return keys;
}

/** Block and line comments out, newlines kept so nothing else shifts. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) =>
      "\n".repeat((m.match(/\n/g) || []).length)
    )
    .replace(/\/\/.*$/gm, "");
}

function resolveLocal(fromFile: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join(ROOT, "src", spec.slice(2))
    : resolve(dirname(fromFile), spec);
  for (const ext of [".tsx", ".ts"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

function rechartsImports(componentSrc: string): string[] {
  const m = componentSrc.match(RECHARTS_IMPORT);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.replace(/\/\/.*$/gm, "").trim())
    .map((s) => s.replace(/^type\s+/, ""))
    .filter((s) => s.length > 0 && /^[A-Za-z_$][\w$]*$/.test(s));
}

interface Case {
  test: string;
  component: string;
  mocked: string[];
  needed: string[];
}

function cases(): Case[] {
  const out: Case[] = [];
  for (const rel of globSync("src/**/__tests__/*.{ts,tsx}", { cwd: ROOT })) {
    const file = join(ROOT, rel);
    const src = readFileSync(file, "utf8");
    if (!FACTORY.test(src)) continue;
    // `importOriginal` factories spread the real module and cannot be short.
    if (
      /vi\.mock\(\s*["']recharts["']\s*,\s*async\s*\(\s*importOriginal/.test(
        src
      )
    )
      continue;
    const mocked = mockedSymbols(src);
    for (const m of src.matchAll(LOCAL_DEFAULT_IMPORT)) {
      const path = resolveLocal(file, m[2]);
      if (!path) continue;
      const needed = rechartsImports(readFileSync(path, "utf8"));
      if (needed.length === 0) continue;
      out.push({
        test: rel,
        component: path.slice(ROOT.length + 1),
        mocked,
        needed,
      });
    }
  }
  return out;
}

describe("a wholesale recharts mock exports what its component imports", () => {
  const found = cases();

  it("is looking at something", () => {
    /* A glob or a regex that matched nothing would make every assertion
       below vacuously true, which is the failure this file exists to
       stop one level down. */
    expect(found.length).toBeGreaterThanOrEqual(5);
    expect(found.map((c) => c.test)).toContain(
      "src/components/analytics/__tests__/piAxisRoom.test.tsx"
    );
  });

  it("reads the factory's keys, not a prefix of them", () => {
    /* The brace matcher's own guard. These factories declare helpers
       before the return and hold arrow components as values, so a naive
       match reports a handful of keys and the check passes by being
       blind. Every case must name at least the handful a chart needs. */
    for (const c of found) {
      expect(
        c.mocked.length,
        `${c.test}: parsed ${c.mocked.length} keys`
      ).toBeGreaterThanOrEqual(5);
    }
  });

  it("has no mock short of a symbol its component renders", () => {
    const short = found
      .map((c) => {
        const missing = c.needed.filter((s) => !c.mocked.includes(s));
        return missing.length
          ? `${c.test}\n  renders ${c.component}\n  missing: ${missing.join(", ")}`
          : null;
      })
      .filter(Boolean);
    expect(
      short,
      "A wholesale recharts mock is missing a symbol the component it " +
        "renders imports. The component will render `undefined` and React " +
        "will throw at the JSX call site, naming the element rather than " +
        "the mock. Add the symbol to the factory as a stub, or rebuild " +
        "the mock with `importOriginal` so it cannot go short again."
    ).toEqual([]);
  });
});

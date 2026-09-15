import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

/**
 * Half of this palette is stored as bare HSL TRIPLETS — `--muted-foreground`
 * is `240 3.8% 43%`, not a colour. That is deliberate: it is what lets
 * Tailwind build `text-muted-foreground/50` and lets a call site write
 * `hsl(var(--x) / 0.5)`. The cost is that `var(--muted-foreground)` on its
 * own is NOT a valid colour value. A JS style object that reaches for it
 * directly produces `color: 240 3.8% 43%`, the browser drops the whole
 * declaration, and the element silently keeps whatever it inherited.
 *
 * Nothing about that failure is visible: no console warning, no type
 * error, and a screenshot of an element that inherited its parent's
 * colour looks like a design choice. The Analytics adherence row shipped
 * its 50-80% band that way — it asked for muted and rendered as
 * foreground.
 *
 * So: inside `.ts` / `.tsx`, any `var(--token)` naming a triplet token
 * must sit inside an `hsl(…)`. Tokens whose stored value is already a
 * colour (`--ds-orange-500: #e87316`) or a non-colour (`--safe-top`,
 * `--font-mono`) are unaffected, which is why the triplet set is read
 * from the stylesheet rather than listed here — a token that changes
 * shape changes which rule applies to it, with no edit needed.
 */
const repoRoot = resolve(__dirname, "../../..");

/** `--name: 240 3.8% 43%;` — hue, saturation%, lightness%, nothing else. */
const TRIPLET = /^\s*[\d.]+\s+[\d.]+%\s+[\d.]+%\s*$/;

function tripletTokens(): Set<string> {
  const css = readFileSync(resolve(repoRoot, "src/index.css"), "utf8");
  const out = new Set<string>();
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g))
    if (TRIPLET.test(m[2])) out.add(m[1]);
  return out;
}

/** Comments stripped: a note that NAMES the bug ("`color: var(--x)` is
 *  invalid") is not the bug, and a gate that fails on its own
 *  documentation teaches people to stop writing the documentation. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Files where a bare `var(--x)` string is wrapped somewhere ELSE, so the
 *  shape is correct and this scan cannot see it. Each needs the site that
 *  does the wrapping named. */
const INDIRECT = new Map<string, string>([
  [
    "src/components/program/SessionCommandCard.tsx",
    "haloVar is interpolated into `hsl(${haloVar} / 0.18)` at its one use",
  ],
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (["__tests__", "test"].includes(name)) continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("HSL triplet tokens are always wrapped in hsl()", () => {
  it("no .ts/.tsx reaches a triplet token through a bare var()", () => {
    const triplets = tripletTokens();
    // The set must be non-empty, or this whole test passes vacuously —
    // a renamed stylesheet or a changed declaration shape would make it
    // green while checking nothing.
    expect(triplets.size).toBeGreaterThan(20);
    expect(triplets.has("muted-foreground")).toBe(true);
    expect(triplets.has("success-strong")).toBe(true);

    const offenders: string[] = [];
    for (const file of sourceFiles(resolve(repoRoot, "src"))) {
      const rel = relative(repoRoot, file);
      if (INDIRECT.has(rel)) continue;
      const src = code(readFileSync(file, "utf8"));
      for (const m of src.matchAll(/var\(--([a-z0-9-]+)\)/g)) {
        if (!triplets.has(m[1])) continue;
        const i = m.index ?? 0;
        // `hsl(` / `hsla(` immediately before, allowing no space —
        // `hsl( var(--x) )` is not a shape this codebase writes, and
        // accepting whitespace here would also accept `rgb(var(--x))`.
        if (/hsla?\($/.test(src.slice(Math.max(0, i - 5), i))) continue;
        const line = src.slice(0, i).split("\n").length;
        offenders.push(`${rel} var(--${m[1]}) (stripped line ${line})`);
      }
    }
    expect(
      offenders,
      "A triplet token is not a colour on its own — `color: var(--x)` is " +
        "invalid CSS and is dropped silently, leaving the inherited " +
        "colour. Wrap it: `hsl(var(--x))`."
    ).toEqual([]);
  });

  it("each indirect exemption really does wrap its token", () => {
    // Otherwise the exemption is a blanket skip: the file could stop
    // wrapping and the gate would keep passing because it stopped
    // looking. Cheap to hold, and it is the half an allow-list forgets.
    for (const [rel, why] of INDIRECT) {
      const src = code(readFileSync(resolve(repoRoot, rel), "utf8"));
      expect(/hsla?\(\$\{/.test(src), `${rel} — ${why}`).toBe(true);
    }
  });
});

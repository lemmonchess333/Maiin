/**
 * Sprint 0 — theme contract regression test.
 *
 * Catches the foundation-layer drift that ChatGPT's Chunk 2.D-style
 * audit flagged: Tailwind classes like `bg-destructive` /
 * `text-destructive` / `bg-destructive/10` only resolve correctly if
 * `src/index.css` exposes the corresponding `--color-*` mapping inside
 * its `@theme` block AND a matching HSL variable exists in `:root` /
 * `.dark`. Before Sprint 0, 28 usages of `*-destructive` classes
 * silently fell through because neither half existed.
 *
 * Plus: legacy `--ds-success` / `--ds-warning` / `--ds-error` in
 * `src/styles/tokens.css` MUST bridge to the new semantic variables
 * rather than ship a separate hardcoded red. Otherwise the
 * ToastProvider and `bg-destructive` consumers will drift.
 *
 * Plus: no source file may reference the undefined variable
 * `var(--text-muted)`. The correct token is `--muted-foreground`
 * (Tailwind class: `text-muted-foreground`).
 *
 * Implementation: text reads + substring assertions. Cheap. Doesn't
 * boot postcss or evaluate CSS — those would catch more but are
 * slower and the contract surface here is narrow enough that text
 * inspection is sufficient.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const indexCss = readFileSync(resolve(repoRoot, "src/index.css"), "utf8");
const tokensCss = readFileSync(
  resolve(repoRoot, "src/styles/tokens.css"),
  "utf8"
);

describe("Sprint 0 theme contract — @theme exposes semantic status colours", () => {
  // Pull out the @theme block so the assertions don't accidentally
  // pass on a stray reference in a comment further down the file.
  const themeStart = indexCss.indexOf("@theme");
  const themeOpen = indexCss.indexOf("{", themeStart);
  // Find the matching close brace.
  let depth = 1;
  let i = themeOpen + 1;
  while (i < indexCss.length && depth > 0) {
    if (indexCss[i] === "{") depth += 1;
    else if (indexCss[i] === "}") depth -= 1;
    i += 1;
  }
  const themeBlock = indexCss.slice(themeOpen + 1, i - 1);

  it("@theme exposes --color-destructive", () => {
    expect(themeBlock).toMatch(/--color-destructive\s*:/);
  });

  it("@theme exposes --color-destructive-foreground", () => {
    expect(themeBlock).toMatch(/--color-destructive-foreground\s*:/);
  });

  it("@theme exposes --color-destructive-bg", () => {
    expect(themeBlock).toMatch(/--color-destructive-bg\s*:/);
  });

  it("@theme exposes --color-success / --color-success-foreground / --color-success-bg", () => {
    expect(themeBlock).toMatch(/--color-success\s*:/);
    expect(themeBlock).toMatch(/--color-success-foreground\s*:/);
    expect(themeBlock).toMatch(/--color-success-bg\s*:/);
  });

  it("@theme exposes --color-warning / --color-warning-foreground / --color-warning-bg", () => {
    expect(themeBlock).toMatch(/--color-warning\s*:/);
    expect(themeBlock).toMatch(/--color-warning-foreground\s*:/);
    expect(themeBlock).toMatch(/--color-warning-bg\s*:/);
  });
});

describe("Sprint 0 theme contract — :root + .dark define the underlying variables", () => {
  // :root and .dark each get their own HSL definitions. Extract the
  // blocks so assertions are scoped (not, say, accidentally matching
  // the @theme bridge or a comment).
  function extractBlock(anchor: string): string {
    // Match the rule SELECTOR followed by `{` (allowing whitespace),
    // not a casual mention of the selector inside a comment. Without
    // this anchor an `@theme` comment mentioning ".dark" would
    // hijack the search and the function would return the wrong
    // block (whichever rule comes next in source order).
    const pattern = new RegExp(
      `${anchor.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\{`
    );
    const m = pattern.exec(indexCss);
    if (!m) return "";
    const open = indexCss.indexOf("{", m.index);
    let depth = 1;
    let i = open + 1;
    while (i < indexCss.length && depth > 0) {
      if (indexCss[i] === "{") depth += 1;
      else if (indexCss[i] === "}") depth -= 1;
      i += 1;
    }
    return indexCss.slice(open + 1, i - 1);
  }
  const rootBlock = extractBlock(":root");
  const darkBlock = extractBlock(".dark");

  const required = [
    "--destructive",
    "--destructive-foreground",
    "--destructive-bg",
    "--success",
    "--success-foreground",
    "--success-bg",
    "--warning",
    "--warning-foreground",
    "--warning-bg",
  ];

  for (const name of required) {
    it(`:root defines ${name}`, () => {
      const pattern = new RegExp(`${name.replace(/-/g, "\\-")}\\s*:`);
      expect(rootBlock).toMatch(pattern);
    });
    it(`.dark overrides ${name}`, () => {
      const pattern = new RegExp(`${name.replace(/-/g, "\\-")}\\s*:`);
      expect(darkBlock).toMatch(pattern);
    });
  }

  it("the .dark destructive-foreground flips to dark (so text on the bright red filled surface stays readable)", () => {
    // Dark destructive uses hue 0 84% 60% — a bright red. The same
    // hue is used for both `text-destructive` and `bg-destructive`.
    // On dark mode, `text-destructive-foreground` must be a DARK
    // colour (so white-on-red doesn't blow out, and dark-on-red
    // stays readable on the filled button). The chosen value is
    // approximately 240 10% 3.9% — same dark navy as :root's
    // --foreground.
    expect(darkBlock).toMatch(
      /--destructive-foreground\s*:\s*240\s+10%\s+3\.9%/
    );
  });
});

describe("DS1 sport-colour token contract — --running / --lifting bridge + fixed value", () => {
  // Re-extract the blocks (the Sprint 0 helpers are scoped to their own
  // describe). Same brace-balanced extraction.
  function block(anchor: string): string {
    const pattern = new RegExp(
      `${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`
    );
    const m = pattern.exec(indexCss);
    if (!m) return "";
    const open = indexCss.indexOf("{", m.index);
    let depth = 1;
    let i = open + 1;
    while (i < indexCss.length && depth > 0) {
      if (indexCss[i] === "{") depth += 1;
      else if (indexCss[i] === "}") depth -= 1;
      i += 1;
    }
    return indexCss.slice(open + 1, i - 1);
  }
  const themeBlock = block("@theme");
  const rootBlock = block(":root");
  const darkBlock = block(".dark");

  it("@theme exposes --color-running and --color-lifting", () => {
    expect(themeBlock).toMatch(/--color-running\s*:/);
    expect(themeBlock).toMatch(/--color-lifting\s*:/);
  });

  for (const name of ["--running", "--lifting"]) {
    it(`:root defines ${name}`, () => {
      expect(rootBlock).toMatch(
        new RegExp(`${name.replace(/-/g, "\\-")}\\s*:`)
      );
    });
    it(`.dark defines ${name}`, () => {
      expect(darkBlock).toMatch(
        new RegExp(`${name.replace(/-/g, "\\-")}\\s*:`)
      );
    });
  }

  // Load-bearing invariant: sport colours are a FIXED identity — the
  // SAME in light + dark. A future agent must NOT silently theme-split
  // them; that would make coral/purple drift between modes and diverge
  // from the chart/gradient sites that still consume the single THEME
  // hex. Pin the identity so the decision can't be quietly reversed.
  for (const name of ["--running", "--lifting"]) {
    it(`${name} is identical in :root and .dark (fixed sport colour)`, () => {
      const re = new RegExp(`${name.replace(/-/g, "\\-")}\\s*:\\s*([^;]+);`);
      const r = re.exec(rootBlock)?.[1].trim();
      const d = re.exec(darkBlock)?.[1].trim();
      expect(r).toBeTruthy();
      expect(d).toBe(r);
    });
  }
});

describe("Sprint 0 theme contract — tokens.css bridges legacy --ds-* to semantic variables", () => {
  it("--ds-error bridges to hsl(var(--destructive))", () => {
    expect(tokensCss).toMatch(/--ds-error\s*:\s*hsl\(var\(--destructive\)\)/);
  });
  it("--ds-error-bg bridges to hsl(var(--destructive-bg))", () => {
    expect(tokensCss).toMatch(
      /--ds-error-bg\s*:\s*hsl\(var\(--destructive-bg\)\)/
    );
  });
  it("--ds-success bridges to hsl(var(--success))", () => {
    expect(tokensCss).toMatch(/--ds-success\s*:\s*hsl\(var\(--success\)\)/);
  });
  it("--ds-success-bg bridges to hsl(var(--success-bg))", () => {
    expect(tokensCss).toMatch(
      /--ds-success-bg\s*:\s*hsl\(var\(--success-bg\)\)/
    );
  });
  it("--ds-warning bridges to hsl(var(--warning))", () => {
    expect(tokensCss).toMatch(/--ds-warning\s*:\s*hsl\(var\(--warning\)\)/);
  });
  it("--ds-warning-bg bridges to hsl(var(--warning-bg))", () => {
    expect(tokensCss).toMatch(
      /--ds-warning-bg\s*:\s*hsl\(var\(--warning-bg\)\)/
    );
  });

  it("tokens.css no longer ships hardcoded hex values for the four status colours", () => {
    // Defence-in-depth — bridge replaced the hex values, not added
    // alongside them. If a future commit accidentally restored the
    // hex it would silently override the hsl() bridge (last
    // declaration wins).
    // Be specific so we don't false-positive on other --ds-* colour
    // hex values (the brand palette is hex, intentionally).
    const lines = tokensCss.split("\n");
    const offenders: string[] = [];
    for (const line of lines) {
      const m = line.match(
        /--ds-(success|warning|error)(?:-bg)?\s*:\s*#[0-9a-fA-F]/
      );
      if (m) offenders.push(line.trim());
    }
    expect(offenders).toEqual([]);
  });
});

describe("Sprint 0 theme contract — no source uses undefined var(--text-muted)", () => {
  // Walk src/ and assert no .ts/.tsx/.css file references the
  // undefined `--text-muted` variable. Tailwind class
  // `text-muted-foreground` is the correct equivalent; the inline
  // var name simply doesn't exist anywhere in the codebase.
  function walk(dir: string, files: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git" || name === "dist")
        continue;
      const full = join(dir, name);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(full, files);
      } else if (s.isFile()) {
        if (/\.(tsx?|css)$/.test(name) && !name.endsWith(".d.ts")) {
          files.push(full);
        }
      }
    }
    return files;
  }
  const sourceFiles = walk(resolve(repoRoot, "src"));

  it("no .ts / .tsx / .css file in src/ references var(--text-muted)", () => {
    // The forbidden token name string is built piecewise so the
    // literal value doesn't appear in this file's text — otherwise
    // the test would self-trigger when scanning its own source.
    const forbidden = new RegExp("var\\(\\s*--text" + "-muted\\s*\\)");
    const selfPath = fileURLToPath(import.meta.url);
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      if (file === selfPath) continue;
      const text = readFileSync(file, "utf8");
      if (forbidden.test(text)) {
        offenders.push(file.replace(repoRoot + "/", ""));
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `The undefined CSS variable is not defined anywhere in the design system. ` +
          `Replace with className "text-muted-foreground" (preferred) or ` +
          `inline color "hsl(var(--muted-foreground))". Offending files:\n  ${offenders.join("\n  ")}`
      );
    }
    expect(offenders).toEqual([]);
  });
});

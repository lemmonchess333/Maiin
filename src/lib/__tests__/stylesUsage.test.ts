/**
 * Class-usage gate for the hand-written stylesheets in src/styles.
 *
 * Tailwind's own utilities are generated from usage, so they cannot rot.
 * The classes and keyframes DECLARED in src/styles/*.css can: a component
 * is rewritten on utilities, its `.ds-card` rule stays behind, and the
 * stylesheet keeps describing a component that no longer exists — 20 such
 * classes and their keyframes at the time this gate was written, most of
 * animations.css and a third of components.css.
 *
 * A class is live when a non-test source file (src/**, index.html) or
 * another stylesheet mentions its name. A keyframe is live when something
 * other than its own declaration names it. Same shape as the reachability
 * gates: KNOWN_DEAD is a delete-only list — entries come off as the CSS is
 * deleted; nothing goes on. A new dead class means a component was rewritten
 * without taking its stylesheet with it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative, basename } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const STYLES_DIR = resolve(repoRoot, "src/styles");

function walk(dir: string, keep: (p: string) => boolean, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "__tests__" || name === "test")
        continue;
      walk(full, keep, out);
    } else if (keep(full)) out.push(full);
  }
  return out;
}

const stripCssComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

const styleFiles = readdirSync(STYLES_DIR)
  .filter((f) => f.endsWith(".css"))
  .map((f) => resolve(STYLES_DIR, f));

/** Every non-test source that could carry a class name. */
const codeText = [
  ...walk(
    resolve(repoRoot, "src"),
    (p) => /\.(tsx?|jsx?|html)$/.test(p) && !/\.(test|spec)\./.test(p)
  ),
  resolve(repoRoot, "index.html"),
]
  .map((p) => readFileSync(p, "utf8"))
  .join("\n");

const allCss = [...styleFiles, resolve(repoRoot, "src/index.css")]
  .map((p) => stripCssComments(readFileSync(p, "utf8")))
  .join("\n");

/** The stylesheets with every `@keyframes <name>` declaration removed, so a
 *  keyframe`s own declaration cannot vouch for it. */
const cssWithoutKeyframeDecls = allCss.replace(/@keyframes\s+[\w-]+/g, "");

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
const mentioned = (name: string, text: string) =>
  new RegExp(`(^|[^\\w-])${escape(name)}(?![\\w-])`, "m").test(text);

/**
 * Delete-only. Listed as `<file>:<class>` / `<file>:@<keyframe>`. Each is a
 * rule with no consumer anywhere in src — the stylesheet half of a
 * component that was rewritten on utilities or removed outright.
 */
const KNOWN_DEAD: string[] = [];

function deadRules(): string[] {
  const dead: string[] = [];
  for (const file of styleFiles) {
    const css = stripCssComments(readFileSync(file, "utf8"));
    const tag = basename(file);
    const classes = new Set(
      [...css.matchAll(/(?:^|[\s,{}>+~)])\.([a-zA-Z][\w-]*)/gm)].map(
        (m) => m[1]
      )
    );
    for (const c of [...classes].sort()) {
      // Live when code names it, or another stylesheet rule composes it
      // (a second mention beyond its own selectors).
      const inCode = mentioned(c, codeText);
      const cssMentions = (
        allCss.match(new RegExp(`\\.${escape(c)}(?![\\w-])`, "g")) ?? []
      ).length;
      const ownSelectors = (
        css.match(new RegExp(`\\.${escape(c)}(?![\\w-])`, "g")) ?? []
      ).length;
      if (!inCode && cssMentions <= ownSelectors) dead.push(`${tag}:${c}`);
    }
    const keyframes = new Set(
      [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])
    );
    for (const k of [...keyframes].sort()) {
      // Named by an `animation` declaration (in any stylesheet) or by code.
      const uses = (
        cssWithoutKeyframeDecls.match(
          new RegExp(`(^|[^\\w-])${escape(k)}(?![\\w-])`, "gm")
        ) ?? []
      ).length;
      if (uses === 0 && !mentioned(k, codeText)) dead.push(`${tag}:@${k}`);
    }
  }
  return dead;
}

describe("src/styles class usage", () => {
  const dead = deadRules();

  it("scans a plausible number of declarations (guards a broken scan)", () => {
    const declared = styleFiles
      .map((f) => stripCssComments(readFileSync(f, "utf8")))
      .join("\n")
      .match(/(?:^|[\s,{}>+~)])\.[a-zA-Z][\w-]*/gm);
    // ~30 declarations after the 2026-09 dead-rule sweep; the floor only has
    // to catch a collapsed scan (a bad root or extension reads as zero).
    expect(declared?.length ?? 0).toBeGreaterThan(20);
    expect(relative(repoRoot, styleFiles[0])).toMatch(/^src\/styles\//);
  });

  it("no NEW dead class or keyframe", () => {
    const fresh = dead.filter((d) => !KNOWN_DEAD.includes(d));
    expect(
      fresh,
      `Declared in src/styles but referenced by nothing in src/ or index.html. ` +
        `Delete the rule with the component it styled — do NOT add it to ` +
        `KNOWN_DEAD; that list is delete-only.`
    ).toEqual([]);
  });

  it("the pinned list stays honest — no entry that is now live or gone", () => {
    const stale = KNOWN_DEAD.filter((d) => !dead.includes(d));
    expect(
      stale,
      `Pinned as dead but now referenced (or deleted) — remove these entries.`
    ).toEqual([]);
  });
});

/**
 * Framer owns the transform and opacity of the elements it animates. The
 * global `button, [role="button"]` rule in index.css puts a CSS transition
 * on both, so every value framer wrote was re-eased by the browser and
 * arrived late: a swiped food row trailed the finger, a whileTap pressed in
 * after the tap. `data-motion-driven` takes an element out of those two
 * transitions (index.css). This holds every motion button to it, so the
 * next one cannot quietly lag.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "test") continue;
      walk(full, out);
    } else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Comments blanked to spaces, so line numbers survive and a `>` inside
 *  a comment cannot end a tag early. */
const blankComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));

/** The opening tag that starts at `start`: up to the first `>` outside
 *  every `{…}`, so arrow functions in props do not end it. */
function openingTag(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

describe("motion buttons opt out of the global button transition", () => {
  it("the opt-out keeps colour fades and drops transform and opacity", () => {
    const css = blankComments(
      readFileSync(resolve(repoRoot, "src/index.css"), "utf8")
    );
    const rule = css.match(
      /button\[data-motion-driven\],\s*\[role="button"\]\[data-motion-driven\]\s*\{([^}]*)\}/
    );
    expect(rule, "no data-motion-driven rule in src/index.css").not.toBeNull();
    const body = rule![1];
    expect(body).toMatch(/background-color/);
    expect(body).not.toMatch(/transform|opacity|\ball\b/);
  });

  it("every motion button carries data-motion-driven", () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const file of walk(resolve(repoRoot, "src"))) {
      const src = blankComments(readFileSync(file, "utf8"));
      for (const m of src.matchAll(/<motion\.([a-z]+)\b/g)) {
        const tag = openingTag(src, m.index!);
        const isButton = m[1] === "button" || /role="button"/.test(tag);
        if (!isButton) continue;
        seen++;
        if (!/\bdata-motion-driven\b/.test(tag)) {
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${relative(repoRoot, file)}:${line}`);
        }
      }
    }
    // The scan has to be finding them, or the guard proves nothing.
    expect(seen).toBeGreaterThanOrEqual(8);
    expect(
      offenders,
      "A motion element that is a button needs data-motion-driven, or " +
        "index.css's button transition re-eases every frame framer writes:\n" +
        offenders.join("\n")
    ).toEqual([]);
  });
});

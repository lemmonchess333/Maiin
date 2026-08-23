import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

/**
 * `BottomSheet` does not pad its children, so every caller must.
 *
 * The primitive says so in its own docstring — "Callers add their own
 * padding inside the children" — and ~20 of them do (`px-4 pb-6`,
 * `px-5 pt-4 pb-6`). Seven did not, all in the Circles/Spaces family, and
 * the result was measurable rather than subtle: in
 * `circle-create-compact-light.png` the sheet's own title and description
 * sit at x=17 while the focus card starts at x=3 and the name input at
 * x=0, and the primary "Start circle" button spans the full 393px to both
 * screen edges. A header at 16px above a body at 0px, in the same sheet.
 *
 * A convention that lives only in a docstring is one every new caller can
 * miss, and seven did. This is that convention as a test.
 *
 * Deliberately a source scan and not a render: the defect is the ABSENCE
 * of a class, and jsdom has no layout, so a rendered assertion could only
 * check for the same string this checks for — with a mount's cost and a
 * mock's fragility on top.
 */
const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const srcRoot = resolve(repoRoot, "src");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      out.push(...tsxFiles(full));
      continue;
    }
    if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Horizontal padding, or a reason not to need it. */
function hasGutter(cls: string): boolean {
  if (/\bp[xl]?-\d/.test(cls)) return true;
  // A centred single element (a spinner, an empty state) fills no width,
  // so a gutter is meaningless — TrainingBlockCard's loading branch.
  if (/\bjustify-center\b/.test(cls)) return true;
  // Content that spans deliberately (a full-bleed list) opts out visibly.
  if (/\b-mx-\d/.test(cls)) return true;
  return false;
}

describe("BottomSheet callers pad their own body", () => {
  it("finds the callers — the fixture this rests on", () => {
    const callers = tsxFiles(srcRoot).filter((f) =>
      readFileSync(f, "utf8").includes("<BottomSheet")
    );
    expect(callers.length).toBeGreaterThanOrEqual(15);
  });

  it("every sheet body wrapper carries a horizontal gutter", () => {
    const offenders: string[] = [];
    for (const f of tsxFiles(srcRoot)) {
      const src = readFileSync(f, "utf8");
      if (!src.includes("<BottomSheet")) continue;
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        if (!lines[i].includes("<BottomSheet")) continue;
        // Walk to the end of the opening tag, then take every direct
        // wrapper div in the next few lines — a sheet can open several
        // branches, which is how five in one file were missed by eye.
        let j = i;
        while (j < lines.length && !/>\s*$/.test(lines[j])) j += 1;
        for (let k = j + 1; k < Math.min(j + 8, lines.length); k += 1) {
          const m = /<div className="([^"]*)"/.exec(lines[k]);
          if (!m) continue;
          if (!hasGutter(m[1])) {
            offenders.push(
              `${relative(repoRoot, f)}:${k + 1} → "${m[1].slice(0, 44)}"`
            );
          }
          break;
        }
      }
    }
    expect(
      offenders,
      `BottomSheet does not pad its children (see its docstring). Without ` +
        `a gutter the body runs to the screen edge while the sheet's own ` +
        `title sits at 16px — measured at x=0 vs x=17 on the Circles ` +
        `create sheet. Add \`px-4\` (or \`px-5\`) to the body wrapper.`
    ).toEqual([]);
  });
});

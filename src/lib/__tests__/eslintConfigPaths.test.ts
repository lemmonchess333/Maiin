import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every concrete path named in `eslint.config.js` still exists.
 *
 * A lint exemption is a switched-off guardrail, and this one had been off
 * for four files on a rationale that had stopped being true of all of
 * them: the hex the block exempted was gone from three, and the fourth —
 * `src/components/social/ShareCard.tsx` — had been DELETED. Nothing about
 * a stale `files:` entry is an error to eslint; it simply matches nothing,
 * and the block reads as deliberate forever.
 *
 * What made it expensive is that the exemption was written for one reason
 * ("PRCard's hex are `accentColor` config defaults") and then silently
 * covered a site that arrived later and had nothing to do with it: a NEW
 * badge painting white on the raw orange at 3.05:1, on the one element of
 * the PRs tab whose job is to catch the eye. The guardrail that exists to
 * catch exactly that was off for the file.
 *
 * Globs are not checked — `**​/*.{ts,tsx}` matching nothing is a different
 * and louder failure. This is only for the entries that name a file.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

/** Quoted strings inside every `files: [ … ]` array in the config. */
function configuredPaths(): string[] {
  const src = readFileSync(resolve(repoRoot, "eslint.config.js"), "utf8");
  const out: string[] = [];
  for (const block of src.matchAll(/files:\s*\[([^\]]*)\]/g))
    for (const q of block[1].matchAll(/"([^"]+)"/g)) out.push(q[1]);
  return out;
}

describe("eslint.config.js names real files", () => {
  it("reads the config at all", () => {
    // Without this the sweep below passes vacuously the moment the regex
    // or the filename drifts — the failure mode the config itself had.
    const paths = configuredPaths();
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.includes("*"))).toBe(true);
  });

  it("every non-glob path exists", () => {
    const missing = configuredPaths()
      .filter((p) => !p.includes("*"))
      .filter((p) => !existsSync(resolve(repoRoot, p)));
    expect(
      missing,
      "eslint.config.js names files that are gone. A stale path in a " +
        "`files:` array matches nothing and silently keeps an exemption " +
        "block looking deliberate — delete the entry, and re-check whether " +
        "the block still has a reason to exist at all."
    ).toEqual([]);
  });
});

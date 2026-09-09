import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

/**
 * Decimal `rgba(…)` is the hex guardrail's OTHER blind spot.
 *
 * `eslint.config.js` bans hex colour literals, but every one of its
 * selectors matches on a literal `#`, so `rgba(123, 114, 233, 0.12)` —
 * which is `THEME.brand` written in decimal — walked straight past it.
 * Measured before this guard existed: `npx eslint` on WaterCard.tsx,
 * WaterWave.tsx and WaterBubbles.tsx returned 0 errors while all three
 * carried hardcoded hydration teals.
 *
 * The gap had a second half. Those selectors are scoped to
 * `JSXAttribute[name.name='style']`, so a colour hoisted one hop out of
 * the JSX — into a `VARIANT_CONFIG` map, a `variantStyle()` switch, a
 * module const — was invisible even when written as hex. That is how
 * NotificationBubble's VARIANT_CONFIG carried three off-palette colours
 * on the lines either side of a correct `THEME.brand`.
 *
 * This is a file scan rather than more ESLint selectors, deliberately:
 *  - it reaches multi-line gradient and box-shadow strings that no AST
 *    selector scoped to a single Literal can see;
 *  - it reaches colours hoisted anywhere in the file, not just into the
 *    two node shapes someone remembered to enumerate;
 *  - it carries a per-file ledger with REASONS, and a second test that
 *    fails when an entry stops earning itself.
 * A weaker second copy of the rule in ESLint would be one more mirror to
 * keep in sync, so the ESLint hex block points here instead.
 *
 * What a hit should become:
 *  - Themed surfaces: `hsl(var(--warning) / 0.12)` — flips with the
 *    theme, which a frozen rgba never does. Prefer this when a sibling
 *    on the same element already uses a token class (a `text-*-strong`
 *    label over a frozen tint is the shape this guard keeps finding).
 *  - A fixed Tropos colour: `${THEME.brand}1F` — the established
 *    alpha-hex suffix form (80 sites). Pixel-identical to the rgba it
 *    replaces when the alpha byte is chosen to match.
 *  - The always-dark run/camera surfaces: a fixed `THEME.*` value, NOT
 *    a token class — the CSS vars follow the USER'S theme there, so a
 *    token hands a light-mode user light-step colours on a dark ground.
 *
 * Pure black and pure white are allowed everywhere and not ledgered.
 * `rgba(0,0,0,0.4)` is the same colour in both themes — it is what
 * `THEME.scrim` and every `--ds-shadow-*` token are made of — and there
 * are ~94 of them across 25 files. Ledgering that would bury the
 * coloured entries, which are the ones worth reading. Note the allowance
 * is STRICT: slate-900 `rgba(15, 23, 42, …)` is a coloured near-black
 * and is a hit.
 */

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const EXEMPT: Record<string, string> = {
  // The token source itself. `iconBg: "rgba(123, 114, 233, 0.10)"` IS
  // the canonical brand tint that the swept sites now point at; a
  // guard that flagged the definition would have nowhere to send it.
  "lib/theme.ts": "the token definitions themselves",

  // The hydration fill ramp — #1E789B → #3A99BA → #52A3BD → #4EC3DC,
  // a designed four-stop gradient that deepens as the glass fills.
  // Only one stop (#52A3BD) is THEME.teal; the other three have no
  // token home, so repointing means designing the ramp, not renaming
  // it. Deferred from PR #2220 for the same reason it was deferred
  // there: both files recomposite the wave animation the water
  // transition capture spec films, so the change needs before/after
  // frames from the capture channel rather than a green unit suite.
  "components/home/WaterCard.tsx": "hydration fill ramp (deferred, #2220)",
  "components/home/WaterWave.tsx": "hydration fill ramp (deferred, #2220)",

  // The active-run cockpit's Stop button. Its red (#EF4444) is
  // deliberately NOT THEME.danger: danger is #D4637A, the coral that
  // IS the running identity on this very surface, so a coral Stop
  // would read as the run's own colour rather than as an interrupt.
  // Always-dark surface, no stop-red token, one call site — a token
  // invented for a single button would be worse than the literal.
  "components/ui/RunControlButton.tsx": "always-dark cockpit Stop red",
};

/** `rgb(…)` / `rgba(…)` opening with three decimal channels. */
const RGBA_RE = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g;

/**
 * A literal `hsl(30 80% 50%)` would slip past RGBA_RE while being the
 * same mistake. Zero current misuse — purely preventive, like the
 * `text-muted` ESLint rule. `hsl(var(--x))` opens with `v`, not a
 * digit, so the token form is unaffected.
 */
const HSL_LITERAL_RE = /hsla?\(\s*\d/g;

/** Black and white are theme-independent — see the header. */
function isMonochrome(r: number, g: number, b: number): boolean {
  return (
    (r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Blanks comment bodies while preserving line count, so a colour named
 * in prose (this file's own header, the ledger reasons above) is not a
 * hit and reported line numbers still match the source.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

function findHits(text: string): string[] {
  const hits: string[] = [];
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(RGBA_RE)) {
      const [r, g, b] = [m[1], m[2], m[3]].map(Number);
      if (isMonochrome(r, g, b)) continue;
      hits.push(`${i + 1} ${m[0]}…)`);
    }
    for (const m of line.matchAll(HSL_LITERAL_RE)) {
      hits.push(`${i + 1} ${m[0]}…) — use hsl(var(--token))`);
    }
  });
  return hits;
}

describe("no hardcoded coloured rgba()", () => {
  it("colours come from tokens, not decimal rgba literals", () => {
    const hits: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const rel = file.slice(SRC_ROOT.length + 1);
      if (EXEMPT[rel]) continue;
      for (const hit of findHits(stripComments(readFileSync(file, "utf8")))) {
        hits.push(`${rel}:${hit}`);
      }
    }
    expect(
      hits,
      "hardcoded coloured rgba() — the hex ESLint rule cannot see these " +
        "(no '#', and it only reads style={} attributes). Use " +
        "hsl(var(--token) / a) on themed surfaces, `${THEME.x}NN` for a " +
        "fixed Tropos colour, or add the FILE to EXEMPT with its " +
        "reason:\n" +
        hits.join("\n")
    ).toEqual([]);
  });

  it("the exemption ledger only names files that still exist and still hit", () => {
    // A stale exemption is a hole: the file gets rewritten or renamed
    // and the blanket pass stays behind. Each entry must still earn
    // itself. (Same guard paletteClassGuard carries, same reason.)
    for (const rel of Object.keys(EXEMPT)) {
      const full = join(SRC_ROOT, rel);
      const text = stripComments(readFileSync(full, "utf8"));
      expect(
        findHits(text).length,
        `${rel} is exempt but no longer contains a coloured rgba() — remove it from EXEMPT`
      ).toBeGreaterThan(0);
    }
  });

  it("allows pure black and white, catches coloured near-blacks", () => {
    // Pins the allowance boundary itself: the monochrome pass is the
    // one thing here broad enough to swallow the rule if it drifted
    // into "anything dark", and slate-900 is the near-black the sweep
    // actually found (ProgrammeSettings' sticky-footer shadow).
    expect(findHits("box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);")).toEqual([]);
    expect(findHits("border: 1px solid rgba(255,255,255,0.06);")).toEqual([]);
    expect(findHits("shadow-[0_-10px_24px_rgba(15,23,42,0.08)]")).toHaveLength(
      1
    );
    expect(findHits("background: rgba(123, 114, 233, 0.12)")).toHaveLength(1);
    expect(findHits("color: hsl(var(--warning) / 0.12)")).toEqual([]);
    expect(findHits("color: hsl(26 90% 37%)")).toHaveLength(1);
  });
});

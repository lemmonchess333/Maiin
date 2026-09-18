/**
 * One name and one unit per leaderboard, across both surfaces.
 *
 * `LeaderboardCard` and `FullLeaderboard` each carried their own
 * `ChallengeType → {label, unit}` table and had already drifted:
 * `weekly_distance` was "Weekly Distance" on the card and "Running
 * Distance" in the full view, `weekly_volume` "Weekly Volume" against
 * "Lifting Volume". The UNITS agreed, which is what let the names diverge
 * unnoticed — the figure looked right on both, so nothing read wrong.
 *
 * It was latent rather than live. The only production call site passes
 * `weekly_hybrid` (FeedView) and the full view defaults to the same, so a
 * user could only ever reach the two rows that happened to agree. The
 * card's other three sit behind a real `challenge` prop.
 *
 * This holds the consolidation the way the drift happened: by comparing
 * the two surfaces to each other, not by restating a table. A test that
 * asserted the four strings would pass just as happily with the duplicate
 * table restored, because it would be checking the copy it was written
 * from.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { CHALLENGE_LABELS, type ChallengeType } from "../leaderboard";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SURFACES = [
  "src/components/social/LeaderboardCard.tsx",
  "src/components/social/FullLeaderboard.tsx",
] as const;

const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

/* Comments are prose, not a second copy of the table. Both surfaces
   legitimately QUOTE a leaderboard name to illustrate something — the
   card's truncation note names its longest and shortest titles — and a
   scan that counted those would be a guard nobody could satisfy without
   writing worse comments. Stripped the same way `calorieUnitGate` does. */
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("leaderboard vocabulary", () => {
  it("names and units live in exactly one place", () => {
    /* The regression is a surface growing its own table again. Neither may
       contain a leaderboard NAME as a literal — the shared table is the
       only place those strings appear. */
    const names = Object.values(CHALLENGE_LABELS).map((l) => l.title);
    const offenders: string[] = [];
    for (const file of SURFACES) {
      const text = withoutComments(read(file));
      for (const name of names) {
        if (text.includes(`"${name}"`) || text.includes(`'${name}'`))
          offenders.push(`${file} hardcodes "${name}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("both surfaces read the shared table", () => {
    for (const file of SURFACES) {
      expect(read(file)).toContain("CHALLENGE_LABELS");
    }
  });

  it("covers every challenge, so a new one cannot ship unnamed", () => {
    const keys: ChallengeType[] = [
      "weekly_distance",
      "weekly_volume",
      "weekly_hybrid",
      "weekly_workouts",
    ];
    for (const key of keys) {
      expect(CHALLENGE_LABELS[key].title.length).toBeGreaterThan(0);
      expect(CHALLENGE_LABELS[key].unit.length).toBeGreaterThan(0);
    }
    expect(Object.keys(CHALLENGE_LABELS).sort()).toEqual([...keys].sort());
  });

  it("the two sport-coded names match the icons the card tints", () => {
    /* Why this wording won over "Weekly …": the card draws Footprints in
       `text-running` and Dumbbell in `text-lifting` beside the title, and
       renders a persistent "This week" eyebrow next to it. "Running" and
       "Lifting" match what is on the screen; "Weekly" said it twice. */
    expect(CHALLENGE_LABELS.weekly_distance.title).toMatch(/^Running /);
    expect(CHALLENGE_LABELS.weekly_volume.title).toMatch(/^Lifting /);
    const card = read(SURFACES[0]);
    expect(card).toContain("text-running");
    expect(card).toContain("text-lifting");
    expect(card).toContain("This week");
  });
});

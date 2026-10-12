/**
 * Outcomes across seeds and both model variants, against lifting-evidence
 * §4.2 (training-engine prompt, Phase 2 (c)). The model is a hypothesis
 * and §4.2's own intervals are model outputs, so the outcomes are reported
 * and asserted only as broad plausibility: no tracked lift's median falls
 * by more than a tenth (a fifth with weeks off), and none passes twice
 * §4.2's 80% upper bound for its level.
 *
 * The soak: `TROPOS_SIM_SEEDS=500 npx vitest run
 * src/features/program/__tests__/sim/liftOutcomes.sim.test.ts` runs 500
 * seeds of each and writes a markdown report to `test-results/sim/`
 * (uncommitted); `sim-soak.yml` runs it each week. Without it, three seeds
 * keep the PR gate quick.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { LIFT_PERSONAS } from "@/test/sim/liftPersonas";
import { simulateLiftSeason, type Season } from "@/test/sim/liftSeason";
import {
  BASE_VARIANT,
  HARSH_VARIANT,
  halfOf,
  type Half,
  type TrainingAge,
} from "@/test/sim/lifter";

const SEEDS = Number(process.env.TROPOS_SIM_SEEDS ?? 3);
/** A persona runs two seasons a seed, each a fraction of a second: the
 *  timeout grows with the soak, twice over to spare. */
const TIMEOUT = Math.max(120_000, SEEDS * 2_000);
const WEEKS = 26;
const AT = [8, 16, 26] as const;

/** §4.2: central gain and its 80% interval, in percent, at 8, 16 and 26
 *  weeks. */
const BANDS: Record<TrainingAge, Record<Half, [number, number, number][]>> = {
  novice: {
    upper: [
      [12, 6, 20],
      [22, 12, 35],
      [30, 16, 45],
    ],
    lower: [
      [18, 8, 30],
      [30, 15, 45],
      [38, 20, 55],
    ],
  },
  intermediate: {
    upper: [
      [4, 1, 9],
      [6, 2, 11],
      [8, 3, 14],
    ],
    lower: [
      [5, 1, 10],
      [7, 2, 13],
      [9, 3, 16],
    ],
  },
  advanced: {
    upper: [
      [1.5, 0, 4],
      [2.5, 0, 6],
      [3, 0, 7],
    ],
    lower: [
      [2, 0, 5],
      [3, 0, 7],
      [4, 0, 8],
    ],
  },
};

const quantile = (sorted: number[], q: number) => {
  if (sorted.length === 0) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
const pct = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "-");

/** Percent gain in a lift's true 1RM from its first session to the end of
 *  `week`, or null where the season never trained it. */
function gainAt(season: Season, id: string, week: number): number | null {
  const first = season.sessions
    .flatMap((s) => s.lifts)
    .find((l) => l.exerciseId === id && l.trueMax !== null);
  const end = season.weeks[week - 1]?.trueMax[id];
  if (!first?.trueMax || !end) return null;
  return ((end - first.trueMax) / first.trueMax) * 100;
}

function halfOfLift(season: Season, id: string): Half {
  const lift = season.sessions
    .flatMap((s) => s.lifts)
    .find((l) => l.exerciseId === id);
  return halfOf(lift?.movementCategory ?? "");
}

const report: string[] = [
  `# Lifting outcomes: ${String(SEEDS)} seeds of each model variant, ${String(WEEKS)} weeks`,
  "",
  "Gain in true 1RM, %: the base model's median / the harsh model's median [10th–90th percentile of both], against lifting-evidence §4.2's central [80% interval]. Misses: missed or lowered sessions per 100 of the lift's.",
];

describe.each(LIFT_PERSONAS.map((p) => [p.name, p] as const))(
  "%s",
  (name, persona) => {
    it(
      "gains within broad plausibility of lifting-evidence §4.2",
      () => {
        const byVariant = [BASE_VARIANT, HARSH_VARIANT].map((variant) =>
          Array.from({ length: SEEDS }, (_, i) =>
            simulateLiftSeason(persona, { weeks: WEEKS, seed: i + 1, variant })
          )
        );
        const seasons = byVariant.flat();
        const age = persona.lifter.trainingAge;
        const floor = persona.breaks?.length ? -20 : -10;
        report.push("", `## ${name} (${age})`, "");
        report.push(
          "| lift | " +
            AT.map((w) => `${String(w)} weeks`).join(" | ") +
            " | misses /100 |",
          "| --- | " + AT.map(() => "---").join(" | ") + " | --- |"
        );
        for (const id of persona.tracked) {
          const half = halfOfLift(seasons[0], id);
          const sortedGains = (list: Season[], week: number) =>
            list
              .map((s) => gainAt(s, id, week))
              .filter((g): g is number => g !== null)
              .sort((a, b) => a - b);
          const cells = AT.map((week, k) => {
            const gains = sortedGains(seasons, week);
            const [base, harsh] = byVariant.map((list) =>
              quantile(sortedGains(list, week), 0.5)
            );
            const [central, low, high] = BANDS[age][half][k];
            if (week === WEEKS && gains.length > 0) {
              const median = quantile(gains, 0.5);
              expect(
                median,
                `${name} ${id}: median ${pct(median)}% at ${String(week)} weeks`
              ).toBeGreaterThan(floor);
              expect(
                median,
                `${name} ${id}: median ${pct(median)}% at ${String(week)} weeks`
              ).toBeLessThan(2 * high);
            }
            return `${pct(base)} / ${pct(harsh)} [${pct(quantile(gains, 0.1))}–${pct(quantile(gains, 0.9))}] vs ${String(central)} [${String(low)}–${String(high)}]`;
          });
          const lifts = seasons.flatMap((s) =>
            s.sessions.flatMap((x) =>
              x.lifts.filter((l) => l.exerciseId === id)
            )
          );
          const misses = lifts.filter(
            (l) => l.outcome === "miss" || l.outcome === "lowered"
          ).length;
          report.push(
            `| ${id} | ${cells.join(" | ")} | ${lifts.length ? ((misses / lifts.length) * 100).toFixed(0) : "-"} |`
          );
        }
      },
      TIMEOUT
    );
  }
);

afterAll(() => {
  if (!process.env.TROPOS_SIM_SEEDS) return;
  mkdirSync("test-results/sim", { recursive: true });
  writeFileSync(
    "test-results/sim/lifting-outcomes.md",
    report.join("\n") + "\n"
  );
});

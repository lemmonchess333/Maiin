/**
 * Running outcomes across seeds and three model variants (base, harsh, and
 * one that credits quality sessions at their top weight), against
 * running-evidence §6.1 and §6.5 (training-engine prompt, Phase 2 (c)). The
 * model is a hypothesis and the evidence's bands are model outputs, so the
 * outcomes are reported and asserted only as broad plausibility: a
 * persona's median change in true VDOT by race day (or the season's end,
 * without a race) between −4 and +6, and a median race no slower than twice
 * its start-of-season equivalent.
 *
 * The soak: `TROPOS_SIM_SEEDS=500 npx vitest run
 * src/features/program/__tests__/sim/runOutcomes.sim.test.ts` runs 500
 * seeds of each and writes a markdown report to `test-results/sim/`
 * (uncommitted); `sim-soak.yml` runs it each week. Without it, three seeds
 * keep the PR gate quick.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { simulateLiftSeason, type Season } from "@/test/sim/liftSeason";
import { BASE_RUNNER, HARSH_RUNNER, INTENSITY_RUNNER } from "@/test/sim/runner";
import { RUN_PERSONAS } from "@/test/sim/runPersonas";
import { raceTimeS } from "@/test/sim/runSeason";
import { clock } from "@/test/sim/runTrace";

const SEEDS = Number(process.env.TROPOS_SIM_SEEDS ?? 3);
/** A persona runs three seasons a seed, a year's about a second each: the
 *  timeout grows with the soak, twice over to spare. */
const TIMEOUT = Math.max(180_000, SEEDS * 6_000);

const RACE_M: Record<string, number> = {
  "5k": 5000,
  "10k": 10000,
  half: 21097.5,
  marathon: 42195,
};

/** What §6.5 and §6.1 expect, as the report states it beside each. */
const EXPECTED: Record<string, string> = {
  "couch-to-5k": "first 5K in 30–40 min; 10–25% injured over 6–12 weeks",
  "half-3-days": "16 weeks recreational: +1.5–3 VDOT (§6.1)",
  "sub-3-30":
    "+1.5–3 VDOT typical; sub-3:30 for 10–25% of runners whose 3:45 was their fitness",
  "sick-six-weeks":
    "6 weeks off: −7% to −16% VO2max, rebuilt over about 6 weeks",
  "new-runner-marathon": "no evidence band: a marathon on one run a week",
  "freeform-runner": "steady easy running: little change",
  "year-out-marathon":
    "+2 to +5 VDOT over the year; finish about 3:45–3:50, 80% 3:35–4:10",
  "hybrid-3-4-trim": "16 weeks recreational: +1.5–3 VDOT (§6.1)",
  "hybrid-3-4-no-trim": "16 weeks recreational: +1.5–3 VDOT (§6.1)",
  "hybrid-2-3-trim": "12 weeks novice-to-recreational: +1–3 VDOT (§6.1)",
  "hybrid-2-3-no-trim": "12 weeks novice-to-recreational: +1–3 VDOT (§6.1)",
};

const quantile = (sorted: number[], q: number) => {
  if (sorted.length === 0) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
const oneDp = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "-");

/** True VDOT on race morning, or at the season's end without a race. */
function vdotAtRace(season: Season): number {
  const race = season.runs.find((r) => r.raceTimeS !== undefined);
  return race?.trueVdot ?? season.runWeeks[season.runWeeks.length - 1].trueVdot;
}

const report: string[] = [
  `# Running outcomes: ${String(SEEDS)} seeds of each model variant`,
  "",
  "Change in true VDOT by race morning (or the season's end without a race): the base model's median / the harsh model's / the intensity model's [10th–90th percentile of all three]. Finish: median [10th–90th]. Injured: share of seasons with at least one injury. Counted: share of planned runs done that Home counted.",
];

describe.each(RUN_PERSONAS.map((p) => [p.persona.name, p] as const))(
  "%s",
  (name, { persona, weeks }) => {
    it(
      "lands within broad plausibility of running-evidence §6",
      () => {
        const start = persona.running!.runner.vdot;
        const byVariant = [BASE_RUNNER, HARSH_RUNNER, INTENSITY_RUNNER].map(
          (runnerVariant) =>
            Array.from({ length: SEEDS }, (_, i) =>
              simulateLiftSeason(persona, { weeks, seed: i + 1, runnerVariant })
            )
        );
        const seasons = byVariant.flat();
        const change = (list: Season[]) =>
          sorted(list.map((s) => vdotAtRace(s) - start));
        const all = change(seasons);
        const median = quantile(all, 0.5);
        expect(
          median,
          `${name}: median VDOT change ${oneDp(median)}`
        ).toBeGreaterThan(-4);
        expect(
          median,
          `${name}: median VDOT change ${oneDp(median)}`
        ).toBeLessThan(6);

        const distance = persona.answers.raceDistance;
        const finishes = sorted(
          seasons
            .flatMap((s) => s.runs)
            .filter((r) => r.raceTimeS !== undefined)
            .map((r) => r.raceTimeS!)
        );
        let finishCell = "no race";
        if (persona.answers.runMode === "race_prep" && distance) {
          const equivalent = raceTimeS(start, RACE_M[distance], 0);
          const mid = quantile(finishes, 0.5);
          expect(finishes.length, `${name}: no race run`).toBeGreaterThan(0);
          expect(mid, `${name}: median finish ${clock(mid)}`).toBeLessThan(
            2 * equivalent
          );
          finishCell = `${clock(mid)} [${clock(quantile(finishes, 0.1))}–${clock(quantile(finishes, 0.9))}]`;
          if (name === "sub-3-30")
            finishCell += ` · under 3:30 in ${String(Math.round((100 * finishes.filter((t) => t < 12600).length) / finishes.length))}%`;
        }
        const injured =
          seasons.filter((s) => s.runs.some((r) => r.done.injury)).length /
          seasons.length;
        const planned = seasons.flatMap((s) =>
          s.runs.filter((r) => r.templateId !== "free")
        );
        const counted = planned.length
          ? planned.filter((r) => r.counted).length / planned.length
          : NaN;
        const [base, harsh, intensity] = byVariant.map((list) =>
          quantile(change(list), 0.5)
        );
        report.push(
          "",
          `## ${name}`,
          "",
          `- VDOT ${oneDp(start)}: ${oneDp(base)} / ${oneDp(harsh)} / ${oneDp(intensity)} [${oneDp(quantile(all, 0.1))}–${oneDp(quantile(all, 0.9))}]`,
          `- Finish: ${finishCell}`,
          `- Injured: ${String(Math.round(injured * 100))}% · counted: ${Number.isFinite(counted) ? String(Math.round(counted * 100)) : "-"}%`,
          `- Expected: ${EXPECTED[name] ?? "-"}`
        );
      },
      TIMEOUT
    );
  }
);

afterAll(() => {
  if (!process.env.TROPOS_SIM_SEEDS) return;
  mkdirSync("test-results/sim", { recursive: true });
  writeFileSync(
    "test-results/sim/running-outcomes.md",
    report.join("\n") + "\n"
  );
});

/**
 * Coaching checks on a simulated season: what a coach reading the log would
 * object to, each with a stable key so a suite can hold today's findings in
 * a ratchet (training-engine prompt, Phase 2 (b)). These are judgements, not
 * rules of the app's code: `liftSeason.ts` checks those.
 *
 * - `stall`: a lift whose plan numbers (weight and target reps) stay put
 *   for eight or more of its sessions while the person has reps to spare,
 *   so the plan, not the person, is what holds it: a rep target climbing
 *   through its range is progress, and a lifter at their limit is the
 *   plateau the rules sheet answers with a variation.
 * - `misses` (F4): a main lift missed or lowered in more than a third of
 *   its sessions.
 * - `acsm-coverage`: a fully trained week that leaves out a major muscle
 *   group (ACSM 2026: all of them, at least twice a week in total).
 * - `acsm-heavy`: a strength plan whose main lifts rarely see two sets at
 *   80% of 1RM or more in a week (ACSM 2026: ≥80% for 2–3 sets).
 * - `acsm-size`: a size plan that gives a major muscle group fewer than ten
 *   sets in most fully trained weeks (ACSM 2026: ≥10 a week).
 */
import { weeklyVolumeByJudgementMuscle } from "@/features/program/volumeModel";
import type { JudgementMuscle } from "@/features/program/volumeModel";
import type { LiftDone, LiftPersona, Season, SessionDone } from "./liftSeason";

/** Weeks a loaded lift may hold its weight before it reads as stuck. */
export const STALL_WEEKS = 8;
/** Mean reps left in reserve on a lift's first set that says the person
 *  had more to give. */
const SPARE_RIR = 2;
/** Share of a main lift's sessions missed or lowered past which the plan
 *  is asking too much too often. */
export const MISS_SHARE = 1 / 3;

/** The major muscle groups and the muscles that count for each. */
const MAJOR_GROUPS: Record<string, readonly JudgementMuscle[]> = {
  chest: ["Chest"],
  back: ["Lats", "UpperBack"],
  shoulders: ["FrontDelts", "SideDelts", "RearDelts"],
  quads: ["Quads"],
  posterior: ["Hamstrings", "Glutes"],
};

const isLoaded = (l: LiftDone) => l.planned > 0;

function weekSessions(season: Season, week: number): SessionDone[] {
  const from = season.weeks[week - 1]?.weekStart ?? "";
  const to = season.weeks[week]?.weekStart ?? "9999-12-31";
  return season.sessions.filter((s) => s.date >= from && s.date < to);
}

/** Weeks the person did everything the plan offered. */
function fullWeeks(season: Season): number[] {
  return season.weeks
    .filter((w) => w.offered > 0 && w.done === w.offered)
    .map((w) => w.week);
}

function setsPerMuscle(sessions: readonly SessionDone[]) {
  return new Map(
    weeklyVolumeByJudgementMuscle(
      sessions.map((s) => ({
        exercises: s.lifts.map((l) => ({
          exerciseId: l.exerciseId,
          movementCategory: l.movementCategory as never,
          sets: l.setsDone,
        })),
      }))
    ).map(({ muscle, sets }) => [muscle, sets])
  );
}

function stalls(season: Season): string[] {
  const out = new Set<string>();
  const bySlot = new Map<string, { date: string; lift: LiftDone }[]>();
  for (const s of season.sessions)
    for (const lift of s.lifts)
      if (isLoaded(lift))
        bySlot.set(lift.slot, [
          ...(bySlot.get(lift.slot) ?? []),
          { date: s.date, lift },
        ]);
  for (const sessions of bySlot.values()) {
    let from = 0;
    for (let i = 1; i <= sessions.length; i++) {
      const same =
        i < sessions.length &&
        sessions[i].lift.planned === sessions[from].lift.planned &&
        sessions[i].lift.targetReps === sessions[from].lift.targetReps;
      if (same) continue;
      // A slot comes round once a week, so its sessions count its weeks.
      const run = sessions.slice(from, i);
      const spare =
        run.reduce((n, r) => n + (r.lift.rir[0] ?? 0), 0) / run.length;
      if (run.length >= STALL_WEEKS && spare >= SPARE_RIR)
        out.add(`stall:${run[0].lift.exerciseId}`);
      from = i;
    }
  }
  return [...out];
}

function misses(season: Season, persona: LiftPersona): string[] {
  const out: string[] = [];
  for (const id of persona.tracked) {
    const lifts = season.sessions.flatMap((s) =>
      s.lifts.filter((l) => l.exerciseId === id && isLoaded(l))
    );
    const bad = lifts.filter(
      (l) => l.outcome === "miss" || l.outcome === "lowered"
    ).length;
    if (lifts.length >= 8 && bad / lifts.length > MISS_SHARE)
      out.push(`misses:${id}`);
  }
  return out;
}

function coverage(season: Season): string[] {
  const out = new Set<string>();
  for (const week of fullWeeks(season)) {
    const sets = setsPerMuscle(weekSessions(season, week));
    for (const [group, muscles] of Object.entries(MAJOR_GROUPS))
      if (!muscles.some((m) => (sets.get(m) ?? 0) > 0))
        out.add(`acsm-coverage:${group}`);
  }
  return [...out];
}

function heavy(season: Season, persona: LiftPersona): string[] {
  if (persona.answers.primaryGoal !== "strength") return [];
  const out: string[] = [];
  const weeks = fullWeeks(season).filter((w) => w > 6);
  if (weeks.length === 0) return out;
  for (const id of persona.tracked) {
    const heavyWeeks = weeks.filter((week) =>
      weekSessions(season, week).some((s) =>
        s.lifts.some(
          (l) =>
            l.exerciseId === id &&
            l.trueMax !== null &&
            l.weight >= 0.8 * l.trueMax &&
            l.setsDone >= 2
        )
      )
    ).length;
    if (heavyWeeks < weeks.length / 2) out.push(`acsm-heavy:${id}`);
  }
  return out;
}

function size(season: Season, persona: LiftPersona): string[] {
  if (persona.answers.primaryGoal !== "hypertrophy") return [];
  const out: string[] = [];
  const weeks = fullWeeks(season);
  if (weeks.length === 0) return out;
  for (const [group, muscles] of Object.entries(MAJOR_GROUPS)) {
    const short = weeks.filter((week) => {
      const sets = setsPerMuscle(weekSessions(season, week));
      return muscles.every((m) => (sets.get(m) ?? 0) < 10);
    }).length;
    if (short > weeks.length / 2) out.push(`acsm-size:${group}`);
  }
  return out;
}

/** Every coaching finding on a season, as `<check>:<subject>` keys. */
export function coachingFindings(
  season: Season,
  persona: LiftPersona
): string[] {
  return [
    ...stalls(season),
    ...misses(season, persona),
    ...coverage(season),
    ...heavy(season, persona),
    ...size(season, persona),
  ].sort();
}

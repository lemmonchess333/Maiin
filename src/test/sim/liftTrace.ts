/**
 * A season as text, for a golden file: what the plan asked for each week,
 * what the person did, and what it did to the plan. Built with String()
 * and toFixed() only, so it reads the same under every CI job's time zone
 * and locale.
 */
import {
  weeklyVolumeByJudgementMuscle,
  type VolumeDay,
} from "@/features/program/volumeModel";
import { daysPerMuscle } from "@/features/program/weeklyFrequency";
import type { LiftDone, LiftOutcome, Season, SessionDone } from "./liftSeason";

const kg = (n: number) => String(n);
const oneDp = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "-" : n.toFixed(1);
const pad = (text: string, width: number) =>
  text.length >= width ? text : text + " ".repeat(width - text.length);

const SHORT: Record<LiftOutcome, string> = {
  "own weight": "own",
  step: "step",
  reps: "reps",
  hold: "hold",
  miss: "miss",
  lowered: "LOWERED",
};

/** A lift's sets, by weight in the order done: "60×[5,5,5]", or
 *  "60×[2] 50×[5,5]" when the person took weight off. */
function setsText(lift: LiftDone): string {
  const runs: { weight: number; reps: number[] }[] = [];
  lift.reps.forEach((reps, k) => {
    const weight = lift.weights[k];
    const run = runs[runs.length - 1];
    if (run && run.weight === weight) run.reps.push(reps);
    else runs.push({ weight, reps: [reps] });
  });
  return runs.map((r) => `${kg(r.weight)}×[${r.reps.join(",")}]`).join(" ");
}

/** The sessions as the volume model reads a week: the sets each lift got. */
function volumeDays(sessions: readonly SessionDone[]): VolumeDay[] {
  return sessions.map((s) => ({
    exercises: s.lifts.map((l) => ({
      exerciseId: l.exerciseId,
      movementCategory:
        l.movementCategory as VolumeDay["exercises"][number]["movementCategory"],
      sets: l.setsDone,
    })),
  }));
}

/** Sets and days per muscle across the sessions done, "Chest 9/3". */
function muscleLine(sessions: readonly SessionDone[]): string {
  const days = volumeDays(sessions);
  const perDay = daysPerMuscle(days);
  return weeklyVolumeByJudgementMuscle(days)
    .map(
      ({ muscle, sets }) =>
        `${muscle} ${String(sets)}/${String(perDay.get(muscle) ?? 0)}`
    )
    .join(" · ");
}

export function liftTrace(season: Season, tracked: readonly string[]): string {
  const lines: string[] = [];
  const first = season.weeks[0];
  lines.push(
    `${season.persona} · seed ${String(season.seed)} · ${season.variant} model · ${String(season.weeks.length)} weeks from ${first?.weekStart ?? "-"} · sessions fitted to ${String(season.sessionMinutes)} minutes`
  );
  const width = Math.max(...tracked.map((id) => id.length)) + 2;

  for (const w of season.weeks) {
    const sessions = season.sessions.filter(
      (s) => s.date >= w.weekStart && s.date < nextWeek(season, w.week)
    );
    const minutes = sessions.map((s) => s.minutes);
    const span =
      minutes.length === 0
        ? ""
        : `  ${String(Math.min(...minutes))}–${String(Math.max(...minutes))} min`;
    lines.push("");
    lines.push(
      `w${String(w.week)} ${w.weekStart}  plan week ${String(w.weekNumber)} ${w.phase}${w.raceWeek ? ` (race: ${w.raceWeek})` : ""}  ${String(w.done)}/${String(w.offered)} sessions${span}`
    );
    for (const id of tracked) {
      const plan = w.plan[id];
      const lifts = sessions.flatMap((s) =>
        s.lifts.filter((l) => l.exerciseId === id)
      );
      const logged = Math.max(0, ...lifts.map((l) => l.loggedMax));
      const done = lifts
        .map((l) => `${setsText(l)} ${SHORT[l.outcome]}`)
        .join(" | ");
      lines.push(
        `  ${pad(id, width)}plan ${plan ? `${kg(plan.weight)} × ${String(plan.reps)} × ${String(plan.sets)}` : "-"}  1RM ${oneDp(w.trueMax[id])} logged ${logged > 0 ? oneDp(logged) : "-"}${done ? `  ${done}` : ""}`
      );
    }
    if (sessions.length > 0) lines.push(`  sets/days: ${muscleLine(sessions)}`);
    const events = season.events.filter(
      (e) =>
        e.slice(0, 10) >= w.weekStart &&
        e.slice(0, 10) < nextWeek(season, w.week)
    );
    for (const e of events) lines.push(`  · ${e}`);
  }

  lines.push("");
  lines.push("summary");
  const done = season.weeks.reduce((n, w) => n + w.done, 0);
  const offered = season.weeks.reduce((n, w) => n + w.offered, 0);
  const lighter = season.weeks.filter((w) => w.phase === "deload").length;
  const rules = new Map<string, number>();
  for (const f of season.failures)
    rules.set(f.rule, (rules.get(f.rule) ?? 0) + 1);
  lines.push(
    `  sessions ${String(done)}/${String(offered)} · lighter weeks ${String(lighter)} · rule failures ${
      rules.size === 0
        ? "none"
        : [...rules].map(([rule, n]) => `${rule} ${String(n)}`).join(", ")
    }`
  );
  const last = season.weeks[season.weeks.length - 1];
  for (const id of tracked) {
    const all = season.sessions.flatMap((s) =>
      s.lifts.filter((l) => l.exerciseId === id)
    );
    const count = (o: LiftOutcome) => all.filter((l) => l.outcome === o).length;
    // The true 1RM on the day of the lift's first session: strength moves
    // at the end of each week, so that is where it started.
    const start = all[0]?.trueMax ?? first?.trueMax[id];
    const end = last?.trueMax[id];
    const gain =
      start && end ? `${(((end - start) / start) * 100).toFixed(1)}%` : "-";
    lines.push(
      `  ${pad(id, width)}1RM ${oneDp(start)} → ${oneDp(end)} (${gain}) · plan ${first?.plan[id] ? kg(first.plan[id].weight) : "-"} → ${last?.plan[id] ? kg(last.plan[id].weight) : "-"} kg · ${String(all.length)} sessions: ${String(count("step"))} steps, ${String(count("reps"))} rep climbs, ${String(count("hold"))} holds, ${String(count("miss"))} misses, ${String(count("lowered"))} lowered, ${String(count("own weight"))} own weight`
    );
  }
  return lines.join("\n") + "\n";
}

/** The day after the week's last, for comparing date strings. */
function nextWeek(season: Season, week: number): string {
  return season.weeks[week]?.weekStart ?? "9999-12-31";
}

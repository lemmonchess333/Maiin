/**
 * A season's running as text, for a golden file: each week, what the plan
 * set, what the runner ran and whether Home counted it, and the runner's
 * fitness against the paces the app prescribed. Built with String() and
 * toFixed() only, so it reads the same under every CI job's time zone and
 * locale. A hybrid's lifting has its own trace (`liftTrace`).
 */
import { parseLocalDate } from "@/lib/dateHelpers";
import type { PaceBand } from "@/lib/runPaces";
import type { LiftPersona, Season } from "./liftSeason";
import type { RunRecord } from "./runSeason";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Seconds as m:ss, or h:mm:ss from an hour. */
export function clock(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0
    ? `${String(h)}:${String(m).padStart(2, "0")}:${ss}`
    : `${String(m)}:${ss}`;
}

const band = (b: PaceBand | null) =>
  b ? `${clock(b[0])}–${clock(b[1])}` : "none";

/** One run: "Mon long_10k 10.0 km/62 min 6:11", flagged when Home didn't
 *  count it, when it hurt, or when its pace was more than they had. */
function runText(r: RunRecord): string {
  const flags = [
    r.counted || r.templateId === "free" ? "" : " NOT COUNTED",
    r.done.tooFast ? " (target too fast)" : "",
    r.done.injury ? ` INJURY ${r.done.injury}` : "",
    r.raceTimeS !== undefined ? ` finish ${clock(r.raceTimeS)}` : "",
  ].join("");
  return `${DAY[parseLocalDate(r.date).getDay()]} ${r.templateId} ${r.done.km.toFixed(1)} km/${String(Math.round(r.done.minutes))} min ${clock(r.done.pace)}${flags}`;
}

export function runTrace(season: Season, persona: LiftPersona): string {
  const habits = persona.running!;
  const goal =
    persona.answers.raceDistance && persona.answers.runMode === "race_prep"
      ? `race: ${persona.answers.raceDistance} on ${String(persona.answers.raceTargetDate)}`
      : "no race";
  const b = habits.benchmark;
  const lines = [
    `${season.persona} · seed ${String(season.seed)} · ${season.variant} model · ${String(season.runWeeks.length)} weeks from ${season.runWeeks[0]?.weekStart ?? "-"} · ${goal}`,
    `runner: VDOT ${habits.runner.vdot.toFixed(1)} · ${String(habits.runner.weeklyMinutes)} min a week · ${String(habits.runner.runningWeeks)} weeks running · ${b ? `entered ${String(b.distanceM)} m in ${clock(b.timeS)}` : "no benchmark"}${habits.goalTimeS ? ` · goal ${clock(habits.goalTimeS)}` : ""}`,
    "",
  ];
  const weeks = season.runWeeks;
  weeks.forEach((w, i) => {
    const to = weeks[i + 1]?.weekStart ?? "9999-12-31";
    const runs = season.runs.filter(
      (r) => r.date >= w.weekStart && r.date < to
    );
    const minutes = runs.reduce((n, r) => n + r.done.minutes, 0);
    const km = runs.reduce((n, r) => n + r.done.km, 0);
    const quality = runs.reduce((n, r) => n + r.done.qualityMinutes, 0);
    const spike = Math.max(
      0,
      ...runs.map((r) =>
        r.longestBefore > 0 ? r.done.km / r.longestBefore : 0
      )
    );
    const plan = w.phase
      ? `${w.phase}, plan week ${String((w.planWeek ?? 0) + 1)} of ${String(w.totalWeeks)}`
      : "no plan";
    lines.push(
      `w${String(w.week)} ${w.weekStart}  ${plan}  counted ${String(w.counted)}/${String(w.planned.length)}  plan ${String(Math.round(w.plannedMinutes))} min, long ${w.longKm.toFixed(1)} km, quality ${String(w.quality)}`
    );
    if (w.planned.length) lines.push(`  planned ${w.planned.join(" · ")}`);
    if (runs.length) lines.push(`  ran     ${runs.map(runText).join(" · ")}`);
    lines.push(
      `  week    ${String(Math.round(minutes))} min · ${km.toFixed(1)} km · easy ${minutes > 0 ? String(Math.round((100 * (minutes - quality)) / minutes)) : "-"}% · longest ×${spike.toFixed(2)} the month's`
    );
    const last = runs[runs.length - 1];
    lines.push(
      `  runner  VDOT ${w.trueVdot.toFixed(2)} · fitness ${String(Math.round(w.fitnessMinutes))} min${last ? ` · easy own ${band(last.ownEasy)}, prescribed ${band(last.prescribedEasy)}` : ""}`
    );
    const events = season.events.filter((e) => {
      const date = e.slice(0, 10);
      return (
        date >= w.weekStart &&
        date < to &&
        !/: (loaded|took|picked up) /.test(e)
      );
    });
    for (const e of events) lines.push(`  · ${e}`);
  });
  const done = season.runs;
  lines.push("");
  lines.push(
    `runs ${String(done.length)} · counted ${String(done.filter((r) => r.counted).length)} of the ${String(done.filter((r) => r.templateId !== "free").length)} planned · injuries ${String(done.filter((r) => r.done.injury).length)} · VDOT ${habits.runner.vdot.toFixed(1)} → ${(weeks[weeks.length - 1]?.trueVdot ?? 0).toFixed(2)}`
  );
  for (const r of done.filter((r) => r.raceTimeS !== undefined))
    lines.push(
      `race ${r.date} ${r.templateId} ${clock(r.raceTimeS!)} at VDOT ${r.trueVdot.toFixed(2)}`
    );
  return lines.join("\n") + "\n";
}

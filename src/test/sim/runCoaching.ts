/**
 * Coaching checks on a simulated running season: what a running coach
 * reading the plan and the log would object to, each with a stable key so a
 * suite can hold today's findings in a ratchet (training-engine prompt,
 * Phase 2 (b)). These are judgements, not rules of the app's code:
 * `liftSeason.ts` checks those.
 *
 * - `quality-cap`: a week planning more than two quality sessions besides
 *   the long run (running-evidence §5.20).
 * - `novice-quality`: tempo or interval work in a new runner's first six
 *   weeks (§5.20: none for the first 4–6).
 * - `back-to-back`: two demanding days in a row: a long run, tempo,
 *   intervals, a race, or an easy run of an hour or more (§5.20: about
 *   48 h between hard sessions; running-engine-audit §7 item 3).
 * - `spike`: a run more than 10% longer than the runner's longest of the
 *   30 days before (§2 item 2: the single-run guard).
 * - `volume-jump`: a week planning over 25% more minutes than the week
 *   before, outside race week (audit §7 item 1).
 * - `taper-long`: a half or marathon plan with no long run in the two
 *   weeks before race week (§4.5: a reduced long run 2–3 weeks out; audit
 *   §7 item 6).
 * - `taper-cut`: the taper's first week planning under half the last build
 *   week's minutes in one step (§4.5: about 41–60% off, progressively).
 * - `long-share`: the long run over half the week's planned minutes in most
 *   weeks that have one (audit §7 item 2; Daniels' 25–30%).
 * - `one-run-week`: race preparation on one run a week (audit §7 item 11).
 * - `run-walk`: a new runner's first week asking for more than 20 minutes
 *   of running at a time (§6.5 A: Couch to 5K starts with one-minute runs).
 * - `under-dose`: the plan's first full month averaging under 80% of the
 *   minutes the runner already ran, which setup never asks.
 * - `derived-low`: a benchmark the app derived three or more VDOT under the
 *   runner's own (it reads an easy run as a race).
 * - `nag-after-race`: the server telling the runner they fell behind after
 *   their race.
 * - `easy-nag`: the run summary telling the runner to slow down
 *   (`easy-too-fast`) on most of their easy and long runs.
 */
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { trainingBands } from "@/lib/runPaces";
import type { LiftPersona, Season } from "./liftSeason";
import { plannedRunMinutes, runTypeOf } from "./runSeason";

/** A week planning this much more than the one before is a jump. */
const JUMP = 1.25;
/** A run this much longer than the month's longest is a spike. */
const SPIKE = 1.1;

const DEMANDING = new Set(["long", "tempo", "intervals", "race"]);

const templateOf = (entry: string) => entry.slice(entry.indexOf(":") + 1);

/** The week holding the race (its phase can read recovery by Sunday). */
const holdsRace = (w: Season["runWeeks"][number]) =>
  w.planned.some((entry) => runTypeOf(templateOf(entry)) === "race");

export function runCoachingFindings(
  season: Season,
  persona: LiftPersona
): string[] {
  const found = new Set<string>();
  const habits = persona.running!;
  const weeks = season.runWeeks;
  const isNew =
    persona.answers.runFrequency === "new" || habits.runner.runningWeeks < 26;
  const [fast, slow] = trainingBands(habits.runner.vdot).easy;
  const easyPace = (fast + slow) / 2;

  // The plan, run by run, in date order.
  const planned = weeks
    .flatMap((w) =>
      w.planned.map((entry, k) => ({
        date: w.plannedDates[k],
        templateId: entry.slice(entry.indexOf(":") + 1),
      }))
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  weeks.forEach((w, i) => {
    if (w.quality > 2) found.add("quality-cap");
    if (isNew && i < 6 && w.quality > 0) found.add("novice-quality");
    const prev = weeks[i - 1];
    if (
      prev &&
      prev.plannedMinutes > 0 &&
      !holdsRace(w) &&
      w.plannedMinutes > JUMP * prev.plannedMinutes
    )
      found.add("volume-jump");
    if (
      parseLocalDate(w.weekStart).getDay() === 1 &&
      w.phase !== null &&
      w.phase !== "race" &&
      w.phase !== "recovery" &&
      w.planned.length === 1
    )
      found.add("one-run-week");
  });

  const demanding = new Set(
    planned
      .filter(
        (p) =>
          DEMANDING.has(runTypeOf(p.templateId)) ||
          (runTypeOf(p.templateId) === "easy" &&
            plannedRunMinutes(p.templateId, easyPace) >= 60)
      )
      .map((p) => p.date)
  );
  for (const date of demanding)
    if (demanding.has(localDateString(addLocalDays(parseLocalDate(date), 1))))
      found.add("back-to-back");

  if (
    season.runs.some(
      (r) => r.longestBefore > 0 && r.done.km > SPIKE * r.longestBefore
    )
  )
    found.add("spike");

  const raceWeek = weeks.findIndex(holdsRace);
  const distance = persona.answers.raceDistance;
  if (
    raceWeek > 0 &&
    (distance === "half" || distance === "marathon") &&
    weeks
      .slice(Math.max(0, raceWeek - 2), raceWeek)
      .every((w) => w.longKm === 0)
  )
    found.add("taper-long");
  const taper = weeks.findIndex((w) => w.phase === "taper");
  const build = weeks[taper - 1];
  if (
    taper > 0 &&
    build?.phase === "build" &&
    weeks[taper].plannedMinutes < 0.5 * build.plannedMinutes
  )
    found.add("taper-cut");

  const withLong = weeks.filter(
    (w) => w.longMinutes > 0 && w.plannedMinutes > 0
  );
  if (
    withLong.length > 0 &&
    withLong.filter((w) => w.longMinutes > 0.5 * w.plannedMinutes).length >
      withLong.length / 2
  )
    found.add("long-share");

  if (persona.answers.runFrequency === "new") {
    const first = weeks[0];
    if (
      first?.planned.some(
        (entry) =>
          plannedRunMinutes(entry.slice(entry.indexOf(":") + 1), easyPace) > 20
      )
    )
      found.add("run-walk");
  }

  const month = weeks.slice(1, 5).filter((w) => w.phase !== null);
  if (
    month.length > 0 &&
    month.reduce((n, w) => n + w.plannedMinutes, 0) / month.length <
      0.8 * habits.runner.weeklyMinutes
  )
    found.add("under-dose");

  const easyRuns = season.runs.filter(
    (r) => (r.type === "easy" || r.type === "long") && r.verdict !== null
  );
  if (
    easyRuns.length > 0 &&
    easyRuns.filter((r) => r.verdict === "easy-too-fast").length >
      easyRuns.length / 2
  )
    found.add("easy-nag");

  for (const e of season.events) {
    const derived =
      /derived a benchmark.*\(VDOT ([\d.]+), true ([\d.]+)\)/.exec(e);
    if (derived && Number(derived[2]) - Number(derived[1]) >= 3)
      found.add("derived-low");
    const flagged = /server flagged the week of (\d{4}-\d{2}-\d{2})/.exec(e);
    const raceDate = persona.answers.raceTargetDate;
    if (flagged && raceDate && flagged[1] > raceDate)
      found.add("nag-after-race");
  }
  return [...found].sort();
}

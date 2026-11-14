/**
 * Run24 (5), deep dive D5: the session library's shapes, from the template
 * to the run screen. Each session reaches the run screen as ordered
 * segments with a cue per segment, judged on pace only in its work, and
 * with a pace only where a confirmed benchmark gives one (§4 of the deep
 * dive, Run20 and Run21).
 */
import { describe, expect, it } from "vitest";
import { computePlanMetadata } from "../runPlanMetadata";
import {
  isWorkSegment,
  judgesPaceNow,
  pinnedWorkPace,
  segmentsDurationSeconds,
} from "../runSegments";
import {
  paceTableFromFitness,
  repeatPaceFromIntervalPace,
  resolveSessionPaces,
  type PaceTable,
} from "../runPaces";
import {
  intervalRestSeconds,
  plannedRepeatPace,
  withPlannedRest,
} from "../intervalRest";
import { runDoseLine } from "../runDose";
import { benchmarkEffortOf } from "../benchmarkEfforts";
import { qualityRungsFor, stepDownOneRung } from "../planDeloadWeek";
import { racePaceWork, type RaceEnrichment } from "../racePace";
import { runSessionAbout } from "../runSessionAbout";
import { runSessionExplainer } from "../runSessionExplainer";
import { RUN_TEMPLATES, type RunTemplate } from "../workoutTemplates";
import {
  fitRunToTimeLimit,
  plannedRunMinutes,
} from "@/features/program/runTimeLimits";
import { newRunnerTemplate } from "@/features/program/newRunner";

const template = (id: string): RunTemplate =>
  RUN_TEMPLATES.find((t) => t.id === id)!;

/** `id` as a session limit of `minutes` fits it. */
const fitTo = (id: string, minutes: number) =>
  fitRunToTimeLimit(
    {
      dayIndex: 2,
      templateId: id,
      type: template(id).type,
      status: "planned",
    },
    { sessionMinutes: minutes, longRunMinutes: null }
  ).templateId;

/** A 25:00 5K runner's confirmed paces (VDOT 38.3). */
const TABLE = paceTableFromFitness({
  benchmark: { distanceM: 5000, timeS: 25 * 60 },
  vdot: null,
})!;
const INTERVAL_PACE = resolveSessionPaces("intervals", TABLE).workPace!;

/** The launch's prefill for a planned session of `id`. */
function launch(id: string, paceTable: PaceTable | null) {
  return computePlanMetadata({
    displayUnit: "km",
    profileRunMode: "race_prep",
    todayDayIndex: 1,
    runPlan: undefined,
    runDays: undefined,
    paceTable,
    urlTemplateId: id,
    urlType: null,
  }).prefill;
}

const LIBRARY = [
  "cruise_3x8",
  "cruise_3x10",
  "progression_40",
  "progression_50",
  "progression_60",
  "sharpener_half",
  "sharpener_marathon",
  "6x2min",
  "5x3min",
  "4x4min",
  "8x200",
  "10x200",
  "12x200",
  "5k_pace_4x800",
  "5k_pace_5x800",
  "5k_pace_6x800",
  "10k_pace_3x2k",
  "10k_pace_4x2k",
  "hills_6x60s",
  "hills_8x60s",
  "hills_10x60s",
  "hills_6x30s",
  "fartlek_30",
  "sharpener_5k",
  "sharpener_10k",
];

describe("every session in the library reaches the run screen (Run24 (5))", () => {
  it("as ordered segments, each with its cue, with work to judge", () => {
    for (const id of LIBRARY) {
      for (const table of [TABLE, null]) {
        const prefill = launch(id, table);
        const segments = prefill.segments ?? [];
        expect(segments.length, id).toBeGreaterThan(1);
        expect(prefill.activityType, id).toBe(template(id).type);
        for (const seg of segments)
          expect(seg.cue, `${id} ${seg.label}`).toBeTruthy();
        expect(segments.some(isWorkSegment), id).toBe(true);
        // The pace is judged in the work segments only, as a tempo's is.
        for (const seg of segments)
          expect(
            judgesPaceNow(prefill.activityType, segments, seg),
            `${id} ${seg.label}`
          ).toBe(isWorkSegment(seg));
      }
    }
  });

  it("with no pace anywhere without a confirmed benchmark", () => {
    for (const id of LIBRARY) {
      const prefill = launch(id, null);
      expect(prefill.target?.type, id).not.toBe("pace");
      expect(prefill.intervals?.workPace, id).toBeUndefined();
      for (const seg of prefill.segments ?? [])
        expect(seg.paceTarget, `${id} ${seg.label}`).toBeUndefined();
    }
  });

  it("keeps a tempo-shaped or timed session to its stated minutes", () => {
    for (const id of LIBRARY) {
      const t = template(id);
      if (t.config.intervals?.workDistance) continue;
      const seconds = segmentsDurationSeconds(launch(id, null).segments!);
      expect(
        Math.abs(seconds - t.estimatedDuration * 60),
        id
      ).toBeLessThanOrEqual(30);
    }
  });
});

describe("repeats at their own pace", () => {
  it("are paced from the band or the race the benchmark gives", () => {
    // Within a couple of seconds of the table: the repeats' pace is worked
    // out from the interval pace every surface holds.
    const rep = repeatPaceFromIntervalPace(INTERVAL_PACE, "repetition")!;
    expect(rep).toBeGreaterThanOrEqual(TABLE.repetition[0] - 2);
    expect(rep).toBeLessThanOrEqual(TABLE.repetition[1] + 2);
    expect(
      Math.abs(
        repeatPaceFromIntervalPace(INTERVAL_PACE, "5k")! - TABLE.race["5k"]
      )
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(
        repeatPaceFromIntervalPace(INTERVAL_PACE, "10k")! - TABLE.race["10k"]
      )
    ).toBeLessThanOrEqual(3);
    expect(repeatPaceFromIntervalPace(INTERVAL_PACE, "feel")).toBeNull();
    expect(repeatPaceFromIntervalPace(INTERVAL_PACE, undefined)).toBe(
      INTERVAL_PACE
    );
    expect(repeatPaceFromIntervalPace(null, "repetition")).toBeNull();
  });

  it("carry that pace, pinned, so the run screen puts no interval band on it", () => {
    for (const [id, at] of [
      ["8x200", "repetition"],
      ["5k_pace_5x800", "5k"],
      ["10k_pace_3x2k", "10k"],
      ["sharpener_5k", "5k"],
    ] as const) {
      const prefill = launch(id, TABLE);
      const pace = repeatPaceFromIntervalPace(INTERVAL_PACE, at);
      expect(prefill.intervals?.workPace, id).toBe(pace);
      const work = prefill.segments!.filter(isWorkSegment);
      for (const seg of work) {
        expect(seg.paceTarget, id).toBe(pace);
        expect(seg.pacePinned, id).toBe(true);
      }
      expect(pinnedWorkPace(prefill.segments), id).toBe(pace);
    }
    // At the interval band, as before: not pinned, the band shows.
    const fiveK = launch("5x1k", TABLE);
    expect(fiveK.intervals?.workPace).toBe(INTERVAL_PACE);
    expect(pinnedWorkPace(fiveK.segments)).toBeNull();
  });

  it("name the race's pace on each repeat's heading, and its effort without one", () => {
    const paced = launch("5k_pace_4x800", TABLE).segments!.find(isWorkSegment)!;
    expect(paced.eyebrow).toBe("5K PACE · REP 1/4");
    const effort = launch("10k_pace_3x2k", null).segments!.find(isWorkSegment)!;
    expect(effort.eyebrow).toBe("10K EFFORT · REP 1/3");
    const quick = launch("8x200", TABLE).segments!.find(isWorkSegment)!;
    expect(quick.eyebrow).toBe("QUICK AND RELAXED · REP 1/8");
  });

  it("rest by what they are run at", () => {
    // Repetition pace: a full recovery, about twice the repeat.
    const rep = plannedRepeatPace(template("8x200"), INTERVAL_PACE)!;
    expect(
      intervalRestSeconds(
        template("8x200").config.intervals!,
        rep,
        "repetition"
      )
    ).toBe(Math.max(60, Math.round((0.2 * rep * 2) / 30) * 30));
    // A race's pace: a short one. 2 km at about 5:11 /km is 622 s: 187 s,
    // so 3 minutes.
    const tenK = plannedRepeatPace(template("10k_pace_3x2k"), INTERVAL_PACE)!;
    expect(
      intervalRestSeconds(
        template("10k_pace_3x2k").config.intervals!,
        tenK,
        "10k"
      )
    ).toBe(Math.round((2 * tenK * 0.3) / 30) * 30);
    // By feel: the template's own, the jog back down.
    expect(
      withPlannedRest(template("hills_8x60s"), INTERVAL_PACE).config.intervals
        ?.restDuration
    ).toBe(120);
    expect(launch("hills_8x60s", TABLE).intervals?.restDuration).toBe(120);
    // Timed repeats at the interval band rest 70% of the repeat, which is
    // what their templates hold.
    for (const id of ["6x2min", "5x3min", "4x4min"])
      expect(
        withPlannedRest(template(id), INTERVAL_PACE).config.intervals
          ?.restDuration,
        id
      ).toBe(template(id).config.intervals!.restDuration);
  });

  it("the launch and every surface agree on the rest", () => {
    for (const id of LIBRARY) {
      if (!template(id).config.intervals) continue;
      expect(launch(id, TABLE).intervals?.restDuration, id).toBe(
        withPlannedRest(template(id), INTERVAL_PACE).config.intervals
          ?.restDuration
      );
    }
  });

  it("state their minutes at their own pace, and a session by feel its own", () => {
    expect(runDoseLine(template("hills_8x60s"), null, INTERVAL_PACE)).toBe(
      "42 min"
    );
    expect(runDoseLine(template("fartlek_30"), null, INTERVAL_PACE)).toBe(
      "30 min"
    );
    expect(runDoseLine(template("10k_pace_3x2k"), null, INTERVAL_PACE)).toMatch(
      /^about \d+ min$/
    );
  });
});

describe("hills and a fartlek, by feel", () => {
  it("take no pace even with a benchmark", () => {
    for (const id of ["hills_6x60s", "hills_6x30s", "fartlek_30"]) {
      const prefill = launch(id, TABLE);
      expect(prefill.intervals?.workPace, id).toBeUndefined();
      for (const seg of prefill.segments!) {
        expect(seg.paceTarget, id).toBeUndefined();
        // No bare effort for the run screen to put the interval band on.
        expect(seg.effort, id).toBeUndefined();
      }
    }
  });

  it("go up the hill and jog back down", () => {
    const segs = launch("hills_6x60s", TABLE).segments!;
    expect(segs.map((s) => s.type)).toEqual([
      "warmup",
      ...Array.from({ length: 5 }, () => ["hard", "recovery"]).flat(),
      "hard",
      "cooldown",
    ]);
    expect(segs[1]).toMatchObject({
      label: "1 min uphill",
      eyebrow: "HARD · HILL 1/6",
      target: { kind: "duration", seconds: 60 },
    });
    expect(segs[1].cue).toMatch(/^Hill 1 of 6\./);
    expect(segs[2]).toMatchObject({
      label: "Jog down",
      eyebrow: "EASY · JOG DOWN",
    });
  });

  it("pick up comfortably hard, then ease back", () => {
    const segs = launch("fartlek_30", TABLE).segments!;
    const work = segs.filter(isWorkSegment);
    expect(work).toHaveLength(6);
    for (const seg of work) expect(seg.type).toBe("moderate");
    expect(work[0].eyebrow).toBe("COMFORTABLY HARD · 1/6");
    expect(work[0].cue).toMatch(/^Pick-up 1 of 6\./);
  });

  it("are never read as evidence of fitness", () => {
    for (const id of [
      "hills_8x60s",
      "fartlek_30",
      "8x200",
      "5k_pace_6x800",
      "10k_pace_4x2k",
    ]) {
      expect(
        benchmarkEffortOf({
          distance: 8000,
          duration: 2400,
          avgPace: 300,
          activityType: "intervals",
          templateId: id,
          completedAt: new Date(2026, 10, 1),
          workPortion: { seconds: 900, meters: 3600 },
        }),
        id
      ).toBeNull();
    }
    // Repeats at the interval band still are (Run24 (4)).
    expect(
      benchmarkEffortOf({
        distance: 8000,
        duration: 2400,
        avgPace: 300,
        activityType: "intervals",
        templateId: "4x4min",
        completedAt: new Date(2026, 10, 1),
        workPortion: { seconds: 960, meters: 4000 },
      })?.kind
    ).toBe("intervals");
  });
});

describe("a progression run", () => {
  it("runs easy, then finishes at threshold with a benchmark", () => {
    const prefill = launch("progression_50", TABLE);
    const threshold = resolveSessionPaces("tempo", TABLE).targetPace;
    expect(prefill.target).toEqual({ type: "pace", value: threshold });
    expect(prefill.segments!.map((s) => s.type)).toEqual(["easy", "moderate"]);
    expect(prefill.segments![0].target).toEqual({
      kind: "duration",
      seconds: 2100,
    });
    expect(prefill.segments![1]).toMatchObject({
      paceTarget: threshold,
      eyebrow: "COMFORTABLY HARD",
      target: { kind: "duration", seconds: 900 },
    });
    expect(segmentsDurationSeconds(prefill.segments!)).toBe(50 * 60);
  });

  it("never takes a goal pace, which a tempo's blocks do", () => {
    const race: RaceEnrichment = {
      distance: "marathon",
      goalPaceS: 340,
      phase: "taper",
      week: 14,
      source: "goal",
    };
    expect(racePaceWork(template("progression_60"), race)).toBeNull();
    expect(racePaceWork(template("cruise_3x10"), race)?.kind).toBe("tempo");
    expect(racePaceWork(template("sharpener_marathon"), race)?.kind).toBe(
      "tempo"
    );
  });
});

describe("a shorter session is a smaller dose of the same one", () => {
  it("steps down its own ladder in a lighter week", () => {
    expect(stepDownOneRung("cruise_3x10")).toBe("cruise_3x8");
    expect(stepDownOneRung("4x4min")).toBe("5x3min");
    expect(stepDownOneRung("12x200")).toBe("10x200");
    expect(stepDownOneRung("5k_pace_6x800")).toBe("5k_pace_5x800");
    expect(stepDownOneRung("10k_pace_4x2k")).toBe("10k_pace_3x2k");
    expect(stepDownOneRung("hills_10x60s")).toBe("hills_8x60s");
    expect(stepDownOneRung("progression_60")).toBe("progression_50");
    // A single session with nothing under it stays as it is.
    for (const id of [
      "hills_6x30s",
      "fartlek_30",
      "sharpener_5k",
      "sharpener_10k",
      "sharpener_half",
      "sharpener_marathon",
    ])
      expect(stepDownOneRung(id), id).toBeNull();
  });

  it("is cut to the same kind of work by a time limit, its own rungs first", () => {
    // Its own ladder first, though another of its kind is longer.
    expect(fitTo("cruise_3x10", 45)).toBe("cruise_3x8");
    expect(fitTo("progression_60", 45)).toBe("progression_40");
    expect(fitTo("hills_10x60s", 45)).toBe("hills_8x60s");
    expect(fitTo("tempo_40", 45)).toBe("tempo_30");
    // Then the same work: repeats at the interval band, hills.
    expect(fitTo("4x4min", 30)).toBe("8x400");
    expect(fitTo("4x1k", 30)).toBe("8x400");
    expect(fitTo("hills_6x60s", 30)).toBe("hills_6x30s");
    // Nothing of its own kind fits: an easy run.
    expect(fitTo("10k_pace_3x2k", 40)).toBe("easy_30");
    expect(fitTo("12x200", 30)).toBe("easy_30");
  });

  it("never turns one kind of session into another, at any limit", () => {
    const kind = (t: RunTemplate) =>
      t.config.timeTrial
        ? "trial"
        : t.config.taper
          ? `taper ${t.config.tempo ? "blocks" : t.config.repeatsAt}`
          : t.config.progression
            ? "progression"
            : t.config.tempo
              ? "threshold"
              : t.config.uphill
                ? "hills"
                : (t.config.repeatsAt ?? "interval band");
    const quality = RUN_TEMPLATES.filter(
      (t) => t.type === "tempo" || t.type === "intervals"
    );
    for (const original of quality) {
      for (const limit of [30, 35, 40, 45, 50, 55]) {
        const fitted = template(
          fitRunToTimeLimit(
            {
              dayIndex: 2,
              templateId: original.id,
              type: original.type,
              status: "planned",
            },
            { sessionMinutes: limit, longRunMinutes: null }
          ).templateId
        );
        if (fitted.type === "easy") continue;
        expect(kind(fitted), `${original.id} at ${limit} min`).toBe(
          kind(original)
        );
      }
    }
    // A hill or fartlek session is never repeats at a pace, cruise
    // intervals never a time trial, a sharpener never a build session.
    expect(fitTo("fartlek_30", 30)).toBe("fartlek_30");
    expect(fitTo("sharpener_marathon", 40)).toBe("sharpener_half");
    expect(fitTo("sharpener_half", 30)).toBe("easy_30");
    // A time trial is fitted to a shorter trial (Run24 (4)), else run easy.
    expect(fitTo("time_trial_5k", 40)).toBe("time_trial_3k");
    expect(fitTo("time_trial_3k", 30)).toBe("easy_30");
  });

  it("is held to its own rungs by a new runner's minutes", () => {
    // Two weeks after the run-walk weeks: 30 minutes a run.
    const until = "2026-09-07";
    const next = newRunnerTemplate("progression_60", "2026-09-14", until);
    expect(qualityRungsFor(template("progression_60"))).toContain(
      "progression_40"
    );
    expect(next?.id).not.toMatch(/^(tempo|cruise|sharpener)/);
    expect(plannedRunMinutes(next!)).toBeLessThanOrEqual(30);
  });
});

describe("the words for each session", () => {
  it("say what it is, how it feels and what to do, for every one", () => {
    for (const id of LIBRARY) {
      const lines = runSessionAbout(template(id));
      expect(lines.what, id).toMatch(/^[A-Z]/);
      expect(lines.feel, id).toMatch(/^[A-Z]/);
    }
    expect(runSessionAbout(template("hills_8x60s")).what).toBe(
      "A 15-minute warm-up to the foot of a hill, then 8 climbs of 1 minute, hard, jogging or walking back down between, then a 5-minute cool-down."
    );
    expect(runSessionAbout(template("fartlek_30")).feel).toMatch(
      /^Comfortably hard on the pick-ups, by feel/
    );
    expect(runSessionAbout(template("5k_pace_5x800")).what).toMatch(
      /5 repeats of 800 m, at 5K pace/
    );
    expect(runSessionAbout(template("progression_40")).what).toBe(
      "Easy running for 30 minutes, then 10 minutes comfortably hard to the finish."
    );
    expect(runSessionAbout(template("cruise_3x8")).what).toMatch(
      /three 8-minute blocks comfortably hard with 1 minute easy between/
    );
    expect(runSessionAbout(template("6x2min")).what).toMatch(
      /6 repeats of 2 minutes, hard/
    );
  });

  it("give each its own reason in the plan", () => {
    const why = (id: string, currentWeek: number) =>
      runSessionExplainer({
        type: template(id).type,
        templateId: id,
        currentWeek,
        totalWeeks: 16,
        distance: "10k",
      });
    expect(why("hills_6x30s", 1)).toMatch(/^Short hills build strength/);
    expect(why("hills_8x60s", 8)).toMatch(/^Hill repeats build strength/);
    expect(why("fartlek_30", 1)).toMatch(/fartlek/);
    expect(why("10k_pace_3x2k", 10)).toMatch(/race pace feels like/);
    expect(why("progression_50", 8)).toMatch(/finishes faster/);
    // The taper's sharpener keeps the taper's reason.
    expect(why("sharpener_10k", 14)).toMatch(/taper sharpener/);
  });
});

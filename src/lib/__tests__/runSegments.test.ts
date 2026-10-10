/**
 * STRUCT-SESS-01 — the canonical segment model.
 *
 * The load-bearing pin is CONSERVATION: every tempo template's segments sum
 * to exactly its estimatedDuration, and a strided easy run's segments sum to
 * its stated duration — structure REPLACES minutes, never extends the
 * session. That is what keeps the scheduler's volume math (and the RUN-EV-11
 * share pins) true after structure becomes real.
 */
import { describe, it, expect } from "vitest";
import {
  segmentsFromEasyWithStrides,
  segmentsFromGuided,
  segmentsFromIntervals,
  segmentsFromLongWithRacePace,
  segmentsFromRunWalk,
  segmentsFromTempo,
  segmentsDurationSeconds,
  segmentTargetLabel,
  STRIDE_RECOVERY_SECONDS,
} from "../runSegments";
import { racePaceBlockKm } from "../racePace";
import {
  RUN_TEMPLATES,
  RUN_WALK_TEMPLATE_IDS,
  type RunTemplate,
} from "../workoutTemplates";
import { GUIDED_WORKOUTS } from "../guidedRun";

describe("segmentsFromIntervals", () => {
  it("orders warmup → (work, rest)×N → cooldown, no trailing rest", () => {
    const segs = segmentsFromIntervals(
      {
        reps: 3,
        workDistance: 1000,
        restDuration: 90,
        warmupDuration: 600,
        cooldownDuration: 300,
      },
      "km"
    );
    expect(segs.map((s) => s.type)).toEqual([
      "warmup",
      "hard",
      "recovery",
      "hard",
      "recovery",
      "hard",
      "cooldown",
    ]);
    // Work reps are distance-based; rests duration-based.
    expect(segs[1].target).toEqual({ kind: "distance", meters: 1000 });
    expect(segs[2].target).toEqual({ kind: "duration", seconds: 90 });
    expect(segs[1].rep).toBe(1);
    expect(segs[1].totalReps).toBe(3);
  });

  it("carries the personalized work pace into label and paceTarget", () => {
    const segs = segmentsFromIntervals(
      {
        reps: 2,
        workDistance: 400,
        workPace: 250,
        restDuration: 60,
      },
      "km"
    );
    expect(segs[0].label).toMatch(/@ 4:10 \/km/);
    expect(segs[0].paceTarget).toBe(250);
  });
});

describe("segmentsFromTempo — the promoted prose", () => {
  it("every tempo template's segments sum EXACTLY to its estimatedDuration", () => {
    const tempos = RUN_TEMPLATES.filter((t) => t.config.tempo);
    expect(tempos.length).toBeGreaterThanOrEqual(3);
    for (const t of tempos) {
      const segs = segmentsFromTempo(t.config.tempo!, "km");
      expect(
        segmentsDurationSeconds(segs),
        `${t.id} structure must equal its stated duration`
      ).toBe(t.estimatedDuration * 60);
    }
  });

  it("tempo_40 renders the 2-block float structure the description promised", () => {
    const t = RUN_TEMPLATES.find((x) => x.id === "tempo_40")!;
    const segs = segmentsFromTempo(t.config.tempo!, "km", 270);
    expect(segs.map((s) => s.type)).toEqual([
      "warmup",
      "moderate",
      "recovery",
      "moderate",
      "cooldown",
    ]);
    expect(segs[1].label).toBe("20 min tempo @ 4:30 /km");
    expect(segs[2].label).toBe("Float");
    expect(segs[1].rep).toBe(1);
    expect(segs[3].rep).toBe(2);
  });

  it("single-block tempo carries no rep counters", () => {
    const t = RUN_TEMPLATES.find((x) => x.id === "tempo_20")!;
    const segs = segmentsFromTempo(t.config.tempo!, "km");
    const work = segs.find((s) => s.type === "moderate")!;
    expect(work.rep).toBeUndefined();
  });
});

describe("segmentsFromEasyWithStrides", () => {
  it("conserves the stated duration exactly", () => {
    for (const id of [
      "easy_30_strides",
      "easy_40_strides",
      "easy_50_strides",
    ]) {
      const t = RUN_TEMPLATES.find((x) => x.id === id)!;
      const segs = segmentsFromEasyWithStrides(
        t.estimatedDuration,
        t.config.strides!
      );
      expect(segmentsDurationSeconds(segs), id).toBe(t.estimatedDuration * 60);
    }
  });

  it("easy block first, then alternating stride/walk-back per rep", () => {
    const segs = segmentsFromEasyWithStrides(30, { reps: 4, workSeconds: 20 });
    expect(segs[0].type).toBe("easy");
    expect(segs.filter((s) => s.type === "hard")).toHaveLength(4);
    expect(segs.filter((s) => s.type === "recovery")).toHaveLength(4);
    // 30min − 4×(20+60)s strides block = 24:40 easy.
    expect(segs[0].target).toEqual({
      kind: "duration",
      seconds: 30 * 60 - 4 * (20 + STRIDE_RECOVERY_SECONDS),
    });
    expect(segs[1].instruction).toMatch(/not sprinting/i);
  });
});

describe("A2 — segmentsFromTempo at goal pace", () => {
  it("pins the pace, renames the effort, and keeps duration conservation", () => {
    const t = RUN_TEMPLATES.find((x) => x.id === "tempo_40")!;
    const segs = segmentsFromTempo(t.config.tempo!, "km", 300, {
      atGoalPace: true,
    });
    // Same shape and the same total — goal pace changes the register,
    // never the dose.
    expect(segmentsDurationSeconds(segs)).toBe(t.estimatedDuration * 60);
    const blocks = segs.filter((s) => s.type === "moderate");
    expect(blocks).toHaveLength(2);
    for (const b of blocks) {
      expect(b.paceTarget).toBe(300);
      expect(b.pacePinned).toBe(true);
      expect(b.label).toContain("@ goal pace");
      expect(b.cue).toMatch(/goal race pace/i);
    }
    // Warmup/cooldown stay unpinned.
    expect(segs[0].pacePinned).toBeUndefined();
  });

  it("without the flag, blocks stay tempo-registered and unpinned", () => {
    const t = RUN_TEMPLATES.find((x) => x.id === "tempo_20")!;
    const segs = segmentsFromTempo(t.config.tempo!, "km", 270);
    const work = segs.find((s) => s.type === "moderate")!;
    expect(work.pacePinned).toBeUndefined();
    expect(work.label).toContain("min tempo");
  });
});

describe("A2 — racePaceBlockKm", () => {
  it("one third in whole km, floored at 3, capped per distance", () => {
    expect(racePaceBlockKm(12, "half")).toBe(4);
    expect(racePaceBlockKm(15, "half")).toBe(5);
    expect(racePaceBlockKm(20, "half")).toBe(7);
    // Half cap: 8 — a hypothetical 30K in a half plan stays at 8.
    expect(racePaceBlockKm(30, "half")).toBe(8);
    expect(racePaceBlockKm(25, "marathon")).toBe(8);
    expect(racePaceBlockKm(30, "marathon")).toBe(10);
    // Floor: never below 3K even for a short long run.
    expect(racePaceBlockKm(8, "half")).toBe(3);
  });
});

describe("A2 — segmentsFromLongWithRacePace", () => {
  it("conserves the total distance exactly across easy + race-pace block", () => {
    const segs = segmentsFromLongWithRacePace(15, 5, 300, "km");
    const meters = segs.reduce(
      (a, s) => a + (s.target.kind === "distance" ? s.target.meters : 0),
      0
    );
    expect(meters).toBe(15000);
    expect(segs.map((s) => s.type)).toEqual(["easy", "moderate"]);
  });

  it("the block carries the pinned goal pace and the RACE PACE eyebrow", () => {
    const segs = segmentsFromLongWithRacePace(20, 7, 285, "km");
    const block = segs[1];
    expect(block.target).toEqual({ kind: "distance", meters: 7000 });
    expect(block.paceTarget).toBe(285);
    expect(block.pacePinned).toBe(true);
    expect(block.eyebrow).toBe("RACE PACE");
    expect(block.label).toBe("7 km @ 4:45 /km");
    /* Same session read in miles: the block is the same DISTANCE, so its
       metre target is untouched — only the label and the pace convert.
       (7 km is 4.3 mi; 4:45/km is 7:39/mi.) */
    const mi = segmentsFromLongWithRacePace(20, 7, 285, "mi");
    const miBlock = mi.find((x) => x.type === "moderate")!;
    expect(miBlock.label).toBe("4.3 mi @ 7:39 /mi");
    expect(miBlock.target).toEqual(block.target);
    expect(block.cue).toMatch(/race-pace block/i);
    // The easy lead-in tells the runner what's coming.
    expect(segs[0].cue).toMatch(/race-pace block comes at the end/i);
  });
});

describe("segmentsFromGuided", () => {
  it("is an identity mapping over the catalogue's segments", () => {
    const w = GUIDED_WORKOUTS[0];
    const segs = segmentsFromGuided(w);
    expect(segs).toHaveLength(w.segments.length);
    segs.forEach((s, i) => {
      expect(s.type).toBe(w.segments[i].type);
      expect(s.label).toBe(w.segments[i].label);
      expect(s.target).toEqual({
        kind: "duration",
        seconds: w.segments[i].durationSeconds,
      });
    });
  });
});

describe("cross-run cue rotation (seed)", () => {
  const shape = {
    reps: 5,
    workDistance: 1000,
    restDuration: 90,
    warmupDuration: 600,
    cooldownDuration: 300,
  };

  it("same seed → identical spoken script (reproducible runs)", () => {
    const a = segmentsFromIntervals(shape, "km", 7).map((s) => s.cue);
    const b = segmentsFromIntervals(shape, "km", 7).map((s) => s.cue);
    expect(a).toEqual(b);
  });

  it("different seeds → a different script, same structure", () => {
    // The whole point: a 5×1K on Tuesday must not open with the same
    // sentence as the 5×1K last Tuesday. Structure (labels, targets)
    // must not move — only the phrasing.
    const a = segmentsFromIntervals(shape, "km", 0);
    const b = segmentsFromIntervals(shape, "km", 1);
    expect(a.map((s) => s.label)).toEqual(b.map((s) => s.label));
    expect(a.map((s) => s.cue)).not.toEqual(b.map((s) => s.cue));
    expect(a[0].cue).not.toBe(b[0].cue); // the warm-up opener itself
  });

  it("unseeded call keeps the historical script", () => {
    const segs = segmentsFromIntervals(shape, "km");
    expect(segs[0].cue).toBe("Warming up. Keep it easy and conversational.");
    expect(segs[segs.length - 1].cue).toBe(
      "Cooling down. Nice and easy from here."
    );
  });

  it("stride walk-backs no longer repeat one sentence all session", () => {
    // The last within-session repeat to survive STRUCT-SESS-02: every
    // walk-back spoke the identical line, five times in eight minutes.
    const segs = segmentsFromEasyWithStrides(30, {
      reps: 5,
      workSeconds: 20,
    });
    const walkBacks = segs
      .filter((s) => s.label === "Walk back")
      .map((s) => s.cue);
    expect(walkBacks.length).toBe(5);
    expect(new Set(walkBacks).size).toBe(5);
  });
});

/* Run20 (5): a new runner's first six weeks run as run-walk, building to
   continuous running (NHS Couch to 5K). */
describe("segmentsFromRunWalk", () => {
  const ladder = RUN_WALK_TEMPLATE_IDS.map(
    (id) => RUN_TEMPLATES.find((t) => t.id === id)!
  );
  const shape = (t: RunTemplate) => t.config.runWalk!;
  const minutes = (seconds: number[]) =>
    seconds.reduce((a, b) => a + b, 0) / 60;

  it("is a template for each of the six weeks, each conserving its stated time", () => {
    expect(RUN_TEMPLATES.filter((t) => t.config.runWalk)).toEqual(ladder);
    for (const t of ladder) {
      expect(t.type, t.id).toBe("easy");
      expect(t.config.targetDurationMinutes, t.id).toBe(t.estimatedDuration);
      expect(segmentsDurationSeconds(segmentsFromRunWalk(shape(t))), t.id).toBe(
        t.estimatedDuration * 60
      );
    }
  });

  it("starts at Couch to 5K's week 1 and builds to 20 minutes non-stop", () => {
    // Week 1 as the NHS plan has it: a 5-minute walk, then 1 minute
    // running and 90 seconds walking seven times, and a last minute.
    expect(shape(ladder[0])).toMatchObject({
      warmupWalkSec: 300,
      runSecs: Array(8).fill(60),
      walkSecs: Array(7).fill(90),
    });
    // Minutes of running near Couch to 5K's own for each week.
    expect(ladder.map((t) => minutes(shape(t).runSecs))).toEqual([
      8, 9, 9, 15, 18, 20,
    ]);
    const longest = ladder.map((t) => Math.max(...shape(t).runSecs) / 60);
    expect(longest).toEqual([1, 1.5, 3, 5, 10, 20]);
    // The longest run never more than doubles from one week to the next.
    longest
      .slice(1)
      .forEach((m, i) => expect(m).toBeLessThanOrEqual(2 * longest[i]));
    for (const t of ladder) {
      expect(shape(t).walkSecs, t.id).toHaveLength(shape(t).runSecs.length - 1);
    }
  });

  it("walks to warm up, runs and walks in turn, walks to finish, with no pace", () => {
    const segs = segmentsFromRunWalk(shape(ladder[0]));
    expect(segs.map((s) => s.label)).toEqual([
      "Walk",
      ...Array(7).fill(["Run", "Walk"]).flat(),
      "Run",
      "Walk",
    ]);
    expect(segs.map((s) => s.type)).toEqual([
      "warmup",
      ...Array(7).fill(["easy", "recovery"]).flat(),
      "easy",
      "cooldown",
    ]);
    expect(segs.map((s) => s.eyebrow).slice(0, 4)).toEqual([
      "WARM-UP",
      "RUN 1/8",
      "WALK",
      "RUN 2/8",
    ]);
    expect(segs.at(-1)?.eyebrow).toBe("COOL-DOWN");
    for (const s of segs) {
      expect(s.paceTarget).toBeUndefined();
      expect(s.effort).toBeUndefined();
    }
  });

  it("says something new at every step, past the numbers", () => {
    // Phrase by phrase, whatever the case and punctuation: "1 minute, easy
    // enough to talk." and a later "Easy enough to talk." are the same
    // words twice. Short and numbered phrases ("Walk.", "90 seconds") are
    // the steps' own names.
    const phrases = (cue: string) =>
      cue
        .toLowerCase()
        .split(/[.,]/)
        .map((p) => p.trim())
        .filter((p) => p && !/\d/.test(p) && p.split(/\s+/).length >= 3);
    for (const t of ladder) {
      for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const said = segmentsFromRunWalk(shape(t), seed).flatMap((s) =>
          phrases(s.cue!)
        );
        expect(said.length, `${t.id}`).toBeGreaterThan(0);
        expect(
          said.filter((p, i) => said.indexOf(p) !== i),
          `${t.id} seed ${seed}`
        ).toEqual([]);
      }
    }
  });

  it("makes a single run the whole session", () => {
    const segs = segmentsFromRunWalk(shape(ladder[5]));
    expect(segs.map((s) => s.label)).toEqual(["Walk", "Run", "Walk"]);
    expect(segs[1]).toMatchObject({
      eyebrow: "RUN",
      target: { kind: "duration", seconds: 1200 },
      cue: "Run for 20 minutes without a break. Easy enough to talk the whole way.",
    });
    expect(segs[1].rep).toBeUndefined();
  });
});

describe("segmentTargetLabel", () => {
  it("spells out a part minute rather than rounding it", () => {
    const label = (seconds: number) =>
      segmentTargetLabel({ kind: "duration", seconds });
    expect(label(45)).toBe("45s");
    expect(label(60)).toBe("1 min");
    // A 90-second walk read "2 min", and so did an interval's 90s rest.
    expect(label(90)).toBe("90s");
    expect(label(150)).toBe("2 min 30s");
    expect(label(330)).toBe("5 min 30s");
    expect(label(1200)).toBe("20 min");
    expect(segmentTargetLabel({ kind: "distance", meters: 1000 })).toBe("1K");
  });
});

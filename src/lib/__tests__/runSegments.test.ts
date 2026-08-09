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
  segmentsFromTempo,
  segmentsDurationSeconds,
  STRIDE_RECOVERY_SECONDS,
} from "../runSegments";
import { RUN_TEMPLATES } from "../workoutTemplates";
import { GUIDED_WORKOUTS } from "../guidedRun";

describe("segmentsFromIntervals", () => {
  it("orders warmup → (work, rest)×N → cooldown, no trailing rest", () => {
    const segs = segmentsFromIntervals({
      reps: 3,
      workDistance: 1000,
      restDuration: 90,
      warmupDuration: 600,
      cooldownDuration: 300,
    });
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
    const segs = segmentsFromIntervals({
      reps: 2,
      workDistance: 400,
      workPace: 250,
      restDuration: 60,
    });
    expect(segs[0].label).toMatch(/@ 4:10\/km/);
    expect(segs[0].paceTarget).toBe(250);
  });
});

describe("segmentsFromTempo — the promoted prose", () => {
  it("every tempo template's segments sum EXACTLY to its estimatedDuration", () => {
    const tempos = RUN_TEMPLATES.filter((t) => t.config.tempo);
    expect(tempos.length).toBeGreaterThanOrEqual(3);
    for (const t of tempos) {
      const segs = segmentsFromTempo(t.config.tempo!);
      expect(
        segmentsDurationSeconds(segs),
        `${t.id} structure must equal its stated duration`
      ).toBe(t.estimatedDuration * 60);
    }
  });

  it("tempo_40 renders the 2-block float structure the description promised", () => {
    const t = RUN_TEMPLATES.find((x) => x.id === "tempo_40")!;
    const segs = segmentsFromTempo(t.config.tempo!, 270);
    expect(segs.map((s) => s.type)).toEqual([
      "warmup",
      "moderate",
      "recovery",
      "moderate",
      "cooldown",
    ]);
    expect(segs[1].label).toBe("20 min tempo @ 4:30/km");
    expect(segs[2].label).toBe("Float");
    expect(segs[1].rep).toBe(1);
    expect(segs[3].rep).toBe(2);
  });

  it("single-block tempo carries no rep counters", () => {
    const t = RUN_TEMPLATES.find((x) => x.id === "tempo_20")!;
    const segs = segmentsFromTempo(t.config.tempo!);
    const work = segs.find((s) => s.type === "moderate")!;
    expect(work.rep).toBeUndefined();
  });
});

describe("segmentsFromEasyWithStrides", () => {
  it("conserves the stated duration exactly", () => {
    for (const id of ["easy_30_strides", "easy_40_strides", "easy_50_strides"]) {
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

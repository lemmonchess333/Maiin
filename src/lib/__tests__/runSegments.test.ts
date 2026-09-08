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
  racePaceBlockKm,
  segmentsFromEasyWithStrides,
  segmentsFromGuided,
  segmentsFromIntervals,
  segmentsFromLongWithRacePace,
  segmentsFromTempo,
  segmentsDurationSeconds,
  STRIDE_RECOVERY_SECONDS,
} from "../runSegments";
import { RUN_TEMPLATES } from "../workoutTemplates";
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
    expect(segs[0].label).toMatch(/@ 4:10\/km/);
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
    expect(segs[1].label).toBe("20 min tempo @ 4:30/km");
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
    expect(block.label).toBe("7 km @ 4:45/km");
    /* Same session read in miles: the block is the same DISTANCE, so its
       metre target is untouched — only the label and the pace convert.
       (7 km is 4.3 mi; 4:45/km is 7:39/mi.) */
    const mi = segmentsFromLongWithRacePace(20, 7, 285, "mi");
    const miBlock = mi.find((x) => x.type === "moderate")!;
    expect(miBlock.label).toBe("4.3 mi @ 7:39/mi");
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

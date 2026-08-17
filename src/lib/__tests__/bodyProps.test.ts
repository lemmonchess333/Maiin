import { describe, it, expect } from "vitest";
import {
  dumbbell,
  frontalBarbell,
  profileBarbell,
  renderProp,
  ropeAttachment,
  type Pt,
  type PropState,
} from "../bodyProps";

/** Every `<circle>` in a fragment as [cx, cy, r]. */
const circles = (svg: string): [number, number, number][] =>
  [
    ...svg.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="(-?[\d.]+)"/g),
  ].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);

/** Every `<line>` as [x1, y1, x2, y2]. */
const lines = (svg: string): [number, number, number, number][] =>
  [
    ...svg.matchAll(
      /<line x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/g
    ),
  ].map((m) => [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]);

describe("profileBarbell", () => {
  it("centres the plate exactly on the grip", () => {
    const svg = profileBarbell([40, 60], 10);
    for (const [cx, cy] of circles(svg)) {
      expect(cx).toBe(40);
      expect(cy).toBe(60);
    }
  });

  it("keeps declared radii whole so the disc is identifiable", () => {
    // The rig tests read the plate back by its radius string; a
    // `toFixed(1)` formatter would silently emit r="10.0" and every one
    // of those pins would stop matching while still passing.
    expect(profileBarbell([0, 0], 10)).toContain('r="10"');
    expect(profileBarbell([0, 0], 16)).toContain('r="16"');
  });

  it("carries a collar and sleeve tip, so it is a bar end not a wheel", () => {
    const svg = profileBarbell([40, 60], 10);
    expect((svg.match(/<rect/g) ?? []).length).toBe(2);
  });

  it("scales its whole construction with the plate", () => {
    const small = profileBarbell([40, 60], 10);
    const big = profileBarbell([40, 60], 16);
    const rs = (s: string) => circles(s).map(([, , r]) => r);
    for (const [a, b] of rs(small).map((r, i) => [r, rs(big)[i]])) {
      expect(b).toBeGreaterThan(a);
    }
  });
});

describe("frontalBarbell", () => {
  it("spans both grips — grip width IS bar width", () => {
    const left: Pt = [14, 20];
    const right: Pt = [86, 20];
    const [shaft] = lines(frontalBarbell(left, right, 9));
    // Shaft runs outboard of each grip (sleeves), never inside them.
    expect(shaft[0]).toBeLessThan(left[0]);
    expect(shaft[2]).toBeGreaterThan(right[0]);
    expect(shaft[1]).toBe(shaft[3]); // level
  });

  it("moves with the grips rather than sitting at a fixed place", () => {
    const low = lines(frontalBarbell([14, 90], [86, 90], 9))[0];
    const high = lines(frontalBarbell([14, 10], [86, 10], 9))[0];
    expect(low[1] - high[1]).toBe(80);
  });

  it("hangs a plate off each sleeve", () => {
    const svg = frontalBarbell([14, 20], [86, 20], 9);
    expect((svg.match(/<ellipse/g) ?? []).length).toBe(4); // 2 per plate
  });
});

describe("ropeAttachment", () => {
  const PULLEY: Pt = [72, -10];
  const HAND: Pt = [60, 90];

  it("draws TWO strands, because the exercise promises two ends", () => {
    const tails = circles(ropeAttachment(PULLEY, HAND, 0.5)).filter(
      ([, , r]) => r === 2.4
    );
    expect(tails.length).toBe(2);
  });

  it("opens the strands as the arms lock out", () => {
    const gap = (spread: number) => {
      const xs = circles(ropeAttachment(PULLEY, HAND, spread))
        .filter(([, , r]) => r === 2.4)
        .map(([x]) => x);
      return Math.abs(xs[1] - xs[0]);
    };
    expect(gap(1)).toBeGreaterThan(gap(0));
  });

  it("hangs the tails straight down whatever the cable is doing", () => {
    // The rope used to extend colinearly with the cable, so at the
    // folded start the ends stuck out FORWARDS. Rope obeys gravity: each
    // tail drops the same distance below the grip it hangs from, no
    // matter where the pulley sits. Measured on the tail SEGMENT rather
    // than from the hand — the grips fan off the pull axis, so the hand
    // is not the thing a tail hangs from.
    const tailDrops = (pulley: Pt) => {
      const all = lines(ropeAttachment(pulley, HAND, 0.5));
      // cable, then per strand: yoke→grip, grip→tail.
      return [all[2], all[4]].map(([, y1, , y2]) => y2 - y1);
    };
    for (const drop of [
      ...tailDrops([60, -40]), // pulley straight overhead
      ...tailDrops([140, -10]), // pulley well forward
      ...tailDrops([-20, 40]), // pulley behind and low
    ]) {
      expect(drop).toBeCloseTo(13, 5);
    }
  });

  it("solves the cable FROM the grip, never independently of it", () => {
    const near = ropeAttachment(PULLEY, [60, 40], 0);
    const far = ropeAttachment(PULLEY, [60, 140], 0);
    const cable = (svg: string) => lines(svg)[0];
    // Pulley end pinned, rope end tracks the hand.
    expect(cable(near)[0]).toBe(PULLEY[0]);
    expect(cable(far)[0]).toBe(PULLEY[0]);
    expect(cable(far)[3]).toBeGreaterThan(cable(near)[3] + 90);
  });

  it("never spans anything like body width (the gated defect)", () => {
    // What got this demo production-gated was a straight bar drawn
    // across the whole figure. Nothing the rope emits may approach it.
    for (const spread of [0, 0.5, 1]) {
      for (const [x1, , x2] of lines(ropeAttachment(PULLEY, HAND, spread))) {
        expect(Math.abs(x2 - x1)).toBeLessThan(40);
      }
    }
  });
});

describe("dumbbell", () => {
  it("draws one bell per hand, centred exactly on the grip", () => {
    const hands: Pt[] = [
      [12.3, 80.5],
      [87.7, 80.5],
    ];
    const cs = circles(dumbbell(hands, 5.5));
    expect(cs.length).toBe(6); // face + rim + hub, per hand
    for (const [i, [cx, cy]] of cs.entries()) {
      const hand = hands[Math.floor(i / 3)];
      expect(cx).toBe(hand[0]);
      expect(cy).toBe(hand[1]);
    }
  });

  it("scales the whole construction with the bell", () => {
    const rs = (r: number) =>
      circles(dumbbell([[50, 50]], r)).map(([, , rr]) => rr);
    const small = rs(5.5);
    const big = rs(8);
    for (let i = 0; i < small.length; i++) {
      expect(big[i]).toBeGreaterThan(small[i]);
    }
  });

  it("renders as held gear — in front, nothing behind", () => {
    const { front, behind } = renderProp({
      kind: "dumbbell",
      hands: [[10, 90]],
      bellR: 5.5,
    });
    expect(front).not.toBe("");
    expect(behind).toBe("");
  });
});

describe("renderProp", () => {
  it("puts held gear in front and machine frames behind", () => {
    const held = renderProp({
      kind: "rigidBar",
      view: "profile",
      hand: [40, 60],
      plateR: 10,
    });
    expect(held.front).not.toBe("");
    expect(held.behind).toBe("");

    const frame = renderProp({
      kind: "fixedBar",
      left: [20, 10],
      right: [80, 10],
      frameY: -14,
    });
    expect(frame.behind).not.toBe("");
    expect(frame.front).toBe("");
  });

  it("is pure — same state renders the same SVG", () => {
    const state: PropState = {
      kind: "ropeAttachment",
      pulley: [72, -10],
      hand: [60, 90],
      spread: 0.3,
    };
    expect(renderProp(state)).toEqual(renderProp(state));
  });

  it("gives the dip station feet on the declared floor", () => {
    const { behind } = renderProp({
      kind: "dipBars",
      left: [30, 100],
      right: [70, 100],
      floorY: 222,
    });
    const feet = lines(behind).filter(([, y1, , y2]) => y1 === y2);
    expect(feet.length).toBe(2);
    for (const [, y] of feet) expect(y).toBe(221);
  });
});

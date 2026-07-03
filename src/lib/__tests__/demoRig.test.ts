import { describe, it, expect } from "vitest";
import {
  solve,
  solveArmIK,
  samplePose,
  lerpPose,
  renderRigSvg,
  getRigDemo,
  RIG_DEMOS,
  type Pose,
} from "../demoRig";

const STANDING: Pose = { shank: 0, thigh: 0, torso: 0, shoulder: 0, elbow: 0 };

describe("solve (forward kinematics)", () => {
  it("stacks the chain vertically when standing", () => {
    const p = solve(STANDING);
    expect(p.knee[1]).toBeLessThan(p.ankle[1]); // knee above ankle (y down)
    expect(p.hip[1]).toBeLessThan(p.knee[1]);
    expect(p.neck[1]).toBeLessThan(p.hip[1]);
    expect(Math.abs(p.knee[0] - p.ankle[0])).toBeLessThan(0.001);
    expect(Math.abs(p.hip[0] - p.ankle[0])).toBeLessThan(0.001);
  });

  it("a squat bottom drops the hip below standing height and behind the knee", () => {
    const bottom = RIG_DEMOS.squat.keyframes.at(-1)!;
    const standing = solve(RIG_DEMOS.squat.keyframes[0]);
    const p = solve(bottom);
    expect(p.hip[1]).toBeGreaterThan(standing.hip[1] + 30); // much lower
    expect(p.hip[0]).toBeLessThan(p.knee[0]); // hips back
    expect(p.knee[0]).toBeGreaterThan(p.ankle[0]); // knees travel forward
  });
});

describe("solveArmIK", () => {
  it("puts the hand on a reachable target", () => {
    const shoulder: [number, number] = [100, 100];
    const target: [number, number] = [140, 160];
    const { hand, elbow } = solveArmIK(shoulder, target, true);
    expect(Math.hypot(hand[0] - target[0], hand[1] - target[1])).toBeLessThan(
      0.5
    );
    // Link lengths respected.
    const upper = Math.hypot(elbow[0] - shoulder[0], elbow[1] - shoulder[1]);
    expect(upper).toBeGreaterThan(40);
    expect(upper).toBeLessThan(48);
  });

  it("clamps an unreachable target to max reach without NaN", () => {
    const { hand, elbow } = solveArmIK([0, 0], [500, 0], true);
    expect(Number.isFinite(hand[0])).toBe(true);
    expect(Number.isFinite(elbow[1])).toBe(true);
    expect(Math.hypot(hand[0], hand[1])).toBeLessThan(90);
  });
});

describe("pose sampling", () => {
  it("returns exact keyframes at the endpoints", () => {
    const track = RIG_DEMOS.squat.keyframes;
    expect(samplePose(track, 0)).toEqual(track[0]);
    expect(samplePose(track, 1)).toEqual(track[track.length - 1]);
  });

  it("interpolates monotonically between frames", () => {
    const a: Pose = { ...STANDING };
    const b: Pose = { ...STANDING, torso: 40 };
    expect(lerpPose(a, b, 0).torso).toBe(0);
    expect(lerpPose(a, b, 1).torso).toBe(40);
    const mid = lerpPose(a, b, 0.5).torso;
    expect(mid).toBeGreaterThan(10);
    expect(mid).toBeLessThan(30);
  });
});

describe("renderRigSvg", () => {
  it("emits a standalone svg with body facets", () => {
    const svg = renderRigSvg(STANDING, [], "none");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.match(/<polygon/g)!.length).toBeGreaterThan(15);
  });

  it("tints ONLY when a region is listed (honest muscle fill)", () => {
    const plain = renderRigSvg(STANDING, [], "none");
    const tinted = renderRigSvg(STANDING, ["quad"], "none");
    expect(plain.includes("--rig-muscle-a")).toBe(false);
    expect(tinted.includes("--rig-muscle-a")).toBe(true);
  });

  it("draws the bar for barbell equipment", () => {
    const withBar = renderRigSvg(STANDING, [], "barbell-back");
    const without = renderRigSvg(STANDING, [], "none");
    expect(withBar.includes("<rect")).toBe(true);
    expect(without.includes("<rect")).toBe(false);
  });
});

describe("registry", () => {
  it("every demo has 2+ keyframes and at least one tinted region", () => {
    for (const [id, demo] of Object.entries(RIG_DEMOS)) {
      expect(demo.keyframes.length, id).toBeGreaterThanOrEqual(2);
      expect(demo.tint.length, id).toBeGreaterThan(0);
    }
  });

  it("getRigDemo resolves known ids and misses unknown ones", () => {
    expect(getRigDemo("squat")).not.toBeNull();
    expect(getRigDemo("zercher-yodel")).toBeNull();
  });
});

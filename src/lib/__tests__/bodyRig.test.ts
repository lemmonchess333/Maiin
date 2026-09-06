import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyToPoint,
  BACK_RACK,
  BODY_DEMOS,
  CALF_BALL,
  CALF_BLOCK_TOP,
  DIP_GRIP,
  FORM_BEAT_IDS,
  getBodyDemo,
  getAuthoredBeats,
  getFormBeats,
  renderBodyDemo,
} from "../bodyRig";
import { PLACARD_CUE_WORDS } from "../exerciseTempo";
import { ANTERIOR, POSTERIOR } from "../bodyModelData";
import { EXERCISES } from "../exercises";
import { FAR_ARM_SHIFT, SIDE_ANCHORS, SIDE_PIECES } from "../bodySideData";

/** The measured wrist anchors — ON the art, since 2026-08-17. They used
 *  to be [10,100] / [9,106], ~6.5 units off the end of the forearm art,
 *  which is why anything drawn at a hand landed beside the arm. */
const ANT_WRIST: [number, number] = [3.5, 101.2];
const POST_WRIST: [number, number] = [3.4, 108.5];

function polyYs(svg: string): number[] {
  return [...svg.matchAll(/points="([^"]+)"/g)]
    .flatMap((m) => m[1].trim().split(" "))
    .map((pair) => Number(pair.split(",")[1]));
}

describe("vendored body model", () => {
  it("carries the full figure for both views", () => {
    expect(ANTERIOR.length).toBe(33);
    expect(POSTERIOR.length).toBe(33);
    expect(ANTERIOR.some((p) => p.muscle === "head")).toBe(true);
    expect(POSTERIOR.some((p) => p.muscle === "gluteal")).toBe(true);
  });
});

describe("renderBodyDemo", () => {
  it("an anterior demo renders the full vendored figure", () => {
    // Lateral raise at t=0: the arms sit 4° off rest and the head is
    // untouched (its top vertex still at the model's y≈0). 33 vendored
    // + 2 feet + 4 fist facets (two per hand — the second is the
    // knuckle band); the library figure ships neither feet nor hands.
    // (Was the squat, which has been a SIDE demo since the 2026-09-02
    // evaluation rebuild.)
    const svg = renderBodyDemo("lateral-raise", 0);
    const ys = polyYs(svg);
    expect(Math.min(...ys)).toBeLessThan(1);
    const body = svg.replace(/<g class="glow">.*?<\/g>/, "");
    expect(body.match(/<polygon/g)!.length).toBe(39);
  });

  /** Polygons whose every vertex sits within `r` of a point. */
  const polysNear = (svg: string, p: [number, number], r: number) =>
    [...svg.matchAll(/<polygon points="([^"]+)"/g)]
      .map((m) =>
        m[1]
          .trim()
          .split(" ")
          .map((pair) => pair.split(",").map(Number) as [number, number])
      )
      .filter((pts) =>
        pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= r)
      );

  it("the fist CAPS the forearm rather than floating beside it", () => {
    // The defect that got the first attempt reverted. It was drawn at a
    // hand anchor sitting ~6.5 units off the end of the arm, so it read
    // as a rock balanced next to the limb. Pinned as: the fist's mass
    // sits ON the elbow→wrist line, and PAST the wrist, not to one side.
    // No anterior demo is an arms-at-rest identity any more (calf-raise
    // moved to the side view on 2026-09-02), so measure against the
    // SOLVED forearm axis: lateral-raise at t=0, elbow and wrist run
    // through the arm's own ops. The fist is grouped with the forearm,
    // so it must cap that solved axis exactly as it capped the rest one.
    const pose = BODY_DEMOS["lateral-raise"].pose(0);
    const elbow = applyToPoint([20, 71], (pose.upperArmL ?? []) as never[]);
    const wrist = applyToPoint(ANT_WRIST, (pose.foreArmL ?? []) as never[]);
    const svg = renderBodyDemo("lateral-raise", 0);
    const facets = polysNear(svg, wrist, 11);
    expect(facets.length).toBe(2); // main mass + knuckle band

    const ux =
      (wrist[0] - elbow[0]) /
      Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1]);
    const uy =
      (wrist[1] - elbow[1]) /
      Math.hypot(wrist[0] - elbow[0], wrist[1] - elbow[1]);
    for (const pts of facets) {
      const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length;
      const cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
      const vx = cx - wrist[0];
      const vy = cy - wrist[1];
      // Along the arm: positive, i.e. beyond the wrist.
      expect(vx * ux + vy * uy).toBeGreaterThan(0);
      // Across the arm: essentially nothing. A fist 6 units to the side
      // — the reverted bug — fails here by a wide margin.
      expect(Math.abs(vx * -uy + vy * ux)).toBeLessThan(1.5);
    }
  });

  it("the fist is TAPERED — narrow at the wrist, wide at the knuckles", () => {
    // A symmetric block reads as a lump; the taper is half of what makes
    // it a hand (the knuckle seam is the other half).
    const pose = BODY_DEMOS["lateral-raise"].pose(0);
    const wrist = applyToPoint(ANT_WRIST, (pose.foreArmL ?? []) as never[]);
    const svg = renderBodyDemo("lateral-raise", 0);
    const [mass] = polysNear(svg, wrist, 11);
    const byDist = [...mass].sort(
      (a, b) =>
        Math.hypot(a[0] - wrist[0], a[1] - wrist[1]) -
        Math.hypot(b[0] - wrist[0], b[1] - wrist[1])
    );
    const span = (p: [number, number], q: [number, number]) =>
      Math.hypot(p[0] - q[0], p[1] - q[1]);
    const wristEnd = span(byDist[0], byDist[1]);
    const knuckleEnd = span(byDist[2], byDist[3]);
    expect(knuckleEnd).toBeGreaterThan(wristEnd + 1);
  });

  it("both views carry fists, and they ride the arm solve", () => {
    const travel = (id: string, anchor: [number, number]) => {
      const at = (t: number) =>
        applyToPoint(
          anchor,
          (BODY_DEMOS[id].pose(t).foreArmL ?? []) as never[]
        );
      return Math.hypot(at(1)[0] - at(0)[0], at(1)[1] - at(0)[1]);
    };
    expect(
      renderBodyDemo("pull-ups", 0.5).match(/<polygon/g)!.length
    ).toBeGreaterThan(35);
    // Anterior + posterior hands both track their arm...
    expect(travel("overhead-press", ANT_WRIST)).toBeGreaterThan(5);
    expect(travel("lat-pulldown", POST_WRIST)).toBeGreaterThan(5);
    // ...but a pull-up grips a FIXED bar: the fist must stay put while
    // the body travels to it, or the hands slide along the bar.
    expect(travel("pull-ups", POST_WRIST)).toBeLessThan(0.2);
  });

  it("overhead press: a REAL bar spans the two grips", () => {
    // Its equipment is Barbell, three of its four instructions name the
    // bar, and for months the demo pressed nothing. The shaft must span
    // past BOTH grips (sleeves), sit level at their height, and travel
    // with the rep.
    for (const t of [0, 0.5, 1]) {
      const pose = BODY_DEMOS["overhead-press"].pose(t);
      const grips = BODY_DEMOS["overhead-press"].bar!(t, pose)!;
      const svg = renderBodyDemo("overhead-press", t);
      const shaft = [
        ...svg.matchAll(
          /<line x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/g
        ),
      ].map((m) => m.slice(1, 5).map(Number))[0];
      expect(shaft, `shaft @${t}`).toBeDefined();
      expect(shaft[0]).toBeLessThan(grips[0][0]);
      expect(shaft[2]).toBeGreaterThan(grips[1][0]);
      expect(shaft[1]).toBeCloseTo(grips[0][1], 1);
      expect(shaft[3]).toBeCloseTo(grips[1][1], 1);
      // A plate off each sleeve — matched on the machined-edge stroke,
      // since a bare <ellipse count also picks up the ground shadow.
      expect((svg.match(/<ellipse[^>]*stroke="#565760"/g) ?? []).length).toBe(
        2
      );
      // Nothing clips: the whole bar stays inside the declared canvas.
      const [, top] = (BODY_DEMOS["overhead-press"].viewBox ?? "")
        .split(/\s+/)
        .map(Number);
      expect(grips[0][1] - 9 - 1).toBeGreaterThan(top);
    }
    const shaftY = (t: number) =>
      Number(
        renderBodyDemo("overhead-press", t).match(
          /<line[^>]*y1="(-?[\d.]+)"/
        )![1]
      );
    expect(shaftY(0) - shaftY(1)).toBeGreaterThan(30);
  });

  it("lateral raise: a bell sits IN each fist through the whole arc", () => {
    // The bells are drawn from the same solved ops as the forearms, so
    // this pin is what keeps them from ever being placed independently
    // of the arm — the detached-prop failure, as a number.
    for (const t of [0, 0.5, 1]) {
      const pose = BODY_DEMOS["lateral-raise"].pose(t);
      const svg = renderBodyDemo("lateral-raise", t);
      const bells = [
        ...svg.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="5.5"/g),
      ].map((m) => [Number(m[1]), Number(m[2])]);
      expect(bells.length, `@${t}`).toBe(2);
      const wristL = applyToPoint(ANT_WRIST, (pose.foreArmL ?? []) as never[]);
      const near = bells.some(
        ([x, y]) => Math.hypot(x - wristL[0], y - wristL[1]) < 0.1
      );
      expect(near, `left bell on wrist @${t}`).toBe(true);
    }
    // And they RIDE the raise: out past the body and up to parallel.
    const bellAt = (t: number) =>
      [
        ...renderBodyDemo("lateral-raise", t).matchAll(
          /<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="5.5"/g
        ),
      ].map((m) => [Number(m[1]), Number(m[2])])[0];
    expect(bellAt(0)[1] - bellAt(1)[1]).toBeGreaterThan(40); // rose
    expect(bellAt(1)[0]).toBeLessThan(bellAt(0)[0] - 25); // swung out
  });

  /* ── 2026-09-02 evaluation rebuild: the squat family and the calf
     raise moved to the SIDE view. The anterior versions faked depth
     with scaleY (a figure shrinking) and a 6.5-unit rise (nothing
     visibly happening) — the evaluation's three failing grades. ── */

  it("squat: a side hinge — knees forward, hips back and down, heels planted", () => {
    const pose = (t: number) => BODY_DEMOS["squat"].pose(t);
    const at = (pt: [number, number], ops?: unknown[]) =>
      applyToPoint(pt, (ops ?? []) as never[]);
    // The ankle is the planted pivot — it must not move at all.
    const ankle0 = at(SIDE_ANCHORS.ankle, pose(0).shankL);
    const ankle1 = at(SIDE_ANCHORS.ankle, pose(1).shankL);
    expect(ankle1[0]).toBeCloseTo(ankle0[0], 5);
    expect(ankle1[1]).toBeCloseTo(ankle0[1], 5);
    // Knees travel forward over the toes.
    const knee0 = at(SIDE_ANCHORS.knee, pose(0).thighL);
    const knee1 = at(SIDE_ANCHORS.knee, pose(1).thighL);
    expect(knee1[0]).toBeGreaterThan(knee0[0] + 4);
    /* Hips travel BACK and DOWN — the shape the front view could never
       show — finishing AT OR BELOW the knee.
 
       This bound used to read "no lower than the knee", with a comment
       saying the squat finished "just above parallel". That was a pin
       written to describe what the rig did rather than what the exercise
       asks for: instruction 3 is "lower until thighs are at or below
       parallel", and the demo stopped 12.7 degrees short of it. The
       instruction-parity test below is the one that states the rule; this
       keeps the direction of travel. */
    const hip0 = at(SIDE_ANCHORS.hip, pose(0).thighL);
    const hip1 = at(SIDE_ANCHORS.hip, pose(1).thighL);
    expect(hip1[0]).toBeLessThan(hip0[0] - 25);
    expect(hip1[1]).toBeGreaterThan(hip0[1] + 30);
    expect(hip1[1]).toBeGreaterThanOrEqual(knee1[1] - 0.5);
    // The torso inclines: the shoulder moves well forward of the hip.
    const sh1 = at(SIDE_ANCHORS.shoulder, pose(1).torso);
    expect(sh1[0] - hip1[0]).toBeGreaterThan(25);
  });

  it("squat: the bar sits on the traps and rides the torso", () => {
    // The near plate (end-on, r=11) is drawn AT the back-rack contact,
    // which lives in torso space — so it follows the hinge exactly and
    // can never leave the body.
    for (const t of [0, 0.5, 1]) {
      const pose = BODY_DEMOS["squat"].pose(t);
      const contact = applyToPoint(BACK_RACK, (pose.torso ?? []) as never[]);
      const svg = renderBodyDemo("squat", t);
      const disc = svg.match(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="11"/);
      expect(disc, `plate @${t}`).not.toBeNull();
      expect(Number(disc![1])).toBeCloseTo(contact[0], 0);
      expect(Number(disc![2])).toBeCloseTo(contact[1], 0);
      // Behind the shoulder joint — on the traps, not held out front.
      const sh = applyToPoint(
        SIDE_ANCHORS.shoulder,
        (pose.torso ?? []) as never[]
      );
      expect(contact[0]).toBeLessThan(sh[0]);
    }
    // The fist sits just UNDER the bar (the grip is outboard of the
    // sagittal plane — a profile shows it foreshortened beneath the
    // bar, never on it), the elbow points down-and-back, and the bar
    // drops with the squat.
    const bottom = BODY_DEMOS["squat"].pose(1);
    const wrist = applyToPoint(
      SIDE_ANCHORS.hand,
      (bottom.handL ?? []) as never[]
    );
    const contact = applyToPoint(BACK_RACK, (bottom.torso ?? []) as never[]);
    expect(
      Math.hypot(wrist[0] - contact[0], wrist[1] - contact[1])
    ).toBeLessThan(10);
    // Elbow down-and-back: standing it hangs well below the shoulder;
    // at the bottom the hinge swings it mostly behind, still behind.
    const standing = BODY_DEMOS["squat"].pose(0);
    const elbow0 = applyToPoint(
      SIDE_ANCHORS.elbow,
      (standing.upperArmL ?? []) as never[]
    );
    expect(elbow0[1]).toBeGreaterThan(SIDE_ANCHORS.shoulder[1] + 15);
    expect(elbow0[0]).toBeLessThan(SIDE_ANCHORS.shoulder[0]);
    const elbow1 = applyToPoint(
      SIDE_ANCHORS.elbow,
      (bottom.upperArmL ?? []) as never[]
    );
    const shoulder1 = applyToPoint(
      SIDE_ANCHORS.shoulder,
      (bottom.torso ?? []) as never[]
    );
    expect(elbow1[0]).toBeLessThan(shoulder1[0] - 15);
    const top = applyToPoint(
      BACK_RACK,
      (BODY_DEMOS["squat"].pose(0).torso ?? []) as never[]
    );
    expect(contact[1] - top[1]).toBeGreaterThan(30);
  });

  it("gear-incompatible squat aliases keep the motion, lose the bar", () => {
    // Stripped of the plate, the hands-behind-the-neck pose IS the
    // prisoner squat — right for bodyweight; front-squat stays the
    // accepted residue (a bar on the FRONT delts is a different arm).
    // smith-machine-squat keeps the plate (true of it, minus the rails).
    for (const id of ["bodyweight-squat", "front-squat"]) {
      const svg = renderBodyDemo(id, 0.5);
      expect(svg.includes('r="11"'), `${id} plate`).toBe(false);
      expect(svg.match(/<polygon/g)!.length, `${id} alive`).toBeGreaterThan(20);
      expect(getBodyDemo(id)!.equip, `${id} equip`).toBeUndefined();
    }
    expect(renderBodyDemo("smith-machine-squat", 0.5).includes('r="11"')).toBe(
      true
    );
    expect(getBodyDemo("squat")!.equip).toBe("plate-end");
  });

  it("goblet squat: one bell cupped at the chest, riding the hinge", () => {
    for (const t of [0, 1]) {
      const pose = BODY_DEMOS["goblet-squat"].pose(t);
      const wrist = applyToPoint(
        SIDE_ANCHORS.hand,
        (pose.handL ?? []) as never[]
      );
      const sh = applyToPoint(
        SIDE_ANCHORS.shoulder,
        (pose.torso ?? []) as never[]
      );
      // Hands out in FRONT of the chest (the figure faces +x), below
      // the shoulder line.
      expect(wrist[0] - sh[0], `hand forward @${t}`).toBeGreaterThan(8);
      expect(wrist[1], `hand below shoulder @${t}`).toBeGreaterThan(sh[1]);
      // "Elbows pinned under it": tucked below and behind the hands,
      // never solved forward-up over the bell.
      const el = applyToPoint(
        SIDE_ANCHORS.elbow,
        (pose.upperArmL ?? []) as never[]
      );
      expect(el[1], `elbow low @${t}`).toBeGreaterThan(sh[1] + 10);
      expect(el[0], `elbow behind hand @${t}`).toBeLessThan(wrist[0]);
      // ONE dumbbell held VERTICALLY: two heads, one cupped above the
      // hands and one hanging below, centred on the grip; no barbell
      // plate. (It drew a flat plate disc until the 2026-09-02 review.)
      const svg = renderBodyDemo("goblet-squat", t);
      const heads = [
        ...svg.matchAll(
          /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="11" height="5"/g
        ),
      ].map((m) => [Number(m[1]) + 5.5, Number(m[2]) + 2.5]);
      expect(heads.length, `heads @${t}`).toBe(2);
      const ys = heads.map((h) => h[1]).sort((a, b) => a - b);
      expect(ys[0]).toBeCloseTo(wrist[1] - 7, 0);
      expect(ys[1]).toBeCloseTo(wrist[1] + 7, 0);
      for (const h of heads) expect(h[0]).toBeCloseTo(wrist[0], 0);
      expect(svg.includes('r="11"')).toBe(false);
    }
    expect(getBodyDemo("goblet-squat")!.equip).toBe("goblet-bell");
  });
  it("squat: the body visibly sinks at the bottom", () => {
    const top = Math.min(...polyYs(renderBodyDemo("squat", 0)));
    const bottom = Math.min(...polyYs(renderBodyDemo("squat", 1)));
    expect(bottom - top).toBeGreaterThan(12); // head dropped by the dive
  });

  it("overhead press: the arms finish above the head", () => {
    // At lockout the forearm polygons must reach above the head top (~0).
    const atRest = Math.min(...polyYs(renderBodyDemo("overhead-press", 0)));
    const lockout = Math.min(...polyYs(renderBodyDemo("overhead-press", 1)));
    expect(lockout).toBeLessThan(-2);
    expect(lockout).toBeLessThan(atRest - 3);
  });

  it("deadlift: the hinge visibly drops the head/shoulders", () => {
    const start = Math.min(...polyYs(renderBodyDemo("deadlift", 0)));
    const end = Math.min(...polyYs(renderBodyDemo("deadlift", 1)));
    expect(end - start).toBeGreaterThan(20);
  });

  it("tints exactly the declared muscles (honest fill)", () => {
    // Strip the aura layer — it repeats the primary colour by design.
    // Lateral raise (front-deltoids primary) — the squat was this test's
    // subject until it became a side demo on 2026-09-02.
    const svg = renderBodyDemo("lateral-raise", 0).replace(
      /<g class="glow">.*?<\/g>/,
      ""
    );
    const purples = (svg.match(/#7B72E9/g) || []).length;
    const deltPolys = ANTERIOR.filter(
      (p) => p.muscle === "front-deltoids"
    ).length;
    expect(purples).toBe(deltPolys); // primary tint = front deltoids only
    expect(svg.includes("#B6BDC3")).toBe(true); // library body grey everywhere else
  });

  it("primary muscles carry a glow aura that breathes with effort", () => {
    const glowOf = (svg: string) => svg.match(/<g class="glow">(.*?)<\/g>/)![1];
    const soft = glowOf(renderBodyDemo("lateral-raise", 0.5, 0));
    const hard = glowOf(renderBodyDemo("lateral-raise", 0.5, 1));
    expect(hard.length).toBeGreaterThan(0);
    const firstOpacity = (g: string) =>
      Number(g.match(/opacity="([\d.]+)"/)![1]);
    expect(firstOpacity(hard)).toBeGreaterThan(firstOpacity(soft));
    // Two deltoids → two hulls × three rings.
    expect((hard.match(/<polygon/g) || []).length).toBe(6);
  });

  it("dips: the body sinks while the grips stay put", () => {
    const maxY = (svg: string) => Math.max(...polyYs(svg));
    const up = renderBodyDemo("dips", 0);
    const down = renderBodyDemo("dips", 1);
    expect(maxY(down) - maxY(up)).toBeGreaterThan(9); // feet dropped
    // Post lines are static.
    const postY = (svg: string) => svg.match(/<line[^>]*y1="(-?[\d.]+)"/)![1];
    expect(postY(up)).toBe(postY(down));
  });

  /** Both rope tails, as [x, y] — the knobs are the only r=2.4 circles. */
  const ropeTails = (t: number): [number, number][] =>
    [
      ...renderBodyDemo("rope-tricep-pushdown", t).matchAll(
        /<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="2\.4"/g
      ),
    ].map((m) => [Number(m[1]), Number(m[2])]);

  it("pushdown: the rope's knotted tails travel down to lockout", () => {
    const startY = Math.min(...ropeTails(0).map(([, y]) => y));
    const endY = Math.min(...ropeTails(1).map(([, y]) => y));
    expect(endY - startY).toBeGreaterThan(20);
  });

  it("pushdown: the rope SPLITS as the arms lock out", () => {
    // Instruction 3 ("spreading the ends apart as your arms lock out")
    // and the tip ("split the rope apart at the bottom") both promise
    // this. The single-strand rope that shipped before could not: it
    // contradicted the copy printed beside it.
    const gap = (t: number) => {
      const xs = ropeTails(t).map(([x]) => x);
      expect(xs.length).toBe(2); // two ends, not one strand
      return Math.abs(xs[1] - xs[0]);
    };
    expect(gap(1)).toBeGreaterThan(gap(0) * 2);
  });

  it("pushdown: the tails hang under GRAVITY, not along the cable", () => {
    // They used to be drawn as hand + cableDirection × 8 — rigid-rod
    // behaviour, so at the folded start they stuck out FORWARD instead
    // of dropping past the grip. Rope hangs down whatever the cable is
    // doing, so the vertical drop is constant across the whole arc.
    // The cable swings through the whole arc, so a constant drop can
    // only come from gravity. Each tail is the line ENDING at a knob.
    for (const t of [0, 0.5, 1]) {
      const svg = renderBodyDemo("rope-tricep-pushdown", t);
      const segs = [
        ...svg.matchAll(
          /<line x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/g
        ),
      ].map((m) => m.slice(1, 5).map(Number));
      const tails = ropeTails(t);
      expect(tails.length).toBe(2);
      for (const [tx, ty] of tails) {
        const seg = segs.find(
          ([, , x2, y2]) => Math.abs(x2 - tx) < 0.06 && Math.abs(y2 - ty) < 0.06
        );
        expect(seg, `tail segment @${t}`).toBeDefined();
        expect(seg![3] - seg![1], `drop @${t}`).toBeCloseTo(13, 1);
      }
    }
  });

  it("pushdown: elbow pinned — the upper arm never moves", () => {
    // The repair's mechanics contract: extension happens about the
    // elbow alone. The pose must not touch the upper-arm group.
    const d = BODY_DEMOS["rope-tricep-pushdown"];
    expect(d.pose(0).upperArmL).toBeUndefined();
    expect(d.pose(1).upperArmL).toBeUndefined();
  });

  it("pushdown: draws a rope (round-capped strand + knob), not a straight bar", () => {
    // The gate's named defect was a body-wide straight bar. The rope
    // reads as a short round-capped strand whose knotted tail hangs
    // past the grip, plus the cable up to the pulley.
    const svg = renderBodyDemo("rope-tricep-pushdown", 0.5);
    expect(svg).toContain('stroke-linecap="round"');
    // No line anywhere near body width (the old bar spanned the hands
    // at full rest span, ~80 units).
    const spans = [
      ...svg.matchAll(
        /<line[^>]*x1="(-?[\d.]+)"[^>]*y1="(-?[\d.]+)"[^>]*x2="(-?[\d.]+)"[^>]*y2="(-?[\d.]+)"/g
      ),
    ].map((m) => Math.abs(Number(m[3]) - Number(m[1])));
    for (const span of spans) expect(span).toBeLessThan(40);
  });

  it("unknown exercise renders nothing", () => {
    expect(renderBodyDemo("zercher-yodel", 0.5)).toBe("");
    expect(getBodyDemo("zercher-yodel")).toBeNull();
  });

  it("aliased exercises render (renderBodyDemo is alias-aware)", () => {
    // bodyweight-squat aliases squat — a direct-registry lookup would
    // blank. (goblet-squat used to be the example here; it graduated to
    // its own registry entry.)
    expect(renderBodyDemo("bodyweight-squat", 0.5)).not.toBe("");
  });

  it("removed variant aliases fall back instead of borrowing motion", () => {
    // Different implement/grip than the canonical (roadmap alias hygiene,
    // owner-decided 2026-07-16) — the Form surface must show the honest
    // static reference, not a borrowed model.
    /* 2026-09-03: db-curl got its own demo (a bell at the hand), and
       hammer-curl / ez-bar-curl alias it and the barbell curl — honest
       in PROFILE specifically, because the difference is hand
       orientation or bar shape, which an end-on view cannot show and
       which does not change the arc. The two below still differ in
       implement (a low-pulley cable, a reverse grip on a rope) and stay
       fallback until they have their own contract.
       2026-09-03 batch 3: cable-curl got that contract (its own demo on
       a low pulley); batch 8: the reverse-grip pushdown got its own too
       (a straight bar on the cable, `cable-handle`). Nothing is left on
       the implement-mismatch fallback — pinned so a future removal has
       to say why here. */
    for (const id of ["cable-curl", "reverse-grip-cable-pushdown"]) {
      expect(getBodyDemo(id), id).toBe(BODY_DEMOS[id]);
      expect(renderBodyDemo(id, 0.5), id).not.toBe("");
    }
    for (const [id, canonical] of [
      ["hammer-curl", "db-curl"],
      ["ez-bar-curl", "barbell-curl"],
      ["close-grip-bench", "bench-press"],
      ["walking-dumbbell-lunges", "lunges"],
    ] as const) {
      expect(getBodyDemo(id), id).toBe(BODY_DEMOS[canonical]);
    }
    // Gear-free alias: the lunge motion without the bells.
    expect(
      getBodyDemo("bodyweight-lunge")?.equip,
      "bodyweight-lunge"
    ).toBeUndefined();
    expect(renderBodyDemo("bodyweight-lunge", 0.5)).not.toBe("");
  });

  it("repaired canonicals are production-enabled again", () => {
    // 2026-08-15: both left GATED_PENDING_REPAIR with side-view models
    // that fix the exact defect the gate named (curl: real end-on bar,
    // no foreshortening; pushdown: honest rope + cable). The alias
    // VARIANTS above stay fallback — different implement/grip.
    for (const id of ["barbell-curl", "rope-tricep-pushdown"]) {
      expect(getBodyDemo(id), id).not.toBeNull();
      expect(getBodyDemo(id)!.view, id).toBe("side");
      expect(renderBodyDemo(id, 0.5), id).not.toBe("");
    }
  });

  it("curl: the bar rises from the thigh to the clavicle on a strict torso", () => {
    // The plate disc is the LAST large circle group; track its centre
    // via the plate's hub (the r matching plateR).
    const plateY = (svg: string) => {
      const m = [...svg.matchAll(/<circle[^>]*cy="(-?[\d.]+)"[^>]*r="10"/g)];
      return Number(m[m.length - 1][1]);
    };
    const bottom = renderBodyDemo("barbell-curl", 0);
    const top = renderBodyDemo("barbell-curl", 1);
    // Bar starts at hand-by-thigh (~y100) and finishes at clavicle
    // height (~y47) — a >40-unit rise.
    expect(plateY(bottom) - plateY(top)).toBeGreaterThan(40);
    // STRICT: no body english — the pose touches only the arm chain.
    const d = BODY_DEMOS["barbell-curl"];
    for (const g of Object.keys(d.pose(1))) {
      expect(
        ["upperArmL", "foreArmL", "handL", "upperArmR", "foreArmR", "handR"],
        g
      ).toContain(g);
    }
  });

  it("side arm carries both biceps and triceps facets (real muscle boundary)", () => {
    // The triceps facet is what lets the pushdown's working-muscle
    // emphasis render at all — pin that both facets tint independently.
    const curl = renderBodyDemo("barbell-curl", 0.5, 1);
    const push = renderBodyDemo("rope-tricep-pushdown", 0.5, 1);
    const primaryCount = (svg: string) =>
      (svg.match(/fill="#7B72E9" fill-opacity/g) ?? []).length;
    expect(primaryCount(curl)).toBeGreaterThan(0); // biceps lit
    expect(primaryCount(push)).toBeGreaterThan(0); // triceps lit
  });

  it("effort brightens the working-muscle fill", () => {
    const soft = renderBodyDemo("squat", 0.5, 0);
    const hard = renderBodyDemo("squat", 0.5, 1);
    const firstOpacity = (svg: string) =>
      Number(svg.match(/fill-opacity="([\d.]+)"/)![1]);
    expect(firstOpacity(hard)).toBeGreaterThan(firstOpacity(soft));
  });

  it("pull-up: the body rises toward the fixed bar", () => {
    // Hands stay ON the bar, so the FEET are the travel signal.
    const maxY = (svg: string) => Math.max(...polyYs(svg));
    const hang = renderBodyDemo("pull-ups", 0);
    const top = renderBodyDemo("pull-ups", 1);
    expect(maxY(hang) - maxY(top)).toBeGreaterThan(15); // feet travelled up
    // The bar itself never moves.
    const barY = (svg: string) => svg.match(/<line[^>]*y1="(-?[\d.]+)"/)![1];
    expect(barY(hang)).toBe(barY(top));
  });

  it("lat pulldown: the bar travels from overhead to the chest", () => {
    // Last <line> is the moving bar (the first is the static cable).
    const lastLineY = (svg: string) => {
      const ys = [...svg.matchAll(/<line[^>]*y1="(-?[\d.]+)"/g)];
      return Number(ys[ys.length - 1][1]);
    };
    const start = lastLineY(renderBodyDemo("lat-pulldown", 0));
    const end = lastLineY(renderBodyDemo("lat-pulldown", 1));
    expect(end - start).toBeGreaterThan(50);
  });

  it("side demos ship: ids and aliases render", () => {
    for (const id of [
      "bench-press",
      "barbell-row",
      "romanian-deadlift",
      "push-ups",
      "db-bench",
      "pendlay-row",
    ]) {
      expect(renderBodyDemo(id, 0.5), id).not.toBe("");
      expect(getBodyDemo(id), id).not.toBeNull();
    }
  });

  /* ── Prompt-9 acceptance checklist, executable ── */

  it("rig acceptance: limb segment lengths identical in every frame", () => {
    for (const id of [
      "bench-press",
      "barbell-row",
      "romanian-deadlift",
      "push-ups",
    ]) {
      const seg = (
        t: number,
        a: [number, number],
        b: [number, number],
        g: string
      ) => {
        const pose = BODY_DEMOS[id].pose(t) as Record<string, never[]>;
        const p = applyToPoint(a, pose[g] ?? []);
        const q = applyToPoint(b, pose[g] ?? []);
        return Math.hypot(q[0] - p[0], q[1] - p[1]);
      };
      for (const [a, b, g] of [
        [SIDE_ANCHORS.hip, SIDE_ANCHORS.knee, "thighL"],
        [SIDE_ANCHORS.knee, SIDE_ANCHORS.ankle, "shankL"],
        [SIDE_ANCHORS.shoulder, SIDE_ANCHORS.elbow, "upperArmL"],
        [SIDE_ANCHORS.elbow, SIDE_ANCHORS.hand, "foreArmL"],
      ] as const) {
        expect(seg(0, a, b, g), `${id}/${g}`).toBeCloseTo(seg(1, a, b, g), 1);
        expect(seg(0, a, b, g), `${id}/${g}`).toBeCloseTo(seg(0.5, a, b, g), 1);
      }
    }
  });

  /* ── Bar paths must stay inside the arm's reach ──────────────────
   * Both press-family demos wrote their bar path as absolute offsets
   * with no reference to how long the arm actually is, and drifted in
   * OPPOSITE directions without anything noticing:
   *
   *   overhead press  asked hypot(14, 53) = 54.82 of a 54.02 arm
   *   bench press     asked hypot(50,  8) = 50.64 of a 55.07 arm
   *
   * The press over-reached, so `solveElbow` clamped at 0.999 of full
   * extension and drew the hand ~0.85 short of the bar it was holding —
   * invisible in the rendered chain, which stays rigid either way, and
   * papered over by the joint caps. The bench under-reached, so the
   * frame labelled lockout kept the elbow 46° short of straight while
   * its own instruction said "full lockout".
   *
   * Reach alone cannot catch the clamp (a clamped chain still measures
   * ~99.9% extended), so the press is pinned against its DECLARED path
   * and the bench against the elbow it actually renders. */

  it("overhead press: the hands stay ON the declared bar path", () => {
    const armLen =
      Math.hypot(20 - 24, 71 - 48) +
      Math.hypot(ANT_WRIST[0] - 20, ANT_WRIST[1] - 71);
    for (const t of [0, 0.5, 1]) {
      const bar = BODY_DEMOS["overhead-press"].bar!(
        t,
        BODY_DEMOS["overhead-press"].pose(t)
      )!;
      // The path itself has to be solvable — this is the guard the
      // press did not have. Measured from the RISEN shoulder: the
      // girdle elevates through the drive, so a fixed [24,48] would
      // over-state the distance the arm has to cover at lockout.
      const sh = applyToPoint(
        [24, 48],
        (BODY_DEMOS["overhead-press"].pose(t).upperArmL ?? []) as never[]
      );
      expect(
        Math.hypot(bar[0][0] - sh[0], bar[0][1] - sh[1]),
        `path@${t}`
      ).toBeLessThan(armLen);
      // ...and the drawn hand has to actually be on it. A clamped solve
      // fails HERE and nowhere else.
      const hand = applyToPoint(
        ANT_WRIST,
        (BODY_DEMOS["overhead-press"].pose(t).foreArmL ?? []) as never[]
      );
      expect(
        Math.hypot(hand[0] - bar[0][0], hand[1] - bar[0][1]),
        `hand@${t}`
      ).toBeLessThan(0.2);
    }
  });

  it("the art's wrist lands ON the grip each demo declares", () => {
    // The defect this whole change exists for. `aimArm` derives its
    // rotation from the rest vector H−E, so an anchor sitting beside the
    // art landed a phantom point on the target while the real wrist went
    // ~6 units elsewhere. Nothing caught it because nothing was DRAWN at
    // a hand. Both demos below declare their actual grip (not a bar that
    // overhangs it), so the wrist must sit on it exactly.
    // Dips moved to the profile figure (2026-09-02): its grip is the
    // fixed station tube, DIP_GRIP, and its wrist is the side art's.
    const gripOf = (id: string, t: number): readonly [number, number] =>
      id === "dips"
        ? DIP_GRIP
        : BODY_DEMOS[id].bar!(t, BODY_DEMOS[id].pose(t))![0];
    for (const [id, wrist, group] of [
      ["overhead-press", ANT_WRIST, "foreArmL"],
      ["dips", SIDE_ANCHORS.hand, "handL"],
    ] as const) {
      for (const t of [0, 0.5, 1]) {
        const pose = BODY_DEMOS[id].pose(t);
        const grip = gripOf(id, t);
        const w = applyToPoint(wrist, (pose[group] ?? []) as never[]);
        expect(
          Math.hypot(w[0] - grip[0], w[1] - grip[1]),
          `${id}@${t}`
        ).toBeLessThan(0.2);
      }
    }
  });

  it("hands do NOT slide along apparatus that is bolted down", () => {
    // The subtler half: the offset was not constant through a rep, so
    // the art crept along bars the anchors held perfectly still. The
    // existing "grips stay put" test misses this entirely — it checks
    // the POST lines, which are drawn from the anchor, never the arm.
    for (const [id, wrist, group] of [
      ["pull-ups", POST_WRIST, "foreArmL"],
      ["dips", SIDE_ANCHORS.hand, "handL"],
    ] as const) {
      const at = (t: number) =>
        applyToPoint(wrist, (BODY_DEMOS[id].pose(t)[group] ?? []) as never[]);
      const drift = Math.hypot(at(1)[0] - at(0)[0], at(1)[1] - at(0)[1]);
      expect(drift, `${id} grip drift`).toBeLessThan(0.2);
    }
  });

  it("the shoulder girdle rises — press and raise both shrug", () => {
    // It used to travel 0.00 across a 55°→166° humerus swing: the rig
    // stylised the scapula's ROTATION as a deltoid tilt and modelled its
    // ELEVATION not at all. ~2:1 scapulohumeral rhythm puts the acromion
    // up ~3.2 units overhead and ~1.7 at a raise to parallel.
    const shoulderAt = (id: string, t: number) =>
      applyToPoint(
        [24, 48],
        (BODY_DEMOS[id].pose(t).upperArmL ?? []) as never[]
      );
    for (const [id, expected] of [
      ["overhead-press", 3.2],
      ["lateral-raise", 1.7],
    ] as const) {
      const rise = shoulderAt(id, 0)[1] - shoulderAt(id, 1)[1];
      expect(rise, `${id} rise`).toBeCloseTo(expected, 1);
      // Elevation only — the girdle must not wander sideways.
      expect(
        Math.abs(shoulderAt(id, 1)[0] - shoulderAt(id, 0)[0]),
        `${id} lateral drift`
      ).toBeLessThan(0.2);
    }
  });

  it("IK demos reach a real extension at the end of their stroke", () => {
    // Each of these was left 43° short of straight by the longer,
    // corrected forearm: the press at lockout, the pull-up at the dead
    // hang, the pulldown at full overhead reach.
    const reach = (
      id: string,
      t: number,
      S: [number, number],
      wrist: [number, number]
    ) => {
      const pose = BODY_DEMOS[id].pose(t);
      const sh = applyToPoint(S, (pose.upperArmL ?? []) as never[]);
      const w = applyToPoint(wrist, (pose.foreArmL ?? []) as never[]);
      return Math.hypot(w[0] - sh[0], w[1] - sh[1]);
    };
    const ANT_LEN =
      Math.hypot(20 - 24, 71 - 48) + Math.hypot(3.5 - 20, 101.2 - 71);
    const POST_LEN =
      Math.hypot(17 - 23, 78 - 46) + Math.hypot(3.4 - 17, 108.5 - 78);
    expect(
      reach("overhead-press", 1, [24, 48], ANT_WRIST) / ANT_LEN
    ).toBeGreaterThan(0.96);
    expect(
      reach("pull-ups", 0, [23, 46], POST_WRIST) / POST_LEN
    ).toBeGreaterThan(0.96);
    expect(
      reach("lat-pulldown", 0, [23, 46], POST_WRIST) / POST_LEN
    ).toBeGreaterThan(0.96);
  });

  it("bench press: the rep finishes at a real lockout", () => {
    const armLen =
      Math.hypot(
        SIDE_ANCHORS.elbow[0] - SIDE_ANCHORS.shoulder[0],
        SIDE_ANCHORS.elbow[1] - SIDE_ANCHORS.shoulder[1]
      ) +
      Math.hypot(
        SIDE_ANCHORS.hand[0] - SIDE_ANCHORS.elbow[0],
        SIDE_ANCHORS.hand[1] - SIDE_ANCHORS.elbow[1]
      );
    const pose = BODY_DEMOS["bench-press"].pose(1);
    const S = applyToPoint(SIDE_ANCHORS.shoulder, pose.upperArmL ?? []);
    const E = applyToPoint(SIDE_ANCHORS.elbow, pose.upperArmL ?? []);
    const H = applyToPoint(SIDE_ANCHORS.hand, pose.handL ?? []);
    // Soft lock: straight to the eye, not hyperextended, not clamped.
    const ua = [E[0] - S[0], E[1] - S[1]];
    const fa = [H[0] - E[0], H[1] - E[1]];
    const bend =
      (Math.acos(
        (ua[0] * fa[0] + ua[1] * fa[1]) /
          (Math.hypot(...ua) * Math.hypot(...fa))
      ) *
        180) /
      Math.PI;
    expect(bend).toBeLessThan(15);
    expect(bend).toBeGreaterThan(2);
    // And the path stays under the ceiling, so nothing clamps.
    expect(Math.hypot(H[0] - S[0], H[1] - S[1])).toBeLessThan(armLen);
  });

  it("rig acceptance: barbell plate present and pinned for bar lifts", () => {
    for (const id of ["bench-press", "barbell-row", "romanian-deadlift"]) {
      for (const t of [0, 0.5, 1]) {
        const svg = renderBodyDemo(id, t);
        expect(svg.includes('r="10"'), `${id}@${t}`).toBe(true);
      }
    }
  });

  it("pose physics: hips travel BACK as the RDL hinges (balance rule)", () => {
    const hipAt = (t: number) =>
      applyToPoint(
        SIDE_ANCHORS.hip,
        BODY_DEMOS["romanian-deadlift"].pose(t).pelvis ?? []
      )[0];
    // Mass stays over mid-foot: deep hinge pushes the hip x backward.
    expect(hipAt(1)).toBeLessThan(hipAt(0) - 5);
  });

  it("pose physics: RDL knee angle constant in every frame", () => {
    const kneeAngle = (t: number) => {
      const pose = BODY_DEMOS["romanian-deadlift"].pose(t);
      const hip = applyToPoint(SIDE_ANCHORS.hip, pose.thighL ?? []);
      const knee = applyToPoint(SIDE_ANCHORS.knee, pose.thighL ?? []);
      const ankle = applyToPoint(SIDE_ANCHORS.ankle, pose.shankL ?? []);
      const a = Math.atan2(hip[1] - knee[1], hip[0] - knee[0]);
      const b = Math.atan2(ankle[1] - knee[1], ankle[0] - knee[0]);
      return ((a - b) * 180) / Math.PI;
    };
    expect(Math.abs(kneeAngle(1) - kneeAngle(0))).toBeLessThan(0.5);
  });

  it("rig acceptance: camera and ground locked across an exercise", () => {
    for (const id of ["bench-press", "barbell-row", "romanian-deadlift"]) {
      const vb = (t: number) =>
        renderBodyDemo(id, t).match(/viewBox="([^"]+)"/)![1];
      expect(vb(0), id).toBe(vb(1));
    }
  });

  it("rig acceptance: hand is compact and articulated (≤ half head width)", () => {
    const width = (pts: [number, number][], axis: 0 | 1) => {
      const v = pts.map((p) => p[axis]);
      return Math.max(...v) - Math.min(...v);
    };
    const head = SIDE_PIECES.find((p) => p.group === "head")!;
    const hand = SIDE_PIECES.find((p) => p.group === "handL")!;
    const headW = width(head.outline, 0);
    expect(width(hand.outline, 0)).toBeLessThanOrEqual(headW / 2 + 0.5);
    expect(width(hand.outline, 1)).toBeLessThanOrEqual(headW / 2 + 0.5);
  });

  /* ── 2026-09-02 model art pass ── */

  it("no facet seam on the profile figure opens into a wedge", () => {
    // The recurring defect on this figure, found four times in one
    // review: a facet's LEVEL border butted against a neighbour's
    // DIAGONAL one, so the seam between them started around a unit and
    // opened to 3-5 as it ran. Rendered, that is a dark gash across the
    // body — "the black space between the body looks odd". Every pair
    // below was one of them.
    //
    // `band` emits the right edge then the reversed left edge, so a
    // facet's own borders are exact segments: its TOP is the closing
    // segment (last point -> first), its BOTTOM the segment across the
    // array's midpoint. Measuring those beats scanning the polygon,
    // which reads a corner as a 3-unit seam wherever a facet's side
    // edge slants.
    const piece = (g: string) => SIDE_PIECES.find((p) => p.group === g)!;
    const facet = (g: string, m: string) =>
      piece(g).facets.find((f) => f.muscle === m)!.points as [number, number][];
    // The top is the CLOSING segment — `band` emits the right edge from
    // top to bottom, then the left edge from bottom to top, so the wrap
    // from last point to first is always the top border.
    const topEdge = (p: [number, number][]) =>
      [p[p.length - 1], p[0]] as [[number, number], [number, number]];
    // The bottom is the segment JOINING the two side edges. It is the
    // only non-closing pair that crosses the band's width, so it is the
    // one with the largest |dx| — every other pair is a step ALONG an
    // edge. Neither the array midpoint nor the greatest mean y finds it:
    // the edges sample independently (a skew gives them different
    // lengths), and on a diagonal bottom the join's mean y is lower than
    // the last pair of the deeper edge.
    const bottomEdge = (p: [number, number][]) => {
      let best = 0;
      let bestDx = -Infinity;
      for (let i = 0; i + 1 < p.length; i++) {
        const dx = Math.abs(p[i + 1][0] - p[i][0]);
        if (dx > bestDx) {
          bestDx = dx;
          best = i;
        }
      }
      return [p[best], p[best + 1]] as [[number, number], [number, number]];
    };
    const yAt = (
      [[x1, y1], [x2, y2]]: [[number, number], [number, number]],
      x: number
    ) =>
      x < Math.min(x1, x2) || x > Math.max(x1, x2) || x1 === x2
        ? null
        : y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
    const pairs: [string, string, string][] = [
      ["torso", "chest", "abs"],
      ["torso", "chest", "obliques"],
      ["torso", "upper-back", "lower-back"],
      ["upperArmL", "front-deltoids", "biceps"],
      ["upperArmL", "front-deltoids", "triceps"],
      ["thighL", "quadriceps", "knees"],
      ["thighL", "hamstring", "knees"],
    ];
    for (const [group, above, below] of pairs) {
      const A = bottomEdge(facet(group, above));
      const B = topEdge(facet(group, below));
      const lo = Math.max(
        Math.min(A[0][0], A[1][0]),
        Math.min(B[0][0], B[1][0])
      );
      const hi = Math.min(
        Math.max(A[0][0], A[1][0]),
        Math.max(B[0][0], B[1][0])
      );
      const gaps: number[] = [];
      for (let i = 0; i <= 20; i++) {
        const x = lo + ((hi - lo) * i) / 20;
        const a = yAt(A, x);
        const b = yAt(B, x);
        if (a === null || b === null) continue;
        gaps.push(b - a);
      }
      expect(
        gaps.length,
        `${group} ${above}/${below} borders overlap`
      ).toBeGreaterThan(10);
      expect(
        Math.max(...gaps),
        `${group} ${above}/${below} widest seam`
      ).toBeLessThan(2);
      expect(
        Math.min(...gaps),
        `${group} ${above}/${below} narrowest seam`
      ).toBeGreaterThan(0.2);
    }
  });

  it("every demo declares where its rep starts, and they are right", () => {
    // A table rather than a rule, because the answer is not derivable:
    // `concentricTo` says which end FINISHES. A squat and a deadlift both
    // lock out standing; the squat starts there and the deadlift starts
    // with the bar on the floor. Listing all fifteen means adding a demo
    // forces the question, and changing one is deliberate.
    const START: Record<string, "lockout" | "stretch"> = {
      // Begin at the finish and lower first.
      squat: "lockout",
      "goblet-squat": "lockout",
      "bench-press": "lockout",
      "push-ups": "lockout",
      dips: "lockout",
      "romanian-deadlift": "lockout",
      // Begin at the stretch and drive first — every pull, press, curl
      // and raise, plus the calf raise off a block.
      deadlift: "stretch",
      "barbell-row": "stretch",
      "barbell-curl": "stretch",
      "overhead-press": "stretch",
      "pull-ups": "stretch",
      "lat-pulldown": "stretch",
      "rope-tricep-pushdown": "stretch",
      "lateral-raise": "stretch",
      "calf-raise": "stretch",
      // 2026-09-03 build-out, batch 1.
      "db-curl": "stretch",
      "front-raise": "stretch",
      "overhead-extension": "stretch",
      "tricep-kickback": "stretch",
      "skull-crushers": "stretch",
      lunges: "lockout",
      // Batch 2.
      "incline-bench": "lockout",
      "incline-db-press": "lockout",
      "glute-bridge": "stretch",
      "hip-thrust": "stretch",
      "bulgarian-split": "lockout",
      // Batch 3: every cable pull starts extended toward the pulley, the
      // extension with the shins hanging, the curl with the legs straight.
      "cable-curl": "stretch",
      "straight-arm-pulldown": "stretch",
      "face-pulls": "stretch",
      "seated-row": "stretch",
      "leg-extension": "stretch",
      "seated-leg-curl": "stretch",
      // Batch 4: curls start hanging, the sleds and the decline press
      // start at lockout, the rack pull starts on the pins.
      "preacher-curl": "stretch",
      "concentration-curl": "stretch",
      "incline-db-curl": "stretch",
      "leg-press": "lockout",
      "hack-squat": "lockout",
      "rack-pull": "stretch",
      "decline-bench": "lockout",
      "decline-db-press": "lockout",
      // Batch 5: every core rep starts at the floor / the hang / the
      // stretch; the ab wheel starts kneeling tall and rolls out first.
      crunches: "stretch",
      "toe-touches": "stretch",
      "decline-sit-up": "stretch",
      "leg-raise": "stretch",
      "cable-crunch": "stretch",
      "ab-wheel": "lockout",
      "superman-hold": "stretch",
      // Batch 6: pulls and the swing start stretched; dips, squats and
      // the two knee hinges start at the top (their lowering is the work).
      "inverted-row": "stretch",
      "bench-dips": "lockout",
      "kettlebell-swing": "stretch",
      "barbell-upright-row": "stretch",
      "zercher-squat": "lockout",
      "nordic-hamstring-curl": "lockout",
      "glute-ham-raise": "lockout",
      "sissy-squat": "lockout",
      // Batch 7.
      "barbell-floor-press": "lockout",
      "single-leg-calf-raise": "stretch",
      "donkey-calf-raise": "stretch",
      "barbell-step-ups": "stretch",
      "pistol-squat": "lockout",
      thrusters: "stretch",
      "chest-supported-db-row": "stretch",
      // Batch 8: every cable movement starts at its stretch.
      "reverse-grip-cable-pushdown": "stretch",
      "single-arm-cable-pushdown": "stretch",
      "overhead-cable-tricep-extension": "stretch",
      "bayesian-cable-curl": "stretch",
      "reverse-barbell-curl": "stretch",
      "spider-db-curl": "stretch",
      "single-arm-lat-pulldown": "stretch",
      "cable-glute-kickback": "stretch",
      // Batch 9.
      "landmine-press": "stretch",
      "landmine-squat": "lockout",
      "meadows-row": "stretch",
      "chest-press-machine": "stretch",
      "shoulder-press-machine": "stretch",
      "jm-press": "lockout",
      "pike-push-up": "lockout",
      "handstand-push-ups": "lockout",
      "dragon-flag": "lockout",
      // Batch 10: two holds drawn as their set-up, an L-sit, two transitions.
      plank: "stretch",
      "weighted-plank": "stretch",
      "l-sit": "stretch",
      "muscle-ups": "stretch",
      "clean-and-press": "stretch",
      // Batch 11 (the frontal plane): every one starts at its stretch.
      "db-flyes": "stretch",
      "cable-fly": "stretch",
      "cable-crossover": "stretch",
      "pec-deck": "stretch",
      "machine-chest-fly": "stretch",
      "lu-raise": "stretch",
      "arnold-press": "stretch",
      "cuban-press": "stretch",
      shrugs: "stretch",
      "barbell-shrug": "stretch",
      // Batch 12.
      "hip-abduction-machine": "stretch",
      "hip-adduction-machine": "stretch",
      "reverse-flyes": "stretch",
      "rear-delt-machine-fly": "stretch",
      "reverse-pec-deck": "stretch",
      "cross-body-hammer-curl": "stretch",
      "cable-woodchopper": "stretch",
      "dead-bug": "stretch",
      "bicycle-crunch": "stretch",
      "russian-twist": "stretch",
      // Batch 13.
      "mountain-climbers": "stretch",
      "battle-ropes": "stretch",
      "side-plank": "stretch",
      "rowing-machine": "stretch",
      "ski-erg": "stretch",
      "jump-rope": "stretch",
      "pallof-press": "stretch",
      // Batch 14.
      burpees: "stretch",
      // Batch 15: CYCLES have no start — t=1 is t=0 — so the default
      // stands and the player ignores it.
      treadmill: "lockout",
      "incline-treadmill-walk": "lockout",
      "farmers-carry": "lockout",
      "sled-push-pull": "lockout",
      stairmaster: "lockout",
      "box-jumps": "lockout",
      // Batch 16: four more cycles, one rep.
      bike: "lockout",
      "spin-bike": "lockout",
      "assault-bike": "lockout",
      elliptical: "lockout",
      swimming: "lockout",
      "zottman-curl": "stretch",
      // Batch 17: a cycle, and a sequence its own instruction reverses.
      "man-maker": "lockout",
      "turkish-get-up": "stretch",
      // Batch 18: heels dropped below the platform first.
      "seated-calf-raise": "stretch",
    };
    expect(Object.keys(START).sort()).toEqual(Object.keys(BODY_DEMOS).sort());
    for (const [id, expected] of Object.entries(START)) {
      expect(BODY_DEMOS[id].startsAt ?? "lockout", id).toBe(expected);
    }
  });

  const SUPINE_FLOOR_Y = 172;
  /** The rig's FRONT_RACK point in torso space (`bodyRig.ts`), mirrored
   *  as a literal so a drift in either shows here. */
  const FRONT_RACK_TEST: [number, number] = [
    SIDE_ANCHORS.shoulder[0] + 9,
    SIDE_ANCHORS.shoulder[1] - 1,
  ];
  it("each demo reaches the position its own instructions describe", () => {
    /* The roadmap's honesty standard, measured against the catalogue
       text rather than against a screenshot. Every claim below is a
       quote from the exercise's own instruction list, and every one of
       them was FALSE when this was written:

         squat      "lower until thighs are at or below parallel"
                    → the hip finished 10.9 ABOVE the knee.
         curl       "pin your elbows ... they shouldn't drift forward"
                    → the elbow travelled 5.0 units forward.
         row        "row the bar to your lower chest"
                    → the bar finished level with the HIP.
         pull-ups   "until your chin clears it"
                    → the chin finished 8 units BELOW the bar.
         dips       "until upper arms are parallel to the floor"
                    → the upper arm hung 85 degrees off the floor,
                      because the elbow IK took the wrong branch.

       A demo that contradicts its own cue teaches the fault the cue
       warns about, which is worse than no demo. */
    const at = (id: string, t: number) => BODY_DEMOS[id].pose(t);
    const pt = (
      anchor: readonly [number, number],
      ops: unknown
    ): [number, number] =>
      applyToPoint(anchor as [number, number], (ops ?? []) as never[]);

    // "at or below parallel" — the hip may not finish above the knee.
    for (const id of ["squat", "goblet-squat"]) {
      const p = at(id, 1);
      const hip = pt(SIDE_ANCHORS.hip, p.thighL);
      const knee = pt(SIDE_ANCHORS.knee, p.thighL);
      expect(hip[1] - knee[1], `${id} hip below knee`).toBeGreaterThan(-0.5);
    }

    // "pin your elbows to your sides".
    const e0 = pt(SIDE_ANCHORS.elbow, at("barbell-curl", 0).upperArmL);
    const e1 = pt(SIDE_ANCHORS.elbow, at("barbell-curl", 1).upperArmL);
    expect(
      Math.hypot(e1[0] - e0[0], e1[1] - e0[1]),
      "curl elbow travel"
    ).toBeLessThan(2.5);

    // "row the bar to your lower chest" — not the hip.
    {
      const p = at("barbell-row", 1);
      const bar = BODY_DEMOS["barbell-row"].bar!(1, p)![0];
      const sh = pt(SIDE_ANCHORS.shoulder, p.torso);
      const hip = pt(SIDE_ANCHORS.hip, p.pelvis ?? p.torso);
      const down = (bar[1] - sh[1]) / (hip[1] - sh[1]);
      expect(down, "row bar, shoulder→hip fraction").toBeGreaterThan(0.25);
      expect(down, "row bar, shoulder→hip fraction").toBeLessThan(0.6);
    }

    // "until your chin clears it".
    {
      const p = at("pull-ups", 1);
      const bar = BODY_DEMOS["pull-ups"].bar!(1, p)![0];
      const head = POSTERIOR.filter(
        (m) => m.muscle === "head" || m.muscle === "neck"
      ).flatMap((m) => m.points.map((q) => pt(q as [number, number], p.head)));
      const chin = Math.max(...head.map(([, y]) => y));
      expect(bar[1] - chin, "chin above the bar").toBeGreaterThan(0);
    }

    // "until upper arms are parallel to the floor".
    {
      const p = at("dips", 1);
      const sh = pt(SIDE_ANCHORS.shoulder, p.upperArmL);
      const el = pt(SIDE_ANCHORS.elbow, p.upperArmL);
      const off = Math.abs(
        (Math.atan2(el[1] - sh[1], el[0] - sh[0]) * 180) / Math.PI
      );
      expect(
        Math.min(off, 180 - off),
        "dips upper arm off horizontal"
      ).toBeLessThan(15);
    }

    // "lower slowly to a full stretch below the platform".
    {
      const heel = pt([41.6, 202.9], at("calf-raise", 0).shankL);
      expect(heel[1], "calf heel below the block top").toBeGreaterThan(
        CALF_BLOCK_TOP
      );
    }

    /* 2026-09-03 build-out, batch 1 — each demo written against its
       instruction text from the start, and pinned the same way. */

    // front raise: "raise ... straight in front to shoulder height".
    {
      const p = at("front-raise", 1);
      const hand = pt(SIDE_ANCHORS.hand, p.handL);
      const sh = pt(SIDE_ANCHORS.shoulder, p.upperArmL);
      expect(hand[0] - sh[0], "hand well in front").toBeGreaterThan(50);
      expect(Math.abs(hand[1] - sh[1]), "hand at shoulder height").toBeLessThan(
        8
      );
    }
    // overhead extension: "lower ... behind your head" then "full lockout".
    {
      const p0 = at("overhead-extension", 0);
      const el = pt(SIDE_ANCHORS.elbow, p0.foreArmL);
      const h0 = pt(SIDE_ANCHORS.hand, p0.handL);
      expect(el[1], "elbow above the shoulder").toBeLessThan(
        SIDE_ANCHORS.shoulder[1] - 25
      );
      expect(h0[0], "hand BEHIND the elbow at the stretch").toBeLessThan(
        el[0] - 20
      );
      const p1 = at("overhead-extension", 1);
      const h1 = pt(SIDE_ANCHORS.hand, p1.handL);
      expect(el[1] - h1[1], "hand above the elbow at lockout").toBeGreaterThan(
        25
      );
    }
    // kickback: "upper arm parallel to the floor" and "fully straight".
    {
      const p = at("tricep-kickback", 1);
      const sh = pt(SIDE_ANCHORS.shoulder, p.upperArmL);
      const el = pt(SIDE_ANCHORS.elbow, p.upperArmL);
      const hd = pt(SIDE_ANCHORS.hand, p.handL);
      const off = Math.abs(
        (Math.atan2(el[1] - sh[1], el[0] - sh[0]) * 180) / Math.PI
      );
      expect(Math.min(off, 180 - off), "upper arm off horizontal").toBeLessThan(
        15
      );
      const a = Math.atan2(el[1] - sh[1], el[0] - sh[0]);
      const b = Math.atan2(hd[1] - el[1], hd[0] - el[0]);
      const bend = Math.abs(((a - b) * 180) / Math.PI);
      expect(
        Math.min(bend, 360 - bend),
        "arm straight at lockout"
      ).toBeLessThan(12);
    }
    // skull crushers: "past your forehead" then extend, upper arm still.
    {
      const e0 = pt(SIDE_ANCHORS.elbow, at("skull-crushers", 0).upperArmL);
      const e1 = pt(SIDE_ANCHORS.elbow, at("skull-crushers", 1).upperArmL);
      expect(
        Math.hypot(e1[0] - e0[0], e1[1] - e0[1]),
        "upper arm still"
      ).toBeLessThan(0.01);
      const h0 = pt(SIDE_ANCHORS.hand, at("skull-crushers", 0).handL);
      const h1 = pt(SIDE_ANCHORS.hand, at("skull-crushers", 1).handL);
      // Lying head-left: the stretch carries the bar toward the head
      // (smaller x); lockout is above the elbow (smaller y).
      expect(h0[0], "bar past the forehead").toBeLessThan(e0[0] - 20);
      expect(e1[1] - h1[1], "lockout above the elbow").toBeGreaterThan(25);
    }
    // lunges: "both knees bending to about 90 degrees", feet planted.
    {
      for (const t of [0, 0.5, 1]) {
        const p = at("lunges", t);
        const fa = pt(SIDE_ANCHORS.ankle, p.shankL);
        const ba = pt(SIDE_ANCHORS.ankle, p.shankR);
        expect(
          Math.hypot(fa[0] - 84, fa[1] - 196),
          `front foot planted @${t}`
        ).toBeLessThan(0.05);
        expect(
          Math.hypot(ba[0] - 2, ba[1] - 196),
          `back foot planted @${t}`
        ).toBeLessThan(0.05);
      }
      const p = at("lunges", 1);
      const hip = pt(SIDE_ANCHORS.hip, p.thighL);
      const fk = pt(SIDE_ANCHORS.knee, p.thighL);
      const fa = pt(SIDE_ANCHORS.ankle, p.shankL);
      const a = Math.atan2(hip[1] - fk[1], hip[0] - fk[0]);
      const b = Math.atan2(fa[1] - fk[1], fa[0] - fk[0]);
      let knee = Math.abs(((a - b) * 180) / Math.PI);
      if (knee > 180) knee = 360 - knee;
      expect(knee, "front knee angle").toBeGreaterThan(75);
      expect(knee, "front knee angle").toBeLessThan(105);
      const bk = pt(SIDE_ANCHORS.knee, p.thighR);
      expect(196 - bk[1], "back knee near the floor").toBeLessThan(12);
    }

    /* Batch 2. */
    const lineDeg = (a: [number, number], b: [number, number]) =>
      (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    // glute bridge: "a straight line from shoulders to knees" at the top.
    {
      const p = at("glute-bridge", 1);
      const sh = pt(SIDE_ANCHORS.shoulder, p.torso);
      const hip = pt(SIDE_ANCHORS.hip, p.pelvis);
      const kn = pt(SIDE_ANCHORS.knee, p.thighL);
      expect(
        Math.abs(lineDeg(sh, hip) - lineDeg(hip, kn)),
        "bridge: shoulder-hip-knee in a line"
      ).toBeLessThan(8);
      const down = pt(SIDE_ANCHORS.hip, at("glute-bridge", 0).pelvis);
      expect(
        down[1],
        "bridge: hips on the floor at the stretch"
      ).toBeGreaterThan(SUPINE_FLOOR_Y - 8);
    }
    // hip thrust: torso horizontal at the top, hips just off the floor at the bottom.
    {
      const p = at("hip-thrust", 1);
      const sh = pt(SIDE_ANCHORS.shoulder, p.torso);
      const hip = pt(SIDE_ANCHORS.hip, p.pelvis);
      expect(
        Math.abs(lineDeg(sh, hip)),
        "thrust: torso horizontal at the top"
      ).toBeLessThan(8);
      const down = pt(SIDE_ANCHORS.hip, at("hip-thrust", 0).pelvis);
      expect(
        down[1],
        "thrust: hips near the floor at the stretch"
      ).toBeGreaterThan(SUPINE_FLOOR_Y - 12);
      // The bar rides the hips, every frame.
      for (const t of [0, 0.5, 1]) {
        const q = at("hip-thrust", t);
        const bar = BODY_DEMOS["hip-thrust"].bar!(t, q)![0];
        const h = pt(SIDE_ANCHORS.hip, q.pelvis);
        expect(
          Math.hypot(bar[0] - h[0], bar[1] - h[1]),
          `thrust bar at the hip @${t}`
        ).toBeLessThan(12);
      }
    }
    // incline press: the bar travels PERPENDICULAR to the inclined trunk.
    for (const id of ["incline-bench", "incline-db-press"]) {
      const p1 = at(id, 1);
      const sh = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const hip = pt(SIDE_ANCHORS.hip, p1.pelvis);
      const trunk = lineDeg(hip, sh); // up-left
      const hand = pt(SIDE_ANCHORS.hand, p1.handL);
      const press = lineDeg(sh, hand);
      let d = Math.abs(((press - trunk) % 360) + 360) % 360;
      if (d > 180) d = 360 - d;
      expect(
        Math.abs(d - 90),
        `${id}: press perpendicular to the trunk`
      ).toBeLessThan(14);
      // Incline: the trunk sits 25-40 degrees above horizontal.
      const incline = 180 - Math.abs(trunk);
      expect(incline, `${id}: trunk incline`).toBeGreaterThan(25);
      expect(incline, `${id}: trunk incline`).toBeLessThan(42);
      // Lockout is nearly a full arm.
      expect(
        Math.hypot(hand[0] - sh[0], hand[1] - sh[1]),
        `${id}: lockout reach`
      ).toBeGreaterThan(62);
    }
    // Bulgarian split: both feet planted, the back one on the bench.
    for (const t of [0, 0.5, 1]) {
      const p = at("bulgarian-split", t);
      const fa = pt(SIDE_ANCHORS.ankle, p.shankL);
      const ba = pt(SIDE_ANCHORS.ankle, p.shankR);
      expect(
        Math.hypot(fa[0] - 84, fa[1] - 196),
        `bulgarian front foot @${t}`
      ).toBeLessThan(0.05);
      expect(
        Math.hypot(ba[0] - 4, ba[1] - 174),
        `bulgarian back foot on the bench @${t}`
      ).toBeLessThan(0.05);
    }

    /* Batch 3: cables and seated machines. */
    const jointDeg = (
      a: [number, number],
      b: [number, number],
      c: [number, number]
    ) => {
      const v1 = [a[0] - b[0], a[1] - b[1]];
      const v2 = [c[0] - b[0], c[1] - b[1]];
      return (
        (Math.acos(
          (v1[0] * v2[0] + v1[1] * v2[1]) /
            (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]))
        ) *
          180) /
        Math.PI
      );
    };
    const elbowDeg = (id: string, t: number) => {
      const p = at(id, t);
      return jointDeg(
        pt(SIDE_ANCHORS.shoulder, p.torso),
        pt(SIDE_ANCHORS.elbow, p.foreArmL),
        pt(SIDE_ANCHORS.hand, p.handL)
      );
    };
    const kneeDeg = (id: string, t: number) => {
      const p = at(id, t);
      return jointDeg(
        pt(SIDE_ANCHORS.hip, p.pelvis),
        pt(SIDE_ANCHORS.knee, p.shankL),
        pt(SIDE_ANCHORS.ankle, p.shankL)
      );
    };
    // The rest leg's own knee angle IS "fully straight" for this figure
    // (the anchors are not collinear), so straightness is measured
    // against it rather than against 180.
    const REST_KNEE = jointDeg(
      SIDE_ANCHORS.hip,
      SIDE_ANCHORS.knee,
      SIDE_ANCHORS.ankle
    );
    // cable curl: a LOW pulley — the tip is "step back until there's
    // tension through the whole rep", so the cable pulls from the floor
    // at every frame, never from above the hand.
    for (const t of [0, 0.5, 1]) {
      const h = pt(SIDE_ANCHORS.hand, at("cable-curl", t).handL);
      expect(
        BODY_DEMOS["cable-curl"].pulley![1],
        `cable-curl: pulley below the hand @${t}`
      ).toBeGreaterThan(h[1] + 60);
    }
    // straight-arm pulldown: "lock your elbows into a soft, fixed bend —
    // don't change it on the set"; "full overhead stretch"; "down in an
    // arc to your thighs"; "hinge slightly forward".
    {
      const id = "straight-arm-pulldown";
      const e0 = elbowDeg(id, 0);
      expect(e0, "pulldown: soft bend").toBeGreaterThan(160);
      expect(e0, "pulldown: soft bend").toBeLessThan(176);
      for (const t of [0.25, 0.5, 0.75, 1]) {
        expect(
          Math.abs(elbowDeg(id, t) - e0),
          `pulldown: elbow bend fixed @${t}`
        ).toBeLessThan(0.5);
      }
      const h0 = pt(SIDE_ANCHORS.hand, at(id, 0).handL);
      expect(
        h0[1],
        "pulldown: hand above the head at the stretch"
      ).toBeLessThan(0);
      const p1 = at(id, 1);
      const hip = pt(SIDE_ANCHORS.hip, p1.pelvis);
      const knee = pt(SIDE_ANCHORS.knee, p1.thighL);
      const h1 = pt(SIDE_ANCHORS.hand, p1.handL);
      const xOnThigh =
        hip[0] + ((knee[0] - hip[0]) * (h1[1] - hip[1])) / (knee[1] - hip[1]);
      expect(h1[0] - xOnThigh, "pulldown: hand at the thigh").toBeGreaterThan(
        0
      );
      expect(h1[0] - xOnThigh, "pulldown: hand at the thigh").toBeLessThan(18);
      for (const t of [0, 1]) {
        const p = at(id, t);
        const lean =
          lineDeg(
            pt(SIDE_ANCHORS.hip, p.pelvis),
            pt(SIDE_ANCHORS.shoulder, p.torso)
          ) + 90;
        expect(lean, `pulldown: slight hinge held @${t}`).toBeGreaterThan(14);
        expect(lean, `pulldown: slight hinge held @${t}`).toBeLessThan(26);
      }
    }
    // face pulls: "elbows high throughout" (never below the shoulder
    // line); "arms extended straight toward the pulley" at the start;
    // "pull towards your eyes" — the hand finishes in front of the face
    // at eye height, not on it.
    {
      const id = "face-pulls";
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const p = at(id, t);
        const S = pt(SIDE_ANCHORS.shoulder, p.torso);
        const E = pt(SIDE_ANCHORS.elbow, p.foreArmL);
        expect(E[1], `face pull: elbow high @${t}`).toBeLessThan(S[1] + 3);
      }
      expect(
        elbowDeg(id, 0),
        "face pull: extended toward the pulley"
      ).toBeGreaterThan(172);
      const h = pt(SIDE_ANCHORS.hand, at(id, 1).handL);
      expect(h[1], "face pull: hand at eye height").toBeGreaterThan(-2);
      expect(h[1], "face pull: hand at eye height").toBeLessThan(16);
      expect(h[0], "face pull: hand in FRONT of the face").toBeGreaterThan(63);
      expect(h[0], "face pull: hand in front of the face").toBeLessThan(76);
    }
    // seated row: "torso upright" at both ends (the tip: "chest tall and
    // still" — no rocking); "extend your arms" at the stretch; "pull the
    // handle to your lower ribs" with the elbow behind the trunk; "knees
    // softly bent".
    {
      const id = "seated-row";
      // "Upright" is the standing figure's own trunk line (the shoulder
      // sits 5.4° ahead of the hip at rest), not a plumb vertical.
      const restLean = lineDeg(SIDE_ANCHORS.hip, SIDE_ANCHORS.shoulder) + 90;
      for (const t of [0, 1]) {
        const p = at(id, t);
        const lean =
          lineDeg(
            pt(SIDE_ANCHORS.hip, p.pelvis),
            pt(SIDE_ANCHORS.shoulder, p.torso)
          ) + 90;
        expect(
          Math.abs(lean - restLean),
          `row: torso upright @${t}`
        ).toBeLessThan(3);
        const k = kneeDeg(id, t);
        expect(k, `row: knees softly bent @${t}`).toBeGreaterThan(132);
        expect(k, `row: knees softly bent @${t}`).toBeLessThan(REST_KNEE - 8);
      }
      expect(
        elbowDeg(id, 0),
        "row: arms extended at the stretch"
      ).toBeGreaterThan(165);
      const p1 = at(id, 1);
      const S = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const E = pt(SIDE_ANCHORS.elbow, p1.foreArmL);
      const H = pt(SIDE_ANCHORS.hand, p1.handL);
      expect(E[0], "row: elbow behind the trunk at the finish").toBeLessThan(
        S[0]
      );
      expect(
        Math.hypot(H[0] - (S[0] + 12), H[1] - (S[1] + 26)),
        "row: hand at the lower ribs"
      ).toBeLessThan(6);
    }
    // leg extension: "hips pressed into the seat" (the hip does not move);
    // from a hanging shin to "fully straight".
    {
      const id = "leg-extension";
      const hip0 = pt(SIDE_ANCHORS.hip, at(id, 0).pelvis);
      for (const t of [0.5, 1]) {
        const hip = pt(SIDE_ANCHORS.hip, at(id, t).pelvis);
        expect(
          Math.hypot(hip[0] - hip0[0], hip[1] - hip0[1]),
          `extension: hips on the seat @${t}`
        ).toBeLessThan(0.01);
      }
      expect(kneeDeg(id, 0), "extension: shin hanging").toBeGreaterThan(80);
      expect(kneeDeg(id, 0), "extension: shin hanging").toBeLessThan(100);
      expect(kneeDeg(id, 1), "extension: fully straight").toBeGreaterThan(
        REST_KNEE - 1
      );
    }
    // seated leg curl: starts straight (the stretch), curls "down and
    // back" past 90 with the heel driven toward the floor — the ankle
    // finishes below and behind the knee; hips pinned.
    {
      const id = "seated-leg-curl";
      const hip0 = pt(SIDE_ANCHORS.hip, at(id, 0).pelvis);
      for (const t of [0.5, 1]) {
        const hip = pt(SIDE_ANCHORS.hip, at(id, t).pelvis);
        expect(
          Math.hypot(hip[0] - hip0[0], hip[1] - hip0[1]),
          `leg curl: hips on the seat @${t}`
        ).toBeLessThan(0.01);
      }
      expect(kneeDeg(id, 0), "leg curl: straight at the start").toBeGreaterThan(
        REST_KNEE - 4
      );
      expect(kneeDeg(id, 1), "leg curl: past 90 at the finish").toBeLessThan(
        75
      );
      const p1 = at(id, 1);
      const k = pt(SIDE_ANCHORS.knee, p1.shankL);
      const a = pt(SIDE_ANCHORS.ankle, p1.shankL);
      expect(a[1], "leg curl: heel driven down").toBeGreaterThan(k[1] + 30);
      expect(a[0], "leg curl: heel driven back").toBeLessThan(k[0]);
    }

    /* Batch 4: pads, sleds, a rack. */
    const stationary = (
      id: string,
      anchor: readonly [number, number],
      group: string,
      label: string
    ) => {
      const p0 = pt(anchor, (at(id, 0) as Record<string, unknown>)[group]);
      for (const t of [0.25, 0.5, 0.75, 1]) {
        const p = pt(anchor, (at(id, t) as Record<string, unknown>)[group]);
        expect(
          Math.hypot(p[0] - p0[0], p[1] - p0[1]),
          `${label} @${t}`
        ).toBeLessThan(0.01);
      }
    };
    // preacher curl: "upper arms flat on the pad" — the elbow never moves;
    // "just short of full extension" at the bottom; "up to shoulder
    // height" at the top.
    {
      const id = "preacher-curl";
      stationary(
        id,
        SIDE_ANCHORS.elbow,
        "foreArmL",
        "preacher: elbow on the pad"
      );
      expect(
        elbowDeg(id, 0),
        "preacher: short of full extension"
      ).toBeGreaterThan(156);
      expect(elbowDeg(id, 0), "preacher: short of full extension").toBeLessThan(
        172
      );
      const p1 = at(id, 1);
      const S = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const H = pt(SIDE_ANCHORS.hand, p1.handL);
      expect(
        Math.abs(H[1] - S[1]),
        "preacher: bar at shoulder height"
      ).toBeLessThan(8);
    }
    // concentration curl: the upper arm is braced against the thigh
    // (elbow stationary); "straight arm" at the hang; "up to your
    // shoulder" at the top.
    {
      const id = "concentration-curl";
      stationary(
        id,
        SIDE_ANCHORS.elbow,
        "foreArmL",
        "concentration: elbow braced"
      );
      expect(elbowDeg(id, 0), "concentration: straight arm").toBeGreaterThan(
        172
      );
      const p1 = at(id, 1);
      const S = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const H = pt(SIDE_ANCHORS.hand, p1.handL);
      expect(
        Math.hypot(H[0] - S[0], H[1] - S[1]),
        "concentration: to the shoulder"
      ).toBeLessThan(24);
    }
    // incline curl: "sit back" — the shoulder sits well behind the hip
    // (the stretch); "without letting your upper arms move forward" —
    // the elbow is stationary and the upper arm hangs plumb-or-behind.
    {
      const id = "incline-db-curl";
      stationary(
        id,
        SIDE_ANCHORS.elbow,
        "foreArmL",
        "incline curl: upper arm fixed"
      );
      const p0 = at(id, 0);
      const S = pt(SIDE_ANCHORS.shoulder, p0.torso);
      const hip = pt(SIDE_ANCHORS.hip, p0.pelvis);
      const E = pt(SIDE_ANCHORS.elbow, p0.foreArmL);
      expect(
        hip[0] - S[0],
        "incline curl: shoulder behind the hip"
      ).toBeGreaterThan(25);
      expect(
        E[0],
        "incline curl: upper arm hangs plumb or behind"
      ).toBeLessThan(S[0] + 1);
      expect(
        Math.abs(lineDeg(S, E) - 90),
        "incline curl: upper arm near plumb"
      ).toBeLessThan(8);
    }
    // leg press: the hip never leaves the seat; the platform travels the
    // 45-degree track; lockout is a soft knee ("without fully locking");
    // the bottom is deep ("thighs near your ribs").
    {
      const id = "leg-press";
      stationary(id, SIDE_ANCHORS.hip, "pelvis", "leg press: hips on the seat");
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const hip = pt(SIDE_ANCHORS.hip, p.pelvis);
        const a = pt(SIDE_ANCHORS.ankle, p.shankL);
        expect(
          Math.abs(lineDeg(hip, a) + 45),
          `leg press: foot on the 45° track @${t}`
        ).toBeLessThan(2);
      }
      expect(kneeDeg(id, 0), "leg press: soft lockout").toBeGreaterThan(125);
      expect(kneeDeg(id, 0), "leg press: never locked").toBeLessThan(
        REST_KNEE - 12
      );
      expect(kneeDeg(id, 1), "leg press: deep").toBeLessThan(70);
    }
    // hack squat: the feet never leave the platform; the top is soft;
    // "thighs parallel to the platform" at the bottom.
    {
      const id = "hack-squat";
      stationary(
        id,
        SIDE_ANCHORS.ankle,
        "shankL",
        "hack squat: feet on the platform"
      );
      expect(kneeDeg(id, 0), "hack squat: soft top").toBeGreaterThan(138);
      expect(kneeDeg(id, 0), "hack squat: never locked hard").toBeLessThan(
        REST_KNEE - 6
      );
      const p1 = at(id, 1);
      const hip = pt(SIDE_ANCHORS.hip, p1.pelvis);
      const knee = pt(SIDE_ANCHORS.knee, p1.thighL);
      expect(
        Math.abs(lineDeg(hip, knee)),
        "hack squat: thighs parallel at the bottom"
      ).toBeLessThan(12);
    }
    // rack pull: "the bar sits just below your knees" on the pins —
    // just under and just ahead of the knee at the bottom; the top is
    // the deadlift's own standing lockout (hip back at rest).
    {
      const id = "rack-pull";
      const p1 = at(id, 1);
      const knee = pt(SIDE_ANCHORS.knee, p1.thighL);
      const bar = BODY_DEMOS[id].bar!(1, p1)![0];
      expect(
        bar[1] - knee[1],
        "rack pull: bar just below the knee"
      ).toBeGreaterThan(3);
      expect(
        bar[1] - knee[1],
        "rack pull: bar just below the knee"
      ).toBeLessThan(12);
      expect(bar[0] - knee[0], "rack pull: bar at the shin").toBeGreaterThan(0);
      expect(bar[0] - knee[0], "rack pull: bar at the shin").toBeLessThan(14);
      const hip0 = pt(SIDE_ANCHORS.hip, at(id, 0).pelvis);
      expect(
        Math.hypot(
          hip0[0] - SIDE_ANCHORS.hip[0],
          hip0[1] - SIDE_ANCHORS.hip[1]
        ),
        "rack pull: standing at the top"
      ).toBeLessThan(0.01);
    }
    // decline press: the trunk is declined 15-25 degrees (head below the
    // hip); the bar travels perpendicular to it; the bottom is on the
    // LOWER chest (hip-ward of the shoulder along the trunk); lockout is
    // a full arm.
    for (const id of ["decline-bench", "decline-db-press"]) {
      const p0 = at(id, 0);
      const p1 = at(id, 1);
      const sh = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const hip = pt(SIDE_ANCHORS.hip, p1.pelvis);
      expect(sh[1] - hip[1], `${id}: head below the hip`).toBeGreaterThan(0);
      const decline = Math.abs(lineDeg(hip, sh)) - 180 + 0; // hip→shoulder points down-left
      const declineDeg = Math.abs(180 - Math.abs(lineDeg(hip, sh)));
      void decline;
      expect(declineDeg, `${id}: decline angle`).toBeGreaterThan(15);
      expect(declineDeg, `${id}: decline angle`).toBeLessThan(25);
      const hand1 = pt(SIDE_ANCHORS.hand, p1.handL);
      const trunk = lineDeg(hip, sh);
      const press = lineDeg(sh, hand1);
      let d = Math.abs(((press - trunk) % 360) + 360) % 360;
      if (d > 180) d = 360 - d;
      expect(
        Math.abs(d - 90),
        `${id}: press perpendicular to the trunk`
      ).toBeLessThan(14);
      expect(
        Math.hypot(hand1[0] - sh[0], hand1[1] - sh[1]),
        `${id}: lockout reach`
      ).toBeGreaterThan(62);
      // Bottom: the hand sits hip-ward of the shoulder along the trunk.
      const sh0 = pt(SIDE_ANCHORS.shoulder, p0.torso);
      const hip0 = pt(SIDE_ANCHORS.hip, p0.pelvis);
      const hand0 = pt(SIDE_ANCHORS.hand, p0.handL);
      const ux =
        (hip0[0] - sh0[0]) / Math.hypot(hip0[0] - sh0[0], hip0[1] - sh0[1]);
      const uy =
        (hip0[1] - sh0[1]) / Math.hypot(hip0[0] - sh0[0], hip0[1] - sh0[1]);
      expect(
        (hand0[0] - sh0[0]) * ux + (hand0[1] - sh0[1]) * uy,
        `${id}: bottom on the lower chest`
      ).toBeGreaterThan(4);
    }

    /* Batch 5: the core. */
    const SKULL: [number, number] = [51.6, 0.2];
    // crunches: "curl your shoulders off the floor" with the lower back
    // down (hip stationary); "don't pull on your neck" — the head rides
    // the trunk rigidly.
    {
      const id = "crunches";
      stationary(id, SIDE_ANCHORS.hip, "pelvis", "crunch: lower back down");
      const s0 = pt(SIDE_ANCHORS.shoulder, at(id, 0).torso);
      const s1 = pt(SIDE_ANCHORS.shoulder, at(id, 1).torso);
      expect(s0[1] - s1[1], "crunch: shoulders off the floor").toBeGreaterThan(
        15
      );
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const a = pt(SKULL, p.head);
        const b = pt(SKULL, p.torso);
        expect(
          Math.hypot(a[0] - b[0], a[1] - b[1]),
          `crunch: no neck pull @${t}`
        ).toBeLessThan(0.01);
      }
    }
    // toe touches: "legs extended straight up" the whole set; "reach your
    // hands up toward your toes, curling your shoulders off the floor".
    {
      const id = "toe-touches";
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const hip = pt(SIDE_ANCHORS.hip, p.pelvis);
        const a = pt(SIDE_ANCHORS.ankle, p.shankL);
        expect(
          Math.abs(lineDeg(hip, a) + 90),
          `toe touch: legs vertical @${t}`
        ).toBeLessThan(8);
        expect(
          elbowDeg(id, t),
          `toe touch: straight arms @${t}`
        ).toBeGreaterThan(168);
      }
      const s0 = pt(SIDE_ANCHORS.shoulder, at(id, 0).torso);
      const s1 = pt(SIDE_ANCHORS.shoulder, at(id, 1).torso);
      expect(
        s0[1] - s1[1],
        "toe touch: shoulders off the floor"
      ).toBeGreaterThan(15);
      const reach = (t: number) => {
        const p = at(id, t);
        const h = pt(SIDE_ANCHORS.hand, p.handL);
        const a = pt(SIDE_ANCHORS.ankle, p.shankL);
        return Math.hypot(h[0] - a[0], h[1] - a[1]);
      };
      expect(
        reach(0) - reach(1),
        "toe touch: hands closer to the toes"
      ).toBeGreaterThan(15);
    }
    // decline sit-up: hips fixed by the rollers; lying on the pad at the
    // stretch (shoulder below the hip); "chest toward your knees" at the top.
    {
      const id = "decline-sit-up";
      stationary(id, SIDE_ANCHORS.hip, "pelvis", "sit-up: hips on the bench");
      const p0 = at(id, 0);
      expect(
        pt(SIDE_ANCHORS.shoulder, p0.torso)[1] -
          pt(SIDE_ANCHORS.hip, p0.pelvis)[1],
        "sit-up: lying back on the decline"
      ).toBeGreaterThan(10);
      const p1 = at(id, 1);
      const S = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const K = pt(SIDE_ANCHORS.knee, p1.thighL);
      expect(
        Math.hypot(S[0] - K[0], S[1] - K[1]),
        "sit-up: chest to the knees"
      ).toBeLessThan(30);
    }
    // hanging leg raise: hands fixed on the bar; legs from plumb to
    // "parallel to the floor or higher".
    {
      const id = "leg-raise";
      stationary(id, SIDE_ANCHORS.hand, "handL", "leg raise: hands on the bar");
      const p0 = at(id, 0);
      expect(
        Math.abs(
          lineDeg(
            pt(SIDE_ANCHORS.hip, p0.pelvis),
            pt(SIDE_ANCHORS.ankle, p0.shankL)
          ) - 90
        ),
        "leg raise: hanging plumb"
      ).toBeLessThan(6);
      const p1 = at(id, 1);
      const d = lineDeg(
        pt(SIDE_ANCHORS.hip, p1.pelvis),
        pt(SIDE_ANCHORS.ankle, p1.shankL)
      );
      expect(d, "leg raise: parallel or higher").toBeLessThan(0.5);
      expect(d, "leg raise: parallel or higher").toBeGreaterThan(-15);
      for (const t of [0, 1])
        expect(
          elbowDeg(id, t),
          `leg raise: straight arms @${t}`
        ).toBeGreaterThan(172);
    }
    // cable crunch: "keeping hips fixed"; rope "held at your temples" —
    // the hand keeps one distance from the head; the trunk flexes ≥55°.
    {
      const id = "cable-crunch";
      stationary(id, SIDE_ANCHORS.hip, "pelvis", "cable crunch: hips fixed");
      const gap = (t: number) => {
        const p = at(id, t);
        const h = pt(SIDE_ANCHORS.hand, p.handL);
        const k = pt(SKULL, p.head);
        return Math.hypot(h[0] - k[0], h[1] - k[1]);
      };
      for (const t of [0.25, 0.5, 0.75, 1])
        expect(
          Math.abs(gap(t) - gap(0)),
          `cable crunch: rope at the temples @${t}`
        ).toBeLessThan(0.05);
      expect(gap(0), "cable crunch: hand AT the head").toBeLessThan(22);
      const trunk = (t: number) => {
        const p = at(id, t);
        return lineDeg(
          pt(SIDE_ANCHORS.hip, p.pelvis),
          pt(SIDE_ANCHORS.shoulder, p.torso)
        );
      };
      expect(trunk(1) - trunk(0), "cable crunch: trunk flexes").toBeGreaterThan(
        55
      );
    }
    // ab wheel: knees fixed on the pad; the wheel stays ON the floor and
    // rolls forward; arms straight; "body staying straight" at the end.
    {
      const id = "ab-wheel";
      stationary(id, SIDE_ANCHORS.knee, "thighL", "ab wheel: knees on the pad");
      const floorY = 204 - 7;
      for (const t of [0, 0.5, 1]) {
        const h = pt(SIDE_ANCHORS.hand, at(id, t).handL);
        expect(
          Math.abs(h[1] - floorY),
          `ab wheel: wheel on the floor @${t}`
        ).toBeLessThan(0.5);
        expect(
          elbowDeg(id, t),
          `ab wheel: straight arms @${t}`
        ).toBeGreaterThan(160);
      }
      const h0 = pt(SIDE_ANCHORS.hand, at(id, 0).handL);
      const h1 = pt(SIDE_ANCHORS.hand, at(id, 1).handL);
      expect(h1[0] - h0[0], "ab wheel: rolls forward").toBeGreaterThan(40);
      const p1 = at(id, 1);
      const K = pt(SIDE_ANCHORS.knee, p1.thighL);
      const H = pt(SIDE_ANCHORS.hip, p1.pelvis);
      const S = pt(SIDE_ANCHORS.shoulder, p1.torso);
      // "Straight" is the standing figure's own knee-hip-shoulder line
      // (the anchors put 14.7° between the two segments at rest).
      const restBend =
        lineDeg(SIDE_ANCHORS.knee, SIDE_ANCHORS.hip) -
        lineDeg(SIDE_ANCHORS.hip, SIDE_ANCHORS.shoulder);
      expect(
        Math.abs(lineDeg(K, H) - lineDeg(H, S) - restBend),
        "ab wheel: body straight at the end"
      ).toBeLessThan(8);
    }
    // superman: hips on the floor; "lift arms, chest, and legs off the
    // floor" — hands AND feet rise at the top.
    {
      const id = "superman-hold";
      stationary(id, SIDE_ANCHORS.hip, "pelvis", "superman: hips down");
      const p0 = at(id, 0);
      const p1 = at(id, 1);
      expect(
        pt(SIDE_ANCHORS.hand, p0.handL)[1] - pt(SIDE_ANCHORS.hand, p1.handL)[1],
        "superman: hands lift"
      ).toBeGreaterThan(12);
      expect(
        pt(SIDE_ANCHORS.ankle, p0.shankL)[1] -
          pt(SIDE_ANCHORS.ankle, p1.shankL)[1],
        "superman: feet lift"
      ).toBeGreaterThan(12);
      expect(
        pt(SIDE_ANCHORS.shoulder, p0.torso)[1] -
          pt(SIDE_ANCHORS.shoulder, p1.torso)[1],
        "superman: chest lifts"
      ).toBeGreaterThan(8);
    }

    /* Batch 6: bodyweight rows and dips, the swing, the rail. */
    const REST_BODY_BEND =
      lineDeg(SIDE_ANCHORS.ankle, SIDE_ANCHORS.hip) -
      lineDeg(SIDE_ANCHORS.hip, SIDE_ANCHORS.shoulder);
    const REST_KNEE_BEND =
      lineDeg(SIDE_ANCHORS.knee, SIDE_ANCHORS.hip) -
      lineDeg(SIDE_ANCHORS.hip, SIDE_ANCHORS.shoulder);
    // inverted row: heels planted; "one straight line from heels to
    // head"; hands fixed on the bar; "chest to the bar" at the top;
    // "full arm extension" at the bottom.
    {
      const id = "inverted-row";
      stationary(
        id,
        SIDE_ANCHORS.ankle,
        "shankL",
        "inverted row: heels planted"
      );
      stationary(
        id,
        SIDE_ANCHORS.hand,
        "handL",
        "inverted row: hands on the bar"
      );
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const bend =
          lineDeg(
            pt(SIDE_ANCHORS.ankle, p.shankL),
            pt(SIDE_ANCHORS.hip, p.pelvis)
          ) -
          lineDeg(
            pt(SIDE_ANCHORS.hip, p.pelvis),
            pt(SIDE_ANCHORS.shoulder, p.torso)
          );
        expect(
          Math.abs(bend - REST_BODY_BEND),
          `inverted row: straight body @${t}`
        ).toBeLessThan(0.5);
      }
      expect(elbowDeg(id, 0), "inverted row: full extension").toBeGreaterThan(
        160
      );
      const p1 = at(id, 1);
      const S = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const H = pt(SIDE_ANCHORS.hand, p1.handL);
      expect(
        Math.hypot(H[0] - S[0], H[1] - S[1]),
        "inverted row: chest at the bar"
      ).toBeLessThan(20);
    }
    // bench dips: hands fixed on the edge, heels fixed ahead; straight
    // arms at the top; "about 90°" with the elbows "tracking back" at
    // the bottom; the trunk stays upright.
    {
      const id = "bench-dips";
      stationary(
        id,
        SIDE_ANCHORS.hand,
        "handL",
        "bench dip: hands on the edge"
      );
      stationary(id, SIDE_ANCHORS.ankle, "shankL", "bench dip: heels planted");
      expect(
        elbowDeg(id, 0),
        "bench dip: locked out at the top"
      ).toBeGreaterThan(158);
      const k = elbowDeg(id, 1);
      expect(k, "bench dip: about 90 at the bottom").toBeGreaterThan(78);
      expect(k, "bench dip: about 90 at the bottom").toBeLessThan(102);
      const p1 = at(id, 1);
      expect(
        pt(SIDE_ANCHORS.elbow, p1.foreArmL)[0],
        "bench dip: elbows track back"
      ).toBeLessThan(pt(SIDE_ANCHORS.shoulder, p1.torso)[0]);
      const restLean = lineDeg(SIDE_ANCHORS.hip, SIDE_ANCHORS.shoulder);
      for (const t of [0, 1]) {
        const p = at(id, t);
        expect(
          Math.abs(
            lineDeg(
              pt(SIDE_ANCHORS.hip, p.pelvis),
              pt(SIDE_ANCHORS.shoulder, p.torso)
            ) - restLean
          ),
          `bench dip: trunk upright @${t}`
        ).toBeLessThan(0.5);
      }
    }
    // kettlebell swing: straight arms throughout ("without lifting with
    // your arms"); the bell "between your legs" at the hike; standing
    // tall with the bell at "chest height" at the top.
    {
      const id = "kettlebell-swing";
      for (const t of [0, 0.5, 1])
        expect(elbowDeg(id, t), `swing: straight arms @${t}`).toBeGreaterThan(
          170
        );
      const p1 = at(id, 1);
      const H1 = pt(SIDE_ANCHORS.hand, p1.handL);
      const K1 = pt(SIDE_ANCHORS.knee, p1.thighL);
      const hip1 = pt(SIDE_ANCHORS.hip, p1.pelvis);
      expect(H1[0], "swing: bell back between the legs").toBeLessThan(
        K1[0] + 4
      );
      expect(H1[1], "swing: bell low at the hike").toBeGreaterThan(
        hip1[1] + 30
      );
      const p0 = at(id, 0);
      const S0 = pt(SIDE_ANCHORS.shoulder, p0.torso);
      const H0 = pt(SIDE_ANCHORS.hand, p0.handL);
      const hip0 = pt(SIDE_ANCHORS.hip, p0.pelvis);
      expect(
        Math.abs(
          lineDeg(hip0, S0) - lineDeg(SIDE_ANCHORS.hip, SIDE_ANCHORS.shoulder)
        ),
        "swing: standing tall at the top"
      ).toBeLessThan(1);
      expect(H0[0] - S0[0], "swing: bell out front").toBeGreaterThan(50);
      expect(H0[1] - S0[1], "swing: chest height").toBeGreaterThan(0);
      expect(H0[1] - S0[1], "swing: chest height, not overhead").toBeLessThan(
        24
      );
    }
    // upright row: the bar "straight up along your body" (a hand's width
    // off the trunk), stopping at "upper chest height", "elbows should
    // not go above shoulders".
    {
      const id = "barbell-upright-row";
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const p = at(id, t);
        const H = pt(SIDE_ANCHORS.hand, p.handL);
        const E = pt(SIDE_ANCHORS.elbow, p.foreArmL);
        expect(
          H[0] - SIDE_ANCHORS.shoulder[0],
          `upright row: bar along the body @${t}`
        ).toBeGreaterThan(4);
        expect(
          H[0] - SIDE_ANCHORS.shoulder[0],
          `upright row: bar along the body @${t}`
        ).toBeLessThan(18);
        expect(
          E[1],
          `upright row: elbows not above the shoulders @${t}`
        ).toBeGreaterThan(SIDE_ANCHORS.shoulder[1] - 2);
      }
      const top =
        pt(SIDE_ANCHORS.hand, at(id, 1).handL)[1] - SIDE_ANCHORS.shoulder[1];
      expect(top, "upright row: upper chest height").toBeGreaterThan(8);
      expect(top, "upright row: upper chest height").toBeLessThan(20);
    }
    // Zercher: the bar rides the elbow crook, never the hand; the torso
    // stays more upright than the back squat's; parallel depth.
    {
      const id = "zercher-squat";
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const bar = BODY_DEMOS[id].bar!(t, p)![0];
        const E = pt(SIDE_ANCHORS.elbow, p.foreArmL);
        const H = pt(SIDE_ANCHORS.hand, p.handL);
        expect(
          Math.hypot(bar[0] - E[0], bar[1] - E[1]),
          `zercher: bar in the crook @${t}`
        ).toBeLessThan(6);
        expect(
          Math.hypot(bar[0] - H[0], bar[1] - H[1]),
          `zercher: bar not at the hand @${t}`
        ).toBeGreaterThan(20);
      }
      const z = at(id, 1);
      const q = at("squat", 1);
      const lean = (p: ReturnType<typeof at>) =>
        lineDeg(
          pt(SIDE_ANCHORS.hip, p.pelvis),
          pt(SIDE_ANCHORS.shoulder, p.torso)
        );
      expect(
        lean(z) - lean(q),
        "zercher: torso more upright than the back squat"
      ).toBeLessThan(-8);
      expect(
        pt(SIDE_ANCHORS.hip, z.pelvis)[1],
        "zercher: parallel"
      ).toBeGreaterThan(pt(SIDE_ANCHORS.knee, z.thighL)[1] - 2);
    }
    // Nordic curl + GHR: knee and ankle fixed; "body dead straight" /
    // "straight line from knees to head"; upright at the top; the Nordic
    // reaches near the floor, the GHR reaches horizontal.
    for (const [id, bottom] of [
      ["nordic-hamstring-curl", "floor"],
      ["glute-ham-raise", "horizontal"],
    ] as const) {
      stationary(id, SIDE_ANCHORS.knee, "thighL", `${id}: knees fixed`);
      stationary(id, SIDE_ANCHORS.ankle, "shankL", `${id}: ankles anchored`);
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const bend =
          lineDeg(
            pt(SIDE_ANCHORS.knee, p.thighL),
            pt(SIDE_ANCHORS.hip, p.pelvis)
          ) -
          lineDeg(
            pt(SIDE_ANCHORS.hip, p.pelvis),
            pt(SIDE_ANCHORS.shoulder, p.torso)
          );
        expect(
          Math.abs(bend - REST_KNEE_BEND),
          `${id}: straight body @${t}`
        ).toBeLessThan(0.5);
      }
      const p0 = at(id, 0);
      expect(
        Math.abs(
          lineDeg(
            pt(SIDE_ANCHORS.knee, p0.thighL),
            pt(SIDE_ANCHORS.shoulder, p0.torso)
          ) + 90
        ),
        `${id}: upright at the top`
      ).toBeLessThan(12);
      const p1 = at(id, 1);
      const line = lineDeg(
        pt(SIDE_ANCHORS.knee, p1.thighL),
        pt(SIDE_ANCHORS.shoulder, p1.torso)
      );
      if (bottom === "floor") {
        expect(
          pt(SIDE_ANCHORS.shoulder, p1.torso)[1],
          "nordic: shoulders near the floor"
        ).toBeGreaterThan(204 - 45);
      } else {
        expect(Math.abs(line), "GHR: horizontal at the bottom").toBeLessThan(
          10
        );
      }
    }
    // sissy squat: the ball of the foot never moves and the heel rises;
    // knees travel forward of the toes; thigh and trunk stay one line;
    // hands stay on the rail.
    {
      const id = "sissy-squat";
      stationary(id, CALF_BALL, "shankL", "sissy: ball of the foot planted");
      stationary(id, SIDE_ANCHORS.hand, "handL", "sissy: hands on the rail");
      const a0 = pt(SIDE_ANCHORS.ankle, at(id, 0).shankL);
      const a1 = pt(SIDE_ANCHORS.ankle, at(id, 1).shankL);
      expect(a0[1] - a1[1], "sissy: heel rises").toBeGreaterThan(5);
      const p1 = at(id, 1);
      expect(
        pt(SIDE_ANCHORS.knee, p1.thighL)[0],
        "sissy: knees forward of the toes"
      ).toBeGreaterThan(66);
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const bend =
          lineDeg(
            pt(SIDE_ANCHORS.knee, p.thighL),
            pt(SIDE_ANCHORS.hip, p.pelvis)
          ) -
          lineDeg(
            pt(SIDE_ANCHORS.hip, p.pelvis),
            pt(SIDE_ANCHORS.shoulder, p.torso)
          );
        expect(
          Math.abs(bend - REST_KNEE_BEND),
          `sissy: thigh and trunk one line @${t}`
        ).toBeLessThan(0.5);
      }
    }

    /* Batch 7: floor, box, one leg, the thruster. */
    // floor press: "upper arms touch the floor" at the bottom (the elbow
    // at shoulder height, i.e. the floor); full lockout at the top.
    {
      const id = "barbell-floor-press";
      const p0 = at(id, 0);
      const S0 = pt(SIDE_ANCHORS.shoulder, p0.torso);
      const E0 = pt(SIDE_ANCHORS.elbow, p0.foreArmL);
      expect(
        Math.abs(E0[1] - S0[1]),
        "floor press: upper arm on the floor"
      ).toBeLessThan(3);
      expect(
        E0[0] - S0[0],
        "floor press: elbow toward the feet"
      ).toBeGreaterThan(20);
      const p1 = at(id, 1);
      const S1 = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const H1 = pt(SIDE_ANCHORS.hand, p1.handL);
      expect(
        Math.hypot(H1[0] - S1[0], H1[1] - S1[1]),
        "floor press: full lockout"
      ).toBeGreaterThan(62);
      expect(
        S1[1] - H1[1],
        "floor press: bar straight up over the shoulder"
      ).toBeGreaterThan(60);
    }
    // single-leg calf raise: the working ball planted, heel dropping
    // below the block at the stretch; the other foot off the step every
    // frame; hands still on the rail.
    {
      const id = "single-leg-calf-raise";
      stationary(id, CALF_BALL, "shankL", "one-leg calf: ball planted");
      stationary(
        id,
        SIDE_ANCHORS.hand,
        "handL",
        "one-leg calf: hands still on the rail"
      );
      // Same pivot as the two-leg raise, so the heel drops exactly as far
      // below the block as that demo's own pins hold it to.
      expect(
        pt(SIDE_ANCHORS.ankle, at(id, 0).shankL)[1] -
          pt(SIDE_ANCHORS.ankle, at("calf-raise", 0).shankL)[1],
        "one-leg calf: heel drops as the two-leg raise does"
      ).toBeLessThan(0.01);
      for (const t of [0, 0.5, 1]) {
        const far = pt(SIDE_ANCHORS.ankle, at(id, t).shankR);
        expect(
          far[1],
          `one-leg calf: far foot off the step @${t}`
        ).toBeLessThan(CALF_BLOCK_TOP - 20);
      }
    }
    // donkey calf raise: "hinge forward to about 90°" held; ball planted;
    // hands still on the rail; heel rises.
    {
      const id = "donkey-calf-raise";
      stationary(id, CALF_BALL, "shankL", "donkey: ball planted");
      stationary(id, SIDE_ANCHORS.hand, "handL", "donkey: hands on the rail");
      for (const t of [0, 1]) {
        const p = at(id, t);
        expect(
          Math.abs(
            lineDeg(
              pt(SIDE_ANCHORS.hip, p.pelvis),
              pt(SIDE_ANCHORS.shoulder, p.torso)
            )
          ),
          `donkey: trunk horizontal @${t}`
        ).toBeLessThan(8);
      }
      const a0 = pt(SIDE_ANCHORS.ankle, at(id, 0).shankL);
      const a1 = pt(SIDE_ANCHORS.ankle, at(id, 1).shankL);
      expect(a0[1] - a1[1], "donkey: heel rises").toBeGreaterThan(5);
    }
    // step-ups: the front foot planted on the box; the trailing foot on
    // the floor at the start and on the box at the finish; the hip rises
    // a box height; the bar rides the traps.
    {
      const id = "barbell-step-ups";
      stationary(
        id,
        SIDE_ANCHORS.ankle,
        "shankL",
        "step-up: front foot on the box"
      );
      const b0 = pt(SIDE_ANCHORS.ankle, at(id, 0).shankR);
      const b1 = pt(SIDE_ANCHORS.ankle, at(id, 1).shankR);
      expect(
        b0[1],
        "step-up: trailing foot on the floor at the start"
      ).toBeGreaterThan(190);
      expect(
        Math.abs(b1[1] - pt(SIDE_ANCHORS.ankle, at(id, 1).shankL)[1]),
        "step-up: both feet on the box at the finish"
      ).toBeLessThan(1);
      const h0 = pt(SIDE_ANCHORS.hip, at(id, 0).pelvis);
      const h1 = pt(SIDE_ANCHORS.hip, at(id, 1).pelvis);
      expect(h0[1] - h1[1], "step-up: stands up a box height").toBeGreaterThan(
        40
      );
      for (const t of [0, 1]) {
        const p = at(id, t);
        const bar = BODY_DEMOS[id].bar!(t, p)![0];
        const rack = pt(BACK_RACK, p.torso);
        expect(
          Math.hypot(bar[0] - rack[0], bar[1] - rack[1]),
          `step-up: bar on the traps @${t}`
        ).toBeLessThan(0.01);
      }
    }
    // pistol: working foot planted; the other leg straight out and off
    // the floor every frame; "butt nearly touches the heel" at the bottom.
    {
      const id = "pistol-squat";
      stationary(
        id,
        SIDE_ANCHORS.ankle,
        "shankL",
        "pistol: working foot planted"
      );
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const far = pt(SIDE_ANCHORS.ankle, p.shankR);
        const hip = pt(SIDE_ANCHORS.hip, p.pelvis);
        expect(far[1], `pistol: free foot off the floor @${t}`).toBeLessThan(
          180
        );
        expect(
          far[0] - hip[0],
          `pistol: free leg out in front @${t}`
        ).toBeGreaterThan(60);
      }
      const p1 = at(id, 1);
      const hip = pt(SIDE_ANCHORS.hip, p1.pelvis);
      const heel = pt(SIDE_ANCHORS.ankle, p1.shankL);
      expect(
        Math.hypot(hip[0] - heel[0], hip[1] - heel[1]),
        "pistol: butt to the heel"
      ).toBeLessThan(42);
    }
    // thrusters: parallel at the bottom with the bar racked; standing at
    // the midpoint with the bar still at the shoulder; overhead lockout
    // at the top, standing tall.
    {
      const id = "thrusters";
      const p0 = at(id, 0);
      expect(
        pt(SIDE_ANCHORS.hip, p0.pelvis)[1],
        "thruster: parallel at the bottom"
      ).toBeGreaterThan(pt(SIDE_ANCHORS.knee, p0.thighL)[1] - 2);
      const rack = (t: number) => {
        const p = at(id, t);
        const S = pt(SIDE_ANCHORS.shoulder, p.torso);
        const H = pt(SIDE_ANCHORS.hand, p.handL);
        return Math.hypot(H[0] - S[0], H[1] - S[1]);
      };
      expect(rack(0), "thruster: bar racked at the bottom").toBeLessThan(12);
      expect(
        rack(0.5),
        "thruster: bar still racked when standing"
      ).toBeLessThan(12);
      const mid = at(id, 0.5);
      expect(
        Math.hypot(
          pt(SIDE_ANCHORS.hip, mid.pelvis)[0] - SIDE_ANCHORS.hip[0],
          pt(SIDE_ANCHORS.hip, mid.pelvis)[1] - SIDE_ANCHORS.hip[1]
        ),
        "thruster: standing at the midpoint"
      ).toBeLessThan(0.01);
      const p1 = at(id, 1);
      const S1 = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const H1 = pt(SIDE_ANCHORS.hand, p1.handL);
      expect(S1[1] - H1[1], "thruster: bar overhead").toBeGreaterThan(60);
      expect(elbowDeg(id, 1), "thruster: locked out").toBeGreaterThan(160);
    }
    // chest-supported row: the chest (shoulder) never leaves the pad;
    // feet planted; plumb straight arms at the stretch; hands at the
    // hips at the top with the elbow up and back.
    {
      const id = "chest-supported-db-row";
      stationary(
        id,
        SIDE_ANCHORS.shoulder,
        "torso",
        "CS row: chest on the pad"
      );
      stationary(id, SIDE_ANCHORS.ankle, "shankL", "CS row: feet planted");
      const p0 = at(id, 0);
      const S0 = pt(SIDE_ANCHORS.shoulder, p0.torso);
      const H0 = pt(SIDE_ANCHORS.hand, p0.handL);
      expect(
        Math.abs(lineDeg(S0, H0) - 90),
        "CS row: arms plumb at the stretch"
      ).toBeLessThan(5);
      expect(
        elbowDeg(id, 0),
        "CS row: straight at the stretch"
      ).toBeGreaterThan(158);
      const p1 = at(id, 1);
      const hip = pt(SIDE_ANCHORS.hip, p1.pelvis);
      const H1 = pt(SIDE_ANCHORS.hand, p1.handL);
      const E1 = pt(SIDE_ANCHORS.elbow, p1.foreArmL);
      expect(
        Math.hypot(H1[0] - hip[0], H1[1] - hip[1]),
        "CS row: hand at the hip"
      ).toBeLessThan(14);
      expect(E1[1], "CS row: elbow driven up").toBeLessThan(H1[1]);
    }

    /* Batch 8: the rest of the cables. */
    // Pushdowns (bar, single handle): "pin your elbow(s)" — stationary;
    // folded at the stretch, full lockout at the finish.
    for (const id of [
      "reverse-grip-cable-pushdown",
      "single-arm-cable-pushdown",
    ]) {
      stationary(id, SIDE_ANCHORS.elbow, "foreArmL", `${id}: elbow pinned`);
      expect(elbowDeg(id, 0), `${id}: folded at the stretch`).toBeLessThan(70);
      expect(elbowDeg(id, 1), `${id}: full lockout`).toBeGreaterThan(165);
      expect(BODY_DEMOS[id].pulley![1], `${id}: high pulley`).toBeLessThan(0);
    }
    // Overhead cable extension: "elbows close to your head" (beside it,
    // every frame); "fully straight" overhead; "lean slightly forward";
    // the cable from a LOW pulley BEHIND.
    {
      const id = "overhead-cable-tricep-extension";
      const headX = pt(SIDE_ANCHORS.neck, at(id, 0).head)[0];
      for (const t of [0, 0.5, 1]) {
        const E = pt(SIDE_ANCHORS.elbow, at(id, t).foreArmL);
        expect(
          Math.abs(E[0] - headX),
          `overhead cable: elbow beside the head @${t}`
        ).toBeLessThan(12);
        expect(E[1], `overhead cable: elbow above the neck @${t}`).toBeLessThan(
          20
        );
        const H = pt(SIDE_ANCHORS.hand, at(id, t).handL);
        const pulley = BODY_DEMOS[id].pulley!;
        expect(pulley[1], `overhead cable: pulley low @${t}`).toBeGreaterThan(
          H[1] + 100
        );
        expect(pulley[0], `overhead cable: pulley behind @${t}`).toBeLessThan(
          H[0]
        );
      }
      expect(elbowDeg(id, 1), "overhead cable: fully straight").toBeGreaterThan(
        165
      );
      const p = at(id, 0);
      const lean =
        lineDeg(
          pt(SIDE_ANCHORS.hip, p.pelvis),
          pt(SIDE_ANCHORS.shoulder, p.torso)
        ) +
        90 -
        (lineDeg(SIDE_ANCHORS.hip, SIDE_ANCHORS.shoulder) + 90);
      expect(lean, "overhead cable: slight forward lean").toBeGreaterThan(6);
      expect(lean, "overhead cable: slight forward lean").toBeLessThan(18);
    }
    // Bayesian curl: "elbow sits behind your torso ... keeping the elbow
    // behind you" — behind the shoulder line every frame and stationary;
    // straight at the stretch; up toward the shoulder at the finish.
    {
      const id = "bayesian-cable-curl";
      stationary(id, SIDE_ANCHORS.elbow, "foreArmL", "bayesian: elbow held");
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const S = pt(SIDE_ANCHORS.shoulder, p.torso);
        const E = pt(SIDE_ANCHORS.elbow, p.foreArmL);
        expect(
          S[0] - E[0],
          `bayesian: elbow behind the trunk @${t}`
        ).toBeGreaterThan(8);
      }
      expect(
        elbowDeg(id, 0),
        "bayesian: straight at the stretch"
      ).toBeGreaterThan(172);
      const p1 = at(id, 1);
      const S = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const H = pt(SIDE_ANCHORS.hand, p1.handL);
      expect(
        Math.hypot(H[0] - S[0], H[1] - S[1]),
        "bayesian: hand up toward the shoulder"
      ).toBeLessThan(30);
      expect(
        BODY_DEMOS[id].pulley![0],
        "bayesian: low pulley behind"
      ).toBeLessThan(0);
    }
    // Reverse curl: the strict curl's contract — elbows pinned (≤3 of
    // drift) — with the bar at shoulder height at the top.
    {
      const id = "reverse-barbell-curl";
      const E0 = pt(SIDE_ANCHORS.elbow, at(id, 0).foreArmL);
      const E1 = pt(SIDE_ANCHORS.elbow, at(id, 1).foreArmL);
      expect(
        Math.hypot(E1[0] - E0[0], E1[1] - E0[1]),
        "reverse curl: elbows pinned"
      ).toBeLessThan(3.2);
      const S = pt(SIDE_ANCHORS.shoulder, at(id, 1).torso);
      const H = pt(SIDE_ANCHORS.hand, at(id, 1).handL);
      expect(
        Math.abs(H[1] - S[1]),
        "reverse curl: bar at shoulder height"
      ).toBeLessThan(14);
    }
    // Spider curl: "arms hanging straight" (plumb) and "without moving
    // your upper arms" — the elbow stationary, the upper arm plumb every
    // frame; straight at the stretch.
    {
      const id = "spider-db-curl";
      stationary(id, SIDE_ANCHORS.elbow, "foreArmL", "spider: upper arm fixed");
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const S = pt(SIDE_ANCHORS.shoulder, p.upperArmL);
        const E = pt(SIDE_ANCHORS.elbow, p.foreArmL);
        expect(
          Math.abs(lineDeg(S, E) - 90),
          `spider: upper arm plumb @${t}`
        ).toBeLessThan(4);
      }
      expect(
        elbowDeg(id, 0),
        "spider: straight at the stretch"
      ).toBeGreaterThan(172);
    }
    // Single-arm pulldown: "full overhead stretch" (hand above the
    // head); "elbow driving back behind your torso" at the finish; hips
    // on the seat.
    {
      const id = "single-arm-lat-pulldown";
      stationary(id, SIDE_ANCHORS.hip, "pelvis", "pulldown: hips on the seat");
      const p0 = at(id, 0);
      const headTop = pt(SIDE_ANCHORS.neck, p0.head)[1] - 28;
      expect(
        pt(SIDE_ANCHORS.hand, p0.handL)[1],
        "pulldown: hand above the head"
      ).toBeLessThan(headTop);
      expect(
        elbowDeg(id, 0),
        "pulldown: extended at the stretch"
      ).toBeGreaterThan(160);
      const p1 = at(id, 1);
      const S = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const E = pt(SIDE_ANCHORS.elbow, p1.foreArmL);
      const H = pt(SIDE_ANCHORS.hand, p1.handL);
      expect(E[0], "pulldown: elbow behind the trunk").toBeLessThan(S[0] - 8);
      expect(Math.abs(H[0] - S[0]), "pulldown: hand at the side").toBeLessThan(
        14
      );
    }
    // Glute kickback: the planted foot never moves; the working leg
    // "straight back" — the knee stays straight and the ankle finishes
    // well behind the hip and off the floor; "hinge slightly".
    {
      const id = "cable-glute-kickback";
      stationary(id, SIDE_ANCHORS.ankle, "shankR", "kickback: planted foot");
      stationary(
        id,
        SIDE_ANCHORS.hand,
        "handL",
        "kickback: hands on the frame"
      );
      for (const t of [0, 0.5, 1]) {
        expect(kneeDeg(id, t), `kickback: leg straight @${t}`).toBeGreaterThan(
          REST_KNEE - 1
        );
      }
      const p1 = at(id, 1);
      const hip = pt(SIDE_ANCHORS.hip, p1.pelvis);
      const a = pt(SIDE_ANCHORS.ankle, p1.shankL);
      const a0 = pt(SIDE_ANCHORS.ankle, at(id, 0).shankL);
      expect(hip[0] - a[0], "kickback: ankle behind the hip").toBeGreaterThan(
        40
      );
      expect(a0[1] - a[1], "kickback: ankle off the floor").toBeGreaterThan(10);
      const lean =
        lineDeg(hip, pt(SIDE_ANCHORS.shoulder, p1.torso)) +
        90 -
        (lineDeg(SIDE_ANCHORS.hip, SIDE_ANCHORS.shoulder) + 90);
      expect(lean, "kickback: slight hinge").toBeGreaterThan(10);
      expect(lean, "kickback: slight hinge").toBeLessThan(26);
    }

    /* Batch 9: landmines, levers, inversions. */
    const restLeanDeg = lineDeg(SIDE_ANCHORS.hip, SIDE_ANCHORS.shoulder) + 90;
    const trunkLean = (id: string, t: number) => {
      const p = at(id, t);
      return (
        lineDeg(
          pt(SIDE_ANCHORS.hip, p.pelvis),
          pt(SIDE_ANCHORS.shoulder, p.torso)
        ) +
        90 -
        restLeanDeg
      );
    };
    // Landmine press: the hand rides the bar's ARC about the floor sleeve
    // (constant radius); starts at shoulder height; finishes fully
    // extended, up and forward.
    {
      const id = "landmine-press";
      const pivot = BODY_DEMOS[id].pivot!;
      const r0 = Math.hypot(
        pt(SIDE_ANCHORS.hand, at(id, 0).handL)[0] - pivot[0],
        pt(SIDE_ANCHORS.hand, at(id, 0).handL)[1] - pivot[1]
      );
      for (const t of [0.25, 0.5, 0.75, 1]) {
        const H = pt(SIDE_ANCHORS.hand, at(id, t).handL);
        expect(
          Math.abs(Math.hypot(H[0] - pivot[0], H[1] - pivot[1]) - r0),
          `landmine press: hand on the bar's arc @${t}`
        ).toBeLessThan(0.3);
      }
      const S0 = pt(SIDE_ANCHORS.shoulder, at(id, 0).torso);
      const H0 = pt(SIDE_ANCHORS.hand, at(id, 0).handL);
      expect(
        Math.abs(H0[1] - S0[1]),
        "landmine press: bar end at shoulder height"
      ).toBeLessThan(10);
      expect(elbowDeg(id, 1), "landmine press: fully extended").toBeGreaterThan(
        160
      );
      const H1 = pt(SIDE_ANCHORS.hand, at(id, 1).handL);
      expect(S0[1] - H1[1], "landmine press: up").toBeGreaterThan(10);
      expect(H1[0] - S0[0], "landmine press: and forward").toBeGreaterThan(40);
    }
    // Landmine squat: the bar end hugged to the chest (hand-to-shoulder
    // distance constant); to parallel with an upright trunk.
    {
      const id = "landmine-squat";
      const d = (t: number) => {
        const p = at(id, t);
        const S = pt(SIDE_ANCHORS.shoulder, p.torso);
        const H = pt(SIDE_ANCHORS.hand, p.handL);
        return Math.hypot(H[0] - S[0], H[1] - S[1]);
      };
      for (const t of [0.5, 1])
        expect(
          Math.abs(d(t) - d(0)),
          `landmine squat: bar hugged @${t}`
        ).toBeLessThan(0.3);
      const p1 = at(id, 1);
      expect(
        pt(SIDE_ANCHORS.hip, p1.pelvis)[1],
        "landmine squat: parallel"
      ).toBeGreaterThan(pt(SIDE_ANCHORS.knee, p1.thighL)[1] - 2);
      expect(trunkLean(id, 1), "landmine squat: upright trunk").toBeLessThan(
        18
      );
    }
    // Meadows row: "keeping the hinge locked" (40-50° at both ends);
    // straight hang at the stretch; elbow driven back behind the trunk
    // and the end at the hip at the top.
    {
      const id = "meadows-row";
      for (const t of [0, 1]) {
        expect(trunkLean(id, t), `meadows: hinge locked @${t}`).toBeGreaterThan(
          40
        );
        expect(trunkLean(id, t), `meadows: hinge locked @${t}`).toBeLessThan(
          50
        );
      }
      expect(elbowDeg(id, 0), "meadows: straight hang").toBeGreaterThan(160);
      const p1 = at(id, 1);
      const S = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const E = pt(SIDE_ANCHORS.elbow, p1.foreArmL);
      const H = pt(SIDE_ANCHORS.hand, p1.handL);
      const hip = pt(SIDE_ANCHORS.hip, p1.pelvis);
      expect(S[0] - E[0], "meadows: elbow behind the trunk").toBeGreaterThan(
        20
      );
      expect(
        Math.hypot(H[0] - hip[0], H[1] - hip[1]),
        "meadows: end at the hip"
      ).toBeLessThan(14);
    }
    // Chest press machine: hips on the seat; a HORIZONTAL press at
    // mid-chest; fully extended at the finish.
    {
      const id = "chest-press-machine";
      stationary(
        id,
        SIDE_ANCHORS.hip,
        "pelvis",
        "chest press: hips on the seat"
      );
      const y0 = pt(SIDE_ANCHORS.hand, at(id, 0).handL)[1];
      for (const t of [0.5, 1])
        expect(
          Math.abs(pt(SIDE_ANCHORS.hand, at(id, t).handL)[1] - y0),
          `chest press: horizontal @${t}`
        ).toBeLessThan(1);
      expect(elbowDeg(id, 1), "chest press: fully extended").toBeGreaterThan(
        160
      );
      const S = pt(SIDE_ANCHORS.shoulder, at(id, 0).torso);
      const H = pt(SIDE_ANCHORS.hand, at(id, 0).handL);
      expect(
        Math.hypot(H[0] - S[0], H[1] - S[1]),
        "chest press: handles at the chest"
      ).toBeLessThan(26);
    }
    // Shoulder press machine: "without shrugging" — the shoulder never
    // moves; handles at shoulder height; straight up to full extension.
    {
      const id = "shoulder-press-machine";
      stationary(
        id,
        SIDE_ANCHORS.shoulder,
        "torso",
        "shoulder press: no shrug"
      );
      const S = pt(SIDE_ANCHORS.shoulder, at(id, 0).torso);
      const H0 = pt(SIDE_ANCHORS.hand, at(id, 0).handL);
      const H1 = pt(SIDE_ANCHORS.hand, at(id, 1).handL);
      expect(
        Math.abs(H0[1] - S[1]),
        "shoulder press: handles at shoulder height"
      ).toBeLessThan(10);
      expect(H0[1] - H1[1], "shoulder press: straight up").toBeGreaterThan(55);
      expect(
        Math.abs(H1[0] - H0[0]),
        "shoulder press: straight up, not forward"
      ).toBeLessThan(16);
      expect(elbowDeg(id, 1), "shoulder press: full extension").toBeGreaterThan(
        160
      );
    }
    // JM press: the bar to the upper chin — toward the head and above
    // the shoulder line — with the elbow FORWARD (anterior = above, lying
    // down) of the bar; lockout over the shoulder.
    {
      const id = "jm-press";
      const p0 = at(id, 0);
      const S = pt(SIDE_ANCHORS.shoulder, p0.torso);
      const E = pt(SIDE_ANCHORS.elbow, p0.foreArmL);
      const H = pt(SIDE_ANCHORS.hand, p0.handL);
      expect(S[0] - H[0], "jm: bar toward the chin").toBeGreaterThan(8);
      expect(S[1] - H[1], "jm: bar above the shoulder line").toBeGreaterThan(8);
      expect(H[1] - E[1], "jm: elbows forward of the bar").toBeGreaterThan(8);
      expect(elbowDeg(id, 1), "jm: lockout").toBeGreaterThan(160);
      stationary(id, SIDE_ANCHORS.shoulder, "torso", "jm: on the bench");
    }
    // Pike push-up: hands and feet fixed; hips high above the shoulders
    // throughout; legs straight; crown to the floor at the bottom;
    // straight arms at the top.
    {
      const id = "pike-push-up";
      stationary(id, SIDE_ANCHORS.hand, "handL", "pike: hands planted");
      stationary(id, SIDE_ANCHORS.ankle, "shankL", "pike: feet planted");
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        expect(
          pt(SIDE_ANCHORS.shoulder, p.torso)[1] -
            pt(SIDE_ANCHORS.hip, p.pelvis)[1],
          `pike: hips high @${t}`
        ).toBeGreaterThan(20);
        expect(kneeDeg(id, t), `pike: legs straight @${t}`).toBeGreaterThan(
          REST_KNEE - 2
        );
      }
      expect(
        pt(SIDE_ANCHORS.shoulder, at(id, 1).torso)[1],
        "pike: crown to the floor"
      ).toBeGreaterThan(204 - 38 - 10);
      expect(elbowDeg(id, 0), "pike: straight arms at the top").toBeGreaterThan(
        160
      );
    }
    // Handstand push-up: hands fixed; the body stacked plumb over the
    // hands every frame; head to the floor at the bottom; locked at the top.
    {
      const id = "handstand-push-ups";
      stationary(id, SIDE_ANCHORS.hand, "handL", "hspu: hands planted");
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        expect(
          Math.abs(
            pt(SIDE_ANCHORS.ankle, p.shankL)[0] -
              pt(SIDE_ANCHORS.shoulder, p.torso)[0]
          ),
          `hspu: stacked @${t}`
        ).toBeLessThan(8);
      }
      expect(
        pt(SIDE_ANCHORS.shoulder, at(id, 1).torso)[1],
        "hspu: head to the floor"
      ).toBeGreaterThan(204 - 38 - 8);
      expect(elbowDeg(id, 0), "hspu: locked at the top").toBeGreaterThan(160);
    }
    // Dragon flag: supported only on the shoulder (stationary); ONE rigid
    // plank (hip on the shoulder-ankle line); vertical at the top; nearly
    // parallel at the bottom with the hips still off the bench.
    {
      const id = "dragon-flag";
      stationary(
        id,
        SIDE_ANCHORS.shoulder,
        "torso",
        "dragon: on the shoulders"
      );
      // "One rigid plank": the hip's offset from the shoulder-ankle line
      // is the standing figure's own (the anatomical hip sits a few units
      // behind that line) and does not change through the rep.
      const perpOf = (
        S: [number, number],
        hip: [number, number],
        a: [number, number]
      ) => {
        const len = Math.hypot(a[0] - S[0], a[1] - S[1]);
        return (
          ((a[0] - S[0]) * (hip[1] - S[1]) - (a[1] - S[1]) * (hip[0] - S[0])) /
          len
        );
      };
      const restPerp = perpOf(
        SIDE_ANCHORS.shoulder,
        SIDE_ANCHORS.hip,
        SIDE_ANCHORS.ankle
      );
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const S = pt(SIDE_ANCHORS.shoulder, p.torso);
        const hip = pt(SIDE_ANCHORS.hip, p.pelvis);
        const a = pt(SIDE_ANCHORS.ankle, p.shankL);
        expect(
          Math.abs(Math.abs(perpOf(S, hip, a)) - Math.abs(restPerp)),
          `dragon: rigid plank @${t}`
        ).toBeLessThan(0.5);
      }
      const p0 = at(id, 0);
      const S0 = pt(SIDE_ANCHORS.shoulder, p0.torso);
      const a0 = pt(SIDE_ANCHORS.ankle, p0.shankL);
      expect(
        Math.abs(a0[0] - S0[0]),
        "dragon: vertical at the top"
      ).toBeLessThan(20);
      expect(S0[1] - a0[1], "dragon: vertical at the top").toBeGreaterThan(130);
      const p1 = at(id, 1);
      const a1 = pt(SIDE_ANCHORS.ankle, p1.shankL);
      const deg = (Math.atan2(S0[1] - a1[1], a1[0] - S0[0]) * 180) / Math.PI;
      expect(deg, "dragon: nearly parallel at the bottom").toBeGreaterThan(8);
      expect(deg, "dragon: nearly parallel at the bottom").toBeLessThan(22);
      expect(
        pt(SIDE_ANCHORS.hip, p1.pelvis)[1],
        "dragon: hips off the bench"
      ).toBeLessThan(150 - 6);
    }

    /* Batch 10: holds drawn as their set-up, and two transitions. */
    // Plank: "elbows directly under your shoulders" (every frame); the
    // hips lift from the floor into "one straight line from the back of
    // your head to your heels" — the hip's offset from the shoulder-ankle
    // line ends at the standing figure's own.
    for (const id of ["plank", "weighted-plank"]) {
      stationary(
        id,
        SIDE_ANCHORS.shoulder,
        "torso",
        `${id}: shoulder over the elbow`
      );
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const S = pt(SIDE_ANCHORS.shoulder, p.torso);
        const E = pt(SIDE_ANCHORS.elbow, p.foreArmL);
        expect(
          Math.abs(E[0] - S[0]),
          `${id}: elbow under the shoulder @${t}`
        ).toBeLessThan(3);
        expect(E[1], `${id}: forearm on the floor @${t}`).toBeGreaterThan(196);
      }
      const hip0 = pt(SIDE_ANCHORS.hip, at(id, 0).pelvis);
      const p1 = at(id, 1);
      const hip1 = pt(SIDE_ANCHORS.hip, p1.pelvis);
      expect(hip0[1] - hip1[1], `${id}: hips lift`).toBeGreaterThan(8);
      const S1 = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const A1 = pt(SIDE_ANCHORS.ankle, p1.shankL);
      const len = Math.hypot(A1[0] - S1[0], A1[1] - S1[1]);
      const perp =
        ((A1[0] - S1[0]) * (hip1[1] - S1[1]) -
          (A1[1] - S1[1]) * (hip1[0] - S1[0])) /
        len;
      const restPerp =
        ((SIDE_ANCHORS.ankle[0] - SIDE_ANCHORS.shoulder[0]) *
          (SIDE_ANCHORS.hip[1] - SIDE_ANCHORS.shoulder[1]) -
          (SIDE_ANCHORS.ankle[1] - SIDE_ANCHORS.shoulder[1]) *
            (SIDE_ANCHORS.hip[0] - SIDE_ANCHORS.shoulder[0])) /
        Math.hypot(
          SIDE_ANCHORS.ankle[0] - SIDE_ANCHORS.shoulder[0],
          SIDE_ANCHORS.ankle[1] - SIDE_ANCHORS.shoulder[1]
        );
      expect(
        Math.abs(Math.abs(perp) - Math.abs(restPerp)),
        `${id}: one straight line at the hold`
      ).toBeLessThan(3);
    }
    // L-sit: "straight arms" on the parallettes (hands fixed) every
    // frame; hips off the floor; legs straight and "parallel to the
    // ground" at the hold.
    {
      const id = "l-sit";
      stationary(
        id,
        SIDE_ANCHORS.hand,
        "handL",
        "l-sit: hands on the parallettes"
      );
      for (const t of [0, 0.5, 1]) {
        expect(elbowDeg(id, t), `l-sit: straight arms @${t}`).toBeGreaterThan(
          165
        );
        expect(kneeDeg(id, t), `l-sit: straight legs @${t}`).toBeGreaterThan(
          REST_KNEE - 1
        );
        expect(
          pt(SIDE_ANCHORS.hip, at(id, t).pelvis)[1],
          `l-sit: hips off the floor @${t}`
        ).toBeLessThan(204 - 14);
      }
      const p1 = at(id, 1);
      const hip = pt(SIDE_ANCHORS.hip, p1.pelvis);
      const a = pt(SIDE_ANCHORS.ankle, p1.shankL);
      expect(
        Math.abs(lineDeg(hip, a)),
        "l-sit: legs parallel to the ground"
      ).toBeLessThan(8);
    }
    // Muscle-up: hands never leave the bar; a straight-arm hang below it,
    // the chest AT the bar halfway, one straight arm ABOVE it at the top.
    {
      const id = "muscle-ups";
      stationary(id, SIDE_ANCHORS.hand, "handL", "muscle-up: hands on the bar");
      const bar = pt(SIDE_ANCHORS.hand, at(id, 0).handL);
      const S0 = pt(SIDE_ANCHORS.shoulder, at(id, 0).torso);
      expect(
        S0[1] - bar[1],
        "muscle-up: hanging below the bar"
      ).toBeGreaterThan(60);
      expect(elbowDeg(id, 0), "muscle-up: straight-arm hang").toBeGreaterThan(
        160
      );
      const Sm = pt(SIDE_ANCHORS.shoulder, at(id, 0.5).torso);
      expect(
        Math.hypot(Sm[0] - bar[0], Sm[1] - bar[1]),
        "muscle-up: chest at the bar"
      ).toBeLessThan(16);
      const S1 = pt(SIDE_ANCHORS.shoulder, at(id, 1).torso);
      expect(
        bar[1] - S1[1],
        "muscle-up: lockout above the bar"
      ).toBeGreaterThan(60);
      expect(elbowDeg(id, 1), "muscle-up: full lockout").toBeGreaterThan(160);
    }
    // Clean and press: the bar near the floor at the start (the deadlift's
    // own bottom), racked on the front delts standing at the half, a dip
    // after the catch, overhead at the top.
    {
      const id = "clean-and-press";
      const bar0 = BODY_DEMOS[id].bar!(0, at(id, 0))![0];
      expect(bar0[1], "clean: bar near the floor").toBeGreaterThan(165);
      const pMid = at(id, 0.5);
      const rack = pt(FRONT_RACK_TEST, pMid.torso);
      const hMid = pt(SIDE_ANCHORS.hand, pMid.handL);
      expect(
        Math.hypot(hMid[0] - rack[0], hMid[1] - rack[1]),
        "clean: racked at the half"
      ).toBeLessThan(2);
      const hipMid = pt(SIDE_ANCHORS.hip, pMid.pelvis);
      expect(
        Math.hypot(
          hipMid[0] - SIDE_ANCHORS.hip[0],
          hipMid[1] - SIDE_ANCHORS.hip[1]
        ),
        "clean: standing at the half"
      ).toBeLessThan(8);
      const hipDip = pt(SIDE_ANCHORS.hip, at(id, 0.6).pelvis);
      expect(
        hipDip[1] - SIDE_ANCHORS.hip[1],
        "press: a dip after the catch"
      ).toBeGreaterThan(4);
      const p1 = at(id, 1);
      const S1 = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const h1 = pt(SIDE_ANCHORS.hand, p1.handL);
      expect(S1[1] - h1[1], "press: overhead").toBeGreaterThan(60);
      expect(elbowDeg(id, 1), "press: lockout").toBeGreaterThan(160);
    }

    /* Batch 11: the frontal plane, on the FRONT figure. */
    const AS: Record<string, [number, number]> = {
      shoulderL: [24, 48],
      shoulderR: [76, 48],
      elbowL: [20, 71],
      elbowR: [80, 71],
      handL: [3.5, 101.2],
      handR: [96.1, 101.2],
    };
    const antAt = (id: string, t: number) => {
      const p = at(id, t);
      return {
        EL: pt(AS.elbowL, p.foreArmL),
        HL: pt(AS.handL, p.foreArmL),
        ER: pt(AS.elbowR, p.foreArmR),
        HR: pt(AS.handR, p.foreArmR),
        SL: pt(AS.shoulderL, p.upperArmL),
        SR: pt(AS.shoulderR, p.upperArmR),
      };
    };
    const span = (id: string, t: number) => {
      const a = antAt(id, t);
      return a.HR[0] - a.HL[0];
    };
    // Flys: hands wide in the fly plane at the stretch, together over
    // the chest at the top, never far from the shoulder line.
    for (const id of ["db-flyes", "cable-fly", "machine-chest-fly"]) {
      expect(span(id, 0), `${id}: wide stretch`).toBeGreaterThan(140);
      expect(span(id, 1), `${id}: together at the top`).toBeLessThan(16);
      for (const t of [0, 1]) {
        const a = antAt(id, t);
        expect(
          Math.abs(a.HL[1] - AS.shoulderL[1]),
          `${id}: in the fly plane @${t}`
        ).toBeLessThan(14);
      }
    }
    // Crossover: from above the shoulders, wide, to together in front of
    // the hips; the pulleys high.
    {
      const id = "cable-crossover";
      expect(
        antAt(id, 0).HL[1],
        "crossover: hands high at the stretch"
      ).toBeLessThan(30);
      expect(span(id, 0), "crossover: wide at the stretch").toBeGreaterThan(
        130
      );
      expect(span(id, 1), "crossover: together at the bottom").toBeLessThan(18);
      expect(
        antAt(id, 1).HL[1],
        "crossover: in front of the hips"
      ).toBeGreaterThan(96);
      for (const p of BODY_DEMOS[id].pivots!)
        expect(p[1], "crossover: pulleys high").toBeLessThan(0);
    }
    // Pec deck: "elbows at shoulder height" every frame, forearms vertical
    // on the pads every frame, and the pads squeezed together.
    {
      const id = "pec-deck";
      for (const t of [0, 0.5, 1]) {
        const a = antAt(id, t);
        expect(
          Math.abs(a.EL[1] - AS.shoulderL[1]),
          `pec deck: elbow at shoulder height @${t}`
        ).toBeLessThan(2);
        expect(
          Math.abs(a.HL[0] - a.EL[0]),
          `pec deck: forearm vertical @${t}`
        ).toBeLessThan(0.5);
        expect(a.EL[1] - a.HL[1], `pec deck: forearm up @${t}`).toBeGreaterThan(
          30
        );
      }
      expect(span(id, 0), "pec deck: open").toBeGreaterThan(90);
      expect(span(id, 1), "pec deck: squeezed together").toBeLessThan(30);
    }
    // Lu raise: a lateral raise to shoulder height by the half, then the
    // bells together in front at shoulder height.
    {
      const id = "lu-raise";
      const mid = antAt(id, 0.5);
      expect(
        Math.abs(mid.HL[1] - AS.shoulderL[1]),
        "lu: shoulder height at the half"
      ).toBeLessThan(6);
      expect(span(id, 0.5), "lu: wide at the half").toBeGreaterThan(150);
      const top = antAt(id, 1);
      expect(span(id, 1), "lu: together in front").toBeLessThan(16);
      expect(
        Math.abs(top.HL[1] - AS.shoulderL[1]),
        "lu: still at shoulder height"
      ).toBeLessThan(6);
    }
    // Arnold press: bells in front of the shoulders at the start (elbows
    // in, hands above), elbows out wide at shoulder height by the swing's
    // end, then a full lockout overhead.
    {
      const id = "arnold-press";
      const a0 = antAt(id, 0);
      expect(
        Math.abs(a0.EL[0] - AS.shoulderL[0]),
        "arnold: elbows in front at the start"
      ).toBeLessThan(12);
      expect(a0.HL[1], "arnold: bells up before the face").toBeLessThan(30);
      const aS = antAt(id, 0.35);
      expect(
        Math.abs(aS.EL[1] - AS.shoulderL[1]),
        "arnold: elbows at shoulder height after the swing"
      ).toBeLessThan(3);
      expect(
        AS.shoulderL[0] - aS.EL[0],
        "arnold: elbows out wide"
      ).toBeGreaterThan(18);
      const a1 = antAt(id, 1);
      expect(a1.HL[1], "arnold: overhead").toBeLessThan(-4);
      expect(jointDeg(a1.SL, a1.EL, a1.HL), "arnold: lockout").toBeGreaterThan(
        165
      );
    }
    // Cuban press: row top with elbows leading (at shoulder height, hands
    // below them); rotated with the hands above the elbows; then lockout.
    {
      const id = "cuban-press";
      const row = antAt(id, 1 / 3);
      expect(
        Math.abs(row.EL[1] - AS.shoulderL[1]),
        "cuban: elbows lead to shoulder height"
      ).toBeLessThan(4);
      expect(
        row.HL[1] - row.EL[1],
        "cuban: hands below the elbows at the row"
      ).toBeGreaterThan(25);
      const rot = antAt(id, 2 / 3);
      expect(
        rot.EL[1] - rot.HL[1],
        "cuban: rotated — hands above the elbows"
      ).toBeGreaterThan(25);
      const a1 = antAt(id, 1);
      expect(
        jointDeg(a1.SL, a1.EL, a1.HL),
        "cuban: lockout overhead"
      ).toBeGreaterThan(165);
      expect(a1.HL[1], "cuban: overhead").toBeLessThan(-4);
    }
    // Shrugs: the shoulders (cap + arm) rise strictly vertically with a
    // straight arm; the trunk does not move.
    for (const id of ["shrugs", "barbell-shrug"]) {
      const a0 = antAt(id, 0);
      const a1 = antAt(id, 1);
      expect(a0.HL[1] - a1.HL[1], `${id}: rise`).toBeGreaterThan(6);
      expect(a0.HL[1] - a1.HL[1], `${id}: rise`).toBeLessThan(8.5);
      expect(
        Math.abs(a1.HL[0] - a0.HL[0]),
        `${id}: strictly vertical`
      ).toBeLessThan(0.01);
      expect(a0.EL[1] - a1.EL[1], `${id}: the whole arm rises`).toBeCloseTo(
        a0.HL[1] - a1.HL[1],
        5
      );
      expect(at(id, 1).torso, `${id}: trunk still`).toBeUndefined();
    }

    /* Batch 12: legs on the front figure, the back figure, the twists. */
    const antKnees = (id: string, t: number) => {
      const p = at(id, t);
      return {
        KL: pt([32, 148], p.shankL),
        KR: pt([68, 148], p.shankR),
        AL: pt([29, 196], p.shankL),
        AR: pt([65, 196], p.shankR),
      };
    };
    // Hip machines: the trunk never moves; the knees (and feet) spread
    // apart for abduction, close for adduction.
    {
      for (const id of ["hip-abduction-machine", "hip-adduction-machine"]) {
        expect(
          at(id, 1).torso,
          `${id}: trunk pinned to the pad`
        ).toBeUndefined();
      }
      const ab0 = antKnees("hip-abduction-machine", 0);
      const ab1 = antKnees("hip-abduction-machine", 1);
      expect(
        ab0.KR[0] - ab0.KL[0],
        "abduction: knees together at the start"
      ).toBeLessThan(32);
      expect(ab1.KR[0] - ab1.KL[0], "abduction: knees apart").toBeGreaterThan(
        46
      );
      expect(ab1.AR[0] - ab1.AL[0], "abduction: feet wide").toBeGreaterThan(80);
      const ad0 = antKnees("hip-adduction-machine", 0);
      const ad1 = antKnees("hip-adduction-machine", 1);
      expect(
        ad0.KR[0] - ad0.KL[0],
        "adduction: apart at the start"
      ).toBeGreaterThan(46);
      expect(
        ad1.KR[0] - ad1.KL[0],
        "adduction: squeezed together"
      ).toBeLessThan(34);
    }
    // Reverse flys (back figure): from the arms reaching away — hands
    // close together — to wide at shoulder height.
    for (const id of [
      "reverse-flyes",
      "rear-delt-machine-fly",
      "reverse-pec-deck",
    ]) {
      const h = (t: number) => {
        const p = at(id, t);
        return {
          L: pt([3.4, 108.5], p.foreArmL),
          R: pt([96.6, 108.9], p.foreArmR),
        };
      };
      expect(
        h(0).R[0] - h(0).L[0],
        `${id}: hands close at the stretch`
      ).toBeLessThan(24);
      expect(h(1).R[0] - h(1).L[0], `${id}: wide open`).toBeGreaterThan(150);
      expect(
        Math.abs(h(1).L[1] - 46),
        `${id}: at shoulder height`
      ).toBeLessThan(8);
    }
    // Cross-body hammer curl: the elbow pinned (within 5 of rest), the bell
    // crossing the midline up at the chest, the other arm hanging.
    {
      const id = "cross-body-hammer-curl";
      for (const t of [0, 0.5, 1]) {
        const E = antAt(id, t).EL;
        expect(
          Math.hypot(E[0] - AS.elbowL[0], E[1] - AS.elbowL[1]),
          `cross-body: elbow pinned @${t}`
        ).toBeLessThan(5);
      }
      const H = antAt(id, 1).HL;
      expect(H[0], "cross-body: across the midline").toBeGreaterThan(52);
      expect(H[1], "cross-body: up at the chest").toBeLessThan(62);
      expect(at(id, 1).foreArmR, "cross-body: other arm hangs").toBeUndefined();
    }
    // Woodchopper: both hands on the handle every frame; high on one side
    // to low on the other; the cable from a high pulley.
    {
      const id = "cable-woodchopper";
      for (const t of [0, 0.5, 1]) {
        const a = antAt(id, t);
        expect(
          Math.hypot(a.HR[0] - a.HL[0], a.HR[1] - a.HL[1]),
          `woodchop: both hands on the handle @${t}`
        ).toBeLessThan(0.5);
      }
      const a0 = antAt(id, 0);
      const a1 = antAt(id, 1);
      expect(a0.HL[0], "woodchop: starts on one side").toBeLessThan(32);
      expect(a0.HL[1], "woodchop: starts high").toBeLessThan(20);
      expect(a1.HL[0], "woodchop: ends on the other side").toBeGreaterThan(66);
      expect(a1.HL[1], "woodchop: ends low").toBeGreaterThan(84);
      expect(
        BODY_DEMOS[id].pivots![0][1],
        "woodchop: high pulley"
      ).toBeLessThan(0);
    }
    // Dead bug: both arms up at the viewer and both knees bent at the
    // start; one arm overhead and the OPPOSITE leg straight at the end,
    // the other two unchanged.
    {
      const id = "dead-bug";
      const a0 = antAt(id, 0);
      const k0 = antKnees(id, 0);
      expect(
        Math.hypot(a0.HL[0] - AS.shoulderL[0], a0.HL[1] - AS.shoulderL[1]),
        "dead bug: arms up at the viewer"
      ).toBeLessThan(14);
      expect(k0.KL[1], "dead bug: knees bent").toBeLessThan(120);
      expect(k0.KR[1], "dead bug: knees bent").toBeLessThan(120);
      const a1 = antAt(id, 1);
      const k1 = antKnees(id, 1);
      expect(a1.HL[1], "dead bug: one arm overhead").toBeLessThan(0);
      expect(k1.KR[1], "dead bug: opposite leg straight").toBeGreaterThan(145);
      expect(
        k1.AR[1],
        "dead bug: opposite leg along the floor"
      ).toBeGreaterThan(190);
      expect(k1.KL[1], "dead bug: the other knee stays bent").toBeLessThan(120);
      expect(
        Math.hypot(a1.HR[0] - a0.HR[0], a1.HR[1] - a0.HR[1]),
        "dead bug: the other arm stays up"
      ).toBeLessThan(0.01);
    }
    // Bicycle crunch: the pedal swaps the tucked knee.
    {
      const id = "bicycle-crunch";
      const k0 = antKnees(id, 0);
      const k1 = antKnees(id, 1);
      expect(k0.KL[1], "bicycle: left knee tucked at the start").toBeLessThan(
        120
      );
      expect(k0.KR[1], "bicycle: right leg long at the start").toBeGreaterThan(
        145
      );
      expect(k1.KR[1], "bicycle: right knee tucked at the end").toBeLessThan(
        120
      );
      expect(k1.KL[1], "bicycle: left leg long at the end").toBeGreaterThan(
        145
      );
    }
    // Russian twist: clasped hands (together every frame) tapping just
    // outside one hip, then the other.
    {
      const id = "russian-twist";
      for (const t of [0, 0.5, 1]) {
        const a = antAt(id, t);
        expect(
          Math.hypot(a.HR[0] - a.HL[0], a.HR[1] - a.HL[1]),
          `twist: hands clasped @${t}`
        ).toBeLessThan(0.5);
      }
      expect(antAt(id, 0).HL[0], "twist: outside one hip").toBeLessThan(26);
      expect(antAt(id, 1).HL[0], "twist: outside the other").toBeGreaterThan(
        74
      );
      expect(antAt(id, 1).HL[1], "twist: at hip height").toBeGreaterThan(86);
    }

    /* Batch 13: the profile's last rows, and a side plank on the front figure. */
    // Mountain climbers: hands and the far foot planted; the near knee
    // driven to the chest with the foot never through the floor; the
    // hips ripple, never pike (≤ 8).
    {
      const id = "mountain-climbers";
      stationary(id, SIDE_ANCHORS.hand, "handL", "climber: hands planted");
      stationary(id, SIDE_ANCHORS.ankle, "shankR", "climber: far foot planted");
      const hip0 = pt(SIDE_ANCHORS.hip, at(id, 0).pelvis);
      for (const t of [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]) {
        const p = at(id, t);
        expect(
          pt(SIDE_ANCHORS.ankle, p.shankL)[1],
          `climber: foot above the floor @${t}`
        ).toBeLessThan(204);
        expect(
          hip0[1] - pt(SIDE_ANCHORS.hip, p.pelvis)[1],
          `climber: no pike @${t}`
        ).toBeLessThan(10);
      }
      const p1 = at(id, 1);
      const K = pt(SIDE_ANCHORS.knee, p1.shankL);
      const S = pt(SIDE_ANCHORS.shoulder, p1.torso);
      expect(
        Math.hypot(K[0] - S[0], K[1] - S[1]),
        "climber: knee to the chest"
      ).toBeLessThan(16);
    }
    // Battle ropes: the quarter squat held; the near hand rises as the far
    // hand falls; the anchor ahead on the floor.
    {
      const id = "battle-ropes";
      stationary(id, SIDE_ANCHORS.hip, "pelvis", "ropes: squat held");
      const n0 = pt(SIDE_ANCHORS.hand, at(id, 0).handL);
      const n1 = pt(SIDE_ANCHORS.hand, at(id, 1).handL);
      const f0 = pt(SIDE_ANCHORS.hand, at(id, 0).handR);
      const f1 = pt(SIDE_ANCHORS.hand, at(id, 1).handR);
      expect(n0[1] - n1[1], "ropes: near arm rises").toBeGreaterThan(50);
      expect(f1[1] - f0[1], "ropes: far arm falls").toBeGreaterThan(50);
      expect(kneeDeg(id, 0), "ropes: quarter squat").toBeLessThan(
        REST_KNEE - 15
      );
    }
    // Side plank (front figure on its side): the supporting elbow on the
    // floor under the shoulder every frame, forearm flat; the feet on the
    // floor; the hips lift into the line.
    {
      const id = "side-plank";
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const E = pt([80, 71], p.foreArmR);
        const H = pt([96.1, 101.2], p.foreArmR);
        const S = pt([76, 48], p.upperArmR);
        expect(
          Math.abs(E[1] - (204 - 8)),
          `side plank: elbow on the floor @${t}`
        ).toBeLessThan(4);
        expect(
          Math.abs(H[1] - E[1]),
          `side plank: forearm flat @${t}`
        ).toBeLessThan(0.5);
        expect(
          Math.abs(E[0] - S[0]),
          `side plank: elbow under the shoulder @${t}`
        ).toBeLessThan(4);
        expect(
          pt([65, 196], p.shankR)[1],
          `side plank: feet on the floor @${t}`
        ).toBeGreaterThan(190);
      }
      const k0 = pt([68, 148], at(id, 0).shankR);
      const k1 = pt([68, 148], at(id, 1).shankR);
      expect(k0[1] - k1[1], "side plank: hips lift").toBeGreaterThan(3);
    }
    // Rowing machine: feet on the plate; shins vertical at the catch with
    // the arms straight; legs first (nearly straight by the half); lean
    // back and the handle at the ribs with the elbow behind at the finish.
    {
      const id = "rowing-machine";
      stationary(id, SIDE_ANCHORS.ankle, "shankL", "rower: feet on the plate");
      const p0 = at(id, 0);
      const K0 = pt(SIDE_ANCHORS.knee, p0.shankL);
      const A0 = pt(SIDE_ANCHORS.ankle, p0.shankL);
      expect(
        Math.abs(K0[0] - A0[0]),
        "rower: shins vertical at the catch"
      ).toBeLessThan(8);
      expect(
        elbowDeg(id, 0),
        "rower: arms straight at the catch"
      ).toBeGreaterThan(165);
      // Legs first: by the half the knee has opened to within 4° of its
      // finish angle (a soft knee, never locked), before the arms pull.
      // (The last 4° open with the lean, which overlaps the drive.)
      expect(kneeDeg(id, 0.5), "rower: legs drive first").toBeGreaterThan(
        kneeDeg(id, 1) - 4
      );
      expect(kneeDeg(id, 0.5), "rower: legs drive first").toBeGreaterThan(140);
      const hip0 = pt(SIDE_ANCHORS.hip, p0.pelvis);
      const hip1 = pt(SIDE_ANCHORS.hip, at(id, 1).pelvis);
      expect(hip0[0] - hip1[0], "rower: the seat slides").toBeGreaterThan(36);
      const p1 = at(id, 1);
      const S1 = pt(SIDE_ANCHORS.shoulder, p1.torso);
      const E1 = pt(SIDE_ANCHORS.elbow, p1.foreArmL);
      const H1 = pt(SIDE_ANCHORS.hand, p1.handL);
      expect(S1[0], "rower: lean back at the finish").toBeLessThan(hip1[0] - 4);
      expect(E1[0], "rower: elbow behind").toBeLessThan(S1[0]);
      expect(
        Math.hypot(H1[0] - (S1[0] + 8), H1[1] - (S1[1] + 26)),
        "rower: handle at the ribs"
      ).toBeLessThan(2);
    }
    // Ski erg: handles overhead at the start; hinged 40-60 with the hands
    // past the thighs at the finish; the pulley at the top of the machine.
    {
      const id = "ski-erg";
      expect(
        pt(SIDE_ANCHORS.hand, at(id, 0).handL)[1],
        "ski: handles overhead"
      ).toBeLessThan(0);
      expect(trunkLean(id, 0), "ski: upright at the start").toBeLessThan(10);
      expect(trunkLean(id, 1), "ski: hinged at the finish").toBeGreaterThan(40);
      expect(trunkLean(id, 1), "ski: hinged at the finish").toBeLessThan(60);
      const p1 = at(id, 1);
      const H = pt(SIDE_ANCHORS.hand, p1.handL);
      const hip = pt(SIDE_ANCHORS.hip, p1.pelvis);
      expect(H[1], "ski: hands down past the thighs").toBeGreaterThan(hip[1]);
      expect(H[0], "ski: hands behind the hip").toBeLessThan(hip[0]);
      expect(BODY_DEMOS[id].pulley![1], "ski: pulley at the top").toBeLessThan(
        -20
      );
    }
    // Jump rope: a small hop (6-10) with the elbows at the ribs and the
    // hands at the hips every frame; feet on the floor at the start.
    {
      const id = "jump-rope";
      const a0 = pt(SIDE_ANCHORS.ankle, at(id, 0).shankL);
      const a1 = pt(SIDE_ANCHORS.ankle, at(id, 1).shankL);
      expect(a0[1] - a1[1], "rope: a small hop").toBeGreaterThan(6);
      expect(a0[1] - a1[1], "rope: an inch or two, not a jump").toBeLessThan(
        10
      );
      expect(
        Math.abs(a0[1] - SIDE_ANCHORS.ankle[1]),
        "rope: feet on the floor at the start"
      ).toBeLessThan(0.01);
      for (const t of [0, 1]) {
        const p = at(id, t);
        const E = pt(SIDE_ANCHORS.elbow, p.foreArmL);
        const S = pt(SIDE_ANCHORS.shoulder, p.torso);
        const H = pt(SIDE_ANCHORS.hand, p.handL);
        const hip = pt(SIDE_ANCHORS.hip, p.pelvis);
        expect(
          Math.abs(E[0] - S[0]),
          `rope: elbows at the ribs @${t}`
        ).toBeLessThan(3);
        expect(
          Math.abs(H[1] - hip[1]),
          `rope: hands at the hips @${t}`
        ).toBeLessThan(6);
      }
    }
    // Pallof press: hands together at the chest, pressed straight out at
    // chest height to full extension; the trunk never turns.
    {
      const id = "pallof-press";
      const p0 = at(id, 0);
      const S = pt(SIDE_ANCHORS.shoulder, p0.torso);
      const H0 = pt(SIDE_ANCHORS.hand, p0.handL);
      expect(
        Math.hypot(H0[0] - S[0], H0[1] - S[1]),
        "pallof: at the chest"
      ).toBeLessThan(20);
      const H1 = pt(SIDE_ANCHORS.hand, at(id, 1).handL);
      expect(
        Math.abs(H1[1] - H0[1]),
        "pallof: straight out at chest height"
      ).toBeLessThan(0.5);
      expect(elbowDeg(id, 1), "pallof: full extension").toBeGreaterThan(165);
      expect(at(id, 1).torso, "pallof: trunk resists the turn").toBeUndefined();
    }

    /* Batch 14: the burpee. */
    // Hands on the floor from the drop through the feet-forward; a plank
    // at 0.3 and 0.7 (body straight, feet back); chest to the floor at
    // 0.5 (shoulder well below the plank's); feet off the floor with the
    // arms overhead at the jump; nothing through the floor.
    {
      const id = "burpees";
      const H0 = pt(SIDE_ANCHORS.hand, at(id, 0).handL);
      for (const t of [0.15, 0.3, 0.5, 0.7, 0.85]) {
        const H = pt(SIDE_ANCHORS.hand, at(id, t).handL);
        expect(
          Math.hypot(H[0] - H0[0], H[1] - H0[1]),
          `burpee: hands on the floor @${t}`
        ).toBeLessThan(0.01);
      }
      for (const t of [0.3, 0.7]) {
        const p = at(id, t);
        const S = pt(SIDE_ANCHORS.shoulder, p.torso);
        const A = pt(SIDE_ANCHORS.ankle, p.shankL);
        expect(
          S[0] - A[0],
          `burpee: feet kicked back into a plank @${t}`
        ).toBeGreaterThan(130);
        expect(
          kneeDeg(id, t),
          `burpee: plank legs straight @${t}`
        ).toBeGreaterThan(REST_KNEE - 3);
      }
      const sPlank = pt(SIDE_ANCHORS.shoulder, at(id, 0.3).torso);
      const sLow = pt(SIDE_ANCHORS.shoulder, at(id, 0.5).torso);
      expect(sLow[1] - sPlank[1], "burpee: chest to the floor").toBeGreaterThan(
        14
      );
      for (const t of [
        0, 0.1, 0.15, 0.2, 0.25, 0.5, 0.75, 0.8, 0.85, 0.9, 0.95, 1,
      ]) {
        const p = at(id, t);
        for (const [anchor, group, label] of [
          [SIDE_ANCHORS.knee, "shankL", "knee"],
          [SIDE_ANCHORS.ankle, "shankL", "ankle"],
          [SIDE_ANCHORS.hip, "pelvis", "hip"],
        ] as const) {
          expect(
            pt(anchor, (p as Record<string, unknown>)[group])[1],
            `burpee: ${label} above the floor @${t}`
          ).toBeLessThan(204);
        }
      }
      const p1 = at(id, 1);
      expect(
        pt(SIDE_ANCHORS.ankle, p1.shankL)[1],
        "burpee: feet off the floor at the jump"
      ).toBeLessThan(SIDE_ANCHORS.ankle[1] - 6);
      expect(
        pt(SIDE_ANCHORS.hand, p1.handL)[1],
        "burpee: arms overhead at the jump"
      ).toBeLessThan(0);
    }

    /* Batch 15: cycles. */
    // Every cycle closes: the pose at t=1 is the pose at t=0, at every
    // joint that moves. This is what lets the player wrap instead of
    // reversing.
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      if (!d.cycle) continue;
      const p0 = at(id, 0);
      const p1 = at(id, 1);
      for (const [g, anchor] of [
        ["torso", SIDE_ANCHORS.shoulder],
        ["pelvis", SIDE_ANCHORS.hip],
        ["shankL", SIDE_ANCHORS.ankle],
        ["shankR", SIDE_ANCHORS.ankle],
        ["handL", SIDE_ANCHORS.hand],
        ["handR", SIDE_ANCHORS.hand],
      ] as const) {
        const a = pt(anchor, (p0 as Record<string, unknown>)[g]);
        const b = pt(anchor, (p1 as Record<string, unknown>)[g]);
        expect(
          Math.hypot(a[0] - b[0], a[1] - b[1]),
          `${id}: cycle closes at ${g}`
        ).toBeLessThan(0.01);
      }
    }
    const feet = (id: string, t: number) => {
      const p = at(id, t);
      return {
        L: pt(SIDE_ANCHORS.ankle, p.shankL),
        R: pt(SIDE_ANCHORS.ankle, p.shankR),
      };
    };
    // A stride alternates: the near foot leads at 0, trails at ½, both
    // on the belt at those instants; mid-swing the trailing foot lifts.
    for (const id of ["treadmill", "farmers-carry", "sled-push-pull"]) {
      const f0 = feet(id, 0);
      const f5 = feet(id, 0.5);
      expect(f0.L[0] - f0.R[0], `${id}: near foot leads at 0`).toBeGreaterThan(
        30
      );
      expect(f5.R[0] - f5.L[0], `${id}: near foot trails at ½`).toBeGreaterThan(
        30
      );
      for (const f of [f0, f5]) {
        expect(Math.abs(f.L[1] - 193), `${id}: feet on the belt`).toBeLessThan(
          0.1
        );
        expect(Math.abs(f.R[1] - 193), `${id}: feet on the belt`).toBeLessThan(
          0.1
        );
      }
      expect(
        193 - feet(id, 0.75).L[1],
        `${id}: swing foot lifts`
      ).toBeGreaterThan(6);
    }
    // Treadmill: "don't hold the handrails"; upright posture.
    for (const t of [0, 0.25, 0.5, 0.75]) {
      const p = at("treadmill", t);
      expect(
        pt(SIDE_ANCHORS.hand, p.handL)[0],
        `treadmill: hands off the rails @${t}`
      ).toBeLessThan(100);
      expect(
        Math.abs(trunkLean("treadmill", t)),
        `treadmill: upright @${t}`
      ).toBeLessThan(1);
    }
    // Incline walk: the belt tilts (stance feet on a 5-9° uphill line)
    // and the body leans slightly FORWARD of upright — not back with it.
    {
      const id = "incline-treadmill-walk";
      const f0 = feet(id, 0);
      const grade =
        (Math.atan2(f0.R[1] - f0.L[1], f0.L[0] - f0.R[0]) * 180) / Math.PI;
      expect(grade, "incline: belt tilted uphill ahead").toBeGreaterThan(5);
      expect(grade, "incline: belt tilted uphill ahead").toBeLessThan(9);
      expect(trunkLean(id, 0), "incline: slight forward lean").toBeGreaterThan(
        3
      );
      expect(trunkLean(id, 0), "incline: slight forward lean").toBeLessThan(8);
    }
    // Farmer's carry: straight arms hanging plumb; trunk upright.
    for (const t of [0, 0.25, 0.5, 0.75]) {
      const id = "farmers-carry";
      expect(elbowDeg(id, t), `carry: straight arms @${t}`).toBeGreaterThan(
        170
      );
      const p = at(id, t);
      const S = pt(SIDE_ANCHORS.shoulder, p.torso);
      const H = pt(SIDE_ANCHORS.hand, p.handL);
      expect(
        Math.abs(H[0] - S[0]),
        `carry: bells hang plumb @${t}`
      ).toBeLessThan(4);
      expect(
        Math.abs(trunkLean(id, t)),
        `carry: stand tall @${t}`
      ).toBeLessThan(1);
    }
    // Sled push: "lean in" (34-46°), hands fixed on the handles.
    {
      const id = "sled-push-pull";
      stationary(id, SIDE_ANCHORS.hand, "handL", "sled: hands on the handles");
      for (const t of [0, 0.5]) {
        expect(trunkLean(id, t), `sled: lean in @${t}`).toBeGreaterThan(34);
        expect(trunkLean(id, t), `sled: lean in @${t}`).toBeLessThan(46);
      }
    }
    // Stairmaster: upright, hands resting on the rail, the stance foot
    // riding its step DOWN and the swing foot lifting over.
    {
      const id = "stairmaster";
      stationary(id, SIDE_ANCHORS.hand, "handL", "stairs: hands on the rail");
      expect(Math.abs(trunkLean(id, 0)), "stairs: stand tall").toBeLessThan(1);
      const a0 = feet(id, 0).L;
      const a5 = feet(id, 0.5).L;
      expect(
        a5[1] - a0[1],
        "stairs: the stance foot rides down a step"
      ).toBeGreaterThan(10);
      expect(
        a5[1] - feet(id, 0.75).L[1],
        "stairs: the swing foot lifts over"
      ).toBeGreaterThan(12);
    }
    // Box jump: on the floor standing at 0; arms back at the dip; both
    // feet off the floor in flight; both on the box at the landing and
    // standing tall; one foot down at the step-down.
    {
      const id = "box-jumps";
      const f0 = feet(id, 0);
      expect(
        Math.abs(f0.L[1] - 193) + Math.abs(f0.R[1] - 193),
        "box: on the floor at 0"
      ).toBeLessThan(0.1);
      const pDip = at(id, 0.18);
      expect(
        pt(SIDE_ANCHORS.hand, pDip.handL)[0],
        "box: arms swung back"
      ).toBeLessThan(pt(SIDE_ANCHORS.hip, pDip.pelvis)[0] - 10);
      const fFly = feet(id, 0.34);
      expect(fFly.L[1], "box: in flight").toBeLessThan(160);
      expect(fFly.R[1], "box: in flight").toBeLessThan(160);
      for (const t of [0.5, 0.64]) {
        const f = feet(id, t);
        expect(
          Math.abs(f.L[1] - 147) + Math.abs(f.R[1] - 147),
          `box: both feet on the box @${t}`
        ).toBeLessThan(0.1);
      }
      const pTop = at(id, 0.64);
      expect(
        pt(SIDE_ANCHORS.ankle, pTop.shankL)[1] -
          pt(SIDE_ANCHORS.hip, pTop.pelvis)[1],
        "box: standing tall on it"
      ).toBeGreaterThan(94);
      const fStep = feet(id, 0.82);
      expect(
        Math.abs(fStep.L[1] - 193),
        "box: one foot stepped down"
      ).toBeLessThan(0.1);
      expect(
        Math.abs(fStep.R[1] - 147),
        "box: the other still on the box"
      ).toBeLessThan(0.1);
    }

    /* Batch 16: pedals, the pool, the Zottman. */
    const CRANK_T: [number, number] = [66, 178];
    // Bikes: seated on a fixed saddle, hands on the bars, each foot on a
    // pedal circle about the crank every frame; "a slight bend at the
    // bottom of the pedal" — never a locked knee there.
    for (const id of ["bike", "spin-bike", "assault-bike"]) {
      stationary(id, SIDE_ANCHORS.hip, "pelvis", `${id}: on the saddle`);
      for (const t of [0, 0.2, 0.45, 0.7, 0.9]) {
        const a = pt(SIDE_ANCHORS.ankle, at(id, t).shankL);
        expect(
          Math.abs(Math.hypot(a[0] - CRANK_T[0], a[1] - CRANK_T[1]) - 15),
          `${id}: foot on the pedal circle @${t}`
        ).toBeLessThan(0.1);
      }
      const bottom = kneeDeg(id, 0.25);
      expect(bottom, `${id}: slight bend at the bottom`).toBeGreaterThan(130);
      expect(bottom, `${id}: never locked at the bottom`).toBeLessThan(
        REST_KNEE - 4
      );
    }
    for (const id of ["bike", "spin-bike"]) {
      stationary(id, SIDE_ANCHORS.hand, "handL", `${id}: hands on the bars`);
    }
    expect(
      trunkLean("spin-bike", 0),
      "spin: a deeper lean than the upright bike"
    ).toBeGreaterThan(trunkLean("bike", 0) + 8);
    // Assault bike: the hands ride the moving handle — forward when the
    // near foot is at the front of the stroke, back half a turn later.
    {
      const id = "assault-bike";
      const h0 = pt(SIDE_ANCHORS.hand, at(id, 0).handL);
      const h5 = pt(SIDE_ANCHORS.hand, at(id, 0.5).handL);
      expect(
        h0[0] - h5[0],
        "assault: handle travels with the stroke"
      ).toBeGreaterThan(24);
    }
    // Elliptical: standing tall, feet riding the flat ellipse, hands on
    // the swinging levers.
    {
      const id = "elliptical";
      expect(Math.abs(trunkLean(id, 0)), "elliptical: stand tall").toBeLessThan(
        8
      );
      for (const t of [0, 0.25, 0.5, 0.75]) {
        const a = pt(SIDE_ANCHORS.ankle, at(id, t).shankL);
        const u = ((a[0] - 60) / 20) ** 2 + ((a[1] - 180) / 6) ** 2;
        expect(
          Math.abs(u - 1),
          `elliptical: foot on the stride ellipse @${t}`
        ).toBeLessThan(0.02);
      }
      const h0 = pt(SIDE_ANCHORS.hand, at(id, 0).handL);
      const h5 = pt(SIDE_ANCHORS.hand, at(id, 0.5).handL);
      expect(
        Math.abs(h0[0] - h5[0]),
        "elliptical: handles swing"
      ).toBeGreaterThan(20);
    }
    // Swimming: hips at the surface, body streamlined (horizontal); the
    // near arm recovers ABOVE the water at ¼ and pulls BELOW it at ¾.
    {
      const id = "swimming";
      const WATER = 118;
      const p0 = at(id, 0);
      const hip = pt(SIDE_ANCHORS.hip, p0.pelvis);
      const S = pt(SIDE_ANCHORS.shoulder, p0.torso);
      expect(
        Math.abs(hip[1] - WATER),
        "swim: hips at the surface"
      ).toBeLessThan(10);
      expect(
        Math.abs(lineDeg(hip, S)),
        "swim: streamlined, horizontal"
      ).toBeLessThan(6);
      expect(
        pt(SIDE_ANCHORS.hand, at(id, 0.25).handL)[1],
        "swim: recovery over the water"
      ).toBeLessThan(WATER - 20);
      expect(
        pt(SIDE_ANCHORS.hand, at(id, 0.75).handL)[1],
        "swim: the pull under it"
      ).toBeGreaterThan(WATER + 30);
    }
    // Zottman: the strict curl's pinned elbows, both movers lit.
    {
      const id = "zottman-curl";
      const E0 = pt(SIDE_ANCHORS.elbow, at(id, 0).foreArmL);
      const E1 = pt(SIDE_ANCHORS.elbow, at(id, 1).foreArmL);
      expect(
        Math.hypot(E1[0] - E0[0], E1[1] - E0[1]),
        "zottman: elbows pinned"
      ).toBeLessThan(3.2);
      expect(
        BODY_DEMOS[id].tint.forearm,
        "zottman: the pronated lower works the forearm"
      ).toBe("primary");
    }

    /* Batch 17: the man-maker and the get-up. */
    // Man-maker: plank → push-up → row each bell to the ribs (the other
    // hand holding the plank) → feet forward → clean to the shoulders →
    // press overhead → back to the plank.
    {
      const id = "man-maker";
      const H = (t: number) => {
        const p = at(id, t);
        return {
          L: pt(SIDE_ANCHORS.hand, p.handL),
          R: pt(SIDE_ANCHORS.hand, p.handR),
          S: pt(SIDE_ANCHORS.shoulder, p.torso),
          hip: pt(SIDE_ANCHORS.hip, p.pelvis),
        };
      };
      for (const t of [0, 0.2, 0.54]) {
        expect(
          Math.abs(H(t).L[1] - 198) + Math.abs(H(t).R[1] - 198),
          `man-maker: bells on the floor @${t}`
        ).toBeLessThan(0.1);
      }
      expect(
        H(0.1).S[1] - H(0).S[1],
        "man-maker: the push-up drops the shoulder"
      ).toBeGreaterThan(10);
      expect(
        H(0.3).R[1] - H(0.3).L[1],
        "man-maker: near bell rowed to the ribs"
      ).toBeGreaterThan(25);
      expect(
        Math.abs(H(0.3).R[1] - 198),
        "man-maker: far hand holds the plank"
      ).toBeLessThan(0.1);
      expect(
        H(0.46).L[1] - H(0.46).R[1],
        "man-maker: far bell rowed"
      ).toBeGreaterThan(25);
      const rack = H(0.72);
      expect(
        Math.hypot(
          rack.hip[0] - SIDE_ANCHORS.hip[0],
          rack.hip[1] - SIDE_ANCHORS.hip[1]
        ),
        "man-maker: standing at the clean"
      ).toBeLessThan(0.1);
      expect(
        Math.hypot(rack.L[0] - 57, rack.L[1] - 40),
        "man-maker: bells at the shoulders"
      ).toBeLessThan(4);
      expect(H(0.82).L[1], "man-maker: pressed overhead").toBeLessThan(-20);
    }
    // Turkish get-up: the bell plumb above the shoulder at every key; the
    // trunk rising through elbow, hand, bridge and half-kneel in order;
    // the far hand posted on the floor through the bridge; the far knee
    // on the floor in the kneel; standing at the top.
    {
      const id = "turkish-get-up";
      const K = (t: number) => {
        const p = at(id, t);
        return {
          L: pt(SIDE_ANCHORS.hand, p.handL),
          R: pt(SIDE_ANCHORS.hand, p.handR),
          S: pt(SIDE_ANCHORS.shoulder, p.torso),
          hip: pt(SIDE_ANCHORS.hip, p.pelvis),
          KR: pt(SIDE_ANCHORS.knee, p.shankR),
        };
      };
      for (const t of [0, 0.2, 0.4, 0.55, 0.7, 0.84, 1]) {
        const f = K(t);
        expect(
          Math.abs(f.L[0] - f.S[0]),
          `get-up: bell plumb over the shoulder @${t}`
        ).toBeLessThan(0.5);
        expect(f.S[1] - f.L[1], `get-up: arm locked @${t}`).toBeGreaterThan(64);
      }
      const trunkUp = (t: number) =>
        (Math.atan2(K(t).hip[1] - K(t).S[1], K(t).hip[0] - K(t).S[0]) * 180) /
        Math.PI;
      expect(Math.abs(trunkUp(0)), "get-up: lying flat").toBeLessThan(2);
      expect(trunkUp(0.2), "get-up: to the elbow").toBeGreaterThan(25);
      expect(trunkUp(0.2), "get-up: to the elbow").toBeLessThan(35);
      expect(trunkUp(0.4), "get-up: to the hand").toBeGreaterThan(55);
      expect(trunkUp(0.4), "get-up: to the hand").toBeLessThan(65);
      for (const t of [0.2, 0.4, 0.55])
        expect(K(t).R[1], `get-up: far hand posted @${t}`).toBeGreaterThan(196);
      expect(
        K(0.4).hip[1] - K(0.55).hip[1],
        "get-up: the bridge lifts the hips"
      ).toBeGreaterThan(12);
      for (const t of [0.7, 0.84])
        expect(
          K(t).KR[1],
          `get-up: far knee on the floor @${t}`
        ).toBeGreaterThan(190);
      expect(
        Math.hypot(
          K(1).hip[0] - SIDE_ANCHORS.hip[0],
          K(1).hip[1] - SIDE_ANCHORS.hip[1]
        ),
        "get-up: standing"
      ).toBeLessThan(0.1);
    }

    /* Batch 18: the ankle. */
    // Seated calf raise: hips on the seat; the ball of the foot fixed on
    // the platform; heels below the platform at the stretch, high at the
    // top; the knee (and its pad) rising with the heel; and the joint
    // itself — the foot's ankle and the shin's ankle never part.
    {
      const id = "seated-calf-raise";
      const PLATFORM_Y = 196;
      stationary(
        id,
        SIDE_ANCHORS.hip,
        "pelvis",
        "seated calf: hips on the seat"
      );
      stationary(
        id,
        SIDE_ANCHORS.ball,
        "footL",
        "seated calf: ball on the platform"
      );
      for (const t of [0, 0.5, 1]) {
        const p = at(id, t);
        const aShank = pt(SIDE_ANCHORS.ankle, p.shankL);
        const aFoot = pt(SIDE_ANCHORS.ankle, p.footL);
        expect(
          Math.hypot(aShank[0] - aFoot[0], aShank[1] - aFoot[1]),
          `seated calf: the ankle joint holds @${t}`
        ).toBeLessThan(0.01);
      }
      const heel = (t: number) => pt([39.4, 199.8], at(id, t).footL);
      expect(
        heel(0)[1],
        "seated calf: heels dropped below the platform"
      ).toBeGreaterThan(PLATFORM_Y + 2);
      expect(heel(1)[1], "seated calf: heels raised high").toBeLessThan(
        PLATFORM_Y - 8
      );
      const knee = (t: number) => pt(SIDE_ANCHORS.knee, at(id, t).shankL);
      expect(
        knee(0)[1] - knee(1)[1],
        "seated calf: the knee rises with the heel"
      ).toBeGreaterThan(4);
    }
    // Every other side demo's feet still ride their shins: with no foot
    // ops the foot's ankle IS the shin's ankle. (The renderer's fallback,
    // pinned through the one demo that has both.)
    for (const id of ["squat", "calf-raise", "lunges"]) {
      const p = at(id, 0.5);
      expect(p.footL, `${id}: no foot ops of its own`).toBeUndefined();
    }
  });

  it("the foot has a heel, an arch and a toe — not a wedge", () => {
    // It was nine points: a flat sole straight from heel to toe, no heel
    // curve, no arch. Under a leg that now has a condyle at the knee it
    // read as a doorstop. The arch is the part a wedge cannot fake, so
    // that is what this measures.
    // The foot is its own piece since the ankle joint (batch 18).
    const footPiece = SIDE_PIECES.find((p) => p.group === "footL")!;
    const foot = footPiece.facets.find((f) => f.muscle === "foot")!.points as [
      number,
      number,
    ][];
    const ground = Math.max(...foot.map(([, y]) => y));
    // Points ON the ground, front and back of the sole.
    const contacts = foot.filter(([, y]) => y > ground - 0.35);
    const heelX = Math.min(...contacts.map(([x]) => x));
    const ballX = Math.max(...contacts.map(([x]) => x));
    expect(ballX - heelX, "sole length").toBeGreaterThan(12);
    // Between them the sole LIFTS — that is the arch.
    const between = foot.filter(
      ([x, y]) => x > heelX + 2 && x < ballX - 2 && y > ground - 4
    );
    expect(between.length, "sole samples between the contacts").toBeGreaterThan(
      1
    );
    const lift = ground - Math.min(...between.map(([, y]) => y));
    expect(lift, "arch lift").toBeGreaterThan(0.3);
    // ...but shallowly. A single raised point made a hard V notch.
    expect(lift, "arch lift").toBeLessThan(3);
    // And the toe tapers: the foot's forward tip is well above the sole.
    const tipX = Math.max(...foot.map(([x]) => x));
    const tip = foot.find(([x]) => x === tipX)!;
    expect(ground - tip[1], "toe rise").toBeGreaterThan(0.4);
  });

  it("the knee is a condyle: nothing at the joint projects past ~5 units", () => {
    // A squat swings the thigh 78 degrees about the knee pivot. Anything
    // on either piece that sits far from that pivot comes out from under
    // its neighbour as a spike — which is what "the knee looks a little
    // pointy and misaligned with the calf" was. Both pieces now arc into
    // a short chord at the pivot's row, so the joint is a circle and a
    // rotation reveals a curve rather than a corner.
    const piece = (g: string) => SIDE_PIECES.find((p) => p.group === g)!;
    const knee = SIDE_ANCHORS.knee;
    const near = (pts: readonly [number, number][], lo: number, hi: number) =>
      pts.filter(([, y]) => y >= lo && y <= hi);
    // Rendered rows: the pivot is at y 145; look at the joint's own band.
    const thighBottom = near(
      piece("thighL").outline as [number, number][],
      143,
      152
    );
    const shankTop = near(
      piece("shankL").outline as [number, number][],
      138,
      147
    );
    expect(thighBottom.length, "thigh points at the joint").toBeGreaterThan(2);
    expect(shankTop.length, "shank points at the joint").toBeGreaterThan(2);
    for (const [label, pts] of [
      ["thigh", thighBottom],
      ["shank", shankTop],
    ] as const) {
      const worst = Math.max(
        ...pts.map(([x, y]) => Math.hypot(x - knee[0], y - knee[1]))
      );
      expect(worst, `${label} reach from the knee pivot`).toBeLessThan(5.4);
    }
  });

  it("the squat's bar sleeve does not cross the face", () => {
    // The profile barbell drew its collar and sleeve tip at a fixed
    // +0.7r, which is right wherever the bar hangs in FRONT of the body
    // and wrong on a back squat, where the bar sits behind the neck and
    // the stub crossed the jaw and poked out past the face.
    for (const t of [0, 0.5, 1]) {
      const svg = renderBodyDemo("squat", t);
      const plate = svg.match(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="11"/);
      expect(plate, `plate @${t}`).not.toBeNull();
      const cx = Number(plate![1]);
      const rects = [
        ...svg.matchAll(/<rect x="(-?[\d.]+)"[^>]*width="([\d.]+)"/g),
      ].map((m) => Number(m[1]) + Number(m[2]));
      expect(rects.length, `gear rects @${t}`).toBeGreaterThan(1);
      // Every piece of bar hardware stays BEHIND the plate's centre.
      expect(Math.max(...rects), `rightmost gear @${t}`).toBeLessThanOrEqual(
        cx
      );
    }
  });

  it("the head is 7.5 to 8.5 figure-heights, not nine", () => {
    // A head that is too small reads as wrong without a viewer being
    // able to say why, and it makes the neck look long because the neck
    // absorbs the difference. This one was authored at 23 units crown to
    // chin on a 210-unit figure — 9.1 heads, where an adult is 7.5 to 8
    // and anthropometry puts the chin at 0.87 of stature.
    const head = SIDE_PIECES.find((p) => p.group === "head")!;
    const skull = head.facets.find((f) => f.muscle === "head")!.points;
    const ys = skull.map(([, y]) => y);
    const height = Math.max(...ys) - Math.min(...ys);
    // The facet is inset from the outline, so it reads a touch short of
    // the true crown-to-chin; the band allows for that.
    const heads = 210 / height;
    expect(heads, "figure heights").toBeGreaterThan(7.2);
    expect(heads, "figure heights").toBeLessThan(8.6);
  });

  it("the throat sits BEHIND the chin", () => {
    // It sat three units in front — a throat projecting past the jaw,
    // which is backwards and cut a hard V under the jawline.
    const head = SIDE_PIECES.find((p) => p.group === "head")!;
    const skull = head.facets.find((f) => f.muscle === "head")!.points;
    const neck = head.facets.find((f) => f.muscle === "neck")!.points;
    // The chin is the lowest point of the skull facet.
    const chin = skull.reduce((a, b) => (b[1] > a[1] ? b : a));
    const throat = Math.max(...neck.map(([x]) => x));
    expect(throat, "throat x vs chin").toBeLessThan(chin[0]);
  });

  it("a piece that paints over another does not end on a level cut", () => {
    // The torso paints over the pelvis and the thigh over the shank, so
    // wherever the upper piece's outline ends, its 0.45 facet inset shows
    // as a dark rim ON the piece below. Both used to end level — both
    // contours at the same y — which laid that rim across the buttock and
    // across the knee as straight horizontal bars. Tilted to the real
    // crease (iliac crest, popliteal fold: high at the back, low at the
    // front) the same rim reads as anatomy.
    const piece = (g: string) => SIDE_PIECES.find((p) => p.group === g)!;
    for (const [group, minTilt] of [
      ["torso", 2],
      ["thighL", 2],
    ] as const) {
      const pts = piece(group).outline as [number, number][];
      /* A silhouette is the back contour then the reversed front one, so
         its only two width-crossing segments are the top and bottom
         edges; every other consecutive pair steps ALONG a contour. Take
         the two widest and keep the lower — index arithmetic would need
         the contour lengths, which this file does not have. */
      const crossings = pts
        .map((p, i) => ({
          a: p,
          b: pts[(i + 1) % pts.length],
          dx: Math.abs(pts[(i + 1) % pts.length][0] - p[0]),
        }))
        .sort((x, y) => y.dx - x.dx)
        .slice(0, 2)
        .sort((x, y) => x.a[1] + x.b[1] - (y.a[1] + y.b[1]));
      const bottom = crossings[1];
      expect(
        Math.abs(bottom.a[1] - bottom.b[1]),
        `${group} bottom edge tilt`
      ).toBeGreaterThanOrEqual(minTilt);
    }
  });

  it("the shank outline traces BOTH contours, not just its back", () => {
    // It was `silhouette(...).slice(0, 6)` plus the foot, which keeps only
    // the back half — so the piece closed as a vertical line up the calf
    // and the entire shin lay outside its own underlay. Facets are painted
    // over the outline rather than clipped by it, so the leg still drew;
    // the tell was a wedge behind the calf where a seam wanted a groove.
    const shank = SIDE_PIECES.find((p) => p.group === "shankL")!;
    const at = (y: number) =>
      shank.outline.filter(([, py]) => Math.abs(py - y) < 3).map(([x]) => x);
    // Rendered rows: the shank runs ~142 (knee) to ~203 (sole).
    for (const y of [155, 170, 185]) {
      const xs = at(y);
      expect(xs.length, `outline samples at y=${y}`).toBeGreaterThan(1);
      // Front and back both present: the shank is 8+ units deep mid-length.
      expect(
        Math.max(...xs) - Math.min(...xs),
        `outline depth at y=${y}`
      ).toBeGreaterThan(6);
    }
  });

  it("the profile figure's gaps are a seam tone, not the stage colour", () => {
    // The pieces used to lay their underlay in the stage colour, so a
    // seam read as a hole punched THROUGH the body onto the background.
    // The front/back figures still work that way on purpose (short,
    // numerous mosaic gaps); the profile's few long ones do not.
    const svg = renderBodyDemo("barbell-curl", 0);
    expect(svg).toContain('fill="#33363D"');
    // ...and no piece paints the stage colour any more.
    expect(svg).not.toContain('fill="#111113"');
  });

  /* ── 2026-09-02 bilateral arms on the profile figure ── */

  it("the profile figure has a far arm: darker, pushed back and down, painted behind the torso", () => {
    // Roadmap side-topology P0 item ("bilateral arms/hands"). The far
    // arm is the near arm's geometry offset by FAR_ARM_SHIFT — back (−x)
    // and down (+y) — flagged `far` so the renderer shadows it, and
    // painted BEFORE the torso so it can only ever peek out from behind
    // the body. The near arm stays in front of the torso.
    const idx = (g: string) => SIDE_PIECES.findIndex((p) => p.group === g);
    expect(FAR_ARM_SHIFT[0]).toBeLessThan(0);
    expect(FAR_ARM_SHIFT[1]).toBeGreaterThan(0);
    for (const [far, near] of [
      ["upperArmR", "upperArmL"],
      ["foreArmR", "foreArmL"],
      ["handR", "handL"],
    ] as const) {
      const f = SIDE_PIECES[idx(far)];
      const n = SIDE_PIECES[idx(near)];
      expect(f?.far, `${far} flagged far`).toBe(true);
      expect(n?.far, `${near} is the near arm`).toBeFalsy();
      expect(idx(far), `${far} behind torso`).toBeLessThan(idx("torso"));
      expect(idx(near), `${near} in front of torso`).toBeGreaterThan(
        idx("torso")
      );
      // The geometry is now IDENTICAL — the offset is a post-pose
      // translate carried on the piece, not baked into its points.
      expect(f.outline.length).toBe(n.outline.length);
      f.outline.forEach(([x, y], i) => {
        expect(x, `${far} x`).toBeCloseTo(n.outline[i][0], 6);
        expect(y, `${far} y`).toBeCloseTo(n.outline[i][1], 6);
      });
      expect(f.depthShift, `${far} carries the depth offset`).toEqual(
        FAR_ARM_SHIFT
      );
      expect(n.depthShift, `${near} carries none`).toBeUndefined();
      expect(f.facets.map((fc) => fc.muscle)).toEqual(
        n.facets.map((fc) => fc.muscle)
      );
    }
  });

  it("every side demo moves the far arm with the near one — both hands on the same bar", () => {
    // Every profile demo is bilateral (a bar, a station, the floor), so
    // the far wrist must land exactly where the near one does, in every
    // frame. A demo that forgets the far arm leaves it hanging at rest
    // while the near arm presses — which is what this catches.
    // The kickback is unilateral by its own instruction ("one knee and
    // hand on a bench"): the far arm is the support and poses on its own.
    const UNILATERAL = new Set([
      "tricep-kickback",
      "concentration-curl",
      // Batch 13: the arms alternate by instruction.
      "battle-ropes",
      // Batch 8: "with one hand" / "one side" by instruction.
      "single-arm-cable-pushdown",
      "single-arm-lat-pulldown",
      "bayesian-cable-curl",
      // Batch 9: "with one hand" (landmine press), the Meadows row's
      // bracing far hand.
      "landmine-press",
      "meadows-row",
      // Batch 15: a stride's arms counter-swing — the far arm is half a
      // cycle from the near one by construction.
      "treadmill",
      "incline-treadmill-walk",
      // Batch 16: the far arm is half a stroke behind the near one.
      "swimming",
      // Batch 17: the man-maker rows one arm at a time; the get-up holds
      // the bell in one hand and posts the other.
      "man-maker",
      "turkish-get-up",
    ]);
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      if (d.view !== "side" || UNILATERAL.has(id)) continue;
      for (const t of [0, 0.5, 1]) {
        const pose = d.pose(t);
        for (const [g, anchor] of [
          ["handR", SIDE_ANCHORS.hand],
          ["foreArmR", SIDE_ANCHORS.elbow],
          ["upperArmR", SIDE_ANCHORS.shoulder],
        ] as const) {
          const near = g.replace("R", "L") as keyof typeof pose;
          const a = applyToPoint(anchor, (pose[g] ?? []) as never[]);
          const b = applyToPoint(anchor, (pose[near] ?? []) as never[]);
          expect(
            Math.hypot(a[0] - b[0], a[1] - b[1]),
            `${id}@${t} ${g}`
          ).toBeLessThan(1e-6);
        }
        // A posed near hand without a posed far hand is the regression.
        if (pose.handL)
          expect(pose.handR, `${id}@${t} far hand posed`).toBeDefined();
      }
    }
  });

  it("the far arm's depth offset does not rotate with the limb", () => {
    // The defect this replaced: the offset was baked into the authored
    // points, so it rode the arm's own rotation. Through a curl's ~120
    // degrees "back and down" became forward-and-up and the far arm
    // surfaced IN FRONT of the near one. Read off the RENDER at the top
    // of the curl — the pose furthest from rest — where the two hand
    // facets are the only six-point polygons on the figure.
    const svg = renderBodyDemo("barbell-curl", 1).replace(
      /<g class="glow">.*?<\/g>/,
      ""
    );
    const sixPointsWithFill = (fill: string) =>
      [...svg.matchAll(/<polygon points="([^"]+)" fill="([^"]+)"/g)]
        .filter((m) => m[2] === fill && m[1].split(" ").length === 6)
        .map((m) =>
          m[1]
            .split(" ")
            .map((p) => p.split(",").map(Number) as [number, number])
        );
    const far = sixPointsWithFill("#9FA6AC");
    const near = sixPointsWithFill("#B6BDC3");
    expect(far.length, "the far hand facet").toBe(1);
    expect(near.length, "candidate near facets").toBeGreaterThan(0);
    const mean = (pts: [number, number][], i: 0 | 1) =>
      pts.reduce((a, p) => a + p[i], 0) / pts.length;
    const fx = mean(far[0], 0);
    const fy = mean(far[0], 1);
    // The near hand is whichever six-point body facet the far one shadows.
    const twin = near.reduce((a, b) =>
      Math.hypot(mean(b, 0) - fx, mean(b, 1) - fy) <
      Math.hypot(mean(a, 0) - fx, mean(a, 1) - fy)
        ? b
        : a
    );
    expect(fx - mean(twin, 0), "dx").toBeCloseTo(FAR_ARM_SHIFT[0], 3);
    expect(fy - mean(twin, 1), "dy").toBeCloseTo(FAR_ARM_SHIFT[1], 3);
  });

  it("the far arm renders in shadow: darker body colour, dimmer tint, painted first", () => {
    const svg = renderBodyDemo("barbell-curl", 1).replace(
      /<g class="glow">.*?<\/g>/,
      ""
    );
    // Untinted far facets take the shadow body colour.
    expect(svg).toContain('fill="#9FA6AC"');
    // The biceps is primary on BOTH arms: the far copy (painted first)
    // carries a lower fill-opacity than the near copy (painted last).
    const ops = [
      ...svg.matchAll(/fill="#7B72E9" fill-opacity="([\d.]+)"/g),
    ].map((m) => Number(m[1]));
    expect(ops.length).toBeGreaterThanOrEqual(2);
    expect(ops[0]).toBeLessThan(ops[ops.length - 1]);
  });

  /* ── 2026-07-27 anatomy rebuild pins (owner device feedback) ── */

  it("overhead press: hands ride a fixed-width vertical bar path", () => {
    // The press is hand-constrained (IK), not choreographed rotation —
    // the regression this pins: a 170° whole-arm sweep that pendulumed
    // the hands out sideways. Rest anchors: shoulder [24,48], hand
    // [10,100] (left side of the vendored anterior figure).
    const hand = (t: number) =>
      applyToPoint(
        ANT_WRIST,
        (BODY_DEMOS["overhead-press"].pose(t).foreArmL ?? []) as never[]
      );
    const bottom = hand(0);
    const top = hand(1);
    // Fixed grip width: the hand's x never wanders.
    expect(Math.abs(top[0] - bottom[0])).toBeLessThan(0.5);
    // Real stroke: the hand travels straight UP by the press range.
    expect(bottom[1] - top[1]).toBeGreaterThan(30);
    // Lockout is overhead (above the head top at y≈0).
    expect(top[1]).toBeLessThan(0);
  });

  it("deadlift: side hinge with planted heels, hips back and down", () => {
    const pose = (t: number) => BODY_DEMOS["deadlift"].pose(t);
    // The ankle is the planted pivot — it must not move at all.
    const ankle = (t: number) =>
      applyToPoint(SIDE_ANCHORS.ankle, (pose(t).shankL ?? []) as never[]);
    expect(ankle(1)[0]).toBeCloseTo(ankle(0)[0], 5);
    expect(ankle(1)[1]).toBeCloseTo(ankle(0)[1], 5);
    // The hip travels BACK and DOWN into the bottom (hinge + knee bend,
    // not the old torso-compression "shrinking figure").
    const hip = (t: number) =>
      applyToPoint(SIDE_ANCHORS.hip, (pose(t).thighL ?? []) as never[]);
    expect(hip(1)[0]).toBeLessThan(hip(0)[0] - 15);
    expect(hip(1)[1]).toBeGreaterThan(hip(0)[1] + 15);
    // Full-size plate pinned in every frame; bar finishes near the
    // floor at the bottom of the pull.
    for (const t of [0, 0.5, 1]) {
      expect(renderBodyDemo("deadlift", t).includes('r="16"'), `@${t}`).toBe(
        true
      );
    }
    const grip = (t: number) =>
      applyToPoint(SIDE_ANCHORS.hand, (pose(t).handL ?? []) as never[]);
    expect(grip(1)[1]).toBeGreaterThan(160); // below the knee line (152)
    expect(grip(0)[1]).toBeLessThan(105); // standing lockout at the thigh
  });

  it("bench press: sole lands ON the floor with a vertical shin", () => {
    const pose = BODY_DEMOS["bench-press"].pose(1);
    const knee = applyToPoint(
      SIDE_ANCHORS.knee,
      (pose.thighL ?? []) as never[]
    );
    const ankle = applyToPoint(
      SIDE_ANCHORS.ankle,
      (pose.shankL ?? []) as never[]
    );
    // Shin screen-vertical: ankle directly under the knee.
    expect(Math.abs(ankle[0] - knee[0])).toBeLessThan(5);
    // Sole (ankle + ~10 of foot) meets the 171 floor line — the old
    // 35°/55° split buried the foot ~5 units through it.
    expect(ankle[1] + 10).toBeGreaterThan(168);
    expect(ankle[1] + 10).toBeLessThan(174);
  });

  it("calf raise: heels lift off the block, toes stay planted, body rises", () => {
    const pose = (t: number) => BODY_DEMOS["calf-raise"].pose(t);
    const at = (pt: [number, number], ops?: unknown[]) =>
      applyToPoint(pt, (ops ?? []) as never[]);
    // The ball of the foot is the pivot: it never moves.
    const ball0 = at(CALF_BALL, pose(0).shankL);
    const ball1 = at(CALF_BALL, pose(1).shankL);
    expect(ball1[0]).toBeCloseTo(ball0[0], 5);
    expect(ball1[1]).toBeCloseTo(ball0[1], 5);
    // The heel (behind the ball, on the sole line) drops below the
    // block edge at the bottom and clears it at the top — the cue the
    // anterior version could not show at all.
    const heel: [number, number] = [CALF_BALL[0] - 18, CALF_BALL[1]];
    const heel0 = at(heel, pose(0).shankL);
    const heel1 = at(heel, pose(1).shankL);
    expect(heel0[1]).toBeGreaterThan(CALF_BLOCK_TOP);
    expect(heel1[1]).toBeLessThan(CALF_BLOCK_TOP - 3);
    expect(heel0[1] - heel1[1]).toBeGreaterThan(6);
    // Everything above rides the knee: the thigh stays attached to the
    // pitched shank's knee end.
    const kneeShank = at(SIDE_ANCHORS.knee, pose(1).shankL);
    const kneeThigh = at(SIDE_ANCHORS.knee, pose(1).thighL);
    expect(kneeThigh[0]).toBeCloseTo(kneeShank[0], 5);
    expect(kneeThigh[1]).toBeCloseTo(kneeShank[1], 5);
    // The block is drawn under the toes.
    expect(renderBodyDemo("calf-raise", 0)).toContain(`y="${CALF_BLOCK_TOP}"`);
  });
});

describe("registry", () => {
  it("all demos are defined with tints and a concentric direction", () => {
    for (const id of [
      "squat",
      "goblet-squat",
      "deadlift",
      "overhead-press",
      "barbell-curl",
      "lateral-raise",
      "calf-raise",
      "pull-ups",
      "lat-pulldown",
      "rope-tricep-pushdown",
      "dips",
      "bench-press",
      "barbell-row",
    ]) {
      const d = BODY_DEMOS[id];
      expect(d, id).toBeTruthy();
      expect(Object.keys(d.tint).length, id).toBeGreaterThan(0);
      expect([0, 1], id).toContain(d.concentricTo);
    }
  });
});

/* ── 2026-09-02 mechanics pass: execution sequencing + tint honesty ── */
describe("execution mechanics", () => {
  const at = (pt: [number, number], ops?: unknown[]) =>
    applyToPoint(pt, (ops ?? []) as never[]);

  it("deadlift: the hinge leads and the knees trail (hips back first, legs drive first)", () => {
    // A deadlift descends as an RDL until the bar passes the knees, then
    // bends the knees to reach the bar; the pull is the mirror. Pinned
    // as: at mid-rep the shoulder has completed a larger share of its
    // forward travel than the knee has of its forward travel.
    const pose = (t: number) => BODY_DEMOS["deadlift"].pose(t);
    const sx = (t: number) => at(SIDE_ANCHORS.shoulder, pose(t).torso)[0];
    const kx = (t: number) => at(SIDE_ANCHORS.knee, pose(t).thighL)[0];
    const fracS = (sx(0.5) - sx(0)) / (sx(1) - sx(0));
    const fracK = (kx(0.5) - kx(0)) / (kx(1) - kx(0));
    expect(fracS).toBeGreaterThan(fracK + 0.25);
    // Same end poses as the un-staggered version: standing and bottom.
    expect(kx(0)).toBeCloseTo(SIDE_ANCHORS.knee[0], 5);
    // The shoulder's NET forward travel is modest (~15): the hips going
    // back cancel most of the hinge — which is the balance the pin above
    // measures in fractions, not absolutes.
    expect(sx(1) - sx(0)).toBeGreaterThan(10);
  });

  it("RDL: the bar slides down the legs, not out in front of them", () => {
    // Plumb hands would hang forward of the shins once the shoulders
    // travel forward; the grip is pulled back as the hinge deepens.
    const pose = BODY_DEMOS["romanian-deadlift"].pose(1);
    const grip = at(SIDE_ANCHORS.hand, pose.handL);
    const sh = at(SIDE_ANCHORS.shoulder, pose.torso);
    expect(grip[0]).toBeLessThan(sh[0] - 3);
  });

  it("squat: the bar finishes over the foot, not behind it", () => {
    const pose = BODY_DEMOS["squat"].pose(1);
    const bar = at(BACK_RACK, pose.torso);
    const ankle = at(SIDE_ANCHORS.ankle, pose.shankL);
    // Within a foot's length of the ankle in x (foot spans ~41-65).
    expect(Math.abs(bar[0] - ankle[0])).toBeLessThan(12);
  });
});

describe("tint honesty", () => {
  const SIDE_FACETS = new Set(
    SIDE_PIECES.flatMap((p) => p.facets.map((f) => f.muscle))
  );
  const ANT_MUSCLES = new Set(ANTERIOR.map((p) => p.muscle));
  const POST_MUSCLES = new Set(POSTERIOR.map((p) => p.muscle));

  it("every tint names a muscle the demo's view can actually draw", () => {
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      const vocab =
        d.view === "side"
          ? SIDE_FACETS
          : d.view === "anterior"
            ? ANT_MUSCLES
            : POST_MUSCLES;
      for (const m of Object.keys(d.tint)) {
        expect(vocab.has(m), `${id} tints undrawable "${m}"`).toBe(true);
      }
    }
  });

  it("the primary tint is the catalogue's primary muscle group", () => {
    // The 2026-09-02 audit found dips INVERTED (triceps primary where
    // the catalogue says pectorals). Pin the mapping for every demo
    // whose primary the catalogue names in a drawable vocabulary.
    const expectPrimary: Record<string, string> = {
      dips: "chest",
      "bench-press": "chest",
      "push-ups": "chest",
      "barbell-curl": "biceps",
      "rope-tricep-pushdown": "triceps",
      squat: "quadriceps",
      "goblet-squat": "quadriceps",
      "calf-raise": "calves",
      "overhead-press": "front-deltoids",
      "lat-pulldown": "upper-back",
      "pull-ups": "upper-back",
      "barbell-row": "upper-back",
      "romanian-deadlift": "hamstring",
      "db-curl": "biceps",
      "front-raise": "front-deltoids",
      "overhead-extension": "triceps",
      "tricep-kickback": "triceps",
      "skull-crushers": "triceps",
      lunges: "quadriceps",
      "incline-bench": "chest",
      "incline-db-press": "chest",
      "glute-bridge": "gluteal",
      "hip-thrust": "gluteal",
      "bulgarian-split": "quadriceps",
      "cable-curl": "biceps",
      "straight-arm-pulldown": "upper-back",
      "face-pulls": "upper-back",
      "seated-row": "upper-back",
      "leg-extension": "quadriceps",
      "seated-leg-curl": "hamstring",
      "preacher-curl": "biceps",
      "concentration-curl": "biceps",
      "incline-db-curl": "biceps",
      "leg-press": "quadriceps",
      "hack-squat": "quadriceps",
      "rack-pull": "gluteal",
      "decline-bench": "chest",
      "decline-db-press": "chest",
      crunches: "abs",
      "toe-touches": "abs",
      "decline-sit-up": "abs",
      "leg-raise": "abs",
      "cable-crunch": "abs",
      "ab-wheel": "abs",
      "superman-hold": "lower-back",
      "inverted-row": "upper-back",
      "bench-dips": "triceps",
      "kettlebell-swing": "gluteal",
      "barbell-upright-row": "trapezius",
      "zercher-squat": "quadriceps",
      "nordic-hamstring-curl": "hamstring",
      "glute-ham-raise": "hamstring",
      "sissy-squat": "quadriceps",
      "barbell-floor-press": "chest",
      "single-leg-calf-raise": "calves",
      "donkey-calf-raise": "calves",
      "barbell-step-ups": "quadriceps",
      "pistol-squat": "quadriceps",
      thrusters: "quadriceps",
      "chest-supported-db-row": "upper-back",
      "reverse-grip-cable-pushdown": "triceps",
      "single-arm-cable-pushdown": "triceps",
      "overhead-cable-tricep-extension": "triceps",
      "bayesian-cable-curl": "biceps",
      "reverse-barbell-curl": "forearm",
      "spider-db-curl": "biceps",
      "single-arm-lat-pulldown": "upper-back",
      "cable-glute-kickback": "gluteal",
      "landmine-press": "front-deltoids",
      "landmine-squat": "quadriceps",
      "meadows-row": "upper-back",
      "chest-press-machine": "chest",
      "shoulder-press-machine": "front-deltoids",
      "jm-press": "triceps",
      "pike-push-up": "front-deltoids",
      "handstand-push-ups": "front-deltoids",
      "dragon-flag": "abs",
      plank: "abs",
      "weighted-plank": "abs",
      "l-sit": "abs",
      "muscle-ups": "upper-back",
      "clean-and-press": "gluteal",
      "db-flyes": "chest",
      "cable-fly": "chest",
      "cable-crossover": "chest",
      "pec-deck": "chest",
      "machine-chest-fly": "chest",
      "lu-raise": "front-deltoids",
      "arnold-press": "front-deltoids",
      "cuban-press": "front-deltoids",
      // The front figure draws no trapezius; the cap that rises is the deltoid.
      shrugs: "front-deltoids",
      "barbell-shrug": "front-deltoids",
      "hip-abduction-machine": "abductors",
      "hip-adduction-machine": "abductors",
      "reverse-flyes": "back-deltoids",
      "rear-delt-machine-fly": "back-deltoids",
      "reverse-pec-deck": "back-deltoids",
      "cross-body-hammer-curl": "biceps",
      "cable-woodchopper": "obliques",
      "dead-bug": "abs",
      "bicycle-crunch": "obliques",
      "russian-twist": "obliques",
      "mountain-climbers": "abs",
      "battle-ropes": "front-deltoids",
      "side-plank": "obliques",
      "rowing-machine": "quadriceps",
      "ski-erg": "upper-back",
      "jump-rope": "calves",
      "pallof-press": "abs",
      burpees: "quadriceps",
      treadmill: "quadriceps",
      "incline-treadmill-walk": "gluteal",
      "farmers-carry": "forearm",
      "sled-push-pull": "quadriceps",
      stairmaster: "gluteal",
      "box-jumps": "quadriceps",
      bike: "quadriceps",
      "spin-bike": "quadriceps",
      "assault-bike": "quadriceps",
      elliptical: "quadriceps",
      swimming: "upper-back",
      "zottman-curl": "biceps",
      "man-maker": "chest",
      "turkish-get-up": "abs",
      "seated-calf-raise": "calves",
    };
    for (const [id, muscle] of Object.entries(expectPrimary)) {
      expect(BODY_DEMOS[id].tint[muscle], `${id} primary`).toBe("primary");
    }
    // Invented tints are gone: nothing lights `neck` any more.
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      expect(d.tint.neck, `${id} neck`).toBeUndefined();
    }
    // Every catalogue exercise these demos serve still exists.
    for (const id of Object.keys(expectPrimary)) {
      expect(
        EXERCISES.some((e) => e.id === id),
        id
      ).toBe(true);
    }
  });
});

/* ── Placard beats (2026-09-03) ──────────────────────────────────────
 *
 * A stepped demo names its positions and captions each one under the
 * drawing. That makes the caption a CLAIM about the frame, which is a
 * stronger obligation than the rig has carried before: a generic phase
 * cue ("Lower under control") is true of any eccentric, but "arms
 * locked" is either true of that frame or it is not.
 *
 * Authoring the dips beats found it false. The support position was
 * built at 0.97 of arm length, which sounds like a locked arm and is
 * not — near full extension the cosine is flat, and 0.97 leaves the
 * elbow at 152°, visibly bent. Nothing pinned it, because nothing had
 * ever said in words what that frame was supposed to be.
 */
describe("form beats — the caption is a claim about the frame", () => {
  const at = (pt: [number, number], ops?: unknown[]) =>
    applyToPoint(pt, (ops ?? []) as never[]);
  const jointDeg = (
    a: [number, number],
    b: [number, number],
    c: [number, number]
  ) => {
    const v1 = [a[0] - b[0], a[1] - b[1]];
    const v2 = [c[0] - b[0], c[1] - b[1]];
    return (
      (Math.acos(
        Math.max(
          -1,
          Math.min(
            1,
            (v1[0] * v2[0] + v1[1] * v2[1]) /
              (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]))
          )
        )
      ) *
        180) /
      Math.PI
    );
  };

  it("every beat sequence names a real demo and stays inside its range", () => {
    expect(FORM_BEAT_IDS.length).toBeGreaterThan(0);
    for (const id of FORM_BEAT_IDS) {
      const beats = getAuthoredBeats(id);
      expect(beats, id).not.toBeNull();
      expect(getBodyDemo(id), `${id} has no demo to caption`).not.toBeNull();
      expect(
        beats!.length,
        `${id} needs more than one position`
      ).toBeGreaterThan(1);
      for (const b of beats!) {
        expect(b.t, `${id} "${b.label}"`).toBeGreaterThanOrEqual(0);
        expect(b.t, `${id} "${b.label}"`).toBeLessThanOrEqual(1);
        expect(b.label.trim().length, id).toBeGreaterThan(0);
        expect(b.cue.trim().length, id).toBeGreaterThan(0);
      }
      // Labels are how a reader tells the positions apart.
      expect(new Set(beats!.map((b) => b.label)).size, `${id} labels`).toBe(
        beats!.length
      );
    }
  });

  it("every cue fits the hold it is read in", () => {
    // The dwell is derived from this width (PLACARD_CUE_WORDS at an
    // ordinary reading rate), so an over-long cue is not a style
    // preference — it is a line that scrolls past unread.
    for (const id of FORM_BEAT_IDS) {
      for (const b of getAuthoredBeats(id)!) {
        const words = b.cue.trim().split(/\s+/).length;
        expect(words, `${id} "${b.label}": ${words} words`).toBeLessThanOrEqual(
          PLACARD_CUE_WORDS
        );
      }
    }
  });

  it("the loop closes from the start pose or a controlled return towards it", () => {
    // Six authored stills need not duplicate the first pose at the end.
    // A partial return must continue in the same direction across 6→1,
    // with a closing distance no larger than an earlier authored step.
    for (const id of FORM_BEAT_IDS) {
      const beats = getAuthoredBeats(id)!;
      const first = beats[0].t;
      const last = beats[beats.length - 1].t;
      if (last === first) continue;
      const previous = beats[beats.length - 2].t;
      expect(
        (last - previous) * (first - last),
        `${id}: return direction`
      ).toBeGreaterThan(0);
      const largestStep = Math.max(
        ...beats.slice(1).map((beat, i) => Math.abs(beat.t - beats[i].t))
      );
      expect(
        Math.abs(last - first),
        `${id}: closing distance`
      ).toBeLessThanOrEqual(largestStep);
    }
  });

  it("the curl draft includes a distinct controlled return and remains unreleased", () => {
    expect(getAuthoredBeats("db-curl")!.map((beat) => beat.t)).toEqual([
      0, 0.25, 0.6, 1, 0.6, 0.15,
    ]);
    expect(getFormBeats("db-curl")).toBeNull();
  });

  it("dips: the two named ends ARE the positions they are named after", () => {
    const beats = getFormBeats("dips")!;
    const pose = (t: number) => BODY_DEMOS.dips.pose(t);
    const elbow = (t: number) => {
      const p = pose(t);
      return jointDeg(
        at(SIDE_ANCHORS.shoulder, p.upperArmL),
        at(SIDE_ANCHORS.elbow, p.upperArmL),
        at(SIDE_ANCHORS.hand, p.foreArmL)
      );
    };

    // "Arms locked" — the house floor for a lockout is 165°, the same
    // bar the overhead press was held to. At the shipped 0.97 of arm
    // length this read 152.0 and the caption was a lie.
    const top = beats.find((b) => b.label === "Top position")!;
    expect(elbow(top.t)).toBeGreaterThan(165);

    // "Stop when upper arms reach parallel" — the upper arm within 10°
    // of the floor at the bottom.
    const bottom = beats.find((b) => b.label === "Bottom position")!;
    const p = pose(bottom.t);
    const S = at(SIDE_ANCHORS.shoulder, p.upperArmL);
    const E = at(SIDE_ANCHORS.elbow, p.upperArmL);
    const fromHorizontal = Math.abs(
      Math.abs((Math.atan2(E[1] - S[1], E[0] - S[0]) * 180) / Math.PI) - 180
    );
    expect(fromHorizontal).toBeLessThan(10);
    // And the elbow travels BACK to get there — behind the hand, which
    // is the dip's own instruction and the geometry the 2026-09-03
    // mirror-image bug got backwards.
    expect(E[0]).toBeLessThan(at(SIDE_ANCHORS.hand, p.foreArmL)[0]);
  });

  it("dips: the descent captions run in the direction they describe", () => {
    // t=0 is the top for this demo, so a descent reads as increasing t
    // and the press as decreasing — the order the labels claim.
    const beats = getFormBeats("dips")!;
    const t = (label: string) => beats.find((b) => b.label === label)!.t;
    expect(t("Top position")).toBeLessThan(t("Initiate descent"));
    expect(t("Initiate descent")).toBeLessThan(t("Mid descent"));
    expect(t("Mid descent")).toBeLessThan(t("Bottom position"));
    expect(t("Press up")).toBeLessThan(t("Bottom position"));
    expect(t("Return to top")).toBeLessThan(t("Press up"));
  });

  it("the hands never leave the bar across the whole sequence", () => {
    // A dip's hands are FIXED on the grip; every position is the body
    // moving around them. This is what makes the six frames one
    // exercise rather than six drawings.
    const beats = getFormBeats("dips")!;
    for (const b of beats) {
      const h = at(SIDE_ANCHORS.hand, BODY_DEMOS.dips.pose(b.t).foreArmL);
      expect(
        Math.hypot(h[0] - DIP_GRIP[0], h[1] - DIP_GRIP[1]),
        b.label
      ).toBeLessThan(18);
    }
    // …and identically at every position, not merely nearby.
    const hands = beats.map((b) =>
      at(SIDE_ANCHORS.hand, BODY_DEMOS.dips.pose(b.t).foreArmL)
    );
    for (const h of hands) {
      expect(h[0]).toBeCloseTo(hands[0][0], 6);
      expect(h[1]).toBeCloseTo(hands[0][1], 6);
    }
  });
});

/* ── Supplied frames (2026-09-03) ────────────────────────────────────
 *
 * The dips placard animates the owner's own card, cut into six by
 * `scripts/extract-form-frames.mjs`. These pin the properties that make
 * six stills read as one movement, and that a path in a TypeScript file
 * still names a file on disk — the failure mode a type cannot catch.
 */
describe("supplied placard frames", () => {
  const framed = FORM_BEAT_IDS.filter((id) =>
    getAuthoredBeats(id)!.some((b) => b.image)
  );

  /** WebP is a RIFF container, and it has two shapes here.
   *
   *  A plain lossy file is `VP8 ` with 14-bit dimensions after the sync
   *  code. Once the frames gained an alpha channel — the card's
   *  background is keyed out so the figure sits on our stage — they
   *  became the EXTENDED form, `VP8X`, whose canvas size is two 24-bit
   *  fields and is stored minus one. The test caught that change rather
   *  than being told about it.
   *
   *  Parsed rather than decoded because the image libraries this repo
   *  uses live in dev scripts and are not in package.json: a test that
   *  reached for one would pass locally and be unavailable in CI. */
  function webpSize(buf: Buffer): { w: number; h: number } {
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.toString("ascii", 8, 12)).toBe("WEBP");
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X")
      return {
        w: buf.readUIntLE(24, 3) + 1,
        h: buf.readUIntLE(27, 3) + 1,
      };
    expect(kind).toBe("VP8 ");
    return {
      w: buf.readUInt16LE(26) & 0x3fff,
      h: buf.readUInt16LE(28) & 0x3fff,
    };
  }

  it("every frame path names a file that is actually there", () => {
    expect(framed.length).toBeGreaterThan(0);
    for (const id of framed) {
      for (const b of getAuthoredBeats(id)!) {
        expect(b.image, `${id} "${b.label}" has no frame`).toBeTruthy();
        const file = resolve(process.cwd(), "public", b.image!);
        expect(existsSync(file), `missing ${b.image}`).toBe(true);
        expect(statSync(file).size).toBeGreaterThan(2000);
      }
    }
  });

  it("all of a sequence's frames share one canvas", () => {
    /* The extraction crops every panel to the UNION of all six figures'
       bounding boxes. Trim each frame to its own box instead and the
       body jumps around the canvas between positions — the single
       property that decides whether six stills read as one movement. */
    for (const id of framed) {
      const sizes = getAuthoredBeats(id)!.map((b) =>
        webpSize(readFileSync(resolve(process.cwd(), "public", b.image!)))
      );
      for (const s of sizes) expect(s, id).toEqual(sizes[0]);
      // A real canvas, not a 1x1 that would satisfy "all equal".
      expect(sizes[0].w).toBeGreaterThan(200);
      expect(sizes[0].h).toBeGreaterThan(200);
    }
  });

  it("a framed beat still carries the t it falls back to", () => {
    // The pictures are fetched at runtime, so "the file is in the repo"
    // is not "the user got it". The rig renders the same position from
    // the beat's own t when a frame cannot load.
    for (const id of framed) {
      for (const b of getAuthoredBeats(id)!) {
        expect(typeof b.t, `${id} "${b.label}"`).toBe("number");
      }
      expect(
        getBodyDemo(id),
        `${id} has no figure to fall back to`
      ).not.toBeNull();
    }
  });

  it("leaves no orphan frames in the directory", () => {
    // A renamed beat that leaves its old picture behind ships dead
    // weight in the bundle and reads as a frame that is still in use.
    const dirs = new Set(
      framed.flatMap((id) =>
        getAuthoredBeats(id)!.map((b) => b.image!.replace(/\/[^/]+$/, ""))
      )
    );
    const used = new Set(
      framed.flatMap((id) => getAuthoredBeats(id)!.map((b) => b.image!))
    );
    for (const d of dirs) {
      for (const f of readdirSync(resolve(process.cwd(), "public", d))) {
        expect(used.has(`${d}/${f}`), `orphan frame ${d}/${f}`).toBe(true);
      }
    }
  });
});

describe("a placard goes live with its art, not before", () => {
  /* Positions are authored AHEAD of the card, because the generator
     prompt is built from them: asking a generator for six panels while
     the app knows only the catalogue's four instructions produces a
     card the code cannot use. Until every position has a frame the
     exercise must play exactly as it did — authoring content is not a
     product change. */
  it("an authored placard with no frames is not live", () => {
    const authored = FORM_BEAT_IDS.filter(
      (id) => !getAuthoredBeats(id)!.every((b) => b.image)
    );
    expect(
      authored.length,
      "expected some positions authored ahead"
    ).toBeGreaterThan(0);
    for (const id of authored) {
      expect(getAuthoredBeats(id), id).not.toBeNull();
      expect(getFormBeats(id), `${id} went live without its card`).toBeNull();
    }
  });

  it("a placard whose frames are all present IS live", () => {
    const withArt = FORM_BEAT_IDS.filter((id) =>
      getAuthoredBeats(id)!.every((b) => b.image)
    );
    expect(withArt.length).toBeGreaterThan(0);
    for (const id of withArt) expect(getFormBeats(id), id).not.toBeNull();
  });

  it("a HALF-carded placard stays dark rather than mixing", () => {
    // A sequence that alternated a photograph with a drawing would
    // read as broken, so the gate is all-or-nothing by construction.
    const half = FORM_BEAT_IDS.map((id) => getAuthoredBeats(id)!).find(
      (b) => b.some((x) => x.image) && !b.every((x) => x.image)
    );
    expect(half, "no half-carded placard should exist").toBeUndefined();
  });
});

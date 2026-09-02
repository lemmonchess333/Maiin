import { describe, it, expect } from "vitest";
import {
  applyToPoint,
  BACK_RACK,
  BODY_DEMOS,
  CALF_BALL,
  CALF_BLOCK_TOP,
  DIP_GRIP,
  getBodyDemo,
  renderBodyDemo,
} from "../bodyRig";
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
    // Hips travel BACK and DOWN — the shape the front view could never
    // show — finishing just above parallel (no lower than the knee).
    const hip0 = at(SIDE_ANCHORS.hip, pose(0).thighL);
    const hip1 = at(SIDE_ANCHORS.hip, pose(1).thighL);
    expect(hip1[0]).toBeLessThan(hip0[0] - 25);
    expect(hip1[1]).toBeGreaterThan(hip0[1] + 30);
    expect(hip1[1]).toBeLessThanOrEqual(knee1[1] + 1);
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
    for (const id of [
      "db-curl",
      "hammer-curl",
      "ez-bar-curl",
      "cable-curl",
      "reverse-grip-cable-pushdown",
    ]) {
      expect(getBodyDemo(id), id).toBeNull();
      expect(renderBodyDemo(id, 0.5), id).toBe("");
    }
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
      expect(f.outline.length).toBe(n.outline.length);
      f.outline.forEach(([x, y], i) => {
        // x is exact; y passes through the re-row after the shift, so
        // the vertical offset is the authored one scaled by the local
        // remap slope — always downward, never more than the shift ×2.
        expect(x - n.outline[i][0], `${far} x`).toBeCloseTo(
          FAR_ARM_SHIFT[0],
          6
        );
        const dy = y - n.outline[i][1];
        expect(dy, `${far} y`).toBeGreaterThan(0);
        expect(dy, `${far} y`).toBeLessThan(FAR_ARM_SHIFT[1] * 2);
      });
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
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      if (d.view !== "side") continue;
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

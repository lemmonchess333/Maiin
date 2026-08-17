import { describe, it, expect } from "vitest";
import {
  applyToPoint,
  BODY_DEMOS,
  getBodyDemo,
  renderBodyDemo,
} from "../bodyRig";
import { ANTERIOR, POSTERIOR } from "../bodyModelData";
import { SIDE_ANCHORS, SIDE_PIECES } from "../bodySideData";

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
  it("t=0 renders the untransformed figure (identity)", () => {
    const svg = renderBodyDemo("squat", 0);
    // The head's top vertex sits at the model's y≈0 when nothing moved.
    const ys = polyYs(svg);
    expect(Math.min(...ys)).toBeLessThan(1);
    const body = svg.replace(/<g class="glow">.*?<\/g>/, "");
    // 33 vendored + 2 feet + 4 fist facets (two per hand — the second
    // is the knuckle band). The library figure ships neither feet nor
    // hands; both are added outside the vendored array.
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
    const svg = renderBodyDemo("squat", 0); // identity pose
    const facets = polysNear(svg, ANT_WRIST, 11);
    expect(facets.length).toBe(2); // main mass + knuckle band

    const elbow: [number, number] = [20, 71];
    const ux =
      (ANT_WRIST[0] - elbow[0]) /
      Math.hypot(ANT_WRIST[0] - elbow[0], ANT_WRIST[1] - elbow[1]);
    const uy =
      (ANT_WRIST[1] - elbow[1]) /
      Math.hypot(ANT_WRIST[0] - elbow[0], ANT_WRIST[1] - elbow[1]);
    for (const pts of facets) {
      const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length;
      const cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
      const vx = cx - ANT_WRIST[0];
      const vy = cy - ANT_WRIST[1];
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
    const svg = renderBodyDemo("squat", 0);
    const [mass] = polysNear(svg, ANT_WRIST, 11);
    const byDist = [...mass].sort(
      (a, b) =>
        Math.hypot(a[0] - ANT_WRIST[0], a[1] - ANT_WRIST[1]) -
        Math.hypot(b[0] - ANT_WRIST[0], b[1] - ANT_WRIST[1])
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
    const svg = renderBodyDemo("squat", 0).replace(
      /<g class="glow">.*?<\/g>/,
      ""
    );
    const purples = (svg.match(/#7B72E9/g) || []).length;
    const quadPolys = ANTERIOR.filter((p) => p.muscle === "quadriceps").length;
    expect(purples).toBe(quadPolys); // primary tint = quadriceps only
    expect(svg.includes("#B6BDC3")).toBe(true); // library body grey everywhere else
  });

  it("primary muscles carry a glow aura that breathes with effort", () => {
    const glowOf = (svg: string) => svg.match(/<g class="glow">(.*?)<\/g>/)![1];
    const soft = glowOf(renderBodyDemo("squat", 0.5, 0));
    const hard = glowOf(renderBodyDemo("squat", 0.5, 1));
    expect(hard.length).toBeGreaterThan(0);
    const firstOpacity = (g: string) =>
      Number(g.match(/opacity="([\d.]+)"/)![1]);
    expect(firstOpacity(hard)).toBeGreaterThan(firstOpacity(soft));
    // Two quads → two hulls × three rings.
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
    // goblet-squat aliases squat — a direct-registry lookup would blank.
    expect(renderBodyDemo("goblet-squat", 0.5)).not.toBe("");
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
      expect(["upperArmL", "foreArmL", "handL"], g).toContain(g);
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
    for (const [id, wrist] of [
      ["overhead-press", ANT_WRIST],
      ["dips", ANT_WRIST],
    ] as const) {
      for (const t of [0, 0.5, 1]) {
        const pose = BODY_DEMOS[id].pose(t);
        const grip = BODY_DEMOS[id].bar!(t, pose)![0];
        const w = applyToPoint(wrist, (pose.foreArmL ?? []) as never[]);
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
    for (const [id, wrist] of [
      ["pull-ups", POST_WRIST],
      ["dips", ANT_WRIST],
    ] as const) {
      const at = (t: number) =>
        applyToPoint(wrist, (BODY_DEMOS[id].pose(t).foreArmL ?? []) as never[]);
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

  it("calf raise: body rises but the feet stay planted", () => {
    const maxY = (svg: string) => Math.max(...polyYs(svg));
    const minY = (svg: string) => Math.min(...polyYs(svg));
    const down = renderBodyDemo("calf-raise", 0);
    const up = renderBodyDemo("calf-raise", 1);
    expect(minY(down) - minY(up)).toBeGreaterThan(4); // head rose
    expect(Math.abs(maxY(down) - maxY(up))).toBeLessThan(1); // toes didn't
  });
});

describe("registry", () => {
  it("all demos are defined with tints and a concentric direction", () => {
    for (const id of [
      "squat",
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

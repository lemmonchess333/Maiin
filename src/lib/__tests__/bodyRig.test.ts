import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  applyToPoint,
  BODY_DEMOS,
  getBodyDemo,
  renderBodyDemo,
} from "../bodyRig";
import { ANTERIOR, POSTERIOR } from "../bodyModelData";
import { SIDE_ANCHORS, SIDE_PIECES } from "../bodySideData";

/* The anterior figure's joint anchors, mirrored from `bodyRig`'s private
   `ANT`. Duplicated deliberately — hoisting them into the export surface
   to serve tests would widen the module's API for no runtime caller — so
   a drift guard keeps them honest (see "anterior anchors match" below). */
const ANT_SHOULDER_L: [number, number] = [24, 48];
const ANT_SHOULDER_R: [number, number] = [76, 48];
const ANT_ELBOW_L: [number, number] = [20, 71];
const ANT_HAND_L: [number, number] = [10, 100];

/** Interior angle at `b`, in degrees. */
function elbowAngle(
  a: [number, number],
  b: [number, number],
  c: [number, number]
): number {
  const u = [a[0] - b[0], a[1] - b[1]];
  const v = [c[0] - b[0], c[1] - b[1]];
  return (
    (Math.acos(
      (u[0] * v[0] + u[1] * v[1]) /
        (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]))
    ) *
      180) /
    Math.PI
  );
}

/** Interior elbow angle of a SIDE-view demo at `t`, in degrees. */
function sideElbow(id: string, t: number): number {
  const pose = BODY_DEMOS[id].pose(t);
  return elbowAngle(
    applyToPoint(SIDE_ANCHORS.shoulder, pose.upperArmL ?? []),
    applyToPoint(SIDE_ANCHORS.elbow, pose.foreArmL!),
    applyToPoint(SIDE_ANCHORS.hand, pose.foreArmL!)
  );
}

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
    expect(body.match(/<polygon/g)!.length).toBe(35); // 33 body + 2 feet
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

  it("dips: the grip is a bar, not the relaxed-hang hand position", () => {
    /* Owner, on the shipped demo: "arms look so far apart on the dips".
       They were: the pose used `ANT.handL/handR` as the grips, which are
       the anterior figure's ARMS-RELAXED hand positions — 79.0 apart
       against a 52.0 shoulder span, so 1.52x shoulder width. Nothing was
       holding the number; it was whatever the source art happened to
       draw, reused because it was the hand.

       liftmanual's chest- and triceps-dip figures both stand on bars at
       roughly shoulder width, so the band is 1.0-1.4 and 1.52 is out of
       it. Asserted as a RATIO rather than a literal: the point is the
       relationship to the shoulders, and a literal would silently stop
       meaning anything if the figure were ever redrawn. */
    const demo = BODY_DEMOS["dips"];
    const bar = demo.bar!(0, demo.pose(0));
    expect(bar, "dips declares no bar").toBeTruthy();
    const span = Math.abs(bar![1][0] - bar![0][0]);
    const shoulders = ANT_SHOULDER_L[0] - ANT_SHOULDER_R[0];
    const ratio = span / Math.abs(shoulders);
    expect(
      ratio,
      `dip grip is ${ratio.toFixed(2)}x shoulder width`
    ).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(1.4);
    // …and level, because it is one bar per side at one height.
    expect(bar![0][1]).toBeCloseTo(bar![1][1], 6);
  });

  it("dips: the bottom reaches the upper-arm-parallel landmark", () => {
    /* liftmanual's two dip pages disagree about lean and elbow flare and
       agree about DEPTH: at the bottom the shoulder-to-elbow segment is
       roughly parallel to the floor. With a vertical forearm that is a
       right angle at the elbow, which is a number, so it is checkable.

       It stopped at 99 degrees — nine short, invisible by eye, and the
       same partial-rep shape as every other demo measured against its own
       form cue. The drop is now solved from the landmark rather than
       chosen: a right angle fixes the shoulder-to-hand distance at
       sqrt(U^2 + F^2), so the sink is whatever closes the straight-arm
       reach down to it.

       Both ends asserted. Pinning only the bottom would be satisfied by a
       demo that starts bent and never locks out. */
    const at = (t: number) => {
      const pose = BODY_DEMOS["dips"].pose(t);
      return elbowAngle(
        applyToPoint(ANT_SHOULDER_L, pose.upperArmL!),
        applyToPoint(ANT_ELBOW_L, pose.foreArmL!),
        applyToPoint(ANT_HAND_L, pose.foreArmL!)
      );
    };
    expect(at(1), "dip bottom").toBeGreaterThan(85);
    expect(at(1), "dip bottom").toBeLessThan(95);
    expect(at(0), "dip lockout").toBeGreaterThan(170);
  });

  it("anterior anchors match the ones this file mirrors", () => {
    /* The two dip tests above probe joints at hard-coded coordinates,
       because `ANT` is private to `bodyRig`. That is a mirror, and this
       project's first recurring-mistake rule is that a mirror nobody pins
       drifts — the copy here would keep passing while measuring points
       the figure no longer has, which is the worst failure mode: green,
       and measuring nothing.

       Caught for real while writing these: the values were carried over
       from an earlier revision of the model and read [18.8, 71.7] for the
       elbow. The probe still "worked" — it just reported a hand 5.3 units
       off the grip it was sitting exactly on. */
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../bodyRig.ts"),
      "utf8"
    );
    const anchor = (name: string) => {
      const m = src.match(
        new RegExp(`${name}: \\[(-?[\\d.]+), (-?[\\d.]+)\\] as Pt`)
      );
      expect(m, `ANT.${name} not found in bodyRig.ts`).toBeTruthy();
      return [Number(m![1]), Number(m![2])];
    };
    expect(anchor("shoulderL")).toEqual(ANT_SHOULDER_L);
    expect(anchor("shoulderR")).toEqual(ANT_SHOULDER_R);
    expect(anchor("elbowL")).toEqual(ANT_ELBOW_L);
    expect(anchor("handL")).toEqual(ANT_HAND_L);
  });

  it("pushdown: capped at the top, locked out at the bottom", () => {
    /* liftmanual gives this one both endpoints as numbers, and the demo
       missed both — top 71 degrees (liftmanual: ~90, "the rope must NOT
       return to full flexion near the shoulders", so 71 IS the fault) and
       bottom 169 rather than a lockout. A pushdown short at both ends is
       a partial with extra steps.

       The elbow-pinned assertion is the third one and it is the headline
       cue ("keep your upper arms completely still — only your forearms
       should move"). It already held; it is asserted anyway, because the
       two range fixes are exactly the kind of change that reaches for the
       upper arm when the forearm alone will not stretch far enough. */
    const at = (t: number) => sideElbow("rope-tricep-pushdown", t);
    expect(at(0), "pushdown top").toBeGreaterThan(80);
    expect(at(0), "pushdown top").toBeLessThan(100);
    expect(at(1), "pushdown lockout").toBeGreaterThan(172);

    const elbowAt = (t: number) => {
      const pose = BODY_DEMOS["rope-tricep-pushdown"].pose(t);
      return applyToPoint(SIDE_ANCHORS.elbow, pose.foreArmL!);
    };
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(elbowAt(t)[0]).toBeCloseTo(SIDE_ANCHORS.elbow[0], 6);
      expect(elbowAt(t)[1]).toBeCloseTo(SIDE_ANCHORS.elbow[1], 6);
    }
  });

  it("strict curl: the elbow does not travel", () => {
    /* The pose swung the upper arm 8 degrees forward at the top, moving
       the elbow 3.5 units, justified in a comment as "the one allowance
       every reference shows". liftmanual is a reference and names elbow
       travel as the curl's defining error — "they should not move forward
       or backward during the lift" — and the demo calls itself a STRICT
       curl, the variant defined by forbidding exactly this.

       Paired with the range check, because deleting the drift would also
       be satisfied by deleting the curl. */
    const elbowAt = (t: number) =>
      applyToPoint(
        SIDE_ANCHORS.elbow,
        BODY_DEMOS["barbell-curl"].pose(t).foreArmL!
      );
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(elbowAt(t)[0], `curl elbow x at t=${t}`).toBeCloseTo(
        SIDE_ANCHORS.elbow[0],
        6
      );
      expect(elbowAt(t)[1], `curl elbow y at t=${t}`).toBeCloseTo(
        SIDE_ANCHORS.elbow[1],
        6
      );
    }
    expect(sideElbow("barbell-curl", 0), "curl start").toBeGreaterThan(170);
    expect(sideElbow("barbell-curl", 1), "curl top").toBeLessThan(60);
  });

  it("lateral raise: a soft elbow that stays soft, hand trailing", () => {
    /* Two liftmanual rules, and the demo broke one while its own comment
       claimed to be enforcing it. The comment said "a constant soft elbow
       bend so the arm never reads hyper-straight"; the rotation was
       signed the wrong way, spending the rest arm's natural 171-degree
       bend to lock the arm out at 179. Nothing measured the elbow, so a
       comment stood in for the property for as long as it existed.

       Both rules are asserted, because they pull in OPPOSITE directions
       here — the sign that softens the elbow is the sign that lifts the
       wrist above it, so a test for either one alone is satisfied by a
       pose that fails the other. That is not hypothetical: it is what the
       first attempt at this fix did. */
    const frames = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const pose = BODY_DEMOS["lateral-raise"].pose(t);
      return {
        t,
        angle: elbowAngle(
          applyToPoint(ANT_SHOULDER_L, pose.upperArmL!),
          applyToPoint(ANT_ELBOW_L, pose.foreArmL!),
          applyToPoint(ANT_HAND_L, pose.foreArmL!)
        ),
        elbow: applyToPoint(ANT_ELBOW_L, pose.foreArmL!),
        hand: applyToPoint(ANT_HAND_L, pose.foreArmL!),
        shoulder: applyToPoint(ANT_SHOULDER_L, pose.upperArmL!),
      };
    });
    for (const f of frames) {
      expect(
        f.angle,
        `elbow at t=${f.t} is ${f.angle.toFixed(0)}deg`
      ).toBeLessThan(170);
      expect(f.angle).toBeGreaterThan(150);
      expect(
        f.hand[1] - f.elbow[1],
        `wrist sits above the elbow at t=${f.t}`
      ).toBeGreaterThan(0);
    }
    // "the SAME slight bend" — constant, not merely present.
    const spread =
      Math.max(...frames.map((f) => f.angle)) -
      Math.min(...frames.map((f) => f.angle));
    expect(spread, "the bend is supposed to be constant").toBeLessThan(1);
    // …and the raise still stops at parallel rather than going overhead.
    const top = frames[frames.length - 1];
    expect(top.elbow[1] - top.shoulder[1]).toBeGreaterThan(0);
    expect(top.elbow[1] - top.shoulder[1]).toBeLessThan(6);
  });

  it("pushdown: the rope's knotted tail travels down to lockout", () => {
    // The tail knob is the LAST circle in the svg (sceneFront renders
    // after the body) — its descent is the extension arc.
    const knobY = (svg: string) => {
      const cs = [...svg.matchAll(/<circle[^>]*cy="(-?[\d.]+)"[^>]*r="2"/g)];
      return Number(cs[cs.length - 1][1]);
    };
    const start = knobY(renderBodyDemo("rope-tricep-pushdown", 0));
    const end = knobY(renderBodyDemo("rope-tricep-pushdown", 1));
    expect(end - start).toBeGreaterThan(20);
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
        [10, 100],
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

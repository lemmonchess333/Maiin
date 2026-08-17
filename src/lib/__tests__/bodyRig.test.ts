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

/* Posterior anchors, mirrored from `bodyRig`'s private `POST` — same
   deal as the anterior set above, pinned by "posterior anchors match". */
const POST_SHOULDER_L: [number, number] = [23, 46];
const POST_SHOULDER_R: [number, number] = [77, 46];
const POST_ELBOW_L: [number, number] = [17, 78];
const POST_HAND_L: [number, number] = [9, 106];
const POST_HAND_R: [number, number] = [91, 106];

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

    // The posterior set, scoped to the POST block so the two cannot
    // shadow each other (both declare `shoulderL`).
    const post = src.slice(src.indexOf("const POST = {"));
    const pAnchor = (name: string) => {
      const m = post.match(
        new RegExp(`${name}: \\[(-?[\\d.]+), (-?[\\d.]+)\\] as Pt`)
      );
      expect(m, `POST.${name} not found in bodyRig.ts`).toBeTruthy();
      return [Number(m![1]), Number(m![2])];
    };
    expect(pAnchor("shoulderL")).toEqual(POST_SHOULDER_L);
    expect(pAnchor("shoulderR")).toEqual(POST_SHOULDER_R);
    expect(pAnchor("elbowL")).toEqual(POST_ELBOW_L);
    expect(pAnchor("handL")).toEqual(POST_HAND_L);
    expect(pAnchor("handR")).toEqual(POST_HAND_R);
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

  it("pulldown: the bar is rigid", () => {
    /* The grips travelled OUTWARD as the bar came down — 75.6 apart at
       full reach, 88.0 at the collarbone. A lat pulldown bar is a steel
       bar and the hands are on it, so that is not a form fault, it is an
       impossible object; and the widening is what made the elbows read as
       flaring when the pose comment says they tuck.

       Nothing was being bought by it either: at the collarbone the
       shoulder-to-hand distance is 11.5 against an arm that folds to 3.5,
       so the reach was never the constraint.

       Asserted on the DRAWN bar as well as the hands, because the two are
       separate code paths and a bar that stretches while the hands hold
       still is the same lie told the other way round. */
    const demo = BODY_DEMOS["lat-pulldown"];
    const spans = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const pose = demo.pose(t);
      const bar = demo.bar!(t, pose);
      return {
        hands: Math.abs(
          applyToPoint(POST_HAND_L, pose.foreArmL!)[0] -
            applyToPoint(POST_HAND_R, pose.foreArmR!)[0]
        ),
        bar: Math.abs(bar![1][0] - bar![0][0]),
      };
    });
    for (const s of spans) {
      expect(s.hands).toBeCloseTo(spans[0].hands, 4);
      expect(s.bar).toBeCloseTo(spans[0].bar, 4);
    }
    // The positive control: it still travels, it just travels vertically.
    const y = (t: number) => demo.bar!(t, demo.pose(t))![0][1];
    expect(y(1) - y(0)).toBeGreaterThan(50);
  });

  it("pull-up: shoulder-width grip, real dead hang, chin over the bar", () => {
    /* Three findings that turned out to be one.

       The grip was 88.0 against a 54.0 shoulder span — 1.63x. liftmanual
       puts roughly shoulder width on its standard Pull-Up page and 1.5x
       on a SEPARATE page, the Wide Grip Pull-Up, so the demo was not a
       slightly-wide pull-up, it was the other exercise. Same defect the
       dip had and from the same cause: a width nothing was holding.

       Narrowing it then EXPOSED the dead hang, which had been passing for
       the wrong reason. At 1.63x the hand sat 17 units lateral of the
       shoulder and the reach to the bar exceeded the arm, so `solveElbow`
       clamped to straight — the hang looked correct because the arm was
       over-extended. Take the offset away and the same pose measures 147
       degrees: a third of a rep already done before the rep starts. The
       drop is now solved so the shoulder sits exactly an arm's length
       from the grip.

       And the top never cleared the bar. liftmanual wants the chin
       "clearly over, not level"; the bar cut through the middle of the
       head, chin 8 units BELOW it. Solved from the head's own geometry
       rather than raised until it looked right. */
    const demo = BODY_DEMOS["pull-ups"];
    const grip = demo.bar!(0, demo.pose(0))!;
    expect(grip, "pull-ups declares no bar").toBeTruthy();

    const handSpan = (t: number) => {
      const pose = demo.pose(t);
      return Math.abs(
        applyToPoint(POST_HAND_L, pose.foreArmL!)[0] -
          applyToPoint(POST_HAND_R, pose.foreArmR!)[0]
      );
    };
    const ratio = handSpan(0) / (POST_SHOULDER_R[0] - POST_SHOULDER_L[0]);
    expect(
      ratio,
      `pull-up grip is ${ratio.toFixed(2)}x shoulder width`
    ).toBeLessThan(1.35);
    expect(ratio).toBeGreaterThan(0.95);
    /* Hands stay on the bar — the pull-up's grip is rigid too. Two
       decimals, not four: the arms reach the bar through composed
       rotations, which leaves ~0.002 of float noise. The defect this
       guards was 12.4 units wide, so 0.01 is still four orders of
       magnitude tighter than it needs to be. */
    expect(handSpan(1)).toBeCloseTo(handSpan(0), 2);

    const elbow = (t: number) => {
      const pose = demo.pose(t);
      return elbowAngle(
        applyToPoint(POST_SHOULDER_L, pose.upperArmL!),
        applyToPoint(POST_ELBOW_L, pose.foreArmL!),
        applyToPoint(POST_HAND_L, pose.foreArmL!)
      );
    };
    expect(elbow(0), "dead hang").toBeGreaterThan(170);
    expect(elbow(1), "top of the pull").toBeLessThan(90);

    // Chin over the bar: the head's lowest drawn vertex clears the bar.
    const headPolys = POSTERIOR.filter((p) => p.muscle === "head").length;
    const chin = (t: number) => {
      const svg = renderBodyDemo("pull-ups", t).replace(
        /<g class="glow">.*?<\/g>/,
        ""
      );
      const polys = [...svg.matchAll(/points="([^"]+)"/g)].map((m) => m[1]);
      return Math.max(
        ...polys.slice(0, headPolys).flatMap((s) =>
          s
            .trim()
            .split(/\s+/)
            .map((q) => Number(q.split(",")[1]))
        )
      );
    };
    const barY = grip[0][1];
    expect(chin(1), "chin does not clear the bar").toBeLessThan(barY);
    // …and the bottom is still a hang, not a permanent chin-up.
    expect(chin(0)).toBeGreaterThan(barY + 20);
  });

  it("pull-up chin reference matches the model it mirrors", () => {
    /* `PULLUP_CHIN_REST_Y` is a measurement of the posterior head polygon
       copied into `bodyRig`, which does not otherwise read the model
       geometry. Same mirror-drift shape as the anterior anchors: if the
       head art is ever redrawn, the chin solve would keep aiming at a jaw
       line that no longer exists and the test above would still pass,
       because it checks the DRAWN chin against the same stale target. */
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../bodyRig.ts"),
      "utf8"
    );
    const declared = Number(
      src.match(/const PULLUP_CHIN_REST_Y = ([\d.]+);/)![1]
    );
    const actual = Math.max(
      ...POSTERIOR.filter((p) => p.muscle === "head").flatMap((p) =>
        p.points.map((q) => q[1])
      )
    );
    expect(declared).toBeCloseTo(actual, 0);
  });

  it("press and row reach a real arm's length at their straight end", () => {
    /* Two demos set the shoulder-to-hand distance by eye and both landed
       short of the arm: the bench "locked out" at 134 degrees and the
       row's "dead hang" started at 130 — a fifth of the pull already done
       before the pull. Neither looks wrong, and that is the point. Near
       full extension the elbow angle is brutally sensitive to reach, so 5
       units of shortfall reads as a straight arm; both are now derived
       from SIDE_ARM_REACH rather than guessed at.

       Each is asserted at BOTH ends. A lockout check alone is satisfied
       by a demo that never leaves lockout. */
    expect(sideElbow("bench-press", 1), "bench lockout").toBeGreaterThan(168);
    expect(sideElbow("bench-press", 0), "bench bottom").toBeLessThan(100);
    expect(sideElbow("barbell-row", 0), "row dead hang").toBeGreaterThan(168);
    expect(sideElbow("barbell-row", 1), "row finish").toBeLessThan(80);
  });

  it("the bent-over row draws its whole figure inside its frame", () => {
    /* The hinged head's crown sat 5 units above the top of the viewBox,
       so every frame of this demo rendered a clipped skull. Pre-existing
       and unrelated to the hang fix — it surfaced from measuring the
       bounding box while checking that fix had not pushed anything out of
       frame, which is the check worth keeping. */
    const [vx, vy, vw, vh] = BODY_DEMOS["barbell-row"]
      .viewBox!.split(" ")
      .map(Number);
    for (const t of [0, 0.5, 1]) {
      const svg = renderBodyDemo("barbell-row", t).replace(
        /<g class="glow">.*?<\/g>/,
        ""
      );
      const pts = [...svg.matchAll(/points="([^"]+)"/g)].flatMap((m) =>
        m[1]
          .trim()
          .split(/\s+/)
          .map((q) => q.split(",").map(Number))
      );
      expect(
        Math.min(...pts.map((p) => p[1])),
        `top clipped at t=${t}`
      ).toBeGreaterThanOrEqual(vy);
      expect(Math.max(...pts.map((p) => p[1]))).toBeLessThanOrEqual(vy + vh);
      expect(Math.min(...pts.map((p) => p[0]))).toBeGreaterThanOrEqual(vx);
      expect(Math.max(...pts.map((p) => p[0]))).toBeLessThanOrEqual(vx + vw);
    }
  });

  it("the push-up top is a lockout, and is not faked by the clamp", () => {
    /* Third of the straight-end family, and the one whose knob is least
       obvious. The top sat at 145 degrees — shoulder 52.5 from the
       planted hand against a 55.07 arm.

       The plank incline CANNOT fix it, which is the part worth keeping:
       `PUSHUP_TILT` rotates the body about the planted HAND, and a
       rotation about a point cannot change the distance from that point
       to the shoulder. Swept -13 to -19 it left the reach at exactly
       52.51 and moved only the toes. The toe-pivot rotation is the only
       one that raises the shoulder while leaving the hand plant alone.

       The reach assertion is the real content. A straight-LOOKING arm is
       cheap: ask for more reach than the arm has and `solveElbow` clamps,
       drawing a straight arm the geometry never earned — which is exactly
       how the pull-up dead hang passed while over-extended. So this pins
       the reach strictly BELOW the clamp as well as the angle above 168.
       Both, or neither means anything. */
    expect(sideElbow("push-ups", 0), "push-up top").toBeGreaterThan(168);
    expect(sideElbow("push-ups", 1), "push-up bottom").toBeLessThan(90);

    const pose = BODY_DEMOS["push-ups"].pose(0);
    const S = applyToPoint(SIDE_ANCHORS.shoulder, pose.upperArmL!);
    const H = applyToPoint(SIDE_ANCHORS.hand, pose.foreArmL!);
    const reach = Math.hypot(S[0] - H[0], S[1] - H[1]);
    // 0.999 is `solveElbow`'s own ceiling factor; read from source so a
    // change to it fails here rather than quietly widening the gate.
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../bodyRig.ts"),
      "utf8"
    );
    const ceiling = Number(
      src.match(/const max = \(L1 \+ L2\) \* ([\d.]+);/)![1]
    );
    const seg = (a: [number, number], b: [number, number]) =>
      Math.hypot(a[0] - b[0], a[1] - b[1]);
    const armMax =
      (seg(SIDE_ANCHORS.elbow, SIDE_ANCHORS.shoulder) +
        seg(SIDE_ANCHORS.hand, SIDE_ANCHORS.elbow)) *
      ceiling;
    expect(
      reach,
      `reach ${reach.toFixed(2)} is sitting on the IK clamp (${armMax.toFixed(2)})`
    ).toBeLessThan(armMax);

    /* And the hand stays where it is planted, in every frame.
       `PUSHUP_TILT` is applied by the pose and UN-applied by the inverse
       chain that maps the plant back into standing space, so the two must
       stay exact negatives. Nothing held that: desyncing them to -19/+13
       left all the other assertions green while the hand slid off its
       plant, because reach is measured between two points the same body
       transform carries. This is the one that notices. */
    const plant = (t: number) =>
      applyToPoint(SIDE_ANCHORS.hand, BODY_DEMOS["push-ups"].pose(t).foreArmL!);
    const first = plant(0);
    for (const t of [0.25, 0.5, 0.75, 1]) {
      expect(plant(t)[0], `hand slid in x at t=${t}`).toBeCloseTo(first[0], 3);
      expect(plant(t)[1], `hand slid in y at t=${t}`).toBeCloseTo(first[1], 3);
    }
    // …and it is planted where the demo says the floor is.
    const floor = BODY_DEMOS["push-ups"].groundY!;
    expect(Math.abs(first[1] - floor)).toBeLessThan(3);
  });

  it("push-up plants its PALM, not its wrist", () => {
    /* The hand was the only piece crossing the drawn floor — 5.8 units
       through it at the top, easing to 3.3 at the bottom. The VARYING
       depth is what identifies the cause: a merely mis-placed plant is
       off by a constant, so something had to be rotating. It was the
       hand, riding `arm.fore` and swinging with the forearm.

       A push-up hand is flat on the floor for the whole rep; the wrist
       angle is what changes. And the plant has to be measured on the
       hand OUTLINE, because `PUSHUP_HAND` is the wrist anchor and the
       piece overhangs it — aiming the wrist at the floor buries the palm.
       Same fix-class as a barbell grip: the contact point is where the
       body meets the world, never the joint above it.

       Asserted on the drawn geometry rather than an anchor, since an
       anchor is precisely what was wrong. */
    const outline = SIDE_PIECES.find((p) => p.group === "handL")!.outline as [
      number,
      number,
    ][];
    const floor = BODY_DEMOS["push-ups"].groundY!;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const ops = BODY_DEMOS["push-ups"].pose(t).handL!;
      const lowest = Math.max(...outline.map((q) => applyToPoint(q, ops)[1]));
      expect(
        lowest - floor,
        `palm is ${(lowest - floor).toFixed(2)} off the floor at t=${t}`
      ).toBeCloseTo(0, 6);
    }

    /* And the constant bodyRig seats it against is the demo's own floor.
       They are declared separately, so nothing but this stops the plant
       from being solved onto a line the scene does not draw. */
    const src = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../bodyRig.ts"),
      "utf8"
    );
    expect(Number(src.match(/const PUSHUP_GROUND = ([\d.]+);/)![1])).toBe(
      floor
    );
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

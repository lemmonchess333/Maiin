import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  applyToPoint,
  BODY_DEMOS,
  getBodyDemo,
  renderBodyDemo,
  type Op,
} from "../bodyRig";
import { ANTERIOR, POSTERIOR } from "../bodyModelData";
import { SIDE_ANCHORS, SIDE_PIECES } from "../bodySideData";

function polyYs(svg: string): number[] {
  // Body shapes render as rounded <path> since the anatomy pass; gear
  // may still use <polygon points>. Harvest y from both.
  const fromPolys = [...svg.matchAll(/points="([^"]+)"/g)]
    .flatMap((m) => m[1].trim().split(" "))
    .map((pair) => Number(pair.split(",")[1]));
  const fromPaths = [...svg.matchAll(/d="([^"]+)"/g)]
    .flatMap((m) => [...m[1].matchAll(/[-\d.]+,([-\d.]+)/g)])
    .map((m) => Number(m[1]));
  return [...fromPolys, ...fromPaths];
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
    const svg = renderBodyDemo("overhead-press", 0);
    // The head's top vertex sits at y≈2.2 when nothing moved — the
    // model's y≈0 plus the static HEAD_SETTLE that seats the skull on
    // the trap line.
    const ys = polyYs(svg);
    expect(Math.min(...ys)).toBeGreaterThan(1.5);
    expect(Math.min(...ys)).toBeLessThan(3);
    const body = svg.replace(/<g class="glow">.*?<\/g>/, "");
    // Mosaic style (pass 10): one crisp rounded <path> per shape —
    // 33 body polys + 2 feet + 2 hands. Joint sleeves are <line>s.
    expect(body.match(/<path/g)!.length).toBe(37);
  });

  it("posterior renders the same single-pass mosaic, heels included", () => {
    const post = renderBodyDemo("pull-ups", 0).replace(
      /<g class="glow">.*?<\/g>/,
      ""
    );
    // 33 body polys + 2 hands + 2 heel blocks (the back-view art
    // tapers the soleus to a needle, so the heels cap the legs) + the
    // fascia/sacrum wedge (posterior part-fit round).
    expect(post.match(/<path/g)!.length).toBe(38);
  });

  it("joint sleeves bridge elbows, shoulders and knees (no ball caps)", () => {
    // A sleeve is a round-capped line spanning a joint — the "real arms
    // instead of balls" mechanism. Both views carry elbow + shoulder +
    // forearm-axis + knee pairs. Counted colour-agnostically: sleeves
    // over a TINTED muscle now take that muscle's colour (below).
    // Sleeve palette only — gear (bars, posts) also draws round-capped
    // lines, in the GEAR greys.
    const count = (svg: string) =>
      (
        svg.match(
          /<line[^>]*stroke="(?:#B6BDC3|#7B72E9|#9590E0)"[^>]*stroke-linecap="round"/g
        ) ?? []
      ).length;
    expect(count(renderBodyDemo("overhead-press", 0))).toBe(8); // +2 wrist welds
    // Posterior gained knee sleeves in the posterior part-fit round.
    expect(count(renderBodyDemo("pull-ups", 0))).toBe(8);
    expect(
      renderBodyDemo("overhead-press", 0).includes('<circle fill="#B6BDC3"')
    ).toBe(false);
  });

  it("a sleeve over a tinted muscle takes that muscle's colour", () => {
    /* The layover defect (owner device feedback 2026-08-16: muscles
       "misaligned like on the arms"): a sleeve only shows through the
       gaps BETWEEN muscle blocks, so a grey capsule under a tinted
       muscle drew a grey stripe cutting the working muscle in half —
       worst on the posterior forearm, which is two thin blades with
       the capsule between them. Pull-ups tint the forearm, so its
       forearm-axis sleeves must carry the secondary purple; its
       deltoids are untinted, so those sleeves stay body grey. */
    const svg = renderBodyDemo("pull-ups", 0);
    const strokes = [
      ...svg.matchAll(/<line[^>]*stroke="(#[0-9A-Fa-f]{6})"[^>]*stroke-linecap="round"/g),
    ].map((m) => m[1].toUpperCase());
    expect(strokes.filter((s) => s === "#9590E0").length).toBe(2); // forearms
    expect(strokes.filter((s) => s === "#B6BDC3").length).toBe(6); // the rest
    // And an untinted-forearm demo keeps every sleeve grey.
    const press = renderBodyDemo("overhead-press", 0);
    expect(press.includes('stroke="#9590E0"')).toBe(false);
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
    const svg = renderBodyDemo("overhead-press", 0).replace(
      /<g class="glow">.*?<\/g>/,
      ""
    );
    // Shaded fills tone the base hex, so identify PRIMARY facets by
    // their opacity step (0.72+0.28·effort = 1.000 at default effort;
    // secondaries land at 0.900) — the honest-fill claim is that exactly
    // the front-deltoid polygons carry the primary level.
    const primary = (svg.match(/fill-opacity="1\.000"/g) || []).length;
    const deltPolys = ANTERIOR.filter(
      (p) => p.muscle === "front-deltoids"
    ).length;
    expect(primary).toBe(deltPolys); // primary tint = front deltoids only
    // Library body grey everywhere else (tone() emits lowercase hex —
    // the zero shade step reproduces BODY exactly).
    expect(svg.toLowerCase().includes("#b6bdc3")).toBe(true);
  });

  it("primary muscles carry a glow aura that breathes with effort", () => {
    const glowOf = (svg: string) => svg.match(/<g class="glow">(.*?)<\/g>/)![1];
    const soft = glowOf(renderBodyDemo("lateral-raise", 0.5, 0));
    const hard = glowOf(renderBodyDemo("lateral-raise", 0.5, 1));
    expect(hard.length).toBeGreaterThan(0);
    const firstOpacity = (g: string) =>
      Number(g.match(/opacity="([\d.]+)"/)![1]);
    expect(firstOpacity(hard)).toBeGreaterThan(firstOpacity(soft));
    // Two front deltoids → two hulls × three rings.
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

  it("every demo moves smoothly — no joint snaps at the extremes", () => {
    /* Owner feedback 2026-08-16 ("non smooth movement"). The two-bone
       IK's elbow offset is sqrt(L1² − a²), which reaches zero with
       INFINITE slope at full arm extension, so the old hard reach
       clamp snapped the elbow the moment a hand crossed the reachable
       boundary — exactly where these demos straighten the arm (pull-up
       dead hang, pulldown overhead start, press lockout). Measured on
       the pull-up elbow, the hard clamp peaked at 0.298 units/step²
       against the soft clamp's 0.008.

       This walks EVERY demo at 200 steps through the real eased clock
       and bounds the second difference of each tracked joint. It is an
       absolute bound, not a ratio: a pinned hand has ~zero median
       velocity, so a ratio there divides by nothing and reports
       nonsense. */
    const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
    const N = 200;
    const worst: Record<string, number> = {};
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      const probes: [string, [number, number]][] =
        d.view === "side"
          ? [
              ["handL", SIDE_ANCHORS.hand],
              ["foreArmL", SIDE_ANCHORS.elbow],
              ["thighL", SIDE_ANCHORS.knee],
              ["torso", SIDE_ANCHORS.shoulder],
            ]
          : d.view === "anterior"
            ? [
                ["foreArmL", [5.1, 97.7]],
                ["upperArmL", [18.8, 71.7]],
                ["torso", [24, 48]],
              ]
            : [
                ["foreArmL", [5.8, 103.8]],
                ["upperArmL", [18, 78.7]],
                ["torso", [23, 46]],
              ];
      let mx = 0;
      for (const [g, anchor] of probes) {
        const pos = Array.from({ length: N + 1 }, (_, i) =>
          applyToPoint(
            anchor,
            (d.pose(ease(i / N)) as Record<string, never[]>)[g] ?? []
          )
        );
        const vel = pos
          .slice(1)
          .map((p, i) => Math.hypot(p[0] - pos[i][0], p[1] - pos[i][1]));
        for (let i = 1; i < vel.length; i++)
          mx = Math.max(mx, Math.abs(vel[i] - vel[i - 1]));
      }
      worst[id] = mx;
    }
    for (const [id, mx] of Object.entries(worst)) {
      expect(mx, `${id} jerk`).toBeLessThan(0.05);
    }
  });

  it("deadlift: the bar runs a straight vertical line over midfoot", () => {
    /* Bar-path audit 2026-08-16. The hand used to be offset from the
       SHOULDER, so the hinging torso dragged the bar forward with it:
       measured 11.6 units of forward drift, finishing 17-20 units past
       midfoot — out beyond the toes, un-liftable. Every reference is
       specific and unanimous (ExRx, Stronglifts, PowerliftingTechnique,
       Barbell Logic): a straight vertical line over the middle of the
       foot, an inch off the shin. */
    const d = BODY_DEMOS["deadlift"];
    const xs = [0, 0.25, 0.5, 0.75, 1].map(
      (t) => d.bar!(t, d.pose(t))![0][0]
    );
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
    // …and the shoulders end up slightly IN FRONT of it, which is the
    // documented setup position (it falls out of the geometry now
    // rather than being posed).
    const S = applyToPoint(
      SIDE_ANCHORS.shoulder,
      (BODY_DEMOS["deadlift"].pose(1).torso ?? []) as never[]
    );
    expect(S[0]).toBeGreaterThan(Math.max(...xs));
  });

  it("no demo clips its own canvas", () => {
    /* Framing audit 2026-08-16. Each demo locks its own camera, but
       nothing ever checked the figure FITS in it: the barbell row was
       slicing 13.9 units off the top of the head, and the calf raise
       clipped the crown at the top of the rise plus its floor line on
       the right. Both went unnoticed because the contact sheets are
       rendered from the same viewBox that does the clipping — the
       frame looks intentional. */
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      const [vx, vy, vw, vh] = (
        d.viewBox ??
        (d.view === "anterior" ? "-8 -14 116 224" : "-12 -14 124 244")
      )
        .split(/\s+/)
        .map(Number);
      for (const t of [0, 0.5, 1]) {
        const svg = renderBodyDemo(id, t, 1).replace(
          /<g class="glow">.*?<\/g>/,
          ""
        );
        const ys = polyYs(svg);
        const xs = [...svg.matchAll(/points="([^"]+)"/g)]
          .flatMap((m) => m[1].trim().split(/\s+/))
          .map((p) => Number(p.split(",")[0]))
          .concat(
            [...svg.matchAll(/ d="([^"]+)"/g)].flatMap((m) =>
              [...m[1].matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((p) =>
                Number(p[1])
              )
            )
          )
          .filter(Number.isFinite);
        expect(Math.min(...ys), `${id}@${t} top`).toBeGreaterThan(vy - 0.5);
        expect(Math.max(...ys), `${id}@${t} bottom`).toBeLessThan(
          vy + vh + 0.5
        );
        expect(Math.min(...xs), `${id}@${t} left`).toBeGreaterThan(vx - 0.5);
        expect(Math.max(...xs), `${id}@${t} right`).toBeLessThan(
          vx + vw + 0.5
        );
      }
    }
  });

  it("no demo clips its EQUIPMENT off its own canvas either", () => {
    /* The clipping test above reads `points=` and `d=` — polygons and
       paths, i.e. the BODY. Every implement is drawn as `<line>`,
       `<circle>` or `<rect>`, so none of it has ever been checked: the
       deadlift's r=26 plate, every cable, every dip-station upright and
       every dumbbell bell were all invisible to the guard that exists to
       catch exactly this.

       Found while adding the trap bar's frame rail, which sticks out 10
       units past a 16-unit disc on BOTH sides and would have been the
       widest thing in that demo with nothing watching it.

       THE ONE STRUCTURAL EXEMPTION: equipment the figure hangs FROM
       (`fixed-bar`, `cable-bar`) is anchored above the frame and is
       supposed to meet the top edge — a pull-up bar flush with the top
       reads as continuing up to a ceiling, which is right. So the top
       edge is exempt for those two kinds and only those two. Exempting
       by KIND rather than by demo id is deliberate: an id list would let
       a new pull-up variant clip silently, and this session already had
       one scale exemption that had to be re-derived structurally for the
       same reason. */
    const HANGS_FROM: string[] = ["fixed-bar", "cable-bar"];
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      const [vx, vy, vw, vh] = (
        d.viewBox ??
        (d.view === "anterior" ? "-8 -14 116 224" : "-12 -14 124 244")
      )
        .split(/\s+/)
        .map(Number);
      const topExempt = HANGS_FROM.includes(d.equip ?? "");
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const svg = renderBodyDemo(id, t, 1).replace(
          /<g class="glow">.*?<\/g>/,
          ""
        );
        const xs: number[] = [];
        const ys: number[] = [];
        // Strokes are centred on their geometry, so half the width spills
        // either side — the part a naive endpoint check would miss.
        for (const m of svg.matchAll(
          /<line[^>]*x1="(-?[\d.]+)"[^>]*y1="(-?[\d.]+)"[^>]*x2="(-?[\d.]+)"[^>]*y2="(-?[\d.]+)"[^>]*stroke-width="(-?[\d.]+)"/g
        )) {
          const w = Number(m[5]) / 2;
          xs.push(Number(m[1]) - w, Number(m[3]) + w);
          ys.push(Number(m[2]) - w, Number(m[4]) + w);
        }
        for (const m of svg.matchAll(
          /<circle[^>]*cx="(-?[\d.]+)"[^>]*cy="(-?[\d.]+)"[^>]*r="(-?[\d.]+)"/g
        )) {
          const [cx, cy, r] = [Number(m[1]), Number(m[2]), Number(m[3])];
          xs.push(cx - r, cx + r);
          ys.push(cy - r, cy + r);
        }
        for (const m of svg.matchAll(
          /<rect[^>]*x="(-?[\d.]+)"[^>]*y="(-?[\d.]+)"[^>]*width="(-?[\d.]+)"[^>]*height="(-?[\d.]+)"/g
        )) {
          const [x, y, w, h] = [
            Number(m[1]),
            Number(m[2]),
            Number(m[3]),
            Number(m[4]),
          ];
          xs.push(x, x + w);
          ys.push(y, y + h);
        }
        if (!xs.length) continue;
        expect(Math.min(...xs), `${id}@${t} equipment left`).toBeGreaterThan(
          vx - 0.5
        );
        expect(Math.max(...xs), `${id}@${t} equipment right`).toBeLessThan(
          vx + vw + 0.5
        );
        if (!topExempt) {
          expect(Math.min(...ys), `${id}@${t} equipment top`).toBeGreaterThan(
            vy - 0.5
          );
        }
        expect(Math.max(...ys), `${id}@${t} equipment bottom`).toBeLessThan(
          vy + vh + 0.5
        );
      }
    }
  });

  it("the trap bar is distinguishable from a straight-bar deadlift", () => {
    /* Before the frame rail these two differed only by torso angle and
       hand position — a viewer saw a slightly different deadlift with no
       way to know why. The rail is the identity: you are standing INSIDE
       the implement.

       Asserted as GEOMETRY, not as the presence of a `<line>`: the rail
       must be horizontal (a hex frame is a plan-view shape and collapses
       to a horizontal segment in profile — a tilted one would be drawing
       the hexagon standing on edge), and it must clear the disc on BOTH
       sides, because a rail that only emerges forward is the collar stub
       every other plate-end demo already has. */
    const svg = renderBodyDemo("trap-bar-deadlift", 0.5, 1);
    const disc = [
      ...svg.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="16"/g),
    ][0];
    expect(disc, "trap bar disc not found").toBeTruthy();
    const [cx, cy] = [Number(disc![1]), Number(disc![2])];

    const rails = [
      ...svg.matchAll(
        /<line x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"[^>]*stroke-width="5.2"/g
      ),
    ];
    expect(rails.length, "frame rail not drawn").toBe(1);
    const [x1, y1, x2, y2] = rails[0].slice(1, 5).map(Number);

    expect(Math.abs(y1 - y2), "rail is not horizontal").toBeLessThan(0.01);
    expect(Math.abs(y1 - cy), "rail is off the disc centre").toBeLessThan(0.6);
    expect(cx - Math.min(x1, x2), "rail does not clear the disc aft").toBeGreaterThan(16);
    expect(Math.max(x1, x2) - cx, "rail does not clear the disc fore").toBeGreaterThan(16);

    // And the straight-bar deadlift must NOT have grown one.
    const dl = renderBodyDemo("deadlift", 0.5, 1);
    expect(dl).not.toMatch(/stroke-width="5.2"/);
  });

  /* ── Limb integrity ────────────────────────────────────────────────
     Two invariants nothing measured, both about whether the figure holds
     together as a BODY rather than as a pile of independently-posed
     polygons. Both currently hold across every side demo; they are pinned
     because the rig is one refactor away from breaking either.

     They are not hypothetical properties. The original report that started
     this arc was "arms still look wrong... they look like there in two
     section" — which is what a joint gap and a stretched segment both look
     like to a viewer, and neither had a guard. */

  const JOINTS: [string, string, keyof typeof SIDE_ANCHORS][] = [
    ["torso", "upperArmL", "shoulder"],
    ["torso", "upperArmR", "shoulder"],
    ["upperArmL", "foreArmL", "elbow"],
    ["upperArmR", "foreArmR", "elbow"],
    ["foreArmL", "handL", "hand"],
    ["foreArmR", "handR", "hand"],
    ["pelvis", "thighL", "hip"],
    ["pelvis", "thighR", "hip"],
    ["thighL", "shankL", "knee"],
    ["thighR", "shankR", "knee"],
    ["shankL", "footL", "ankle"],
    ["shankR", "footR", "ankle"],
  ];

  it("every limb stays attached at its joints", () => {
    /* A joint is one point shared by two groups. Each group carries its
       own op chain, so the shared anchor must land in the SAME place under
       both — otherwise the limb visibly separates.

       This holds by construction while every child chain is built as
       `[...parentOps, ownRotation]`, and that is exactly the construction
       a convenience helper can quietly abandon: `hangingArmTo` already
       builds an arm from an IK solve rather than from the torso chain, and
       gets this right. The next one might not. */
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      if (d.view !== "side") continue;
      for (let i = 0; i <= 10; i++) {
        const pose = d.pose(i / 10) as Record<string, Op[] | undefined>;
        for (const [a, b, anchor] of JOINTS) {
          const oa = pose[a];
          const ob = pose[b];
          if (!oa || !ob) continue;
          const P = SIDE_ANCHORS[anchor];
          const A = applyToPoint(P, oa);
          const B = applyToPoint(P, ob);
          const gap = Math.hypot(A[0] - B[0], A[1] - B[1]);
          expect(gap, `${id}@${i / 10} ${a}/${b} separated at ${anchor}`)
            .toBeLessThan(0.5);
        }
      }
    }
  });

  const SEGMENTS: [string, keyof typeof SIDE_ANCHORS, keyof typeof SIDE_ANCHORS][] =
    [
      ["upperArmL", "shoulder", "elbow"],
      ["upperArmR", "shoulder", "elbow"],
      ["foreArmL", "elbow", "hand"],
      ["foreArmR", "elbow", "hand"],
      ["thighL", "hip", "knee"],
      ["thighR", "hip", "knee"],
      ["shankL", "knee", "ankle"],
      ["shankR", "knee", "ankle"],
      ["torso", "hip", "shoulder"],
    ];

  it("foreshortening is used ONLY where it is justified", () => {
    /* THIS TEST HAD TO BE REWRITTEN, and the first version is worth
       recording because it looked completely convincing.

       It asserted "a bone only changes length if it declares a scaleAxis
       or scaleY". That is a TAUTOLOGY: the Op union is rotate, translate,
       scaleY and scaleAxis, and the first two are rigid — so a group
       without a scale op cannot change length no matter what anyone does
       to it. The assertion could never fail, and a mutation run is what
       said so, not a re-read.

       Same shape as the `moveRunDay` refusal tests and PR #1775's accept
       fixture, both already in CLAUDE.md: an assertion whose expected
       value is guaranteed by the code path it is testing pins consistency,
       not behaviour.

       The real risk is the opposite one. `scaleAxis` is a CHEAT — it fakes
       out-of-plane projection in 2D — and cheats spread. So the ratchet is
       on WHICH bones take it: the set is pinned, and adding one is a
       decision someone has to come back here and make on purpose.

       Currently exactly two, both on the back squat's left arm and both
       correct: a high-bar grip abducts the elbow behind the torso, so in a
       strict side view both bones point largely away from the camera. The
       magnitudes are computed from the target geometry (`ku`, `kf`), never
       dialled in by eye. Every other bone in every other side demo is
       rigid, which is what the count below locks. */
    const foreshortened = new Set<string>();
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      if (d.view !== "side") continue;
      for (const [g] of SEGMENTS) {
        for (let i = 0; i <= 10; i++) {
          const ops = (d.pose(i / 10) as Record<string, Op[] | undefined>)[g];
          if (!ops) continue;
          if (ops.some((o) => o.kind === "scaleAxis" || o.kind === "scaleY"))
            foreshortened.add(`${id}/${g}`);
        }
      }
    }
    expect([...foreshortened].sort()).toEqual([
      "squat/foreArmL",
      "squat/upperArmL",
    ]);
  });

  it("the foreshortening that IS used is a real projection, not a nudge", () => {
    /* The paired positive. Pinning the set alone would still pass if the
       squat's scaleAxis were reduced to k≈1 — the cheat would be declared
       and doing nothing, and the arm would fan back into the stack of
       slats this rebuild removed. So assert it actually shortens, hard:
       both bones project under 60% of rest. */
    for (const [g, a, b] of SEGMENTS) {
      if (g !== "upperArmL" && g !== "foreArmL") continue;
      const ops = (BODY_DEMOS["squat"].pose(0.5) as Record<string, Op[]>)[g];
      const rest = Math.hypot(
        SIDE_ANCHORS[a][0] - SIDE_ANCHORS[b][0],
        SIDE_ANCHORS[a][1] - SIDE_ANCHORS[b][1]
      );
      const A = applyToPoint(SIDE_ANCHORS[a], ops);
      const B = applyToPoint(SIDE_ANCHORS[b], ops);
      const len = Math.hypot(A[0] - B[0], A[1] - B[1]);
      expect(len / rest, `squat ${g} barely foreshortens`).toBeLessThan(0.6);
      expect(len / rest, `squat ${g} collapsed to nothing`).toBeGreaterThan(0.3);
    }
  });

  it("a foreshortened bone holds its projection through the rep", () => {
    /* The other half, and the one that would actually be VISIBLE: a
       foreshortening that changes frame to frame is a limb pumping in and
       out of the screen while the lifter squats.

       The squat solves its projection ONCE at rest and lets bar and arm
       both ride `torsoOps`, so the grip stays registered by construction —
       this asserts that stays true. A pose that recomputed `ku`/`kf` per
       frame from a moving elbow would satisfy every other test in this
       file and look wrong immediately. */
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      if (d.view !== "side") continue;
      for (const [g, a, b] of SEGMENTS) {
        const lens: number[] = [];
        for (let i = 0; i <= 10; i++) {
          const ops = (d.pose(i / 10) as Record<string, Op[] | undefined>)[g];
          if (!ops) continue;
          if (!ops.some((o) => o.kind === "scaleAxis" || o.kind === "scaleY"))
            continue;
          const A = applyToPoint(SIDE_ANCHORS[a], ops);
          const B = applyToPoint(SIDE_ANCHORS[b], ops);
          lens.push(Math.hypot(A[0] - B[0], A[1] - B[1]));
        }
        if (lens.length < 2) continue;
        const spread = Math.max(...lens) - Math.min(...lens);
        expect(spread, `${id} ${g} foreshortening breathes by ${spread.toFixed(2)}`)
          .toBeLessThan(0.5);
      }
    }
  });

  it("a front or back camera is only used where the movement needs one", () => {
    /* THE CAMERA-PLANE RULE, which until now lived only in prose.

       It was set by the owner mid-session, on a squat that had been built
       as a front view: "if this is the animation squatting, it should be
       from a side angle not a front, revisit how you have done all the
       front and side angle stuff as well". A squat is a sagittal movement,
       and from the front you cannot see the one thing the demo exists to
       teach — hip depth and the path of the bar.

       So: a non-side camera has to EARN itself, and the evidence is that
       the movement actually changes the figure's silhouette WIDTH. A
       frontal-plane movement spreads and closes; a sagittal one drawn from
       the front just goes up and down while the outline sits still.

       Measured across all five, and all five pass, which is the useful
       part — this started as a suspicion that overhead-press and dips were
       mis-cameraed like the squat had been, and the numbers said otherwise:

         lateral-raise  73.3   arms sweep to full span
         lat-pulldown   43.6   elbows drive down and in
         pull-ups       29.8   same, bodyweight
         overhead-press 21.5   elbows track IN under the bar — the form cue
         dips           11.9   arms move against a descending torso

       A front-view squat would sit near zero: the arms are fixed on the
       bar and the stance does not change. The floor is 8, which clears
       dips by half its margin and would not save that squat.

       SCOPE, from mutation testing: this fires on an AUTHORED front-view
       demo whose movement has no frontal content, which is the real
       failure mode. It does NOT fire on merely flipping an existing side
       demo's `view` flag — that produces an incoherent hybrid (side pose
       ops driving the anterior model) whose silhouette thrashes wide
       enough to pass. That case is caught by the foreshortening-set and
       squat-mechanics tests instead, so it is covered; just not here. */
    const MIN_WIDTH_CHANGE = 8;
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      const view = d.view ?? "anterior";
      if (view === "side") continue;
      const widths: number[] = [];
      for (let i = 0; i <= 10; i++) {
        const svg = renderBodyDemo(id, i / 10, 1).replace(
          /<g class="glow">.*?<\/g>/,
          ""
        );
        const xs = [...svg.matchAll(/points="([^"]+)"/g)]
          .flatMap((m) => m[1].trim().split(/\s+/))
          .map((q) => Number(q.split(",")[0]))
          .concat(
            [...svg.matchAll(/ d="([^"]+)"/g)].flatMap((m) =>
              [...m[1].matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((q) =>
                Number(q[1])
              )
            )
          )
          .filter(Number.isFinite);
        widths.push(Math.max(...xs) - Math.min(...xs));
      }
      const change = Math.max(...widths) - Math.min(...widths);
      expect(
        change,
        `${id} uses a ${view} camera but its silhouette barely changes width (${change.toFixed(1)}) — is this a sagittal movement facing the wrong way?`
      ).toBeGreaterThan(MIN_WIDTH_CHANGE);
    }
  });

  /* KNOWN GAP, stated rather than left to be discovered: the two limb-
     integrity tests above cover SIDE demos only. The anterior and
     posterior rigs anchor against their own measured joint tables, which
     are module-private, and exporting them purely for a test would be
     changing the module to suit the test. The five front/back demos
     therefore have camera and canvas coverage but no joint-gap or
     bone-length coverage. */

  it("the figure renders as ONE connected body, in every view", () => {
    /* The complaint that opened this arc, measured directly: "arms still
       look wrong... they look like there in two section". A limb that
       detaches does not just move wrong — the drawing stops being a body
       and becomes a pile of parts.

       Deliberately measured from RENDERED OUTPUT, not from pose ops. The
       joint-continuity test above works on anchors and therefore only
       covers side demos, because the anterior and posterior rigs anchor
       against module-private tables. This one needs nothing private: it
       takes the drawn shapes, links any two that come within `eps`, and
       counts connected components. One body, one component. It closes the
       gap that test had to leave open.

       THE THRESHOLD IS PER VIEW, because the two rigs are built
       differently and the measurement says so plainly:

         side demos          worst gap to bridge 0.73
         anterior/posterior  worst gap to bridge 3.37

       The side pieces are constructed from contours and very nearly
       touch. The front and back rigs are an écorché MOSAIC — separate
       muscle shapes with dark ground between them, which is the intended
       look and not a defect. A single threshold would either flag the art
       or go slack on the side demos, so each view gets one sized to its
       own construction with roughly 1.3-1.6 units of headroom.

       MEASURED SENSITIVITY, not assumed: sliding a front-view forearm off
       its elbow fails this at 5 units — a displacement the anchor test
       above cannot see at all, because it has no anchor table for that
       rig. On SIDE demos it is the less sensitive of the two (broad
       overlapping muscle shapes stay in contact through a few units of
       slide), and that is fine: there the anchor test catches 0.5. The two
       are complementary rather than redundant, which is the only reason
       both exist.

       Getting that number cost two inert mutations first. Injecting
       `foreArmL` at the head of a pose's returned object literal does
       nothing when the pose declares its own `foreArmL` further down — the
       later key wins, the mutant is a no-op, and the test "passing" looked
       exactly like the test being weak. A mutation that does not change
       behaviour proves nothing about the assertion; check the mutant
       landed before concluding anything from it. */
    const EPS: Record<string, number> = {
      side: 2.0,
      anterior: 5.0,
      posterior: 5.0,
    };

    type Shape = { pts: [number, number][]; x0: number; y0: number; x1: number; y1: number };
    const shapesOf = (svg: string): Shape[] => {
      const raw: [number, number][][] = [];
      for (const m of svg.matchAll(/points="([^"]+)"/g)) {
        const pts = m[1]
          .trim()
          .split(/\s+/)
          .map((q) => q.split(",").map(Number) as [number, number])
          .filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]));
        if (pts.length) raw.push(pts);
      }
      for (const m of svg.matchAll(/ d="([^"]+)"/g)) {
        const pts = [...m[1].matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(
          (q) => [Number(q[1]), Number(q[2])] as [number, number]
        );
        if (pts.length) raw.push(pts);
      }
      return raw.map((pts) => ({
        pts,
        x0: Math.min(...pts.map((q) => q[0])),
        y0: Math.min(...pts.map((q) => q[1])),
        x1: Math.max(...pts.map((q) => q[0])),
        y1: Math.max(...pts.map((q) => q[1])),
      }));
    };

    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      const eps = EPS[d.view ?? "anterior"];
      for (const t of [0, 0.5, 1]) {
        const svg = renderBodyDemo(id, t, 1).replace(
          /<g class="glow">.*?<\/g>/,
          ""
        );
        const sh = shapesOf(svg);
        if (sh.length < 2) continue;
        const parent = sh.map((_, i) => i);
        const find = (i: number): number =>
          parent[i] === i ? i : (parent[i] = find(parent[i]));
        for (let i = 0; i < sh.length; i++) {
          for (let j = i + 1; j < sh.length; j++) {
            if (find(i) === find(j)) continue;
            const a = sh[i];
            const b = sh[j];
            // Bounding-box reject first — without it this is O(n²·m²) and
            // far too slow for a unit test.
            if (
              a.x0 - b.x1 > eps ||
              b.x0 - a.x1 > eps ||
              a.y0 - b.y1 > eps ||
              b.y0 - a.y1 > eps
            )
              continue;
            let touch = false;
            for (const p of a.pts) {
              for (const q of b.pts) {
                if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= eps) {
                  touch = true;
                  break;
                }
              }
              if (touch) break;
            }
            if (touch) parent[find(i)] = find(j);
          }
        }
        const parts = new Set(sh.map((_, i) => find(i))).size;
        expect(
          parts,
          `${id}@${t} renders as ${parts} disconnected pieces, not one body`
        ).toBe(1);
      }
    }
  });

  it("every figure meets its own contact shadow", () => {
    /* The shadow IS the floor: it is the only thing on the canvas telling
       a viewer where the ground is. Two failures, both found by measuring
       rather than looking, and both invisible in a contact sheet because
       the frame looks deliberate:

       push-ups punched its HANDS 7 units through the floor while its
       toes sat correctly on it — one end of the body in the ground.

       It also reported barbell-curl and rope-tricep-pushdown drawing
       their shadow 18.9 units below their own feet. THAT ONE WAS NOT
       REAL, and it is the more useful half of the story: the probe
       reconstructed the renderer's fallback rule instead of reading the
       rendered `<ellipse>`, and reconstructed it from the wrong one of
       the two render paths. I wrote a fix, and a mutation test showed the
       fix changed nothing because the branch it edited is unreachable for
       side demos. Measure the output, not your model of the output —
       which is why this test reads the ellipse the renderer actually
       emitted. */
    const HANGS_OFF_THE_FLOOR = new Set(["dips", "pull-ups"]);
    for (const [id] of Object.entries(BODY_DEMOS)) {
      if (HANGS_OFF_THE_FLOOR.has(id)) continue;
      for (const t of [0, 0.5, 1]) {
        const full = renderBodyDemo(id, t, 1);
        const shadowY = Number(
          full.match(/<ellipse[^>]*cy="([-\d.]+)"/)?.[1] ?? NaN
        );
        expect(
          Number.isFinite(shadowY),
          `${id} draws no contact shadow`
        ).toBe(true);
        const svg = full.replace(/<g class="glow">.*?<\/g>/, "");
        const ys = [...svg.matchAll(/points="([^"]+)"/g)]
          .flatMap((m) => m[1].trim().split(/\s+/))
          .map((q) => Number(q.split(",")[1]))
          .concat(
            [...svg.matchAll(/ d="([^"]+)"/g)].flatMap((m) =>
              [...m[1].matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((q) =>
                Number(q[2])
              )
            )
          )
          .filter(Number.isFinite);
        const lowest = Math.max(...ys);
        /* The two sides get different tolerances, each from a reason
           rather than from a round number.

           FLOAT (6): a demo may legitimately stand on something. The calf
           raise is on a step, so its shadow belongs on the floor BELOW
           the platform, and it floats 5.4 at the top of the rise. The
           defect this is aimed at measured 18.9, so the margin is ample.

           SINK (2.6): the shadow is an ellipse of `ry` 2.6, so anything
           within 2.6 of its centre is still inside the drawn shadow and
           reads as contact. Past that a limb is in the ground, which has
           no benign reading. The deadlift family sits at 1.3-2.4 — the
           foot's lower edge against the shadow's middle — which is
           exactly what that allowance is for. */
        expect(
          shadowY - lowest,
          `${id}@${t} floats ${(shadowY - lowest).toFixed(1)} above its shadow`
        ).toBeLessThan(6);
        expect(
          lowest - shadowY,
          `${id}@${t} sinks ${(lowest - shadowY).toFixed(1)} through its shadow`
        ).toBeLessThan(2.6);
      }
    }
  });

  it("push-ups plants BOTH hands, not just the near one", () => {
    /* Needs its own assertion because the global shadow test above cannot
       separate this case. Planting only the near hand leaves the far one
       2.0 units through the floor — and the deadlift family legitimately
       sits at up to 2.4 (foot edge against shadow centre), so no single
       tolerance distinguishes them. A mutation proved exactly that: the
       near-hand-only version passed the global test.

       The far hand is the lower of the two here because `FAR_OFFSET` is a
       body-space depth nudge, and a prone figure has been rotated 90°,
       which turns it into a vertical one. Both hands are on the floor in
       life, so the target is that NOTHING crosses the drawn line. */
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const svg = renderBodyDemo("push-ups", t, 1).replace(
        /<g class="glow">.*?<\/g>/,
        ""
      );
      const ys = [...svg.matchAll(/points="([^"]+)"/g)]
        .flatMap((m) => m[1].trim().split(/\s+/))
        .map((q) => Number(q.split(",")[1]))
        .concat(
          [...svg.matchAll(/ d="([^"]+)"/g)].flatMap((m) =>
            [...m[1].matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((q) =>
              Number(q[2])
            )
          )
        )
        .filter(Number.isFinite);
      const through = Math.max(...ys) - 158.5;
      expect(
        through,
        `push-ups@${t} puts a hand ${through.toFixed(2)} through the floor`
      ).toBeLessThan(0.3);
    }
  });

  it("the push-up's copy of the far-limb parallax matches the renderer's", () => {
    /* `PUSHUP_FAR_OFFSET` duplicates the render closure's `FAR_OFFSET`,
       because the push-up's palm plant has to account for the FAR hand —
       prone, the body-space depth offset becomes a VERTICAL one and the
       far hand is the lower of the two.

       Duplicated deliberately (hoisting would drag `FAR_NEAR` and `FOLLOW`
       into module scope to serve one pose), which makes this the exact
       mirror-drift shape this project's first recurring-mistake rule is
       about. So the two are pinned equal from source: if the renderer's
       parallax changes, the plant that compensates for it fails here
       rather than silently sinking a hand back into the floor. */
    const rigSrc = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../bodyRig.ts"),
      "utf8"
    );
    const renderer = rigSrc.match(
      /const FAR_OFFSET: Op = \{ kind: "translate", dx: (-?[\d.]+), dy: (-?[\d.]+) \}/
    );
    const pushup = rigSrc.match(
      /const PUSHUP_FAR_OFFSET: Op = \{ kind: "translate", dx: (-?[\d.]+), dy: (-?[\d.]+) \}/
    );
    expect(renderer, "renderer FAR_OFFSET not found").toBeTruthy();
    expect(pushup, "PUSHUP_FAR_OFFSET not found").toBeTruthy();
    expect([pushup![1], pushup![2]]).toEqual([renderer![1], renderer![2]]);
  });

  it("a standing lift keeps its planted foot planted", () => {
    /* Contact audit 2026-08-16. The squat and deadlift get this free by
       building the leg ANKLE-UP; the row and RDL built it hip-down, so
       the knee ops displaced the ankle and the balance LEAN then
       pivoted about where the ankle USED to be. Measured: the RDL's
       planted ankle travelled 3.0 units DOWN, through the floor. */
    for (const id of [
      "squat",
      "bodyweight-squat",
      "deadlift",
      "romanian-deadlift",
      "barbell-row",
      "barbell-curl",
      "rope-tricep-pushdown",
    ]) {
      const d = BODY_DEMOS[id];
      const at = (t: number) =>
        applyToPoint(
          SIDE_ANCHORS.ankle,
          (d.pose(t) as Record<string, never[]>).shankL ?? []
        );
      const a0 = at(0);
      for (const t of [0.25, 0.5, 0.75, 1]) {
        const a = at(t);
        expect(Math.hypot(a[0] - a0[0], a[1] - a0[1]), `${id}@${t}`).toBeLessThan(0.5);
      }
      // …and that plant is the REST ankle, so the sole meets the floor.
      expect(Math.hypot(a0[0] - SIDE_ANCHORS.ankle[0], a0[1] - SIDE_ANCHORS.ankle[1]), id).toBeLessThan(0.5);
    }
  });

  it("a person is the same size across the upright demos", () => {
    /* Scale audit 2026-08-16. The card renders the SVG into a fixed
       190px-wide box with auto height (ExerciseRigDemo: max-w-[190px]),
       so on-screen scale is simply 190 / viewBox-width — a camera wider
       than it needs to be renders its figure smaller for nothing.
       Measured, the deadlift/row/RDL carried 75-85 units of unused
       width and drew a 198-226px person where the rest of the set drew
       300-360px. Their cameras are now tightened to their measured
       content.

       Exempt, and NOT a defect: movements whose envelope is genuinely
       wide already fill 90-97% of their frame, so they cannot be
       tightened and legitimately render a smaller figure — a lateral
       raise at full span, a bench, and a prone push-up. */
    const WIDE = new Set(["lateral-raise", "bench-press", "push-ups"]);
    /* Exempt STRUCTURALLY, by camera rather than by id: an implement
       variant spreads its canonical, so it inherits that camera and is
       exempt for exactly the same reason the canonical is. Listing ids
       instead would need editing every time a variant is added — and
       would fail closed, flagging a demo that is fine. */
    const wideCameras = new Set(
      [...WIDE].map((id) => BODY_DEMOS[id].viewBox).filter(Boolean)
    );
    const scales: Record<string, number> = {};
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      if (WIDE.has(id) || (d.viewBox && wideCameras.has(d.viewBox))) continue;
      const vw = Number(
        (
          d.viewBox ??
          (d.view === "anterior" ? "-8 -14 116 224" : "-12 -14 124 244")
        ).split(/\s+/)[2]
      );
      scales[id] = 190 / vw;
    }
    const vals = Object.values(scales);
    for (const [id, s] of Object.entries(scales)) {
      expect(s, `${id} scale`).toBeGreaterThan(1.3);
      expect(s, `${id} scale`).toBeLessThan(1.7);
    }
    // …and the spread across them stays tight.
    expect(Math.max(...vals) / Math.min(...vals)).toBeLessThan(1.25);
  });

  it("bars are RIGID — a bar never changes length mid-rep", () => {
    /* Bar-path audit 2026-08-16: the lat-pulldown's grip x lerped
       outward through the pull, which stretched the drawn steel bar
       13% (95.6 → 108 units) as the user pulled it down. Grip width is
       a property of the bar, not of the rep. */
    for (const [id, d] of Object.entries(BODY_DEMOS)) {
      if (!d.bar) continue;
      const widths = [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const b = d.bar!(t, d.pose(t));
        return b ? Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]) : 0;
      });
      if (Math.max(...widths) < 0.5) continue; // end-on plate: a point
      expect(Math.max(...widths) - Math.min(...widths), id).toBeLessThan(0.5);
    }
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

  it("side rig is bilateral: far limbs render and mirror the near chain", () => {
    // BODY_FAR (#8F969D) polygons are the far pieces. The pushdown's pose
    // addresses only the NEAR forearm — the far forearm must move anyway
    // (the far-follows-near rule), offset by the constant back-parallax.
    const farFill = (svg: string) =>
      (svg.match(/fill="#8F969D"/g) ?? []).length;
    const start = renderBodyDemo("rope-tricep-pushdown", 0);
    const end = renderBodyDemo("rope-tricep-pushdown", 1);
    expect(farFill(start)).toBeGreaterThan(0);
    // The far arm travels with the near arm: the set of far-coloured
    // polygons differs between the extremes (a static far arm — the
    // pre-rule behaviour — would render identical far bytes at both;
    // the far LEGS stay static here, so the whole-set comparison only
    // passes if the far ARM moved).
    const farPolys = (svg: string) =>
      [...svg.matchAll(/<path d="([^"]+)" fill="#8F969D"/g)]
        .map((m) => m[1])
        .join("|");
    expect(farPolys(start)).not.toBe(farPolys(end));
  });

  it("far tints render dimmed and stay out of the glow hull", () => {
    // Depth rule: same muscle further away — the far triceps facet's
    // fill-opacity must be strictly below the near one's at the same
    // effort, and the glow hull is built from near facets only (a far
    // hull would double the aura's footprint).
    const svg = renderBodyDemo("rope-tricep-pushdown", 0.5, 1);
    const opacities = [
      ...svg.matchAll(/fill="#[0-9a-f]{6}" fill-opacity="([\d.]+)"/g),
    ].map((m) => Number(m[1]));
    expect(Math.min(...opacities)).toBeLessThan(Math.max(...opacities) * 0.7);
  });

  it("no ball-joint discs on the body; hands render and ride the arm", () => {
    // Owner pass 2: "why are the joins circular balls? why don't the
    // figure have hands?" The cap hack is gone — no body-toned circles
    // anywhere (circles that remain are GEAR: plates, pulleys, rope
    // knobs) — and each view carries two hand mitts that transform with
    // their forearm group.
    const raise = renderBodyDemo("lateral-raise", 1);
    expect(raise.match(/<circle[^>]*fill="#B6BDC3"/g)).toBeNull();
    const handPaths = (svg: string) =>
      (svg.match(/<path[^>]*stroke-width="1.6"/g) ?? []).length;
    // weld pass per hand carries the 1.6 stroke — two hands per view.
    expect(handPaths(raise)).toBe(2);
    // Hands MOVE with the arms: raised vs rest differ.
    const rest = renderBodyDemo("lateral-raise", 0);
    const handD = (svg: string) =>
      [...svg.matchAll(/<path d="([^"]+)"[^>]*stroke-width="1.6"/g)]
        .map((m) => m[1])
        .join("|");
    expect(handD(raise)).not.toBe(handD(rest));
  });

  it("side arm carries both biceps and triceps facets (real muscle boundary)", () => {
    // The triceps facet is what lets the pushdown's working-muscle
    // emphasis render at all — pin that both facets tint independently.
    const curl = renderBodyDemo("barbell-curl", 0.5, 1);
    const push = renderBodyDemo("rope-tricep-pushdown", 0.5, 1);
    const primaryCount = (svg: string) =>
      (svg.match(/fill="#[0-9a-f]{6}" fill-opacity/g) ?? []).length;
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
    // The moving bar is the cable-bar stroke (width 2.8) — joint
    // sleeves are also <line> elements, so match by width, not order.
    const lastLineY = (svg: string) => {
      const ys = [
        ...svg.matchAll(/<line[^>]*y1="(-?[\d.]+)"[^>]*stroke-width="2.8"/g),
      ];
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
    for (const id of [
      "bench-press",
      "barbell-row",
      "romanian-deadlift",
      "squat",
    ]) {
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

  it("squat: side view — hips back+down, knees forward, heels planted", () => {
    // Owner feedback 2026-08-15: "squatting should be from a side
    // angle, not a front". Pin the view AND the mechanism the side
    // view exists to show.
    expect(BODY_DEMOS["squat"].view).toBe("side");
    const pose = (t: number) => BODY_DEMOS["squat"].pose(t);
    // Planted ankle: never moves.
    const ankle = (t: number) =>
      applyToPoint(SIDE_ANCHORS.ankle, (pose(t).shankL ?? []) as never[]);
    expect(ankle(1)[0]).toBeCloseTo(ankle(0)[0], 5);
    expect(ankle(1)[1]).toBeCloseTo(ankle(0)[1], 5);
    // Hips travel BACK and DOWN; knees travel FORWARD.
    const hip = (t: number) =>
      applyToPoint(SIDE_ANCHORS.hip, (pose(t).thighL ?? []) as never[]);
    expect(hip(1)[0]).toBeLessThan(hip(0)[0] - 20);
    expect(hip(1)[1]).toBeGreaterThan(hip(0)[1] + 20);
    const knee = (t: number) =>
      applyToPoint(SIDE_ANCHORS.knee, (pose(t).shankL ?? []) as never[]);
    expect(knee(1)[0]).toBeGreaterThan(knee(0)[0] + 3);
  });

  it("squat: the bar rides the traps, plumb over mid-foot at depth", () => {
    const d = BODY_DEMOS["squat"];
    const bar = (t: number) => d.bar!(t, d.pose(t))![0];
    // The bar travels DOWN with the torso — a real sink, not a fake.
    expect(bar(1)[1] - bar(0)[1]).toBeGreaterThan(25);
    // Balance rule: at the bottom the bar sits over the planted ankle
    // (mid-foot) — the mass never drifts past the toes or heels.
    expect(Math.abs(bar(1)[0] - SIDE_ANCHORS.ankle[0])).toBeLessThan(3);
    // End-on plate pinned in every frame.
    for (const t of [0, 0.5, 1]) {
      expect(renderBodyDemo("squat", t).includes('r="10"'), `@${t}`).toBe(true);
    }
  });

  it("squat: the grip stays welded to the bar through the whole rep", () => {
    // Bar and arm both ride torsoOps, so registration is constant by
    // construction — this pins that the construction holds.
    const d = BODY_DEMOS["squat"];
    for (const t of [0, 0.5, 1]) {
      const pose = d.pose(t);
      const hand = applyToPoint(
        SIDE_ANCHORS.hand,
        (pose.handL ?? []) as never[]
      );
      const bar = d.bar!(t, pose)![0];
      expect(
        Math.hypot(hand[0] - bar[0], hand[1] - bar[1]),
        `@${t}`
      ).toBeLessThan(2);
    }
  });

  it("bodyweight-squat: bar-less variant — forward reach, no plate", () => {
    // Owner call 2026-08-15: front/goblet/bodyweight squats must not
    // inherit the barbell squat's back bar. The variant shares the
    // side chain but counterbalances with a forward arm reach.
    const d = BODY_DEMOS["bodyweight-squat"];
    expect(d.view).toBe("side");
    expect(d.equip).toBeUndefined();
    for (const t of [0, 0.5, 1]) {
      const svg = renderBodyDemo("bodyweight-squat", t);
      expect(svg, `@${t}`).not.toBe("");
      expect(svg.includes('r="10"'), `@${t}`).toBe(false); // no plate disc
    }
    // The same sink as the barbell squat (shared chain)…
    const hip = (t: number) =>
      applyToPoint(SIDE_ANCHORS.hip, (d.pose(t).thighL ?? []) as never[]);
    expect(hip(1)[0]).toBeLessThan(hip(0)[0] - 20);
    expect(hip(1)[1]).toBeGreaterThan(hip(0)[1] + 20);
    // …with the hand sweeping FORWARD to the counterbalance reach.
    const hand = (t: number) =>
      applyToPoint(SIDE_ANCHORS.hand, (d.pose(t).handL ?? []) as never[]);
    expect(hand(1)[0]).toBeGreaterThan(hand(0)[0] + 30);
  });

  it("squat family aliases: only the smith machine keeps the bar", () => {
    expect(getBodyDemo("smith-machine-squat")).toBe(BODY_DEMOS["squat"]);
    for (const id of ["front-squat", "goblet-squat"]) {
      expect(getBodyDemo(id), id).toBe(BODY_DEMOS["bodyweight-squat"]);
    }
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

  it("calf raise: side view — heel rises about a planted ball", () => {
    // The foot/shank split's reason to exist: plantarflexion. The ball
    // of the foot stays on the step edge while the heel swings up and
    // the body rides the ankle's arc.
    expect(BODY_DEMOS["calf-raise"].view).toBe("side");
    const pose = (t: number) => BODY_DEMOS["calf-raise"].pose(t);
    const HEEL: [number, number] = [42.2, 203];
    const BALL: [number, number] = [58.5, 202.5];
    const at = (p: [number, number], t: number) =>
      applyToPoint(p, (pose(t).footL ?? []) as never[]);
    // Ball pinned in every frame; heel travels from below the step top
    // (the stretch) to well above it.
    for (const t of [0, 0.5, 1]) {
      expect(
        Math.hypot(...([0, 1] as const).map((i) => at(BALL, t)[i] - BALL[i])),
        `@${t}`
      ).toBeLessThan(0.01);
    }
    expect(at(HEEL, 0)[1]).toBeGreaterThan(203.5); // heel-drop stretch
    expect(at(HEEL, 0)[1] - at(HEEL, 1)[1]).toBeGreaterThan(6); // heel rose
    // The body rises with the ankle.
    const minY = (svg: string) => Math.min(...polyYs(svg));
    expect(
      minY(renderBodyDemo("calf-raise", 0)) -
        minY(renderBodyDemo("calf-raise", 1))
    ).toBeGreaterThan(3); // head rose
  });

  it("side feet follow their shank when a pose doesn't address them", () => {
    // The attachment default that keeps every non-calf-raise demo
    // rendering exactly as before the foot/shank piece split: the
    // bench's 90°-rotated legs must carry their feet along.
    const pose = BODY_DEMOS["bench-press"].pose(1);
    expect(pose.footL).toBeUndefined(); // bench never poses the foot…
    const svg = renderBodyDemo("bench-press", 1);
    // …yet no foot polygon remains at the standing foot's location
    // (y≈191-203): the whole figure lies on the bench.
    const ys = polyYs(svg);
    expect(Math.max(...ys)).toBeLessThan(190);
  });
});

describe("registry", () => {
  it("all demos are defined with tints and a concentric direction", () => {
    for (const id of [
      "squat",
      "bodyweight-squat",
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

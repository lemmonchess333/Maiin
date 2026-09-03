# Form Animation Rig — Motion Rig V2 master roadmap

**Adopted 2026-07-16** from operator packet `23-FORM-ANIMATION-RIG-MASTER.md`
(which supersedes packets 20/21/22). This copy is the in-repo source of
truth for Form-rig work; the original packets are historical uploads.

## STATUS — verified against main, 2026-07-16

The source packet claimed a set of increments existed "in the current
working tree" (hand supports, rope yoke/strands, side barbell-curl pose,
press/raise clavicle chains, pull-up/pulldown posterior bridge, curl-alias
removals, wrist caps). **None of that is on `main`.** Verified:

- Zero commits have touched `bodyRig.ts` / `bodySideData.ts` /
  `bodyTypes.ts` / `bodyRig.test.ts` since the packet baseline
  `ef475163` — main is byte-identical to what packet 20/21 audited.
- `DEMO_ALIASES` still maps `db-curl`/`hammer-curl`/`ez-bar-curl`/
  `cable-curl` → `barbell-curl` and `reverse-grip-cable-pushdown` →
  `rope-tricep-pushdown` (bodyRig.ts ~1129–1143).
- No `yoke`, wrist caps, `RigApproval`, `bodyKinematics.ts`, side
  `handR`/`foreArmR`/`upperArmR`, or FormMotionLab route exists anywhere
  in history (`git log --all`).
- The packet's build-blocker claim (`MacroDistribution.tsx:106`,
  `RoutePlannerSheet.tsx:332`) does **not** reproduce — main builds
  clean. Its environment (`pnpm`/PowerShell) was not this repo.

Every ledger row in the packet is therefore **Pending** here. Treat the
packet's design content as the plan and its status content as void.

### Shipped from this roadmap so far

| Increment                                                                                                                                                                                                                                                                | Where                                                            | Status                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------- |
| Replay determinism — reset `lastDrawRef`/`effortRef` per run (Phase 5 item, packet-20 finding)                                                                                                                                                                           | `ExerciseRigDemo.tsx` + determinism test                         | ✅ this PR                  |
| Five-sample preview + deterministic manifest (Phase 1 item)                                                                                                                                                                                                              | `scripts/preview-rig.ts`                                         | ✅ this PR                  |
| Alias hygiene — 5 incompatible variants fall back (packet P0)                                                                                                                                                                                                            | `bodyRig.ts` `DEMO_ALIASES` + tests                              | ✅ this PR                  |
| Misrepresentation gate — `barbell-curl` + `rope-tricep-pushdown` production-gated, review path kept                                                                                                                                                                      | `bodyRig.ts` `GATED_PENDING_REPAIR` + tests                      | ✅ this PR                  |
| Form Motion Lab — dev-only force-render review rig (Phase 1)                                                                                                                                                                                                             | `/dev/form-motion-lab` (#1639)                                   | ✅ shipped                  |
| Gate-0 contact sheets + status ledger (operator review pending)                                                                                                                                                                                                          | `docs/visual-audit/form-motion-v2/`                              | ✅ sheets; verdicts pending |
| Press rebuild — IK bar-path press + divergence-scaled joint caps (Phase 4-class, owner-directed)                                                                                                                                                                         | `bodyRig.ts` + mechanics pins                                    | ✅ 2026-07-27               |
| Deadlift rebuild — side-view planted-ankle hinge replaces posterior scaleY (Phase 4-class)                                                                                                                                                                               | `bodyRig.ts` + mechanics pins                                    | ✅ 2026-07-27               |
| Bench leg/bar repair + side facet-count discipline (Phase 2-class art)                                                                                                                                                                                                   | `bodyRig.ts` / `bodySideData.ts`                                 | ✅ 2026-07-27               |
| Looping player + even 30fps throttle (supersedes Demo1 single-rep settle — owner feedback)                                                                                                                                                                               | `ExerciseRigDemo.tsx` / `exerciseTempo.ts`                       | ✅ 2026-07-27               |
| Curl + rope-pushdown repairs — side-view rebuilds fix the gated defects; both un-gated (Phase 4 items 1–2); side triceps facet added (Phase 2 item)                                                                                                                      | `bodyRig.ts` / `bodySideData.ts` + mechanics pins                | ✅ 2026-08-15               |
| Typed props (Phase 3, prop half) — `bodyProps.ts` union + pure resolver; two divergent gear branch chains consolidated, dead anterior copy removed                                                                                                                       | `bodyProps.ts` + `bodyRig.ts` `resolveProp`                      | ✅ 2026-08-17               |
| Rope split + gravity tails; press/bench bar paths fitted to the arm (one unreachable, one never locking out)                                                                                                                                                             | `bodyProps.ts` / `bodyRig.ts` + mutation-checked pins            | ✅ 2026-08-17               |
| Owner evaluation of every demo — 8 good / 4 passable / 3 bad; verdict "curate, don't revert" (ledger section in the Gate-0 README)                                                                                                                                       | `docs/visual-audit/form-motion-v2/README.md`                     | ✅ 2026-09-02               |
| Squat family + calf raise moved to the SIDE view on the planted-ankle chain — the last front-view depth fakes retired                                                                                                                                                    | `bodyRig.ts` + mechanics pins                                    | ✅ 2026-09-02               |
| Side-model anatomy pass from owner device review — trunk band proportions, pelvis follow (0.6) + head lift (0.4) on every hinge, vertical goblet dumbbell                                                                                                                | `bodySideData.ts` / `bodyRig.ts` / `bodyProps.ts`                | ✅ 2026-09-02               |
| Mechanics pass — tints reconciled to the catalogue (dips was inverted), deadlift joint staggering, RDL bar on the legs, squat bar over the foot; skeleton proportions measured                                                                                           | `bodyRig.ts` + `tint honesty` / `execution mechanics` pins       | ✅ 2026-09-02               |
| Profile skeleton re-rowed to anthropometric norms (shoulder 38, elbow 74, wrist 105, hip 96, knee 145); every side reach re-fitted from the measured arm; push-up plank derived                                                                                          | `bodySideData.ts` re-row + `bodyRig.ts` reach constants          | ✅ 2026-09-02               |
| Device-recording review — pushdown top raised to the upper chest; pelvis facets closed to the outline (the dark hip seam)                                                                                                                                                | `bodyRig.ts` / `bodySideData.ts`                                 | ✅ 2026-09-02               |
| Dips moved to the SIDE view — fixed grip, solved shoulder path, chest-dip lean, knees tucked (owner recording: "looks bad")                                                                                                                                              | `bodyRig.ts`                                                     | ✅ 2026-09-02               |
| Bilateral arms on the profile figure — far arm behind the torso, shadowed and depth-offset; every side demo poses both (roadmap P0 side-topology item)                                                                                                                   | `bodySideData.ts` / `bodyRig.ts` + pins                          | ✅ 2026-09-02               |
| Model art pass from owner device review — smoothed contours, ellipse cranium, rounded pec, muscular arms, 0.9 seams, waist band closed, deltoid follow damped                                                                                                            | `bodySideData.ts` / `bodyRig.ts`                                 | ✅ 2026-09-02               |
| Pec plane replaces the chest dome; four level-against-diagonal seam wedges closed and pinned; profile seams painted as a groove tone; CI capture spec for the Form demos                                                                                                 | `bodySideData.ts` / `bodyRig.ts` / `e2e/screenshots`             | ✅ 2026-09-02               |
| Lower-body pass — overlap rims tilted onto real creases (hip, knee), pelvis facets rebuilt from contours, thigh/glute junction, shin seam and ankle band, shank outline traced both contours                                                                             | `bodySideData.ts` + 2 pins                                       | ✅ 2026-09-02               |
| Arms — far-arm depth offset moved post-pose (it rotated with the limb and surfaced in front on a curl); joint caps added to the side renderer                                                                                                                            | `bodySideData.ts` / `bodyRig.ts` + pins                          | ✅ 2026-09-02               |
| Head grown to 8 figure-heights from 9.1 (measured); throat moved behind the chin; both pinned                                                                                                                                                                            | `bodySideData.ts` + 2 pins                                       | ✅ 2026-09-02               |
| Knee rebuilt as a condyle (thigh + shank domed about the pivot); profile barbell sleeve takes a direction so the squat's stub stops crossing the face; all demos audited for gear-through-body                                                                           | `bodySideData.ts` / `bodyProps.ts` + 2 pins                      | ✅ 2026-09-02               |
| Rep START position is explicit per demo (`startsAt`) — nine of fifteen begin at the stretch, so a deadlift no longer opens with the lift already done                                                                                                                    | `exerciseTempo.ts` / `bodyRig.ts` / `ExerciseRigDemo.tsx` + pins | ✅ 2026-09-02               |
| Profile foot rebuilt with heel, arch and toe (outline and facet from one chain); mid-rep sweep of all fifteen demos for prop/body overlap                                                                                                                                | `bodySideData.ts` + arch pin                                     | ✅ 2026-09-02               |
| Instruction-parity audit — five demos (squat depth, curl elbow drift, row height, pull-up height, dips elbow branch) corrected to what their own catalogue text says, and pinned                                                                                         | `bodyRig.ts` + parity pin                                        | ✅ 2026-09-02               |
| Dip geometry corrected — shoulder path forward-and-down between the bars, elbow behind over the hand, legs hang (owner: "body moves away from the bars")                                                                                                                 | `bodyRig.ts`                                                     | ✅ 2026-09-03               |
| Build-out batch 1 — db-curl, front raise, overhead extension, kickback, skull crushers, lunges (planted-feet IK chain) + 5 honest aliases; coverage 35 → 46 of 152                                                                                                       | `bodyRig.ts` + parity pins                                       | ✅ 2026-09-03               |
| Build-out batch 2 — incline bench + db press, glute bridge, hip thrust, Bulgarian split; `plantedLeg` and `supineHinge` chains; coverage 46 → 51                                                                                                                         | `bodyRig.ts` + parity pins                                       | ✅ 2026-09-03               |
| Build-out batch 3 — cable curl, straight-arm pulldown, face pulls, seated row, leg extension, seated leg curl; `cableHandle` prop, `seatedChain` + machine scene; coverage 51 → 57                                                                                       | `bodyRig.ts` + `bodyProps.ts` + parity pins                      | ✅ 2026-09-03               |
| Build-out batch 4 — preacher / concentration / incline curls, leg press, hack squat, rack pull, decline bench + db press; `hingeLift` extracted from the deadlift, `benchAnglePose`, sled chains; coverage 57 → 65                                                       | `bodyRig.ts` + parity pins                                       | ✅ 2026-09-03               |
| Build-out batch 5 — crunches, toe touches, decline sit-up, hanging leg raise, cable crunch, ab wheel, superman; `supineFlat` + `crunchOps`, `kneelingBase`, `hangingBase`, `invertOps`; coverage 65 → 72                                                                 | `bodyRig.ts` + parity pins                                       | ✅ 2026-09-03               |
| Build-out batch 6 — inverted row, bench dips, kettlebell swing, upright row, Zercher squat, Nordic curl, GHR, sissy squat; `rigidLean`, `armToWorld`, `kneelHingeChain`, kettlebell prop; coverage 72 → 80                                                               | `bodyRig.ts` + `bodyProps.ts` + parity pins                      | ✅ 2026-09-03               |
| Build-out batch 7 — floor press, single-leg + donkey calf raise, step-ups, pistol squat, thrusters, chest-supported row; `calfRise`, `backRackArms`, `rigidLeanForward`, deeper `sideSquatChain`; coverage 80 → 87                                                       | `bodyRig.ts` + parity pins                                       | ✅ 2026-09-03               |
| Build-out batch 8 — reverse-grip + single-arm pushdowns, overhead cable extension, Bayesian curl, reverse curl, spider curl, single-arm pulldown, glute kickback; `staggeredStance`, `pushdownFore`; coverage 87 → 95; the implement-mismatch fallback list is now empty | `bodyRig.ts` + parity pins                                       | ✅ 2026-09-03               |
| Build-out batch 9 — landmine press / squat, Meadows row, chest + shoulder press machines, JM press, pike + handstand push-ups, dragon flag; `landmine` + `leverHandle` props, `trunkBetween`, solved pike; coverage 95 → 104                                             | `bodyRig.ts` + `bodyProps.ts` + parity pins                      | ✅ 2026-09-03               |
| Build-out batch 10 — plank + weighted plank (drawn as their set-up), L-sit, muscle-up, clean-and-press; coverage 104 → 109; the 43 that stay on the static reference are listed with reasons (README STATUS 2026-09-03k)                                                 | `bodyRig.ts` + parity pins                                       | ✅ 2026-09-03               |
| Build-out batch 11 — the frontal plane on the FRONT figure: db + cable + machine flys, crossover, pec deck, Lu raise, Arnold + Cuban press, both shrugs; `antArmToward` foreshortening, `frontalPair` prop, scenes on the front view; coverage 109 → 119                 | `bodyRig.ts` + `bodyProps.ts` + parity pins                      | ✅ 2026-09-03               |
| Build-out batch 12 — hip abduction + adduction, reverse fly + rear-delt fly + reverse deck (back figure), cross-body curl, woodchop, dead bug, bicycle crunch, Russian twist; `antLegToward`, `postArmToward`, `preTwist`; coverage 119 → 129                            | `bodyRig.ts` + parity pins                                       | ✅ 2026-09-03               |
| Build-out batch 13 — mountain climbers, battle ropes, side plank (front figure on its side), rowing machine, ski erg, jump rope, Pallof press; `highPlankBase`, `antSidePlank`; coverage 129 → 136                                                                       | `bodyRig.ts` + parity pins                                       | ✅ 2026-09-03               |
| Build-out batch 14 — the burpee as a six-key chain (`burpeePose`); coverage 136 → 137; the ledger closes at 15                                                                                                                                                           | `bodyRig.ts` + parity pins                                       | ✅ 2026-09-03               |
| Build-out batch 15 — the player learns to CYCLE (`cycle: true`, t wraps instead of reversing); gait chain → treadmill, incline walk, farmer's carry, sled push, stairmaster; box jumps as a keyed cycle; coverage 137 → 143                                              | `exerciseTempo.ts` + `ExerciseRigDemo.tsx` + `bodyRig.ts` + pins | ✅ 2026-09-03               |
| Build-out batch 16 — pedal chain → bike, spin bike, assault bike, elliptical; freestyle swimming; Zottman curl; coverage 143 → 149                                                                                                                                       | `bodyRig.ts` + pins                                              | ✅ 2026-09-03               |
| Everything else below                                                                                                                                                                                                                                                    | —                                                                | Pending                     |

**Demo1 supersession note (2026-07-27).** The single bounded teaching
rep ("plays one rep, settles behind a replay control") is superseded by
owner feedback from device use: "the reps don't repeat properly" — the
reference experience is the looping demo screens on gym equipment. The
player now loops the phase-cued cycle continuously while the surface is
active; reduced-motion still gets the static two-up. The Demo1
PROVENANCE rule (only vetted media may animate; borrowed photos render
static) is untouched. The guardrail list's "single bounded teaching
rep" line should be read through this note. The owner-directed rebuilds
above were shipped without the rights-cleared-reference gate because
they correct movements that misrepresented their exercise (the gate's
own honesty standard); operator review of the regenerated sheets stands
in for Gate-3 approval.

## Executive decision (unchanged from packet)

Retain the existing Form card, muscle-map language, dark stage,
lifting-purple emphasis, one-rep teaching timeline, replay behavior,
locked camera, SVG renderer, and reduced-motion path.

Improve the rig through three layers, **in this order**:

1. **Artwork/topology** — the figure must contain the pieces needed to
   portray the movement.
2. **Landmark mechanics** — named joints, supports, and props drive each
   other through constraints.
3. **Movement-specific timing** — only after the first two layers pass
   visual review are midpoint/easing curves tuned.

This is a Motion Rig V2 program inside the current product surface — not
a 3-D viewer, camera feature, video replacement, form-scoring system, or
medical model.

## Non-negotiable guardrails

- Preserve `ExerciseFormContent`, Progress/Form navigation, the
  in-workout Form sheet, cue language, and the single bounded teaching
  rep.
- Static per-exercise `viewBox`; no pan/zoom/orbit/view selector.
- Keep the imperative SVG/rAF path and 30fps cap until device profiling
  proves otherwise.
- Keep JS reduced-motion suppression: two static extremes, no rAF loop.
- Existing palette/tokens only; no new colour, gradient, or decoration.
- A grip, bar, rope, bench, floor, hand, toe, or heel is a **constraint**
  — never drawn after independently animating the body.
- One explicitly named healthy-reference variant per model; no universal
  technique claims, no diagnosis.

## Architecture target (condensed)

- `src/lib/bodyKinematics.ts` (new, pure): named `PoseLandmarks`,
  `ShoulderGirdleState`, typed `PropState`
  (`rigidBar | cableBar | ropeAttachment | fixedBar | dipBars`), and
  per-exercise `MotionSpec.resolve(progress, direction)`.
- Resolution order: supports/shoulder roots → prop + hand contacts →
  limb solves between constraints → SVG group transforms. Same endpoints
  in reverse; only the approved phase curve may differ.
- `bodyRig.ts` keeps registry/serialization; art stays in
  `bodySideData.ts`/`bodyModelData.ts`.
- **Exercise-level quality gate** (`RigApproval`: art / mechanics /
  movement-review approvals + `productionEnabled` + approval hash).
  Registry presence must stop equalling production approval;
  unapproved/unsupported variants fall back to the static reference.
- Side topology is P0 art work: bilateral arms/hands, triceps facet,
  shoulder girdle, independent feet with heel/toe, far-depth offsets,
  side joint bridges (full piece/landmark tables live in the packet).

## Delivery phases and gates

- **Gate 0** — five-frame contact sheets + real-route captures; mark
  every current demo approved / provisional / fallback.
- **Phase 1** — `RigApproval` data, dev-only Form Motion Lab,
  five-sample preview with metadata _(preview part shipped)_.
- **Phase 2** — side topology rebuild (art direction proven before
  migrating motions).
- **Phase 3** — `bodyKinematics.ts` + typed props; renderer becomes a
  compatibility layer.
- **Phase 4** — movement migration in order: strict curl (two-hand bar),
  rope pushdown cleanup, bench, row, RDL, push-up, side squat/calf,
  pulldown furniture.
- **Phase 5** — motion polish; endpoint-preserving midpoint curves only
  after topology/mechanics approval _(replay-reset part shipped)_.
- **Gate 3** — production enablement only with art + mechanics +
  rights-cleared movement-reference approvals recorded against the exact
  version hash.

## Why the remaining phases are not agent-autonomous

Per the packet's own rules: production enablement requires **human
visual approval** against **rights-cleared movement references**
(recorded performer capture or licensed material), and its anti-shortcut
rules reject any rig enabled "merely because it renders or its unit
tests pass". Topology/art phases therefore need the operator in the
loop (contact-sheet review via the screenshot channel) before any
behavior change ships.

## Operator decisions

1. **Alias hygiene** — DECIDED 2026-07-16 (owner: remove now, honesty
   over continuity). The five incompatible variants (`db-curl`,
   `hammer-curl`, `ez-bar-curl`, `cable-curl`,
   `reverse-grip-cable-pushdown`) fall back to the static reference
   until each has its own grip/prop contract. Shipped in this PR.
2. **Gate the misrepresenting canonicals** — DECIDED 2026-07-16 (owner:
   gate now). `barbell-curl` (no barbell, ~58% forearm foreshortening)
   and `rope-tricep-pushdown` (straight bar contradicting its rope
   instructions) are production-gated via `GATED_PENDING_REPAIR`; the
   Form surface shows the honest static reference. The review renderer
   (`renderBodyDemo`) still draws them so previews/mechanics tests can
   iterate the repairs. Un-gate only with an approved replacement per
   the roadmap gates. Shipped in this PR.
3. **Reference capture** — OPEN, operator-owned (physical-world action):
   record a rights-cleared performer per packet §11. Until this exists,
   Phase-4 movement migrations cannot reach production approval.

## Test matrix, exercise contracts, licensing policy

The packet's full §7–§15 (topology tables, per-exercise contracts, prop
rules, test matrix, visual acceptance, anti-shortcut rules, licensing
table with study citations) is adopted verbatim as the working spec for
Phases 2–5. Consult the packet text for those details when implementing;
re-verify all line references against current source first — they were
authored against `ef475163` and several are already stale.

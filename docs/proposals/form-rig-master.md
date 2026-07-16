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

| Increment                                                                                           | Where                                       | Status     |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------- |
| Replay determinism — reset `lastDrawRef`/`effortRef` per run (Phase 5 item, packet-20 finding)      | `ExerciseRigDemo.tsx` + determinism test    | ✅ this PR |
| Five-sample preview + deterministic manifest (Phase 1 item)                                         | `scripts/preview-rig.ts`                    | ✅ this PR |
| Alias hygiene — 5 incompatible variants fall back (packet P0)                                       | `bodyRig.ts` `DEMO_ALIASES` + tests         | ✅ this PR |
| Misrepresentation gate — `barbell-curl` + `rope-tricep-pushdown` production-gated, review path kept | `bodyRig.ts` `GATED_PENDING_REPAIR` + tests | ✅ this PR |
| Everything else below                                                                               | —                                           | Pending    |

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

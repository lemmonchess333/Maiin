# Anterior/posterior grip reconciliation

**Status:** scoped, not started. Prerequisite for any held prop on the
front or back views (fists, the overhead-press barbell, dumbbells).

Written after the 2026-08-17 hands attempt was shipped and reverted on
sight — see `docs/visual-audit/form-motion-v2/README.md` STATUS
2026-08-17b/c. That attempt failed for one reason, and it is narrower
and more tractable than "the anchors are wrong".

## What is actually wrong

Measured against `bodyModelData` rather than assumed. Anchors are the
declared joint pivots in `bodyRig.ts`; "art centre" is the middle of the
vendored polygons in a ±3-unit band at that joint's height.

| joint    | anterior anchor | art centre | offset    | posterior anchor | art centre | offset    |
| -------- | --------------- | ---------- | --------- | ---------------- | ---------- | --------- |
| shoulder | x=24            | 24.08      | **−0.08** | x=23             | 22.34      | **0.66**  |
| elbow    | x=20            | 18.77      | **1.23**  | x=17             | 18.30      | **−1.30** |
| hand     | x=10            | **3.47**   | **6.53**  | x=9              | **3.40**   | **5.60**  |

**Only the hand is displaced.** Shoulder and elbow sit inside the art's
own width (the joint bands are ~8 units across, so ±1.3 is centred for
practical purposes). The hand is out by ~6 — most of a limb width — and
also short in y (anchors 100 / 106; art wrists 101.2 / 108.5).

Consequent segment lengths:

|                       | declared | art   | drift  |
| --------------------- | -------- | ----- | ------ |
| anterior forearm      | 30.68    | 33.87 | +10.4% |
| posterior forearm     | 29.12    | 33.95 | +16.6% |
| anterior total reach  | 54.02    | 57.48 | +6.4%  |
| posterior total reach | 61.68    | 66.21 | +7.3%  |

The art is symmetric — implied mirror axis 49.80 (anterior) and 50.00
(posterior) against a figure centre of 50 — so left and right take the
same correction and no per-side special-casing is needed. Wrist width is
~7 units, which is the size any fist has to match.

## Why this matters beyond hands

`aimArm` computes its rotation from the REST vector `rest.H − rest.E`.
If `rest.H` is not on the art, the solved rotation lands a phantom point
on the target and the art's real wrist lands somewhere else. So every
IK demo currently mis-seats its hands against its own apparatus:

| demo           | art wrist vs its declared grip                    |
| -------------- | ------------------------------------------------- |
| dips           | 6.3 units INSIDE the post at t=0, 4.8 at t=1      |
| overhead-press | 6.5 units OUTSIDE the bar path at t=0, 5.3 at t=1 |

Worse, the offset is not constant through a rep, so the art slides
against apparatus that is supposed to be fixed: the pull-up art wrist
travels 2.1 units along a bar the anchor holds perfectly still, and the
dips art wrist drifts 2.9 units on a static post. The existing
"grips stay put" test passes because it checks the POST lines, which are
drawn from the anchor — it never checks the arm.

This is invisible today only because nothing is drawn at a hand and the
forearm's taper roughly covers the gap.

## The change

1. Move four constants to the art: `ANT.handL` → ~[3.5, 101],
   `ANT.handR` → ~[96.1, 101], `POST.handL` → ~[3.4, 108.5],
   `POST.handR` → ~[96.6, 108.9].
2. `ANT_FORE_LEN` / `POST_FORE_LEN` recompute from them automatically.
3. Re-fit every IK bar path against the new, longer reach.
4. Re-review all anterior/posterior contact sheets.

## Blast radius

Nine `aimArm` call sites across four demos consume these anchors:
**overhead-press, dips, pull-ups, lat-pulldown**. `lateral-raise`,
`squat` and `calf-raise` rotate about the shoulder/elbow only and are
untouched. Side-view demos use `SIDE_ANCHORS` and are entirely
unaffected — that rig has a real `handL` piece and is already correct.

Known test fallout: the press "hands stay ON the declared bar path" and
"fixed-width vertical bar path" pins both hard-code `[10, 100]`; the
dips "grips stay put" pin should be STRENGTHENED as part of this (it
currently proves nothing about the arm).

Reopened decisions: the press grip was narrowed 14 → 10 in #2066 partly
because 14 was unreachable (hypot(14,53) = 54.82 > 54.02). Against a
57.48 arm, 14 becomes reachable again — so that constraint disappears
and the grip width has to be re-argued on its own merits (1.54×
biacromial is still too wide for "grip just outside your shoulders").
Bench and the other side demos are unaffected.

## The shoulder girdle never moves (found 2026-08-17, owner-reported)

Separate defect, same arithmetic — which is why it lands in the same PR.

The shoulder anchor is PINNED. Measured across both demos that need it:

| demo           | humerus swing            | shoulder point travel |
| -------------- | ------------------------ | --------------------- |
| overhead-press | 55° → 166° from vertical | **0.00**              |
| lateral-raise  | 14° → 82°                | **0.00**              |

What the rig models today is the DELTOID CAP tilting at 40% of the
humerus angle (capped at 38°) about that fixed pivot — the 2026-07-11
joint pass. So the scapula's ROTATION is stylised, and its ELEVATION is
absent. In a real press the whole girdle shrugs up at lockout; that is
the movement the owner spotted as missing.

Scapulohumeral rhythm is ~2:1, and the acromion rises ~3 cm at full
overhead reach. The figure is 200 units for ~175 cm, so 1 unit ≈
0.875 cm:

|                                 | scapular contribution | acromion rise  |
| ------------------------------- | --------------------- | -------------- |
| press lockout (~170°)           | ~57°                  | **~3.2 units** |
| lateral raise to parallel (90°) | ~30°                  | **~1.7 units** |

Against a 52-unit shoulder width that is plainly visible.

The machinery already exists: `aimArm` takes a `dy` documented as "body
carries the shoulder". The press passes `0`.

**Spiking it surfaced a coupling that decides the sequencing.** Raising
the shoulder while leaving the bar path alone just puts SLACK in the
arm: reach drops 53.94 → 50.8 against a 54.02 arm, so the elbow bend
goes 6.5° → ~30° and the elbows bow inward. Physically obvious in
hindsight — if your shoulders shrug up at lockout, the bar finishes
higher too. So elevation and lockout height must move together.

Which means the hand anchor, the bar paths and the girdle are ONE piece
of arithmetic, not three. Sequencing below is revised accordingly.

## Sequencing

Deliberately three PRs, not one. Bundling them makes a single review
unable to tell "the press moved because the anchor moved" from "the
press moved because it gained a bar".

- **Spike (hours, throwaway).** Correct the anchors locally, draw one
  fist, render magnified crops, look. This is the cheap answer to the
  question the whole plan rests on and which is still unproven — see
  Risks. Nothing ships.
- **PR1 — arm geometry.** The four hand constants, shoulder-girdle
  elevation, and the bar paths re-fitted against BOTH (a longer forearm
  and a rising shoulder change the same reach arithmetic). Test updates,
  regenerated sheets. No new features, and valuable on its own twice
  over: it stops the art sliding on fixed apparatus in pull-ups and
  dips, and it puts the shrug into the press and the raise.

  Originally scoped as anchor-only. Merged after the shoulder spike
  showed the two cannot be re-fitted independently — doing them in
  separate PRs would mean fitting the bar path twice and re-reviewing
  45 frames twice.

- **PR2 — fists.** On corrected anchors, following the `ANTERIOR_FEET`
  pattern.
- **PR3 — held props.** Overhead-press barbell, lateral-raise dumbbells.
  The prop code for both already exists and is tested (`frontalBarbell`,
  `dumbbell` in `bodyProps.ts`); PR3 is wiring, not building.

## Risks

- ~~The fist may still not read.~~ **RESOLVED, 2026-08-17, in two
  passes.** Pass one moved the anchors onto the art and drew a
  symmetric hexagon: correctly PLACED, but still reading as a lump.
  Owner supplied reference photographs of a real fist, dorsal and
  palmar, and the two things the hexagon lacked were obvious from them —
  a TAPER (wide at the knuckles, narrow at the wrist) and a KNUCKLE
  LINE. Pass two is the geometry PR2 should start from:

  ```
  built along the FOREARM axis (u = elbow→wrist, q = across), not
  screen-vertical, with `wrist` as the origin:

    main mass   P(-1.2, ±2.7) → P(4.4, ±3.5)     (5.4 wide → 7.0 wide)
    knuckle band P(5.0, ±3.5) → P(6.6, 2.6) → P(7.1, 0.6) → P(6.6, -1.6)
  ```

  Two facets, so the rig's own gap draws the knuckle line — the same
  device the side rig uses to split the upper arm at the biceps/triceps
  boundary. Verified at rest, gripping the pull-up bar, and mid-raise.

  Known limits, accepted: no thumb (below the threshold where 7 units
  can carry it), fingers not individuated, and on a bar the hand sits ON
  the bar rather than wrapping it — correct for a pull-up's overhand
  grip, approximate elsewhere.

- **Re-posing may surface further art/anchor disagreements.** The elbow
  is 1.2–1.3 off centre, which is tolerable now and may not be once
  something is drawn at the joint.
- **Girdle elevation opens a seam at the deltoid/torso junction** — the
  arm assembly rises and the torso does not. The spike's full-frame
  render was acceptable, but it was one value at one frame; the elevation
  curve needs shaping against the existing `DELTOID_FOLLOW` / 38° cap
  rather than bolted on beside it.
- **45 frames to re-review** (9 front/back demos × 5), all changed by a
  pose shift rather than a deliberate design change, which is the
  hardest kind of sheet to review attentively.

## Alternative: do nothing

Entirely viable. Front and back views keep structural equipment only,
which is the state the app has shipped in since 2026-07-03. The cost is
that the overhead press keeps pressing an invisible bar and the lateral
raise keeps holding invisible dumbbells — real, but the demos are
honest about the MOVEMENT, which is what the muscle tint and the pose
carry. Nothing here is a correctness bug in the exercise data.

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

## Sequencing

Deliberately three PRs, not one. Bundling them makes a single review
unable to tell "the press moved because the anchor moved" from "the
press moved because it gained a bar".

- **Spike (hours, throwaway).** Correct the anchors locally, draw one
  fist, render magnified crops, look. This is the cheap answer to the
  question the whole plan rests on and which is still unproven — see
  Risks. Nothing ships.
- **PR1 — anchor correction.** The four constants, the re-fitted bar
  paths, the test updates, regenerated sheets. No new features. Valuable
  on its own: it stops the art sliding on fixed apparatus in pull-ups
  and dips.
- **PR2 — fists.** On corrected anchors, following the `ANTERIOR_FEET`
  pattern.
- **PR3 — held props.** Overhead-press barbell, lateral-raise dumbbells.
  The prop code for both already exists and is tested (`frontalBarbell`,
  `dumbbell` in `bodyProps.ts`); PR3 is wiring, not building.

## Risks

- **The fist may still not read, and the anchor fix does not answer
  that.** The 2026-08-17 attempt was BOTH misplaced and unproven as a
  shape. Correcting the anchor removes the misplacement only. Wrist
  width ~7 vs the 8-wide fist tried suggests the scale was roughly
  right, but that is an inference, not evidence — hence the spike first.
- **Re-posing may surface further art/anchor disagreements.** The elbow
  is 1.2–1.3 off centre, which is tolerable now and may not be once
  something is drawn at the joint.
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

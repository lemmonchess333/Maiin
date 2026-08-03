---
Status: accepted
---

# Volume currency: count indirect sets at 0.5 today, adopt the literature's 1:1 only alongside landmark-aware builders

## Context

`volumeModel.ts` tallies weekly hard sets per muscle. A set of an exercise
counts **1.0** toward the muscle it targets and **0.5** toward each muscle it
trains indirectly — bench press books 1.0 chest, 0.5 triceps, 0.5 front delt.
The module has always described that as "the MASS/RP standard".

Those tallies are then classified against goal bands (`volumeLandmark`) that
came from Schoenfeld's dose–response meta-analyses, pp.183–184. **Those
meta-analyses counted 1:1.** They counted sets _of an exercise for a muscle_,
without discounting indirect work, because that is what the primary studies
reported.

So the model publishes a tally in one currency and judges it against bands
denominated in another. Every muscle whose volume arrives mostly indirectly —
triceps, front delts, biceps, hamstrings, glutes — is systematically
understated against its own threshold. That is not a rounding difference: at
the sweep level the two currencies differ by 46% of all volume.

There are only two ways to make the model self-consistent:

1. **Count 1:1** and keep the bands as the literature published them.
2. **Keep 0.5** and re-derive all five goal bands into 0.5-weighted
   equivalents.

Option 2 is arithmetic with no external check. It permanently disconnects our
numbers from the literature we cite, so no future reader can compare a Tropos
band against a published one, and every future band has to be invented rather
than looked up. Schoenfeld himself doubts 1:1 is _physiologically_ right and
recommends it anyway, as the convention that keeps results comparable — which
is exactly the property option 2 destroys.

**So the currency decision is settled: 1:1 is correct.** The remaining question
was purely one of sequencing, and it turned on a measurement.

## The measurement

`planSweep.golden.test.ts` (P1) pins the generator's output across 90
configurations — 6 day-counts × 3 equipment profiles × 5 goals. Flipping
`SECONDARY_SET_WEIGHT` from 0.5 to 1.0 and re-running the sweep:

|                                    | 0.5 (today) | 1.0 (literature) |
| ---------------------------------- | ----------- | ---------------- |
| Total sets across the sweep        | 9,275       | 13,559 (+46%)    |
| Configurations over a ceiling      | 53 / 90     | **64 / 90**      |
| Configurations under a floor       | 60 / 90     | 41 / 90          |
| Per-muscle readings over a ceiling | 180 / 825   | **364 / 825**    |
| Per-muscle readings under a floor  | 263 / 825   | 147 / 825        |

Two predictions were made before running it and **both were wrong**:

- "The tally rises, so violations get worse" — only half true. Under-floor
  readings nearly halve, because most of what looked under-dosed was indirect
  volume the model was discounting.
- "A higher tally will make `overshootsCeiling` veto more adds, partly
  offsetting the rise" — falsified outright. Over-ceiling readings **double**.
  The veto only governs the balancers' ADDS; the day builders hard-code their
  slot counts and nothing reconciles them against the landmarks afterwards, so
  the builders' output dominates and the veto has almost nothing to bite on.

Net across the sweep, violating readings go 443 → 511. Worse in total, and
worse in the more costly direction: over-MRV volume is unrecoverable, whereas
under-MEV volume is merely unproductive.

## Decision

**Count indirect sets at 0.5 for now, behind the named constant
`SECONDARY_SET_WEIGHT` in `volumeModel.ts`, and flip it to 1.0 in the same
change that makes the day builders landmark-aware.**

The currency question itself is decided in favour of 1:1 and this ADR is the
record of that. What is staged is only the flip, and it is staged on a
condition rather than a date: the builders must consult the landmarks when they
choose slot counts. Today they do not — the balancers can only add sets after
the fact, and add-only balancing cannot fix a week that the builders authored
over the ceiling.

Flipping first would ship an app whose own volume advice is measurably worse
than it is today, in a phase (13a) whose entire premise is that it changes no
behaviour. Flipping second costs nothing: the constant is one line, the golden
sweep makes the diff reviewable, and D-VOL's ratchet in
`planSweep.golden.test.ts` will record the improvement.

## Consequences

- **The inconsistency is now named, measured and located** rather than living
  as an unremarked mismatch between a comment and a set of bands. The constant
  carries a pointer here; this ADR carries the numbers.
- **The bands stay comparable to their sources.** Nobody has to re-derive five
  goal bands, and a future reader can still check `{12, 20}` against
  Schoenfeld pp.183–184.
- **D-VOL's ratchet is measuring against the wrong currency until the flip.**
  Its current bounds (53/90 over, 60/90 under) are 0.5-currency numbers. When
  the flip lands, both bounds must be re-baselined in the same commit — they
  will not simply improve, and treating a re-baseline as a ratchet regression
  would be a misreading.
- **`MuscleVolume.sets` is not a comparable quantity across the flip.** Nothing
  persists it today, which is what keeps this reversible; if anything starts
  storing a tally before the flip, it will need the currency recorded alongside
  it or the history becomes uninterpretable.
- **This does not license inventing an exchange rate elsewhere.** Schoenfeld
  p.209 is explicit that a squat set and a curl set are not the same fatigue
  unit and gives **no** exchange rate. 0.5 vs 1.0 here is a _counting
  convention_ for attributing one set to several muscles, not a fatigue model,
  and the v8 evaluation's refusal to build a `fatigueCost` / SFR scalar stands
  unchanged.

## Status addendum — 2026-08-03: the staged condition landed and proved insufficient; flip re-staged on the taxonomy split

`reconcileToLandmarks` (shrink-only, primary-slot, floor-bound: accessories 2,
mains 3) now runs in `generateProgram` around the add-only balancers —
reconcile → balance → reconcile — which is this ADR's staged condition. The
same change fixed an intra-exercise double-count the flip measurement
surfaced: an exercise whose primary and a secondary roll up to the SAME
canonical bucket (barbell row: Lats + Lower Back → Back) booked 1.5 canonical
sets per physical set at 0.5 and would book 2.0 at 1:1. The canonical tally
now counts a set once per canonical muscle at the exercise's strongest
relationship. The fine view is unchanged.

Measured across the 75-config sweep (readings over ceiling / under floor):

|                                      | high | low |
| ------------------------------------ | ---- | --- |
| status quo (0.5, summed roll-up)     | 180  | 153 |
| 1:1 + reconciler + dedupe            | 292  | 87  |
| **0.5 + reconciler + dedupe (kept)** | 74   | 193 |

The flip still cannot land net-positive: at 1:1 the canonical Shoulders
bucket absorbs every press AND every pull as full sets (measured at 6d: 8
primary + 27 secondary weekly sets against a ceiling of 20) and Core absorbs
every compound. No shrink pass can reconcile those buckets without starving
the primaries that feed them — the buckets themselves are mispriced, and the
fix is per-head landmarks (front/side/rear delts; direct-ab counting), i.e.
the taxonomy split this repo already stages as 13a's successor.

**The flip is therefore re-staged: it lands with the taxonomy split's
per-head landmarks, not with the reconciler alone.** What shipped now is the
reconciler and the dedupe at 0.5 — the high-direction readings fell 180 → 74
(the unrecoverable failure direction, per this ADR's own cost asymmetry),
and the D-VOL ratchet bounds tightened rather than re-baselined. The rise in
low readings (153 → 193) is substantially the dedupe revealing volume that
double-counting had been inflating into-band, plus reconciler cascades at
2–3 day counts where every band is unreachable anyway.

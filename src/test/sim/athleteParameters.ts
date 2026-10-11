/**
 * Every parameter of the virtual lifter, in one table: its value, the range
 * a sweep covers, its source, the evidence marker and its grade, as in
 * docs/training-engine-2026-10/lifting-evidence.md §4.4. The model reads
 * its numbers from here and nowhere else, so this table is the whole of
 * what the simulator assumes about a person.
 *
 * Markers: VF checked in full text, VA abstract or book, U identified but
 * unchecked, C computed here from checked sources, ASSUMPTION the harness's
 * own choice. A WEAK or ASSUMPTION parameter is reported across its range
 * (the model variants in `lifter.ts`), never at one value alone.
 */

export type Marker = "VF" | "VA" | "U" | "C" | "ASSUMPTION";
export type Grade = "MODERATE" | "WEAK-MODERATE" | "WEAK" | "ASSUMPTION";

export interface AthleteParameter {
  value: number;
  range: readonly [number, number];
  unit: string;
  source: string;
  marker: Marker;
  grade: Grade;
}

const p = (
  value: number,
  range: readonly [number, number],
  unit: string,
  source: string,
  marker: Marker,
  grade: Grade
): AthleteParameter => ({ value, range, unit, source, marker, grade });

/**
 * Strength gain per week, for a lift's 1RM as a multiple of its start:
 * Δb = rate · dose · responder · (1 − b / ceiling)^γ. Rate and ceiling are
 * fitted to lifting-evidence §4.2's central rows at the reference dose (8
 * effective sets a week, twice a week, 8RM or heavier): every fit is within
 * 0.5% of the row at 8, 16, 26 and 52 weeks. The ranges are the fits at
 * γ = 1 and γ = 1.5.
 */
export const STRENGTH_CURVE = {
  gamma: p(
    1.25,
    [1, 1.5],
    "",
    "§4.4; shapes of Latella 2024, Steele 2023",
    "VA",
    "WEAK"
  ),
  novice: {
    upper: {
      rate: p(
        0.0743,
        [0.0581, 0.0912],
        "/week",
        "fit to §4.2 novice upper",
        "C",
        "WEAK"
      ),
      ceiling: p(
        1.505,
        [1.46, 1.555],
        "× start",
        "fit to §4.2 novice upper",
        "C",
        "WEAK"
      ),
    },
    lower: {
      rate: p(
        0.0983,
        [0.0769, 0.1227],
        "/week",
        "fit to §4.2 novice lower",
        "C",
        "WEAK"
      ),
      ceiling: p(
        1.58,
        [1.535, 1.625],
        "× start",
        "fit to §4.2 novice lower",
        "C",
        "WEAK"
      ),
    },
  },
  intermediate: {
    upper: {
      rate: p(
        0.1034,
        [0.0613, 0.1862],
        "/week",
        "fit to §4.2 intermediate upper",
        "C",
        "WEAK"
      ),
      ceiling: p(
        1.115,
        [1.105, 1.12],
        "× start",
        "fit to §4.2 intermediate upper",
        "C",
        "WEAK"
      ),
    },
    lower: {
      rate: p(
        0.1015,
        [0.0604, 0.1648],
        "/week",
        "fit to §4.2 intermediate lower",
        "C",
        "WEAK"
      ),
      ceiling: p(
        1.135,
        [1.125, 1.145],
        "× start",
        "fit to §4.2 intermediate lower",
        "C",
        "WEAK"
      ),
    },
  },
  advanced: {
    upper: {
      rate: p(
        0.1212,
        [0.0484, 0.2307],
        "/week",
        "fit to §4.2 advanced upper",
        "C",
        "WEAK"
      ),
      ceiling: p(
        1.045,
        [1.045, 1.05],
        "× start",
        "fit to §4.2 advanced upper",
        "C",
        "WEAK"
      ),
    },
    lower: {
      rate: p(
        0.1274,
        [0.0532, 0.2425],
        "/week",
        "fit to §4.2 advanced lower",
        "C",
        "WEAK"
      ),
      ceiling: p(
        1.055,
        [1.055, 1.06],
        "× start",
        "fit to §4.2 advanced lower",
        "C",
        "WEAK"
      ),
    },
  },
} as const;

export const LIFTER = {
  /** r_s ~ lognormal(0, σ), drawn once per lifter. */
  responderSigma: p(
    0.35,
    [0.2, 0.45],
    "log-SD",
    "§4.4 Responders",
    "ASSUMPTION",
    "WEAK-MODERATE"
  ),

  /** Reps at a load: Nuzzo's mean + z · SD · scale, z ~ N(0, 1) once per
   *  lifter (`repCapacity.ts`). The SDs may hold measurement error, so the
   *  low end shrinks them. */
  repsSpreadScale: p(
    1,
    [0.7, 1],
    "× Nuzzo SD",
    "Nuzzo 2024 Figs 2–4",
    "VF",
    "MODERATE"
  ),

  /** Day to day: P = 1RM · (1 − F) · e^ε. Grgic 2020's medians, read as
   *  ceilings. */
  dayNoiseTrained: p(
    0.028,
    [0.025, 0.033],
    "SD",
    "Grgic 2020 (median CV 3.3%)",
    "VF",
    "WEAK"
  ),
  dayNoiseNovice: p(
    0.04,
    [0.035, 0.05],
    "SD",
    "Grgic 2020 (median CV 5.5%)",
    "VF",
    "WEAK"
  ),

  /** What a set costs the next one of the same lift, as a share of the
   *  day's 1RM: this much after a set to failure, two thirds of it at 1 rep
   *  in reserve, a third at 2, nothing from 3. A set to failure at 80% then
   *  leaves about 2 fewer reps for the next, the size of the losses seen
   *  across sets to failure with a few minutes' rest; no source was checked
   *  for the number. */
  setFailureCost: p(
    0.04,
    [0.02, 0.06],
    "of P",
    "no source checked",
    "ASSUMPTION",
    "ASSUMPTION"
  ),

  /** Acute fatigue: each hard set (4 or fewer in reserve) adds to F for its
   *  half of the body, which decays with τ. 2–4 days is §4.4's assumption;
   *  strength-sport fits put τ at 13–22 days [U]. */
  fatigueTauDays: p(
    3,
    [2, 22],
    "days",
    "§4.4; Busso 1990/1994 [U]",
    "ASSUMPTION",
    "ASSUMPTION"
  ),
  fatiguePerHardSet: p(
    0.002,
    [0.001, 0.004],
    "of 1RM",
    "no source checked",
    "ASSUMPTION",
    "ASSUMPTION"
  ),

  /** A set counts toward the dose in full within 4 reps of failure, and
   *  this much less per rep in reserve past that (8 in reserve: 0.6). */
  effortLossPerRirPast4: p(
    0.1,
    [0.06, 0.15],
    "per rep",
    "§4.4 V_frac convention; Robinson 2024 shape",
    "ASSUMPTION",
    "ASSUMPTION"
  ),

  /** Dose against 8 effective sets a week: Pelland 2025's reciprocal fit,
   *  D(V) = max · V / (V + half). 0.55 at 1 set, 0.74 at 2, 1 at 8, 1.08 at
   *  20 [C]. */
  doseMax: p(
    1.132,
    [1.1, 1.132],
    "× ref",
    "Pelland 2025 (OSF tables)",
    "C",
    "WEAK-MODERATE"
  ),
  doseHalf: p(
    1.059,
    [1.059, 1.5],
    "sets",
    "Pelland 2025 (1-set value may be inflated)",
    "C",
    "WEAK-MODERATE"
  ),

  /** Frequency at equal volume, against twice a week. Part may be practice
   *  of the tested lift. */
  frequency1x: p(0.73, [0.73, 1], "× 2×", "Pelland 2025", "C", "WEAK-MODERATE"),
  frequency3x: p(1.14, [1, 1.14], "× 2×", "Pelland 2025", "C", "WEAK-MODERATE"),
  frequency4x: p(1.22, [1, 1.22], "× 2×", "Pelland 2025", "C", "WEAK-MODERATE"),

  /** Load zone against 8RM or heavier. Lopez 2021 gives only the order. */
  loadZoneModerate: p(
    0.875,
    [0.85, 0.9],
    "× heavy",
    "Lopez 2021 (order only)",
    "VF",
    "WEAK"
  ),
  loadZoneLight: p(
    0.65,
    [0.6, 0.7],
    "× heavy",
    "Lopez 2021 (order only)",
    "VF",
    "WEAK"
  ),

  /** Lower body, running alongside: moderately trained, sessions at least
   *  3 h apart, up to ~3 h of endurance a week (C_s). */
  concurrentLower: p(
    0.9,
    [0.85, 0.95],
    "× gain",
    "Petré 2021; Huiberts 2024; Schumann 2022",
    "VF",
    "WEAK"
  ),
  /** Leg sessions within a day of a long or hard run. Doma 2013 found no
   *  torque loss from a run. */
  legsAfterHardRun: p(
    0.95,
    [0.93, 0.97],
    "× P",
    "no source checked",
    "ASSUMPTION",
    "ASSUMPTION"
  ),

  /** A week with no sets loses this share of the gain so far. */
  detrainShareOfGain: p(
    0.019,
    [0.01, 0.05],
    "of gain/week",
    "Psilander 2019 (40% in 20 weeks); Ogasawara 2013",
    "VF",
    "WEAK"
  ),
  /** Below the best yet, gains come this much faster. */
  retrainMultiplier: p(
    1,
    [1, 1.7],
    "× rate",
    "Ogasawara 2013, Psilander 2019 (×1.0); Seaborne 2018 (×1.6–1.8)",
    "VF",
    "WEAK"
  ),
} as const;

/** What a person does with the plan. These dominate outcomes, so every
 *  comparison sweeps them. */
export const ADHERENCE = {
  /** Share of planned sessions done by someone still training. Fuente-Vidal
   *  2026: about half; running-evidence §6.7 assumes 0.75–0.95. */
  sessionShare: p(
    0.85,
    [0.5, 0.95],
    "of planned",
    "Fuente-Vidal 2026; running-evidence §6.7",
    "VF",
    "WEAK"
  ),
} as const;

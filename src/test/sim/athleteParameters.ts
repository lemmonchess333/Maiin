/**
 * Every parameter of the virtual athlete, in one table: its value, the range
 * a sweep covers, its source, the evidence marker and its grade, as in
 * docs/training-engine-2026-10/lifting-evidence.md §4.4 for the lifter and
 * running-evidence.md §6.2–6.7 for the runner. The models read their
 * numbers from here and nowhere else, so this table is the whole of what
 * the simulator assumes about a person.
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

/**
 * The virtual runner (running-evidence §6.2–6.7, `runner.ts`). Fitness and
 * fatigue are running averages of weekly effort-minutes (a quality minute
 * counts 1.3) over τ₁ and τ₂ days. True VDOT is the untrained base plus a
 * concave curve of fitness, H · r · (1 − e^(−F / w*)); on the day,
 * freshness (recent load below fitness) adds up to a taper's worth and
 * fatigue takes as much away.
 *
 * A linear Banister sum can't be fitted to both §6.1's gains and §6.4's
 * detraining with one gain; the concave curve holds both. At r = 1
 * (`runnerCalibration.test.ts` pins each): a VDOT 42 runner on 175 minutes
 * a week whose 16-week block adds 90 gains +2.1 VDOT (§6.1: +1.5–3); 1, 3,
 * 6 and 10 weeks off lose 0, 3.2, 7.5 and 11.3% (§6.4: 0–2, 3–6, 5–10,
 * 8–15); a VDOT 55 runner adding 60 minutes to 300 gains +0.9; a novice
 * going from 100 to 150 minutes gains +1.6 in 12 weeks (+1.5–3). A known
 * gap: fitness follows minutes, so a 2-week taper at half the easy minutes
 * nets only about +0.5%, against an observational +2.6% for a strict
 * 3-week taper (Smyth & Lawlor 2021).
 */
export const RUNNER = {
  fitnessTauDays: p(
    42,
    [30, 57],
    "days",
    "Peng 2023's 57 published sets: median 42, IQR 30–57 (§6.2)",
    "C",
    "WEAK-MODERATE"
  ),
  fatigueTauDays: p(
    10,
    [5, 16],
    "days",
    "Peng 2023: median 10, IQR 5–16 (§6.2)",
    "C",
    "WEAK-MODERATE"
  ),
  /** A quality minute (tempo, intervals, a race) against an easy one. The
   *  low end is the app's own effort-weighted minutes (`trainingLoad.ts`'s
   *  QUALITY_RUN_FACTOR), which §6.7 item 3 allows; Banister's TRIMP
   *  weighting makes a threshold minute about 2.1 and an interval minute
   *  about 2.6 easy ones, and session RPE about 2. Calibration runs on easy
   *  running, so this only moves what quality sessions buy: swept by the
   *  `intensity` variant. */
  qualityLoadFactor: p(
    1.3,
    [1.3, 2.5],
    "× minute",
    "trainingLoad.ts QUALITY_RUN_FACTOR; Banister TRIMP at threshold and interval heart rates [C]",
    "ASSUMPTION",
    "WEAK"
  ),
  /** VDOT above the untrained base at saturating load, before r. */
  headroom: p(
    15,
    [12, 18],
    "VDOT",
    "fit to §6.1's recreational and well-trained rows and §6.4's losses",
    "C",
    "WEAK"
  ),
  /** The weekly load at which 63% of the headroom is reached. */
  loadScale: p(250, [200, 300], "min/week", "the same fit", "C", "WEAK"),
  /** The most a taper (or the start of a break) adds, as a share of VDOT;
   *  sustained fatigue costs as much the other way. */
  freshnessCap: p(
    0.026,
    [0.018, 0.03],
    "of VDOT",
    "Smyth & Lawlor 2021: strict 3-week taper about 2.6% (1.8% adjusted)",
    "VF",
    "WEAK"
  ),
  /** r ~ lognormal(0, σ), drawn once per runner, scales the headroom. */
  responderSigma: p(
    0.4,
    [0.4, 0.5],
    "log-SD",
    "HERITAGE (Bouchard 1999): CV ≈ 0.5 with test noise, 0.41 without [C]",
    "C",
    "WEAK-MODERATE"
  ),
  /** Day-to-day variation in what the runner can do. */
  dayNoise: p(
    0.015,
    [0.01, 0.025],
    "of VDOT",
    "no source checked",
    "ASSUMPTION",
    "ASSUMPTION"
  ),
  /** Running-related injuries per 1000 h: a novice's first weeks, and a
   *  runner past them. */
  injuryNovice: p(
    30,
    [17.8, 33],
    "per 1000 h",
    "Videbæk 2015: 30.1–33.0 in the 8–13-week studies, 17.8 pooled",
    "VF",
    "MODERATE"
  ),
  injuryRecreational: p(
    7.7,
    [6.9, 8.7],
    "per 1000 h",
    "Videbæk 2015",
    "VF",
    "MODERATE"
  ),
  /** Weeks over which a novice's rate falls to a runner's. */
  noviceRiskWeeks: p(
    13,
    [8, 26],
    "weeks",
    "Videbæk 2015's short studies run 8–13 weeks; the fall itself is unsourced",
    "ASSUMPTION",
    "WEAK"
  ),
  /** A single run against the longest of the last 30 days (Frandsen 2025,
   *  first overuse injury): 10–30% longer, 30–100%, more than 100%. */
  spike10to30: p(1.64, [1.31, 2.05], "HRR", "Frandsen 2025", "VF", "MODERATE"),
  spike30to100: p(1.52, [1.16, 2], "HRR", "Frandsen 2025", "VF", "MODERATE"),
  spikeOver100: p(2.28, [1.5, 3.48], "HRR", "Frandsen 2025", "VF", "MODERATE"),
  /** For a year after an injury. */
  priorInjury: p(
    1.5,
    [1.5, 2],
    "×",
    "Fokkema 2019: RR ≈ 1.63 at a 29% baseline [C]; never the OR 2.21",
    "C",
    "MODERATE"
  ),
  /** What an injury does (Kluitenberg 2016, novices; others unsourced):
   *  running reduced, stopped 1–6 days, stopped a week or more. */
  injuryReducedShare: p(
    0.22,
    [0.22, 0.22],
    "of injuries",
    "Kluitenberg 2016",
    "VF",
    "WEAK-MODERATE"
  ),
  injuryShortShare: p(
    0.52,
    [0.52, 0.52],
    "of injuries",
    "Kluitenberg 2016",
    "VF",
    "WEAK-MODERATE"
  ),
  injuryShortDays: p(
    5,
    [4, 7],
    "days",
    "Kluitenberg 2016: medians 4–7 days",
    "VF",
    "WEAK-MODERATE"
  ),
  injuryLongDays: p(
    21,
    [20, 22],
    "days",
    "Kluitenberg 2016: medians 20–22 days, censored at 6 weeks",
    "VF",
    "WEAK-MODERATE"
  ),
  /** A beginner who lifts as well: the aerobic gain. */
  concurrentNovice: p(
    0.9,
    [0.8, 1],
    "× stimulus",
    "Huiberts 2024: SMD −0.35 (−0.70 to −0.01); §6.6",
    "VF",
    "WEAK"
  ),
  /** A quality run within two days of a heavy leg session. */
  afterHeavyLegs: p(
    0.9,
    [0.85, 0.95],
    "× stimulus",
    "Doma & Deakin 2013: running cost +5.3% at 24 h; §6.6",
    "VF",
    "WEAK"
  ),
} as const;

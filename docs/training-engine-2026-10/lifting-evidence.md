# Lifting programming for Tropos: the evidence base, expected progress, and the Lift4 gap analysis

Prepared 2026-10-06 by a research subagent for the multi-agent run that will build
the lifting model (powerlifting/strength, hypertrophy, powerbuilding, general
fitness, lifters who run) and a simulation of synthetic lifters over 16–52
weeks. It is planning material: nothing in it is decided. Index, verification
status and corrections: [README.md](README.md).

## Read this first

**How the evidence was gathered.** The egress proxy blocked WebFetch and shell
access to PubMed, PMC, Europe PMC, Crossref, SportRxiv, every publisher site
tried, Stronger By Science and Wikipedia. No full text was opened. Only the
web-search tool worked: its results carry abstract or summary text, and that
text is the basis for every claim marked [V]. The search tool allows 200 calls
per turn shared by every agent running in parallel. This agent verified about
50 sources before the shared budget ran out. Everything after that point comes
from prior knowledge and is marked [K].

| Marker | Meaning                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [V]    | Confirmed this session from abstract or summary text surfaced by search. The full text was not read.                                                                                                                     |
| [V*]   | Confirmed this session by the sibling running-research agent (`running-evidence.md` in this folder), and reused here with that attribution.                                                                              |
| [K]    | From prior knowledge of the published source. The citation is believed accurate, but the numbers and the DOI were **not** re-checked this session. Check them before quoting them in copy or encoding them as constants. |
| [R]    | Already in the repo (the lifting handoff's ledger or its "Contemporary evidence checkpoints"). Cited, not redone.                                                                                                        |

**Grades** (on claims): **STRONG** means meta-analyses or consistent RCTs.
**MODERATE** means several trials or one good meta-analysis with caveats.
**WEAK** means a single study, small samples, indirect evidence or expert
consensus. **CONVENTION** means coaching practice with no trial behind it.

**Population caveat.** Most trials run 6–12 weeks on young men who are untrained
or "recreationally trained". Advanced lifters, women, older adults and
anything longer than six months are underrepresented. Every projection beyond
12 weeks below is an extrapolation and says so.

**Not redone (already in the repo):** Zatsiorsky, Kraemer & Fry; Fleck & Kraemer;
Helms et al.'s _Pyramid_; Israetel et al.; Schoenfeld's textbook (handoff
lines 65–150); Ramos-Campo 2024, Robinson 2024 and Huiberts 2024 (handoff
~line 611); and the book reviews in `docs/proposals/training-book-reviews.md`
(Juggernaut squat/bench/deadlift manuals, Meadows, Nippard's chest/back/
shoulder programmes, Helms's _Pyramid_). The owner's coaching transcripts
(Sebastian Oreb) are summarised separately in `owner-lifting-sources.md`. This
file reconciles them with the research in §4.6 and does not repeat them.

## Source table

| Source                                                                                                                                                               | Type                                         | Year       | Best product use                                                                                                                                                                                                     | Key limitation                                                                                                 | Link / DOI / ISBN                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **VOLUME AND FREQUENCY**                                                                                                                                             |                                              |            |                                                                                                                                                                                                                      |                                                                                                                |                                                                                                 |
| Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC. The resistance training dose response: meta-regressions of weekly volume and frequency, _Sports Med_ [V] | meta-regression (67 studies, 2,058 people)   | 2025       | Dose-response shapes for weekly sets and frequency. Counting indirect sets as 0.5 ("fractional") fit hypertrophy best and direct-only counting fit strength best                                                     | Group averages from short trials; thresholds are detection points, not optima; coefficients need the full text | doi:10.1007/s40279-025-02344-w                                                                  |
| Remmert JF, Pelland JC et al. "Is there too much of a good thing?" Per-session volume meta-regressions [V]                                                           | meta-regression (preprint)                   | 2025       | Per-session caps: no detectable extra gain past ~11 fractional sets per muscle (hypertrophy) or ~2 direct sets (strength)                                                                                            | Preprint                                                                                                       | SportRxiv preprint 537                                                                          |
| Schoenfeld BJ, Ogborn D, Krieger JW. Weekly volume and muscle mass, _J Sports Sci_ 35(11):1073–82 [V]                                                                | meta-analysis (15 studies)                   | 2017       | About 0.37 percentage points more growth per extra weekly set; the "10+ sets" benchmark                                                                                                                              | Few studies; counted 1:1                                                                                       | doi:10.1080/02640414.2016.1210197                                                               |
| Baz-Valle E et al. Different training volumes and hypertrophy, _J Hum Kinet_ 81:199–210 [V]                                                                          | SR + meta (6 studies)                        | 2022       | 12–20 weekly sets per muscle as a default; more than 20 helped only the triceps                                                                                                                                      | Trained young men; small                                                                                       | doi:10.2478/hukin-2022-0017 [K: DOI]                                                            |
| Schoenfeld BJ, Contreras B, Krieger J et al. Volume and trained men, _MSSE_ 51(1):94–103 [K]                                                                         | RCT                                          | 2019       | 1, 3 or 5 sets per exercise: graded growth, similar 1RM                                                                                                                                                              | 8 weeks                                                                                                        | doi:10.1249/MSS.0000000000001764                                                                |
| Ralston GW et al. Weekly set volume and strength, _Sports Med_ 47(12):2585–601 [K]                                                                                   | meta-analysis                                | 2017       | More weekly sets moderately better than very few for 1RM                                                                                                                                                             | Heterogeneous                                                                                                  | doi:10.1007/s40279-017-0762-7                                                                   |
| Krieger JW. Single vs multiple sets for hypertrophy, _JSCR_ 24(4):1150–9 [K]                                                                                         | meta-analysis                                | 2010       | 2–3 sets per exercise beat 1                                                                                                                                                                                         | Older data                                                                                                     | doi:10.1519/JSC.0b013e3181d4d436                                                                |
| Schoenfeld BJ, Ogborn D, Krieger JW. Frequency and hypertrophy, _Sports Med_ 46(11):1689–97 [V]                                                                      | meta-analysis (10 studies)                   | 2016       | Twice a week per muscle beat once (ES 0.49 vs 0.30; ~6.8% vs 3.7% growth)                                                                                                                                            | Mostly not volume-equated                                                                                      | doi:10.1007/s40279-016-0543-8                                                                   |
| Schoenfeld BJ, Grgic J, Krieger J. How many times per week? _J Sports Sci_ 37(11):1286–95 [V]                                                                        | meta-analysis (25 studies)                   | 2019       | Volume-equated, frequency does not change hypertrophy                                                                                                                                                                | —                                                                                                              | doi:10.1080/02640414.2018.1555906                                                               |
| Grgic J et al. Frequency and strength, _Sports Med_ 48(5):1207–20 [V]                                                                                                | meta-analysis                                | 2018       | Higher frequency raised strength, mostly through added volume                                                                                                                                                        | —                                                                                                              | doi:10.1007/s40279-018-0872-x                                                                   |
| Ramos-Campo DJ et al. Split vs full body [R]                                                                                                                         | meta-analysis                                | 2024       | Split by schedule and preference when volume matches                                                                                                                                                                 | —                                                                                                              | PubMed 38595233                                                                                 |
| **LOAD, EFFORT AND REST**                                                                                                                                            |                                              |            |                                                                                                                                                                                                                      |                                                                                                                |                                                                                                 |
| Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW. Low vs high load, _JSCR_ 31(12):3508–23 [V]                                                                            | meta-analysis                                | 2017       | 1RM favours heavy loads; growth similar across loads taken to failure                                                                                                                                                | Low-load sets went to failure                                                                                  | doi:10.1519/JSC.0000000000002200                                                                |
| Lopez P et al. Load, hypertrophy and strength, _MSSE_ 53(6):1206–16 [V]                                                                                              | network meta (28 studies, 747)               | 2021       | Strength: high (≤8RM) and moderate (9–15RM) beat low (>15RM), SMD 0.60 and 0.34; high vs moderate 0.26, not significant. Growth load-independent                                                                     | Sets to failure                                                                                                | doi:10.1249/MSS.0000000000002585                                                                |
| Schoenfeld BJ, Grgic J, Van Every DW, Plotkin DL. The repetition continuum re-examined, _Sports_ 9(2):32 [V]                                                         | narrative review                             | 2021       | "Heavier for strength, wide range for size" replaces rep zones                                                                                                                                                       | Narrative                                                                                                      | doi:10.3390/sports9020032                                                                       |
| Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ. Proximity to failure and hypertrophy, _Sports Med_ 53(3):649–65 [V]                                           | meta-analysis (15 studies)                   | 2023       | Failure not superior to non-failure for growth; likely non-linear                                                                                                                                                    | Few trained cohorts                                                                                            | doi:10.1007/s40279-022-01784-y [K: DOI]                                                         |
| Robinson ZP, Pelland JC, Remmert JF, Refalo MC et al. Estimated proximity to failure [V][R]                                                                          | meta-regressions                             | 2024       | Growth rises as sets end closer to failure; strength flat across RIR                                                                                                                                                 | RIR inferred from study descriptions                                                                           | doi:10.1007/s40279-024-02069-2 [K: DOI]                                                         |
| Grgic J, Schoenfeld BJ, Orazem J, Sabol F. Failure vs non-failure, _J Sport Health Sci_ 11(2):202–11 [V]                                                             | meta-analysis (15 studies)                   | 2022       | No overall difference; non-failure better for strength when volume not equated (ES −0.32); failure slightly better for growth in trained (ES 0.15)                                                                   | —                                                                                                              | doi:10.1016/j.jshs.2021.01.007                                                                  |
| Refalo MC et al. Failure vs 1–2 RIR in trained people, _J Sports Sci_ [K]                                                                                            | within-participant RCT                       | 2024       | Similar growth at 0 and 1–2 RIR                                                                                                                                                                                      | 8 weeks                                                                                                        | doi:10.1080/02640414.2024.2321021 [K]                                                           |
| Schoenfeld BJ, Pope ZK, Benik FM et al. Longer interset rest, _JSCR_ 30(7):1805–12 [V]                                                                               | RCT (21 trained men)                         | 2016       | 3-min rest beat 1-min for squat/bench 1RM and muscle thickness                                                                                                                                                       | Small; 8 weeks                                                                                                 | doi:10.1519/JSC.0000000000001272 [K: DOI]                                                       |
| Singer A, Wolf M, Generoso L et al. "Give it a rest", _Front Sports Act Living_ 6:1429789 [V]                                                                        | Bayesian meta (9 studies)                    | 2024       | Small growth benefit from resting more than ~60 s                                                                                                                                                                    | 19 measurements                                                                                                | doi:10.3389/fspor.2024.1429789                                                                  |
| Grgic J et al. Rest interval and strength, _Sports Med_ 48(1):137–51 [K]                                                                                             | systematic review                            | 2018       | Trained lifters: rests over 2 min for strength                                                                                                                                                                       | —                                                                                                              | doi:10.1007/s40279-017-0788-x                                                                   |
| **PERIODIZATION, AUTOREGULATION, PROGRESSION**                                                                                                                       |                                              |            |                                                                                                                                                                                                                      |                                                                                                                |                                                                                                 |
| Williams TD, Tolusso DV, Fedewa MV, Esco MR. Periodized vs non-periodized, _Sports Med_ 47(10):2083–100 [V]                                                          | meta-analysis (18 studies)                   | 2017       | Periodized beat non-periodized for 1RM (ES 0.43); undulating favoured; larger in untrained                                                                                                                           | Volume often unequal                                                                                           | doi:10.1007/s40279-017-0734-y                                                                   |
| Moesgaard L, Beck MM, Christiansen L, Aagaard P, Lundbye-Jensen J. Periodization, volume-equated, _Sports Med_ 52(7):1647–66 [V]                                     | meta-analysis (35 RCTs, 1,187)               | 2022       | Periodization helps 1RM (ES 0.31) but not hypertrophy                                                                                                                                                                | —                                                                                                              | doi:10.1007/s40279-021-01636-1                                                                  |
| Grgic J, Mikulic P, Podnar H, Pedisic Z. Linear vs daily undulating, _PeerJ_ 5:e3695 [V]                                                                             | meta-analysis (13 studies)                   | 2017       | Same hypertrophy (d = −0.02)                                                                                                                                                                                         | Mostly untrained                                                                                               | doi:10.7717/peerj.3695                                                                          |
| Helms ER et al. RPE vs %1RM loading, _Front Physiol_ 9:247 [V]                                                                                                       | RCT (21 trained men)                         | 2018       | RPE-chosen loads ≥ fixed %: bench +10.7 vs +9.6 kg, squat +17.1 vs +13.9 kg in 8 weeks                                                                                                                               | Small                                                                                                          | doi:10.3389/fphys.2018.00247                                                                    |
| Graham T, Cleather DJ. RIR autoregulation vs fixed loading, _JSCR_ [V]                                                                                               | RCT (31 trained men)                         | 2021       | RIR-chosen squat loads beat fixed % over 12 weeks                                                                                                                                                                    | One lift                                                                                                       | doi:10.1519/JSC.0000000000003164 [K: DOI]                                                       |
| Hickmott LM, Chilibeck PD, Shaw KA, Butcher SJ. Load and volume autoregulation, _Sports Med Open_ 8:9 [V]                                                            | meta-analysis (15 studies)                   | 2022       | Autoregulated ≈ fixed % (+2.1 kg, ns); velocity loss ≤25% gave more 1RM, >25% more CSA                                                                                                                               | Few studies                                                                                                    | doi:10.1186/s40798-021-00404-9                                                                  |
| Larsen S, Kristiansen E, van den Tillaar R. Autoregulation methods, _PeerJ_ 9:e10663 [K]                                                                             | systematic review                            | 2021       | Autoregulation comparable or better                                                                                                                                                                                  | —                                                                                                              | doi:10.7717/peerj.10663                                                                         |
| Zourdos MC et al. RIR-based RPE scale, _JSCR_ 30(1):267–75 [V]                                                                                                       | validation (29)                              | 2016       | RPE tracks bar speed; experienced squatters rate near-max sets more accurately                                                                                                                                       | Squat only                                                                                                     | doi:10.1519/JSC.0000000000001049                                                                |
| Helms ER, Cronin J, Storey A, Zourdos MC. Applying the RIR-RPE scale, _Strength Cond J_ 38(4):42–9 [K]                                                               | applied review                               | 2016       | How to prescribe with RPE                                                                                                                                                                                            | —                                                                                                              | doi:10.1519/SSC.0000000000000218                                                                |
| Halperin I et al. Predicting reps to failure, _Sports Med_ 52:377–90 [V]                                                                                             | scoping review + meta (12 studies, 414)      | 2022       | People under-predict reps left by ~1; worse above 12 reps and far from failure                                                                                                                                       | Heterogeneous                                                                                                  | doi:10.1007/s40279-021-01559-x [K: DOI]                                                         |
| Plotkin D et al. Progressing load vs repetitions, _PeerJ_ 10:e14142 [K]                                                                                              | RCT                                          | 2022       | Adding reps ≈ adding load for growth and strength                                                                                                                                                                    | 8 weeks                                                                                                        | doi:10.7717/peerj.14142                                                                         |
| **SPECIFICITY, MINIMAL DOSE, DELOADS, TAPERS**                                                                                                                       |                                              |            |                                                                                                                                                                                                                      |                                                                                                                |                                                                                                 |
| Mattocks KT et al. Practising the test, _MSSE_ 49(9):1945–54 [V]                                                                                                     | RCT (38 untrained)                           | 2017       | 1RM practice alone matched high-volume training for 1RM gains (not for size)                                                                                                                                         | Untrained; 8 weeks                                                                                             | doi:10.1249/MSS.0000000000001300                                                                |
| Androulakis-Korakakis P, Fisher JP, Steele J. Minimum effective dose for 1RM, _Sports Med_ 50(4):751–65 [V]                                                          | SR + meta                                    | 2020       | One set of 6–12 at 70–85%, 2–3×/week, near failure, raises 1RM in trained men, sub-optimally                                                                                                                         | Trained men only                                                                                               | doi:10.1007/s40279-019-01236-0                                                                  |
| Spiering BA, Mujika I, Sharp MA, Foulis SA. Minimal dose to maintain, _JSCR_ 35(5):1449–58 [V]                                                                       | review                                       | 2021       | Strength and size kept up to 32 weeks on 1 session and 1 set per exercise a week, if intensity is kept                                                                                                               | Few trials                                                                                                     | doi:10.1519/JSC.0000000000003964                                                                |
| Bickel CS, Cross JM, Bamman MM. Dosing to retain adaptations, _MSSE_ 43(7):1177–87 [V citation; K results]                                                           | RCT                                          | 2011       | One ninth of the dose kept young adults' gains for 32 weeks; older adults needed about a third to keep size                                                                                                          | —                                                                                                              | doi:10.1249/MSS.0b013e318207c15d                                                                |
| Bell L, Strafford BW, Coleman M, Androulakis-Korakakis P, Nolan D. Deloading Delphi, _Sports Med Open_ 9:87 [V]                                                      | Delphi (34 → 21 coaches)                     | 2023       | Definition and design principles for deloads                                                                                                                                                                         | Expert opinion                                                                                                 | doi:10.1186/s40798-023-00633-0                                                                  |
| Rogerson D et al. Deloading practices survey, _Sports Med Open_ [V]                                                                                                  | survey (246 athletes)                        | 2024       | ~6-day deload every 5.6 ± 2.3 weeks; fewer sets and reps, more RIR, lighter loads, same exercises                                                                                                                    | Self-report; competitive athletes                                                                              | doi:10.1186/s40798-024-00691-y                                                                  |
| Coleman M et al. A one-week deload mid-programme, _PeerJ_ 12:e16777 [V]                                                                                              | RCT (50 trained)                             | 2024       | A week off at the midpoint of 9 weeks slightly reduced lower-body strength gains; no effect on growth                                                                                                                | The "deload" was total cessation                                                                               | doi:10.7717/peerj.16777                                                                         |
| Pritchard HJ, Keogh JW, Barnes MJ, McGuigan MR. NZ powerlifters' tapers, _JSCR_ 30(7):1796–804 [V]                                                                   | interviews (11 elite)                        | 2016       | Volume −59%; last heavy session ~3.7 days out; volume peaks ~5 weeks out, intensity ~2 weeks out                                                                                                                     | n = 11                                                                                                         | doi:10.1519/JSC.0000000000001292 [K: DOI]                                                       |
| Pritchard H et al. Tapering for strength, _Strength Cond J_ 37(2):72–83 [K]                                                                                          | review                                       | 2015       | Mechanisms of strength tapers                                                                                                                                                                                        | —                                                                                                              | doi:10.1519/SSC.0000000000000125                                                                |
| Travis SK, Mujika I, Gentles JA, Stone MH, Bazyler CD. Tapering and peaking for powerlifting, _Sports_ 8(9):125 [V]                                                  | review                                       | 2020       | Step or exponential taper; volume-load about halved over 2 ± 1 weeks                                                                                                                                                 | Few powerlifting trials                                                                                        | doi:10.3390/sports8090125                                                                       |
| Bosquet L et al. Tapering meta-analysis, _MSSE_ 39(8):1358–65 [K]                                                                                                    | meta-analysis (endurance)                    | 2007       | ~2-week taper, volume −41–60%, intensity and frequency kept                                                                                                                                                          | Endurance                                                                                                      | doi:10.1249/mss.0b013e31806010e0                                                                |
| **EXERCISE SELECTION AND RANGE OF MOTION**                                                                                                                           |                                              |            |                                                                                                                                                                                                                      |                                                                                                                |                                                                                                 |
| Maeo S et al. Seated vs prone leg curl, _MSSE_ 53(4):825–37 [V]                                                                                                      | within-subject RCT (20)                      | 2021       | Seated curl (hamstrings lengthened) grew more                                                                                                                                                                        | Untrained                                                                                                      | doi:10.1249/MSS.0000000000002523                                                                |
| Maeo S et al. Overhead vs neutral triceps extension, _Eur J Sport Sci_ 23(7):1240–50 [V]                                                                             | within-subject RCT (21)                      | 2023       | Overhead: ~1.4× triceps growth (19.9% vs 13.9%; long head 28.5% vs 19.6%)                                                                                                                                            | Untrained; cable only                                                                                          | doi:10.1080/17461391.2022.2100279                                                               |
| Kassiano W et al. Calf partials at long lengths, _JSCR_ 37(9):1746–53 [V]                                                                                            | RCT (42 women)                               | 2023       | Long-length partials beat full ROM for medial gastrocnemius (+15.2% vs +6.7%)                                                                                                                                        | Untrained women; calves                                                                                        | doi:10.1519/JSC.0000000000004460 [K: DOI]                                                       |
| Pedrosa GF et al. Partial ROM at long lengths, _Eur J Sport Sci_ 22(8):1250–60 [K]                                                                                   | RCT                                          | 2022       | Long-length partials ≥ full ROM (knee extension)                                                                                                                                                                     | Untrained                                                                                                      | doi:10.1080/17461391.2021.1927199                                                               |
| Wolf M, Androulakis-Korakakis P, Fisher J, Schoenfeld B, Steele J. Partial vs full ROM, _Int J Strength Cond_ 3(1) [V]                                               | SR + meta                                    | 2023       | Full or long ROM slightly better for most outcomes; strength is ROM-specific                                                                                                                                         | Small effects                                                                                                  | doi:10.47206/ijsc.v3i1.182                                                                      |
| Strey et al. Partials at long vs short muscle lengths, _Sport Sci Health_ [V]                                                                                        | meta-analysis (8 studies)                    | 2026       | Long-length partials beat short-length partials (ES 0.28)                                                                                                                                                            | Mostly quadriceps                                                                                              | doi:10.1007/s11332-025-01586-5                                                                  |
| Wolf M et al. Longer-length training and longitudinal growth [V: finding]                                                                                            | systematic review                            | 2025       | Longer-length training consistently grows more                                                                                                                                                                       | Not read in full                                                                                               | ScienceDirect S2666337625000332                                                                 |
| Kassiano W et al. Exercise variation and hypertrophy, _JSCR_ 36(6):1753–62 [K]                                                                                       | systematic review                            | 2022       | Some variation spreads growth across regions; excessive rotation can cost strength                                                                                                                                   | Few trials                                                                                                     | doi:10.1519/JSC.0000000000004258                                                                |
| **REPS, %1RM AND e1RM**                                                                                                                                              |                                              |            |                                                                                                                                                                                                                      |                                                                                                                |                                                                                                 |
| Nuzzo JL, Pinto MD, Nosaka K, Steele J. Reps at %1RM, _Sports Med_ 54(2):303–21 [V]                                                                                  | meta-regression (269 studies, 7,289 people)  | 2024       | Mean and between-person SD of reps to failure at each %1RM; little moderation by sex, age or training status; separate bench and leg-press tables                                                                    | Read the tables from the paper before coding                                                                   | doi:10.1007/s40279-023-01937-7                                                                  |
| LeSuer DA et al. Accuracy of 1RM equations, _JSCR_ 11(4):211–3 [V]                                                                                                   | validation                                   | 1997       | Equations under-predicted deadlift 1RM by 9–14%                                                                                                                                                                      | Small                                                                                                          | JSCR 11(4):211–3                                                                                |
| Reynolds JM, Gordon TJ, Robergs RA. 1RM from multiple-RM tests, _JSCR_ 20(3):584–92 [V]                                                                              | validation                                   | 2006       | Estimate from 10 reps or fewer                                                                                                                                                                                       | Two exercises                                                                                                  | JSCR 20(3):584–92                                                                               |
| Brzycki M (1993), _JOPERD_ 64(1):88–90; Epley B. Poundage chart (1985) [K]                                                                                           | formulas                                     | 1985/1993  | Baseline e1RM formulas                                                                                                                                                                                               | Fit to ~2–10 reps                                                                                              | doi:10.1080/07303084.1993.10606684                                                              |
| Marzagao T. Weight-dependent 1RM equation from 303,494 near-failure sets (Fitbod data) [V]                                                                           | cohort (app logs), preprint                  | 2026       | Letting Epley's factor vary with the load cut inconsistency 17–22% against Epley, Brzycki, Wathen, Mayhew                                                                                                            | Consistency, not tested 1RMs                                                                                   | arXiv:2603.17495                                                                                |
| Grgic J, Lazinica B, Schoenfeld BJ, Pedisic Z. 1RM reliability, _Sports Med Open_ 6:31 [V]                                                                           | systematic review (32 studies, 1,595)        | 2020       | Noise floor: median ICC 0.97, median CV 4.2% (range 0.5–12.1%)                                                                                                                                                       | Mixes learning and daily noise                                                                                 | doi:10.1186/s40798-020-00260-z                                                                  |
| **RESPONSE, SEX, AGE, DETRAINING**                                                                                                                                   |                                              |            |                                                                                                                                                                                                                      |                                                                                                                |                                                                                                 |
| Hubal MJ et al. Variability of gains, _MSSE_ 37(6):964–72 [V]                                                                                                        | multicentre trial (585)                      | 2005       | 12 weeks: elbow-flexor 1RM 0 to +250% (0 to +10.2 kg); CSA −2 to +59%                                                                                                                                                | Untrained; includes noise                                                                                      | doi:10.1249/01.mss.0000170469.90461.5f [K: DOI]                                                 |
| Ahtiainen JP et al. Heterogeneity of responses, _Age_ 38:10 [V]                                                                                                      | pooled cohort (287)                          | 2016       | Untrained, 20–24 weeks: strength +21 ± 12% (−8 to +60), size +4.8 ± 6.1% (−11 to +30)                                                                                                                                | Mixed ages and programmes                                                                                      | doi:10.1007/s11357-015-9870-1 [K: DOI]                                                          |
| Hammarström D et al. Volume and ribosome biogenesis, _J Physiol_ 598(3):543–65 [V]                                                                                   | within-participant RCT (34)                  | 2020       | 3 sets beat 1 set (CSA +5.2% vs +3.7%); ~38% (size) and ~47% (strength) of people clearly benefited                                                                                                                  | Untrained; 12 weeks                                                                                            | doi:10.1113/JP278455                                                                            |
| Dankel SJ, Loenneke JP (2020), _Sports Med_; Hecksteden A et al. (2015), _J Appl Physiol_ [V]                                                                        | methods papers                               | 2015/2020  | Observed spread overstates true responder variance; correct for random error with a control                                                                                                                          | —                                                                                                              | doi:10.1007/s40279-019-01147-0 [K]; doi:10.1152/japplphysiol.00714.2014 [K]                     |
| Robinson ZP, Steele J, Helms ER, Trexler ET et al. Volume and individual-level adaptation: a replicated within-participant trial [V: existence]                      | RCT (conference abstract / bioRxiv)          | 2025       | The first design able to estimate true individual volume response                                                                                                                                                    | Not yet published in full                                                                                      | Jyväskylä conference, Nov 2025                                                                  |
| Roberts BM, Nuckols G, Krieger JW. Sex differences, _JSCR_ 34(5):1448–60 [K]                                                                                         | meta-analysis                                | 2020       | Similar relative growth and lower-body strength gains; women gain more relative upper-body strength                                                                                                                  | Short trials                                                                                                   | doi:10.1519/JSC.0000000000003521                                                                |
| Refalo MC et al. Sex differences in muscle growth, _PeerJ_ 13:e19042 [K]                                                                                             | Bayesian meta                                | 2025       | Relative growth similar; men larger absolute                                                                                                                                                                         | —                                                                                                              | doi:10.7717/peerj.19042 [K]                                                                     |
| Jones MD et al. Sex differences in older adults, _Sports Med_ 51(3):503–17 [K]                                                                                       | meta-analysis                                | 2021       | Older men gain more in absolute terms; relative gains similar                                                                                                                                                        | —                                                                                                              | doi:10.1007/s40279-020-01388-4                                                                  |
| Peterson MD, Rhea MR, Sen A, Gordon PM. Older adults' strength, _Ageing Res Rev_ 9(3):226–37 [K]                                                                     | meta-analysis                                | 2010       | Older adults gain ~25–30% strength; heavier loads gain more                                                                                                                                                          | —                                                                                                              | doi:10.1016/j.arr.2010.03.004                                                                   |
| Ogasawara R et al. Continuous vs periodic training, _Eur J Appl Physiol_ 113(4):975–85 [K]                                                                           | RCT                                          | 2013       | 3-week breaks after every 6 weeks gave the same 24-week bench and CSA gains as training throughout                                                                                                                   | Bench only; untrained                                                                                          | doi:10.1007/s00421-012-2511-9                                                                   |
| Psilander N et al. Training, detraining, retraining, _J Appl Physiol_ 126(6):1636–45 [K]                                                                             | RCT                                          | 2019       | Strength partly kept after 20 weeks off; retraining fast; no clear myonuclear advantage                                                                                                                              | Small                                                                                                          | doi:10.1152/japplphysiol.00917.2018                                                             |
| Seaborne RA et al. Epigenetic memory of hypertrophy, _Sci Rep_ 8:1898 [K]                                                                                            | trial (n = 8)                                | 2018       | Faster regrowth on retraining                                                                                                                                                                                        | Very small                                                                                                     | doi:10.1038/s41598-018-20287-3                                                                  |
| Bosquet L et al. Training cessation and muscular performance, _Scand J Med Sci Sports_ 23(3):e140–9 [K]                                                              | meta-analysis                                | 2013       | Small losses at first, growing with time off                                                                                                                                                                         | —                                                                                                              | doi:10.1111/sms.12047                                                                           |
| **CONCURRENT TRAINING AND ENERGY BALANCE**                                                                                                                           |                                              |            |                                                                                                                                                                                                                      |                                                                                                                |                                                                                                 |
| Wilson JM et al. Concurrent training meta-analysis, _JSCR_ 26(8):2293–307 [V*]                                                                                       | meta-analysis                                | 2012       | Interference grows with endurance frequency and duration; running worse than cycling; power suffers most. ES lift-only vs concurrent [K]: size 1.23 vs 0.85, strength 1.76 vs 1.44, power 0.91 vs 0.55               | Older studies                                                                                                  | doi:10.1519/JSC.0b013e31823a3e2d                                                                |
| Schumann M et al. Concurrent compatibility, _Sports Med_ 52(3):601–12 [V*]                                                                                           | meta-analysis                                | 2022       | No interference on average for hypertrophy or maximal strength; explosive strength blunted, more within one session                                                                                                  | —                                                                                                              | doi:10.1007/s40279-021-01587-7                                                                  |
| Huiberts RO, Wüst RCI, van der Zwaard S. Sex and training status, _Sports Med_ [V\*][R]                                                                              | meta-analysis                                | 2024       | Lower-body strength blunted in men (−0.43) but not women (0.08)                                                                                                                                                      | —                                                                                                              | PubMed 37847373; doi:10.1007/s40279-023-01943-9 [K: DOI]                                        |
| Petré H et al. Concurrent 1RM by training status, _Sports Med_ 51:991–1010 [V*]                                                                                      | meta-analysis                                | 2021       | Lower-body 1RM blunted only in trained people                                                                                                                                                                        | —                                                                                                              | doi:10.1007/s40279-021-01426-9                                                                  |
| Lundberg TR et al. Concurrent training and fibre hypertrophy, _Sports Med_ [V*]                                                                                      | meta-analysis                                | 2022       | Small negative effect on fibre growth, perhaps larger with running                                                                                                                                                   | —                                                                                                              | doi:10.1007/s40279-022-01688-x                                                                  |
| Murlasits Z et al. (2018); Eddens L et al. (2018) [V*/K]                                                                                                             | meta-analyses                                | 2018       | Within one session, lift before running for lower-body strength                                                                                                                                                      | —                                                                                                              | doi:10.1080/02640414.2017.1364405; doi:10.1007/s40279-017-0784-1                                |
| Robineau J et al., _JSCR_ [V*]                                                                                                                                       | RCT                                          | 2016       | Separate conflicting sessions by ≥6 h; 24 h was best                                                                                                                                                                 | Rugby players                                                                                                  | PubMed 25546450                                                                                 |
| Doma K, Deakin GB (three studies) [V*]                                                                                                                               | lab studies                                  | 2013–14    | Leg strength work impairs running economy at 6 h and the next day                                                                                                                                                    | Small                                                                                                          | James Cook University repository                                                                |
| Blagrove RC et al. (2018); Llanos-Lagos C et al. (2024); Eihara Y et al. (2022) [V*]                                                                                 | SR / meta                                    | 2018–24    | Heavy strength training improves running economy (2–8%) and time trials                                                                                                                                              | Trained runners                                                                                                | doi:10.1007/s40279-017-0835-7; doi:10.1007/s40279-024-02018-z; doi:10.1186/s40798-022-00511-1   |
| Rønnestad BR, Hansen EA, Raastad T. In-season maintenance, _EJAP_ 110:1269–82 [K]                                                                                    | RCT                                          | 2010       | One heavy session a week kept strength in cyclists                                                                                                                                                                   | Cyclists                                                                                                       | doi:10.1007/s00421-010-1622-4                                                                   |
| Murphy C, Koehler K. Energy deficiency and training, _Scand J Med Sci Sports_ 32(1):125–37 [K]                                                                       | meta-regression                              | 2022       | Deficits blunt lean-mass gains, not strength gains                                                                                                                                                                   | —                                                                                                              | doi:10.1111/sms.14075                                                                           |
| Morton RW et al. Protein meta-analysis, _BJSM_ 52(6):376–84 [K]                                                                                                      | meta-analysis                                | 2018       | Lean-mass benefit plateaus near 1.6 g/kg/day                                                                                                                                                                         | —                                                                                                              | doi:10.1136/bjsports-2017-097608                                                                |
| **LONG-TERM PROGRESS AND MODELLING**                                                                                                                                 |                                              |            |                                                                                                                                                                                                                      |                                                                                                                |                                                                                                 |
| Latella C, Teo WP, Spathis J, van den Hoek D. 15-year powerlifting analysis, _JSCR_ 34(9):2412–8 [K]                                                                 | longitudinal cohort (meet results)           | 2020       | Shape of long-term gains: fastest in year 1, slowing over years                                                                                                                                                      | Competitors; meet totals                                                                                       | doi:10.1519/JSC.0000000000003657                                                                |
| Steele J et al. Long-term strength time course, _Res Q Exerc Sport_ [K]                                                                                              | retrospective growth modelling (gym records) | 2023       | Log-like deceleration under minimal-dose training                                                                                                                                                                    | Machines, single sets                                                                                          | doi:10.1080/02701367.2022.2070592                                                               |
| van den Hoek D et al. Normative powerlifting data (809,986 entries), _J Sci Med Sport_ [K]                                                                           | normative cohort                             | 2024       | Priors for ceilings by sex, age and bodyweight                                                                                                                                                                       | Competitors                                                                                                    | doi:10.1016/j.jsams.2024.07.005 [K]                                                             |
| ACSM position stand on progression models (Ratamess NA et al.), _MSSE_ 41(3):687–708 [K]                                                                             | position stand                               | 2009       | Typical gains by status: ~40% untrained, 20% moderately trained, 16% trained, 10% advanced, 2% elite, over 4 weeks to 2 years                                                                                        | Heterogeneous periods                                                                                          | doi:10.1249/MSS.0b013e3181915670                                                                |
| Rhea MR et al. (2003) _MSSE_ 35(3):456–64; Peterson MD et al. (2004) _JSCR_ 18(2):377–82 [K]                                                                         | meta-analyses                                | 2003–04    | Strength dose-response by training status                                                                                                                                                                            | Dated effect-size methods                                                                                      | doi:10.1249/01.MSS.0000053727.63505.D4                                                          |
| Ahtiainen JP et al. Trained vs untrained over 21 weeks, _EJAP_ 89:555–63 [K]                                                                                         | trial                                        | 2003       | Far smaller gains in trained than in untrained men                                                                                                                                                                   | Small                                                                                                          | doi:10.1007/s00421-003-0833-3                                                                   |
| Banister EW, Calvert TW et al. (1975–76); Busso T et al., weightlifters, _EJAP_ 61:48–54 (1990); Busso T, _MSSE_ 35(7):1188–95 (2003) [K]                            | models                                       | 1975–2003  | Fitness–fatigue impulse-response model, fitted to weightlifters; variable fatigue gain                                                                                                                               | Parameters unstable                                                                                            | doi:10.1007/BF00236693; doi:10.1249/01.MSS.0000074465.13621.37                                  |
| Chiu LZF, Barnes JL. Fitness–fatigue revisited, _Strength Cond J_ 25(6):42–51 [K]                                                                                    | review                                       | 2003       | Applying the model to resistance-training planning                                                                                                                                                                   | Conceptual                                                                                                     | Strength Cond J 25(6):42–51                                                                     |
| Hellard P et al. Limits of the Banister model, _J Sports Sci_ 24(5):509–20 [K]                                                                                       | modelling study                              | 2006       | Ill-conditioned parameters; poor individual prediction                                                                                                                                                               | Swimmers                                                                                                       | doi:10.1080/02640410500244697                                                                   |
| Stephens Hemingway BH, Burgess KE, Elyan E, Swinton PA. Fitness–fatigue for resistance training, _Int J Sports Sci Coach_ 15(1):60–71 [K]                            | simulation study                             | 2020       | Measurement error and test frequency limit model fitting in resistance training                                                                                                                                      | Simulation                                                                                                     | doi:10.1177/1747954119887721 [K]                                                                |
| Clarke DC, Skiba PF. Modelling training and performance, _Adv Physiol Educ_ 37(2):134–52 [K]                                                                         | teaching review                              | 2013       | Equations and typical parameter ranges                                                                                                                                                                               | Endurance-oriented                                                                                             | doi:10.1152/advan.00078.2011                                                                    |
| **CONSENSUS STATEMENTS**                                                                                                                                             |                                              |            |                                                                                                                                                                                                                      |                                                                                                                |                                                                                                 |
| ACSM Position Stand: resistance training prescription (Phillips SM, chair; Currier BS, Schoenfeld BJ et al.), _MSSE_ [V]                                             | overview of 137 reviews (>30,000 people)     | 2026       | Each muscle ≥2×/week; strength from ≥80% 1RM, 2–3 sets, early in the session; hypertrophy from ~10+ sets/muscle/week with more helping; failure, equipment type and complex periodization not consistently important | Average healthy adults, not peaking athletes                                                                   | doi:10.1249/MSS.0000000000003897                                                                |
| Currier BS et al. Bayesian network meta-analysis, _BJSM_ 57(18):1211–20 [V]                                                                                          | network meta-analysis                        | 2023       | Strength: heavy, multiple sets, ≥2×/week; size: multiple sets                                                                                                                                                        | Average effects                                                                                                | doi:10.1136/bjsports-2023-106807                                                                |
| Schoenfeld BJ et al. IUSCA hypertrophy position stand, _Int J Strength Cond_ 1(1) [K]                                                                                | position stand                               | 2021       | ≥10 sets/muscle/week, ≥2×/week, wide load range, near failure                                                                                                                                                        | Athletes                                                                                                       | doi:10.47206/ijsc.v1i1.81                                                                       |
| Helms ER, Fitschen PJ, Aragon AA, Cronin J, Schoenfeld BJ. Natural bodybuilding: training, _J Sports Med Phys Fitness_ 55(3):164–78 [K]                              | review                                       | 2015       | Physique athletes: moderate volume, ~2×/week per muscle, keep load and effort through a cut                                                                                                                          | Contest prep                                                                                                   | J Sports Med Phys Fitness 55(3):164–78                                                          |
| Helms ER, Aragon AA, Fitschen PJ. Natural bodybuilding: nutrition, _JISSN_ 11:20 [K]                                                                                 | review                                       | 2014       | Slow loss rate and high protein in a cut                                                                                                                                                                             | —                                                                                                              | doi:10.1186/1550-2783-11-20                                                                     |
| **BOOKS AND COACHING SYSTEMS**                                                                                                                                       |                                              |            |                                                                                                                                                                                                                      |                                                                                                                |                                                                                                 |
| Sheiko B. _Powerlifting: Foundations and Methods_ (English edition) [K]                                                                                              | book (coach)                                 | 2018       | Per-lift frequency and submaximal practice; volume as number of lifts and average intensity                                                                                                                          | Soviet sport-school context; competitive lifters                                                               | ISBN not re-checked                                                                             |
| Tuchscherer M. _The Reactive Training Manual_; Reactive Training Systems [K]                                                                                         | book / coach                                 | 2008       | RPE anchored to reps in reserve; top set then load-drop or fatigue-percentage back-offs; e1RM tracking                                                                                                               | Needs accurate RPE; self-published                                                                             | reactivetrainingsystems.com                                                                     |
| Smith CW. _The Juggernaut Method 2.0_ [K]                                                                                                                            | book (coach)                                 | 2012–13    | Rep waves with accumulation, intensification, realisation (AMRAP) and deload phases; AMRAP updates the training max                                                                                                  | AMRAP fatigue; no trials                                                                                       | jtsstrength.com                                                                                 |
| Wendler J. _5/3/1 Forever_ [K]                                                                                                                                       | book (coach)                                 | 2017       | Training max below true max; small fixed increases; leader/anchor blocks; deload and test weeks                                                                                                                      | Fixed rate whatever the response                                                                               | jimwendler.com                                                                                  |
| Rippetoe M, Baker A. _Practical Programming for Strength Training_, 3rd ed. [K]                                                                                      | book (coach)                                 | 2014       | Training age defined by how fast someone recovers and progresses: by session, week or month                                                                                                                          | Barbell- and strength-only; anecdotal                                                                          | The Aasgaard Company; ISBN not re-checked                                                       |
| Texas Method (Pendlay; described in _Practical Programming_); Madcow 5×5 (after Bill Starr) [K]                                                                      | coach programmes                             | 2000s      | Intermediate weekly progression: volume, light and intensity days                                                                                                                                                    | Grinding intensity days                                                                                        | startingstrength.com; archived Madcow pages                                                     |
| Lefever C. GZCL method [K]                                                                                                                                           | coach (blog)                                 | 2012+      | Tiers: heavy mains, moderate secondaries, high-rep accessories                                                                                                                                                       | No trials                                                                                                      | swoleateveryheight.blogspot.com                                                                 |
| Candito J. 6-Week Strength Program [K]                                                                                                                               | coach programme                              | ~2013      | A short block sequence ending in a test                                                                                                                                                                              | Generic                                                                                                        | canditotraininghq.com                                                                           |
| Calgary Barbell (Krawczyk B) 8- and 16-week programmes [K]                                                                                                           | coach programmes                             | 2018+      | RPE top sets plus back-offs; competition variations; peaking                                                                                                                                                         | Meet-focused; needs RPE literacy                                                                               | calgarybarbell.com                                                                              |
| Stronger By Science (Nuckols G et al.): programmes and articles [V: the volume article]                                                                              | coach / evidence reviews                     | 2016–2025  | AMRAP- or RIR-driven max updates; plain-language syntheses                                                                                                                                                           | Commercial programmes untested                                                                                 | strongerbyscience.com/volume                                                                    |
| Simmons L. _The Westside Barbell Book of Methods_ [K]                                                                                                                | book (coach)                                 | 2007       | Rotating max-effort variations; dynamic-effort speed work; weak-point accessories                                                                                                                                    | Equipped, often enhanced lifters                                                                               | westside-barbell.com                                                                            |
| Prilepin's chart (A.S. Prilepin, 1970s; via Laputin & Oleshko, 1982, and Hatfield) [K]                                                                               | coach convention                             | 1970s      | Reps per set and total reps by intensity zone, as a sanity check                                                                                                                                                     | Olympic weightlifting; never validated                                                                         | —                                                                                               |
| Bompa TO, Buzzichelli C. _Periodization: Theory and Methodology of Training_, 6th ed. [K]                                                                            | book                                         | 2019       | Phase vocabulary: anatomical adaptation, hypertrophy, max strength, conversion, maintenance                                                                                                                          | Theory-heavy; little trial support for phase lengths                                                           | ISBN 978-1-4925-4480-7 [K]                                                                      |
| Stone MH, Stone M, Sands WA. _Principles and Practice of Resistance Training_ [K]                                                                                    | book                                         | 2007       | Block periodization, fitness–fatigue, monitoring                                                                                                                                                                     | Athlete focus                                                                                                  | ISBN 978-0-88011-706-7 [K]                                                                      |
| PHUL (B. Campbell), PHAT (L. Norton), Nippard J. powerbuilding programmes [K]                                                                                        | coach programmes                             | 2008–2020s | Powerbuilding: heavy compound days plus hypertrophy days; RPE top sets plus back-offs                                                                                                                                | Commercial; untested                                                                                           | muscleandstrength.com; jeffnippard.com                                                          |
| **APPS**                                                                                                                                                             |                                              |            |                                                                                                                                                                                                                      |                                                                                                                |                                                                                                 |
| JuggernautAI; RP Hypertrophy; MacroFactor Workouts; Fitbod; Alpha Progression; Gravl [K]                                                                             | apps (published descriptions)                | 2019–2025  | How commercial adaptive models describe themselves (§5)                                                                                                                                                              | Descriptions not re-read this session; no validation data                                                      | juggernautai.app; rpstrength.com; macrofactorapp.com; fitbod.me; alphaprogression.com; gravl.ai |

Seen in search but not read: "Exploring the Upper Limits of Resistance Training
Volume for Muscle Hypertrophy and Strength in Trained Athletes", _J Sci Sport
Exerc_ (2026), doi:10.1007/s42978-026-00387-7; Kassiano et al. (2025) on
past-failure partials for the calves in trained lifters (_Eur J Sport Sci_);
"Regional hypertrophy — does muscle length matter?" (SportRxiv 464).

---

## 0. The findings that matter most for decisions

1. **Volume drives hypertrophy, with diminishing returns. Strength saturates
   on volume quickly and depends more on load, frequency and specificity.**
   STRONG for the shapes, MODERATE for the thresholds. Pelland 2025: both
   outcomes rise with weekly sets (posterior probability 100%). Strength
   flattens far sooner: past roughly 5 direct sets a week, and about 2 per
   session, extra sets add less than the smallest detectable effect.
   Hypertrophy keeps rising slowly, with no detectable advantage past about 30
   fractional sets a week.
2. **ADR-0010's flip to 1:1 counting runs against the newest evidence.**
   MODERATE. _(Integration correction: the flip is not planned, it LANDED on
   2026-08-03 — `SECONDARY_SET_WEIGHT = 1.0` in `volumeModel.ts`, recorded in
   the ADR's second addendum. Read "already counts 0.5" below as "counted 0.5
   until 2026-08-03"; the recommendation becomes reverting to fractional
   counting for hypertrophy judgements, through the ADR.)_ Pelland 2025 tested three ways of counting a set
   against the outcomes. Counting an indirect set as 0.5 ("fractional")
   predicted hypertrophy best, and counting direct sets only predicted
   strength best. Tropos already counts 0.5. ADR-0010 rejected re-expressing
   its bands in 0.5 because that would be "arithmetic with no external check".
   Pelland's thresholds now provide that check.
3. **Twice a week per muscle is the right floor** (STRONG). Frequency per
   _lift_ matters more for strength than for size (MODERATE). Lift4
   guarantees the first. It does not guarantee the second for the main lifts.
4. **Effort: 1–3 reps in reserve on compounds, failure optional.**
   MODERATE–STRONG. Hypertrophy improves a little as sets end closer to
   failure. Strength does not, and excess failure costs strength when volume
   is free to vary. Lift4's cue (2 reps to spare on compounds, the last set to
   the limit on isolations) matches the evidence.
5. **For a 1RM, heavy loads and practice of heavy low-rep sets matter**
   (STRONG for load, MODERATE for test practice). Lift4's Get stronger
   prescribes 5s at about 2 reps in reserve, roughly 80% of 1RM, which is the
   bottom of the consensus zone. It has no heavier exposure, no peak and no
   test, so it falls short for powerlifters.
6. **Periodization helps strength modestly (ES ~0.3–0.4) but not
   hypertrophy.** MODERATE. Lift4's heavier and lighter days for
   intermediates are the evidence-aligned kind of variation.
7. **Autoregulation by RPE or RIR does at least as well as fixed loading**
   (MODERATE). Reported reps in reserve run about one rep off (MODERATE).
   Lift4's "the plan follows the weight lifted" and its 9.5 brake fit this.
8. **Deload evidence is thin** (WEAK). In practice athletes deload about every
   5–6 weeks by cutting sets and effort and keeping roughly the same
   exercises. A week fully off costs a little strength. Lift4's lighter week
   (half the sets, same weights, every 4th trained week) is a defensible
   middle.
9. **Expected progress.** Over 16 weeks, a novice gains about +20–30% on the
   main lifts, an intermediate +4–10% and an advanced lifter 0–5%.
   Individual responses vary widely: the observed CV is about 50%, and true
   variation is somewhat less. A 100 kg bencher adding 10 kg in 16 weeks is a
   stretch goal: roughly one lifter in five on a general programme, and one in
   three on a bench-specific block. It is not a typical outcome (WEAK,
   model-based).
10. **Running blunts lower-body strength, mainly in men and trained lifters,
    and blunts explosive strength. Upper-body strength and hypertrophy are
    barely touched.** MODERATE. About one heavy session a week maintains
    strength. Lift4's race-build leg trim, taper weeks and spacing rules are
    well supported.

**The changes the evidence suggests most strongly** (detail in §6):

- (a) Re-open ADR-0010 (the 1:1 flip landed 2026-08-03): return to 0.5
  counting for hypertrophy judgements, and count
  direct sets only for strength-lift tallies.
- (b) Give Get stronger a strength track:
  - a frequency floor for each main lift;
  - heavier exposure (an optional top set at RPE 7–9);
  - a dated test or meet using the race-week machinery.
- (c) Let the simulation compare intermediate strength progression rules: the
  current session-to-session step, a weekly step, and a step gated on logged
  effort.
- (d) Scale the two-miss drop by level, for example 5% for advanced lifters.
- (e) Default to small plates for light lifts (overhead press, many women's
  presses).
- (f) Offer priority muscles above the volume ceiling to time-rich
  hypertrophy lifters.
- (g) Keep an e1RM trend in the back end, for stall detection and expectation
  copy, not as a %1RM prescription.

---

## 1. Books and coaching systems: what each contributes, and its limit

All of this is coaching convention unless a trial is cited. The useful
question for each source is which of its ideas has research behind it.

**Sheiko (_Powerlifting: Foundations and Methods_, 2018) [K].**

- _Contribution:_ frequent practice of the competition lifts at submaximal
  loads (mostly ~70–85%, few reps per set, many sets, rarely near failure).
  Volume is counted as lifts above a threshold intensity and average
  intensity, in monthly loading waves. Bench is often trained three or more
  times a week.
- _Research fit:_ consistent with frequency mattering for strength (Pelland
  2025, MODERATE) and with failure being unnecessary for strength (Robinson
  2024).
- _Limit:_ built for competitive lifters in a sport-school system. The
  templates are heavy on volume and lightly individualised.
- _Tropos:_ supports a per-lift frequency floor on the strength goal, and
  "number of lifts at ≥70%" as a possible strength-volume metric.

**Tuchscherer, Reactive Training Systems (2008) [K].**

- _Contribution:_ the RPE scale anchored to reps in reserve, which became the
  research RIR-RPE scale (Zourdos 2016; Helms 2016). A top set at a target RPE
  sets the day's load. Back-off volume follows a load drop or a "fatigue
  percentage" (keep doing sets until performance falls by a set margin). e1RM
  is tracked from rated sets.
- _Limit:_ everything depends on rating accuracy, which is about ±1 rep and
  worse in novices and at high reps (Halperin 2022). The stopping rules have
  not been validated.
- _Tropos:_ the blueprint for an advanced, opt-in strength mode, and the
  basis for an e1RM signal from rated sets.

**Juggernaut Method 2.0 (C.W. Smith) [K].**

- _Contribution:_ 16 weeks of rep waves (10s, 8s, 6s, 3s), each with
  accumulation, intensification, realisation (an AMRAP) and a deload. The
  AMRAP result resets the training max, which is a simple performance
  feedback loop.
- _Limit:_ weekly AMRAPs to near failure carry fatigue and form risk for
  novices, and the rules are arbitrary.
- _Tropos:_ an AMRAP-driven max update is a known pattern. Tropos's
  non-adoption of AMRAP by default stands. The repo's book review already
  covers the Juggernaut manuals.

**Wendler, _5/3/1 Forever_ (2017) [K].**

- _Contribution:_ train from a "training max" below the true max, which is
  conservative by construction (like working at 2+ reps in reserve). Raise it
  in small fixed steps each cycle. Run three-week waves with a deload or test
  week, "leader" (building) and "anchor" (realising) blocks, supplemental
  volume templates and explicit resets.
- _Limit:_ the progression rate is the same whatever the response, and the
  AMRAP "plus" sets invite grinding.
- _Tropos:_ the strongest coaching precedent for slow, sustainable
  intermediate progression, and for resets about 10% down. That reset is
  CONVENTION.

**Rippetoe & Baker, _Practical Programming for Strength Training_ (3rd ed., 2014) [K].**

- _Contribution:_ defines training age by how quickly a lifter recovers from
  and adapts to a training stress. A novice progresses session to session, an
  intermediate week to week, an advanced lifter month to month or slower.
  Programme complexity should follow that.
- _Limit:_ anecdotal, barbell-centric, strength-only, and indifferent to
  hypertrophy evidence.
- _Tropos:_ the most useful operational definition of level for an app,
  because it can be detected from data as the slope of the e1RM trend against
  noise. It also exposes a Lift4 tension: intermediate strength main lifts
  still step session to session (§6, L15).

**Texas Method and Madcow 5×5 [K].**

- _Contribution:_ intermediate weekly progression. The Texas Method uses a
  volume day, a light day and an intensity day that sets a new rep record.
  Madcow ramps to a top set of five and adds a heavier triple later in the
  week, progressing about weekly. Both reset when stalled.
- _Limit:_ the weekly intensity day grinds, and neither has been trialled.
- _Tropos:_ the precedent for a "weekly step" rule for intermediates.

**GZCL (Cody Lefever) [K].**

- _Contribution:_ three tiers. Tier 1 is heavy low-rep main lifts, tier 2
  moderate-load secondary lifts, tier 3 higher-rep accessories, with the rep
  share growing down the tiers.
- _Limit:_ published as a blog, with no trials.
- _Tropos:_ Lift4's role table (main lifts, other compounds, isolations) is
  effectively a tier system. Lift4 already matches it.

**Candito 6-Week Strength Program [K].**

- _Contribution:_ a short block sequence from conditioning and hypertrophy
  through heavy acclimation to a test week. It is an accessible taste of
  block periodization.
- _Limit:_ generic percentages and a test every six weeks.
- _Tropos:_ a model for an optional six-week strength block that ends in a
  test.

**Calgary Barbell (Bryce Krawczyk) [K].**

- _Contribution:_ modern powerlifting templates. RPE top sets, back-offs as a
  percentage of the top set, competition-specific variations (pauses, pins),
  and 8- and 16-week blocks that end in a peak.
- _Limit:_ meet-focused, and assumes the lifter can rate RPE.
- _Tropos:_ the blueprint for a "meet mode".

**Stronger By Science (Nuckols and colleagues) [V for the volume article].**

- _Contribution:_ plain-language syntheses of the volume, frequency and
  failure research. Programmes adjust the training max automatically from the
  last set's reps (AMRAP) or from reps in reserve.
- _Limit:_ the programmes themselves have not been trialled.
- _Tropos:_ the precedent for automatic max updates from logged sets.

**Westside conjugate (Simmons, 2007) [K].**

- _Contribution:_ rotate the max-effort exercise variation weekly to avoid
  staleness, add dynamic-effort speed days with bands and chains, and pick
  accessories for weak points.
- _Limit:_ developed with equipped and often enhanced lifters. Weekly maxes
  are too demanding for consumers, and there is little evidence for raw
  lifters or novices.
- _Tropos:_ variation for a stall and a weak-point emphasis belong as user
  choices, not defaults.

**Prilepin's chart (1970s, via Laputin & Oleshko and Hatfield) [K].**

- _Contribution:_ by intensity zone, a range of reps per set and of total reps
  per session, drawn from Soviet weightlifters.
- _Limit:_ the Olympic lifts are explosive and technical, unlike
  powerlifting or hypertrophy work. The ranges were never validated, and
  presenting them as "optimal" totals overstates them.
- _Tropos:_ a rough sanity check on heavy-single volume at most. Non-adopted
  as a rule (§7).

**Bompa & Buzzichelli, _Periodization_ (6th ed., 2019) [K].**

- _Contribution:_ the vocabulary of macro-, meso- and microcycles, and phase
  sequences (anatomical adaptation, hypertrophy, maximal strength,
  conversion, maintenance, transition), plus taper principles.
- _Limit:_ theory-heavy and rooted in classical periodization. Specific phase
  structures and lengths have little trial support. ACSM 2026 found complex
  periodization not consistently important for average adults.
- _Tropos:_ phase names for a race or meet calendar, without prescriptive
  phase lengths.

**Stone, Stone & Sands, _Principles and Practice of Resistance Training_
(2007) [K].**

- _Contribution:_ block periodization (concentrated loading then
  realisation), fitness–fatigue reasoning and monitoring. The ETSU group's
  taper work (Travis 2020) comes from this lineage.
- _Limit:_ written for athletes.
- _Tropos:_ the theoretical basis for the strength track's blocks and tapers.

**PHUL, PHAT and Nippard's powerbuilding programmes [K].**

- _Contribution:_ powerbuilding combines heavy low-rep compound work ("power"
  days or top sets) with hypertrophy volume ("pump" days or accessories).
  PHUL uses four upper/lower days. PHAT uses five days, two power and three
  hypertrophy. Nippard's versions add RPE targets, top sets with back-offs and
  exercises that load muscles at long lengths.
- _Limit:_ commercial and never trialled. PHAT's volume is high for
  consumers.
- _Tropos:_ the shape of a "powerbuilding" dial: strength-style main lifts
  with hypertrophy-style accessories and volume.

**Helms et al., natural bodybuilding recommendations (2014, 2015) [K].**

- _Contribution:_ train each muscle about twice a week at moderate volume,
  mostly in moderate rep ranges with some heavy work, rest long enough to
  keep performance up, and keep training loads and effort through a cut. For
  nutrition, lose slowly and eat high protein.
- _Limit:_ written for contest preparation, before the newer volume
  meta-regressions.
- _Tropos:_ supports Lift4's "Lose fat = Build muscle + a nutrition cut", and
  the retirement of the set cut that used to come with a diet (§6, L30).

---

## 2. Research by topic

### 2.1 Weekly volume

**Hypertrophy.** Growth rises with weekly sets, with diminishing returns
(STRONG).

- Schoenfeld 2017 [V]: each extra weekly set added about 0.37 percentage
  points of growth (ES ~0.023 per set) over the range studied.
- Pelland 2025 [V]: the slope of volume on hypertrophy was positive with
  posterior probability 100%, and returns diminished. The abstract summary
  reports no detectable superiority past about 31 fractional sets a week.
- A secondary summary of the same paper, to be verified, gives about 4
  fractional sets a week as the smallest detectable dose, with roughly 6 more
  sets needed for each further detectable gain in the 5–10 range.
- Baz-Valle 2022 [V]: 12–20 weekly sets did as well as more than 20 for the
  quadriceps and biceps. More than 20 helped only the triceps.
- Schoenfeld 2019 [K]: roughly 6, 18 and 30 weekly sets produced graded
  growth in trained men.

**Strength.** Strength rises with volume, but flattens much sooner (MODERATE).

- Pelland 2025 [V]: diminishing returns are "considerably more pronounced"
  for strength.
- Stronger By Science's summary [V]: past about 5 direct sets a week, further
  strength gains fall below the smallest detectable effect. One search
  summary gave ~3 fractional sets instead. The two versions or counting
  methods differ, so take the threshold from the paper.
- Androulakis-Korakakis 2020 [V]: even one set per exercise two or three
  times a week raised 1RM in trained men, though sub-optimally.

**Product implications.**

- Hypertrophy: the first ~10 fractional sets per muscle per week buy most of
  the effect. Going from 10 to 20 buys a smaller, real increment. Past about
  25–30, the gain is hard to detect and the time cost is high.
- Strength: a few direct heavy sets per lift per week capture most of the
  volume effect. Additional sets serve hypertrophy, technique and skill, and
  hypertrophy raises the long-term ceiling.

### 2.2 How to count a set (the ADR-0010 question)

Pelland 2025 [V] quantified volume three ways:

- **total**: an indirect set counts 1;
- **fractional**: an indirect set counts 0.5;
- **direct**: an indirect set counts 0.

It then fitted each against the outcomes. Fractional counting carried the
strongest evidence for hypertrophy, and direct counting for strength (the
abstract and summaries agree; check the full text). MODERATE: one well-built
model comparison.

_(Integration correction: the paragraph below describes ADR-0010's opening
sections. Its second 2026-08-03 addendum records that the flip LANDED —
`SECONDARY_SET_WEIGHT = 1.0` in `volumeModel.ts` — so "today" is 1:1, and
"keep 0.5" below means "return to 0.5".)_

ADR-0010 counted an indirect set at 0.5 when written. It records "1:1 is correct" as
settled, and stages a flip to 1.0 because the bands it uses came from 1:1
meta-analyses. It rejected option 2 (keep 0.5 and re-derive the bands)
because the re-derivation would be "arithmetic with no external check". The
new meta-regression is that external check. It also says 0.5 is the better
predictor of the outcome the bands judge. **Recommendation:** re-open
ADR-0010.

- Keep 0.5 for hypertrophy.
- Re-derive the bands in fractional currency from Pelland's curves.
- Count direct sets only when judging volume for a strength goal's main
  lifts.

The ADR's 2026-08-03 addendum re-staged the flip on a per-head taxonomy split,
because at 1:1 the shoulder and core buckets absorbed every press and compound
as full sets. If 0.5 is kept on the evidence, that split stops blocking the
currency question. It may still be worth doing for judgement.

### 2.3 Per-session volume

Remmert et al. 2025 (preprint) [V]: within one session, no detectable extra
gain past about **11 fractional sets per muscle** for hypertrophy or about
**2 direct sets** for strength. WEAK–MODERATE (preprint). This is why
frequency starts to matter once weekly volume is high: a muscle needing 20
sets is better served by two or three sessions than by one. Lift4's twice a
week with three sets per exercise stays far below these caps.

### 2.4 Frequency

- **Per muscle, for hypertrophy.** Twice a week beat once in early, mostly
  volume-unequal trials (Schoenfeld 2016 [V]: ES 0.49 vs 0.30). With volume
  equated, frequency makes no difference (Schoenfeld 2019 [V]; Ramos-Campo
  2024 [R]). STRONG.
- **For strength.** Higher frequency raised 1RM, largely through added volume
  (Grgic 2018 [V]). Pelland 2025 [V] found an identifiable frequency effect
  on strength even after adjusting for volume, and none on hypertrophy.
  MODERATE.
- **Consensus.** ACSM 2026 [V]: train every major muscle at least twice a
  week.
- **Product implications.** "Every muscle twice a week" is the right floor.
  For strength users, the frequency that matters is per _lift_: practice of
  the specific movement.

### 2.5 Load and the repetition continuum

STRONG.

- 1RM gains favour heavy loads (Schoenfeld 2017 [V]).
- Lopez 2021 [V]: high (≤8RM) and moderate (9–15RM) loads beat low loads
  (>15RM) for strength (SMD 0.60 and 0.34). High beat moderate by a further
  0.26, which was not significant.
- Hypertrophy is similar from roughly 30% to 85% of 1RM when sets go close to
  failure (Schoenfeld 2017; Lopez 2021; Schoenfeld 2021 [V]).
- Currier 2023 and ACSM 2026 [V]: strength from ≥80% of 1RM, 2–3 sets per
  exercise, early in the session, at least twice a week.
- **Product implications.** Rep ranges are a tool for time, comfort and
  joint load, not a switch between "hypertrophy" and "endurance". Strength
  goals need most main-lift work at ≥75–80% of 1RM.

### 2.6 Proximity to failure

- Failure is not needed for hypertrophy, and the relationship is probably
  non-linear (Refalo 2023 [V]).
- Robinson 2024 [V][R]: estimated reps in reserve moderated hypertrophy
  (closer to failure, more growth) but not strength.
- Grgic 2022 [V]:
  - no overall difference between failure and non-failure;
  - when volume was not equated, non-failure was _better_ for strength
    (ES −0.32);
  - in trained lifters, failure was slightly better for growth (ES 0.15).
- Refalo 2024 [K]: a within-participant trial in trained lifters found
  similar growth at 0 and 1–2 reps in reserve.
- Hickmott 2022 [V]: more velocity loss within a set (sets taken closer to
  failure) gave more CSA. Less velocity loss gave more 1RM.
- ACSM 2026 [V]: failure is not consistently important.
- **Grade and implications.** MODERATE–STRONG. Compounds at 1–3 reps in
  reserve. Isolations can go to failure on the last set. Strength work stays
  1–3 reps from failure.

### 2.7 Rest between sets

- Schoenfeld 2016 [V]: 3 minutes beat 1 minute for both strength and
  thickness in trained men.
- Singer 2024 [V]: a small growth benefit from resting more than ~60 s. In
  four categories, the central estimates were 0.47 (short), 0.65
  (intermediate), 0.55 (long) and 0.50 (very long), so the benefit does not
  keep climbing.
- Grgic 2018 [K]: trained lifters do better on strength with rests over two
  minutes.
- **Grade and implications.** MODERATE. Rest about 2–3 minutes on heavy
  compounds and at least 60–90 seconds on isolations. Shorter rests cost a
  little hypertrophy and a fair amount of load.

### 2.8 Periodization

- Williams 2017 [V]: periodized beat non-periodized for 1RM (ES 0.43), with
  undulating programmes favoured and larger effects in untrained people.
- Moesgaard 2022 [V]: with volume equated, periodization helped 1RM
  (ES 0.31) but not hypertrophy. Undulating looked at least as good as linear
  for strength, especially in trained participants [K].
- Grgic 2017 [V]: linear and daily undulating gave the same hypertrophy.
- ACSM 2026 [V]: complex periodization was not consistently important for the
  average adult.
- **Grade and implications.** MODERATE for strength, a consistent null for
  hypertrophy. Planned variation in load and reps (heavier and lighter days,
  or blocks) is worth having on strength goals. Hypertrophy needs no periodized
  structure beyond managing fatigue.

### 2.9 Autoregulation, RPE and RIR

- Helms 2018 [V]: in trained men over 8 weeks, RPE-chosen loads matched or
  slightly beat fixed percentages. Bench gained 10.7 vs 9.6 kg and squat 17.1
  vs 13.9 kg.
- Graham & Cleather 2021 [V]: RIR-chosen squat loads beat fixed percentages
  over 12 weeks.
- Hickmott 2022 [V]: autoregulated load prescription was not significantly
  different from percentage-based (+2.1 kg, 95% CI −0.3 to 4.5).
- Larsen 2021 [K] agrees.
- Zourdos 2016 [V]: RPE tracks bar velocity, and experienced lifters rate
  near-maximal sets more accurately than novices.
- Halperin 2022 [V]: people under-predict reps left by about 0.95. Accuracy
  is better close to failure and below 12 reps.
- **Grade and implications.** MODERATE. Letting performance set the next load
  is evidence-aligned. Effort ratings help, but they are estimates: about ±1
  rep, and worse in novices and long sets. Use them as brakes and for
  advanced users, not as a mandatory input.

### 2.10 Specificity of the 1RM

- Mattocks 2017 [V]: in untrained people, practising the 1RM alone produced
  1RM gains equal to four sets of 8–12RM to failure, though less growth.
- Wolf 2023 [V]: strength is range-of-motion specific.
- **Grade and implications.** MODERATE. A meaningful part of a 1RM gain is
  skill at heavy loads. Two consequences:
  - A lifter who trains only 8–12 reps will under-express their strength in a
    1RM, and gains in RCTs that include repeated testing partly reflect test
    practice.
  - A strength user who wants a better 1RM needs some heavy low-rep exposure
    (singles, doubles and triples at about RPE 7–9), especially in the last
    4–6 weeks before a test.

### 2.11 Minimal dose and maintenance

- Androulakis-Korakakis 2020 [V]: one set of 6–12 at 70–85% of 1RM, two or
  three times a week, near failure, raises 1RM in trained men, though
  sub-optimally.
- Spiering 2021 [V]: strength and size are kept for up to 32 weeks on one
  session a week with one set per exercise, as long as intensity is kept.
- Bickel 2011 [K results]: young adults kept their gains on one ninth of the
  training dose. Older adults needed about a third to keep fibre size.
- Rønnestad 2010 [K]: one heavy session a week kept strength gains in
  cyclists in season.
- **Grade and implications.** MODERATE. Intensity is what keeps strength.
  Volume can fall by two thirds or more. This is the evidence base for:
  - Lift4's race-build leg trim;
  - "Short on time?" sessions;
  - maintenance volume for muscles that are not a priority.

### 2.12 Deloads

- Bell 2023 Delphi [V]: defines a deload as a planned or autoregulated
  period of reduced training stress, to dissipate fatigue and restore
  readiness. Reduce volume first, and intensity or effort to a lesser degree.
- Rogerson 2024 [V], a survey of 246 strength and physique athletes:
  - deloads last about 6.4 ± 1.7 days, every 5.6 ± 2.3 weeks;
  - fewer sets and reps, more reps in reserve and somewhat lighter loads, with
    the same exercises and frequency;
  - taken pre-planned or when performance stalls or joints ache.
- Coleman 2024 [V], the only RCT: a week of complete rest in the middle of
  nine weeks slightly reduced lower-body strength gains and did not change
  hypertrophy.
- **Grade and implications.** WEAK: one RCT, one Delphi, one survey. A
  reduced-volume week at maintained load is the safest recipe. A week fully
  off is not a "deload". No source supports a particular cadence as
  physiology.

### 2.13 Tapering and peaking

- Pritchard 2016 [V], interviews with 11 elite New Zealand powerlifters:
  - volume peaked about 5 weeks out and average intensity about 2 weeks out;
  - the taper cut volume by about 59%;
  - the last heavy session came about 3.7 days before the meet;
  - accessories were dropped about 2 weeks out;
  - deadlifts were said to need longer to recover from;
  - a week or more fully off was felt to go badly.
- Travis 2020 [V]: step or exponential tapers that cut volume-load by about
  half over 2 ± 1 weeks look most effective. Powerlifting-specific trials are
  scarce.
- Bosquet 2007 [K]: endurance tapers of about two weeks, cutting volume by
  41–60% with intensity and frequency kept.
- **Grade and implications.** WEAK–MODERATE. For a strength test or meet,
  cut volume by about 40–60% over 1–3 weeks, keep heavy singles, and put the
  last heavy session 3–5 days out. For a race, Lift4's two lighter weeks and
  rest days fit the same logic.

### 2.14 Training at long muscle lengths

- Maeo 2021 [V]: the seated leg curl, which trains the hamstrings at long
  length, grew them more than the prone curl.
- Maeo 2023 [V]: the overhead triceps extension produced about 1.4× the
  triceps growth of the pushdown (19.9% vs 13.9%; long head 28.5% vs 19.6%).
- Kassiano 2023 [V]: calf partials at long lengths beat full ROM for the
  medial gastrocnemius (+15.2% vs +6.7%).
- Pedrosa 2022 [K]: long-length partials at least matched full ROM for knee
  extension.
- Wolf 2023 [V]: full or long ROM is slightly better for most outcomes.
- Strey 2026 [V], 8 studies: long-length partials beat short-length partials
  for hypertrophy (ES 0.28).
- Wolf et al.'s 2025 systematic review [V: finding]: longer-length training
  consistently grows more.
- **Grade and implications.** MODERATE for _choosing_ exercises that load
  the muscle at long length: the seated curl, overhead triceps work, deep calf
  raises, incline curls. This is low-risk and evidence-informed. WEAK for
  _replacing_ full range of motion with lengthened partials in trained
  lifters (few trials, mostly untrained). Full range with a controlled
  stretch is the default.

### 2.15 Reps at %1RM, e1RM formulas and their error

- Nuzzo 2024 [V], 269 studies and 7,289 people: the mean and the
  between-person SD of reps to failure at each %1RM. The SD shrinks as load
  rises. Sex, age and training status barely moderate the relationship. The
  bench press and leg press differ: more reps on the leg press at every load.
  One table serves most exercises, with separate tables for those two.
  **Read the exact tables from the paper before coding.**
- The classic convention for planning, pending Nuzzo's numbers, is CONVENTION
  and should be replaced by Nuzzo's means:

  | %1RM | Approximate reps to failure |
  | ---- | --------------------------- |
  | ~95% | 2                           |
  | ~90% | 4                           |
  | ~85% | 6                           |
  | ~80% | 8                           |
  | ~75% | 10                          |
  | ~70% | ~12                         |

  Each rep near the low end is worth about 2.5–3.5% of 1RM. The owner
  source's "about 4% load per rep dropped" is slightly steep but in the same
  range.

- **e1RM formulas** [K]: Epley multiplies the load by 1 + reps/30. Brzycki
  multiplies by 36/(37 − reps). They agree around 10 reps. Adding reported
  reps in reserve to reps performed is the usual RPE-chart practice.
- **Their error:**
  - Formulas under-predicted deadlift 1RM by 9–14% (LeSuer 1997 [V]).
  - Accuracy falls with reps, so estimate from 10 reps or fewer (Reynolds
    2006 [V]).
  - Marzagao 2026 [V]: on 303,494 near-failure sets from Fitbod users,
    letting Epley's factor vary with the load cut inconsistency by 17–22%
    against Epley, Brzycki, Wathen and Mayhew. The gain ranged from about
    +1% for heavy barbell lifts to +40% for light dumbbell and cable work.
- **The noise floor.** 1RM test–retest reliability has a median CV of 4.2%,
  with a range of 0.5–12.1% (Grgic 2020 [V]).
- **Product implications.** MODERATE.
  - An e1RM from a set of 3–8 reps with a credible effort rating sits within
    roughly ±3–5% of the true 1RM. From 12 or more reps, the error is large.
  - On the deadlift, formulas run low.
  - Any stall or PR logic must look past ±3–4% day-to-day noise.

### 2.16 Individual response

- Hubal 2005 [V]: in 585 untrained people over 12 weeks, elbow-flexor 1RM
  changed by 0 to +250% (0 to +10.2 kg) and CSA by −2 to +59%.
- Ahtiainen 2016 [V]: over 20–24 weeks, strength rose 21 ± 12% (range −8 to
  +60) and size 4.8 ± 6.1% (range −11 to +30).
- Hammarström 2020 [V]: three sets beat one set (CSA +5.2% vs +3.7%), but
  only about 38% (size) and 47% (strength) of people clearly benefited from
  the higher volume.
- Dankel & Loenneke 2020 and Hecksteden 2015 [V]: observed spread includes
  measurement error and biological noise, so true response variance is
  smaller than the raw ranges.
- A replicated within-participant trial (Robinson, Steele, Helms, Trexler et
  al., 2025, conference abstract) [V: existence] was designed to measure true
  individual volume response. Watch for it.
- **Grade and implications.** MODERATE. Never promise an outcome. Give
  ranges. "Responders" exist, but labelling one person from one block is
  mostly noise.

### 2.17 Sex and age

- Nuzzo 2024 [V]: sex, age and training status barely change reps at a given
  %1RM, so one reps–%1RM model serves everyone. This is one of the few [V]
  points on sex.
- Roberts 2020 [K]: similar relative hypertrophy and lower-body strength gains
  in women and men, and larger relative upper-body strength gains in women.
- Refalo 2025 [K]: similar relative muscle growth, larger absolute growth in
  men.
- Jones 2021 [K]: older men gain more in absolute terms, with similar relative
  changes.
- Peterson 2010 [K]: older adults gain about 25–30% strength on average, more
  with heavier loads.
- **Grade and implications.** MODERATE.
  - Program by the person's numbers, not their sex. Rates in percent can be
    shared, and absolute starting loads differ.
  - The repo's 0.75 female starting-load factor (LIFT-EV-07, fenced) is a
    cold-start convenience, not a programming rule.
  - Older lifters progress in absolute terms more slowly and grow less in
    absolute size. Their recovery assumptions should be more conservative
    (WEAK).

### 2.18 Detraining, retraining and "muscle memory"

- Bosquet 2013 [K]: strength losses are small at first and grow with time
  off.
- A trial in trained men [K] found no 1RM loss after two weeks off.
- Ogasawara 2013 [K]: a three-week break after every six weeks of training
  gave the same 24-week bench and CSA gains as training throughout.
- Seaborne 2018 [K]: faster regrowth on retraining, linked to DNA methylation
  (n = 8).
- Psilander 2019 [K]: strength was partly kept after 20 weeks off and
  retraining was fast. There was no clear advantage of the previously trained
  leg, and no myonuclear "memory" signal.
- Coleman 2024 [V]: one week off mid-programme cost a little lower-body
  strength.
- **Grade and implications.** MODERATE–WEAK.
  - Short breaks of two to three weeks cost little.
  - Strength comes back faster than it was first built.
  - Lift4's Welcome back is conservative and reasonable: 10% lighter after 3–8
    weeks away, 20% after longer, and climbing back a step a session.

### 2.19 Concurrent training (lifting and running)

**What the meta-analyses show.**

- Wilson 2012 [V*]: interference grows with endurance frequency and duration.
  Running interferes more than cycling, and power suffers most. Effect sizes,
  lift-only vs concurrent [K]: hypertrophy 1.23 vs 0.85, strength 1.76 vs
  1.44, power 0.91 vs 0.55.
- Schumann 2022 [V*]: on average, no interference for hypertrophy or maximal
  strength. Explosive strength is blunted, more when both are done in the
  same session.
- Huiberts 2024 [V\*][R]: lower-body strength is blunted in men (−0.43) but not
  in women (0.08).
- Petré 2021 [V*]: lower-body 1RM is blunted only in trained people.
- Lundberg 2022 [V*]: a small negative effect on fibre hypertrophy, perhaps
  larger with running.

**Order and spacing.**

- Within one session, lift before running when lower-body strength is the
  priority (Murlasits 2018, Eddens 2018 [V*/K]).
- Separate conflicting sessions by at least about 6 hours (Robineau 2016
  [V*]).
- Leg strength work impairs running economy at 6 hours and the next day (Doma
  & Deakin [V*]).

**Benefit to running.** Heavy strength training improves running economy by
2–8% and time trials (Blagrove 2018; Llanos-Lagos 2024; Eihara 2022 [V*]).

**Grade and implications.** MODERATE.

- For the typical Tropos runner who lifts, the cost falls on lower-body
  maximal and explosive strength, mostly in men and trained lifters, and
  grows with running volume.
- Upper-body strength and hypertrophy are barely touched.
- Keep loads heavy, trim leg volume when mileage builds, and keep heavy legs
  away from the day before key runs. Lift4 does all three.

### 2.20 Progression method

- Plotkin 2022 [K]: adding reps and adding load produced similar hypertrophy
  and strength over 8 weeks in trained lifters, which supports double
  progression. WEAK–MODERATE.
- Progressive _set_ increases within a mesocycle (the RP pattern) are
  CONVENTION, with limited trial support. One 2024 trial on weekly set
  progressions (Enes et al., _MSSE_ 56(3):553–63, doi:10.1249/MSS.0000000000003317)
  [K] was not re-read, and its result should be checked before it is cited
  either way.

### 2.21 Nutrition as a moderator

- Energy deficits blunt lean-mass gains but not strength gains (Murphy &
  Koehler 2022 [K]).
- Protein's benefit plateaus near 1.6 g/kg/day (Morton 2018 [K]).
- **Grade and implications.** MODERATE. The simulation needs an energy-balance
  multiplier on hypertrophy, and the app should not promise muscle gain to
  someone on Lose fat.

### 2.22 New since the repo's checkpoints (2024–2026)

- Pelland 2025: weekly dose-response and counting methods.
- Remmert 2025: per-session caps.
- ACSM 2026 position stand: an overview of 137 reviews.
- Strey 2026: long- vs short-length partials.
- Wolf 2025: a systematic review of long-length training.
- Marzagao 2026: an e1RM equation fitted to app data.
- Robinson et al. 2025: the replicated within-participant volume trial.
- Singer 2024, Coleman 2024, Rogerson 2024 and Nuzzo 2024.

The ACSM 2026 statement is the new consensus anchor. It says:

- every muscle at least twice a week;
- heavy loads for strength;
- about 10 or more sets per muscle per week for size;
- failure, equipment type and complex periodization are not consistently
  important.

It matches Lift4's defaults closely.

---

## 3. Programming by goal and training age

**Training age, defined operationally** (after Rippetoe & Baker; CONVENTION,
detectable from data):

| Level        | Definition                                                                            |
| ------------ | ------------------------------------------------------------------------------------- |
| Novice       | Still adds load session to session. Usually under 6–12 months of consistent training. |
| Intermediate | Progress is weekly at best. Usually 1–3 years.                                        |
| Advanced     | Progress shows over a month or a block, with near-ceiling 1RMs. Usually 3–5+ years.   |

A data-driven level is the e1RM slope divided by its noise over 6–8 weeks.
That is more honest than self-report, which skews toward the middle.

**The rows below hold for every goal unless a goal says otherwise.**

- Per muscle: at least twice a week (STRONG).
- Main lifts first in the session (STRONG for strength).
- Rest: 2–3 minutes on heavy compounds and at least 60–90 seconds on
  isolations (MODERATE).
- The progression unit is the lift instance, judged on all working sets
  (CONVENTION).

### 3.1 Strength and powerlifting

| Variable                           | Novice                                 | Intermediate                                                                  | Advanced                                                                                        | Grade                                                                             |
| ---------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Frequency per lift                 | Each main lift 2–3×/week (full body)   | Bench 2–3×, squat 2×, deadlift or hinge 1–2×                                  | Bench 3–4×, squat 2–3×, deadlift 1–2× (variants count)                                          | MODERATE (frequency effect on strength); CONVENTION for exact counts              |
| Direct hard sets per lift per week | 4–8                                    | 6–12                                                                          | 8–15                                                                                            | MODERATE (strength saturates past ~5 direct sets; the rest serves skill and size) |
| Accessory volume per prime mover   | 4–8 fractional                         | 6–12                                                                          | 8–14                                                                                            | MODERATE (size raises the ceiling)                                                |
| Reps and intensity                 | Mostly 3–6 reps at ~75–85%             | Mostly 2–6 reps at 75–90%; singles at RPE 7–8 from mid-block                  | Same plus heavier singles (90%+) in the last 3–6 weeks                                          | STRONG (≥80% for strength); CONVENTION (distribution)                             |
| Proximity to failure               | 2–3 reps in reserve                    | 1–3; occasional RPE 9                                                         | 1–3; RPE 9–9.5 only near a peak                                                                 | MODERATE–STRONG                                                                   |
| Structure                          | Straight sets                          | Top set (1–5 at RPE 7–9) + back-offs at −5–15%, _or_ heavier and lighter days | Top set + back-offs; blocks                                                                     | CONVENTION (no RCT against straight sets)                                         |
| Progression                        | Linear, session to session, fixed reps | Weekly step, or effort-gated (hold at RPE ≥9), or e1RM-driven                 | Block-to-block; RPE or e1RM-driven load selection                                               | MODERATE (autoregulation ≥ fixed; periodized > non-periodized for strength)       |
| Lighter weeks                      | None planned; drops handle stalls      | Every 4–6 weeks or on a falling e1RM trend: volume −30–50%, same load         | Same, plus taper weeks before tests                                                             | WEAK                                                                              |
| Peaking and testing                | None; e1RM only                        | A test every 12–16 weeks, optional                                            | Taper 1–3 weeks (volume −40–60%, intensity kept, last heavy session 3–5 days out); test or meet | WEAK–MODERATE                                                                     |
| Exercise selection                 | Competition lifts plus a few compounds | Plus close variants (paused, tempo, pin) rotated by block                     | Variants chosen for weak points, rotated by block, not weekly                                   | MODERATE (specificity); CONVENTION (rotation)                                     |

### 3.2 Hypertrophy

| Variable                            | Novice                                                                                         | Intermediate                                                    | Advanced                                                          | Grade                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Frequency per muscle                | 2× (full body 2–3 days)                                                                        | 2–3×                                                            | 2–3×; more when per-session volume would pass ~10 fractional sets | STRONG (2× floor); WEAK–MODERATE (per-session cap)    |
| Fractional sets per muscle per week | 6–12                                                                                           | 10–20                                                           | 12–25 for 1–3 priority muscles; others 4–8 (maintenance)          | MODERATE                                              |
| Reps                                | 6–15                                                                                           | 6–20 (compounds 6–12, isolations 10–20)                         | Same; some 4–6 on compounds                                       | STRONG (load-independence near failure)               |
| Proximity                           | 1–3 reps in reserve; isolation last sets to failure                                            | 0–2; failure on isolations                                      | 0–2; failure on isolations and machines                           | MODERATE                                              |
| Rest                                | ≥90 s; 2–3 min on compounds                                                                    | Same                                                            | Same                                                              | MODERATE                                              |
| Progression                         | Double progression                                                                             | Double progression; optional set progression across a mesocycle | Same; volume reallocated by priority                              | MODERATE (double progression); CONVENTION (set waves) |
| Lighter weeks                       | Not needed                                                                                     | Every 4–6 weeks, or on stalls or aches                          | Same                                                              | WEAK                                                  |
| Exercise selection                  | Stable compounds plus long-length isolations (seated curl, overhead triceps, deep calf raises) | Same; variants for regions                                      | Same; rotate per block for weak regions                           | MODERATE (long length); WEAK (rotation)               |

### 3.3 Powerbuilding

The combination is CONVENTION built from MODERATE parts.

- **Main lifts:** strength structure, twice a week each. A top set of 3–6
  reps at RPE 7–9, or heavy fixed sets, then back-offs of 6–10.
- **Accessories:** hypertrophy structure. 8–20 reps near failure, 10–20
  fractional sets per muscle a week.
- **Novice:** Build muscle with fixed 5s on the main lifts is already a
  powerbuilding programme (Lift4's beginner rows do this).
- **Intermediate:** heavier and lighter days, which is the DUP-lite Lift4
  already has.
- **Advanced:** alternate strength-emphasis and hypertrophy-emphasis blocks
  of 4–8 weeks.
- **Evidence:** combining heavy work with volume serves both outcomes
  (Currier 2023: heavy loads for strength, sets for size).

### 3.4 General fitness

STRONG; ACSM 2009/2026.

- Two or three full-body sessions a week.
- 1–3 sets of 8–15 reps at 1–3 reps in reserve, covering the movement
  patterns.
- Double progression.
- Any equipment works, and any training beats none. The minimal dose (one set
  per exercise) still works when time is short.
- Lighter weeks are optional.

### 3.5 Lifting to support running

MODERATE.

- **Sessions:** two a week in the base phase, one or two in build and peak.
- **Loads:** heavy, 3–6 reps at ≥80% or fixed 5s, for running economy.
- **Volume:**
  - leg volume kept low (4–8 hard sets a week) and trimmed as mileage
    builds;
  - upper body as time allows.
- **Placement:**
  - lift on hard-run days, lifting first or at least 6 hours after the run;
  - avoid heavy legs within about 24–48 hours of a key run;
  - the taper drops lifting volume by about half for the last two weeks.
- **Plyometrics and explosive work** may add economy benefit. That belongs to
  the running workstream.

---

## 4. Expected progress, for the simulation

### 4.1 Anchors

| Anchor                         | Population                      | Duration        | Outcome                                                                     | Grade                        |
| ------------------------------ | ------------------------------- | --------------- | --------------------------------------------------------------------------- | ---------------------------- |
| ACSM 2009 [K]                  | mixed                           | 4 weeks–2 years | ~40% untrained, 20% moderately trained, 16% trained, 10% advanced, 2% elite | WEAK (heterogeneous periods) |
| Ahtiainen 2016 [V]             | untrained, 19–78 years, n = 287 | 20–24 weeks     | Strength +21 ± 12%; size +4.8 ± 6.1%                                        | MODERATE                     |
| Hubal 2005 [V]                 | untrained young, n = 585        | 12 weeks        | Elbow-flexor 1RM 0 to +250% (0 to +10.2 kg); CSA −2 to +59%                 | MODERATE                     |
| Hammarström 2020 [V]           | untrained, n = 34               | 12 weeks        | CSA +5.2% (3 sets) vs +3.7% (1 set)                                         | MODERATE                     |
| Helms 2018 [V]                 | trained men, n = 21             | 8 weeks         | Bench +9.6 to +10.7 kg; squat +13.9 to +17.1 kg                             | MODERATE (small)             |
| Schoenfeld 2016 [V]            | trained men, n = 21             | 8 weeks         | 3-minute rest > 1-minute for squat and bench 1RM                            | WEAK                         |
| Mattocks 2017 [V]              | untrained, n = 38               | 8 weeks         | 1RM practice alone matched 4 × 8–12RM for 1RM gains                         | MODERATE                     |
| Androulakis-Korakakis 2020 [V] | trained men                     | 8–12 weeks      | One set 2–3×/week raises 1RM, sub-optimally                                 | MODERATE                     |
| Latella 2020 [K]               | competitive powerlifters        | 15 years        | Fastest gains in year 1, slowing after                                      | MODERATE (shape only)        |
| Steele 2023 [K]                | gym members, minimal dose       | multi-year      | Log-like deceleration                                                       | MODERATE (shape only)        |
| Grgic 2020 [V]                 | various                         | test–retest     | Median CV 4.2%                                                              | MODERATE                     |

Two cautions apply to every short trial. Gains in "trained" RCT samples often
include test practice and a novelty boost from a new, specific, supervised
programme. Gains are also front-loaded after any programme change. A
simulator calibrated only to 8-week trained RCTs will overstate long-run
intermediate progress. Calibrating only to multi-year cohorts will understate
short-term gains after a programme change.

### 4.2 Projected 1RM change by training age

Young adults, adherent at 2–4 sessions a week, adequate energy and protein.
Central estimate, with an approximate 80% interval in brackets. WEAK: built
by triangulating the anchors in §4.1. Use them as calibration targets, not as
truths.

| Level        | Lifts                   | 8 weeks     | 16 weeks     | 26 weeks     | 52 weeks     |
| ------------ | ----------------------- | ----------- | ------------ | ------------ | ------------ |
| Novice       | Upper (bench, OHP)      | +12% [6–20] | +22% [12–35] | +30% [16–45] | +40% [22–60] |
| Novice       | Lower (squat, deadlift) | +18% [8–30] | +30% [15–45] | +38% [20–55] | +50% [28–75] |
| Intermediate | Upper                   | +4% [1–9]   | +6% [2–11]   | +8% [3–14]   | +10% [4–18]  |
| Intermediate | Lower                   | +5% [1–10]  | +7% [2–13]   | +9% [3–16]   | +12% [5–20]  |
| Advanced     | Upper                   | +1.5% [0–4] | +2.5% [0–6]  | +3% [0–7]    | +4% [0–9]    |
| Advanced     | Lower                   | +2% [0–5]   | +3% [0–7]    | +4% [0–8]    | +5% [0–10]   |

**Adjustments** (all WEAK):

| Factor                        | Adjustment                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Women                         | Same percentages for the lower body. Novice upper body about +3–5 points higher at 16–52 weeks (Roberts 2020 [K]). Absolute kilograms smaller.               |
| Over about 60                 | Similar relative strength early. Lower absolute gains. Less hypertrophy.                                                                                     |
| Bodyweight                    | A sustained surplus with +3–5 kg of bodyweight adds roughly 2–5 points over a year for intermediates. A deficit removes most of the hypertrophy-driven part. |
| A taper or peak before a test | +1–3% on the day.                                                                                                                                            |
| Returning after a layoff      | Faster than the table until the previous best.                                                                                                               |
| Overhead press                | Few data; treat like the bench in percent. With 2.5 kg steps on a 40 kg lift, real progress comes in chunks.                                                 |
| Deadlift                      | e1RM formulas run low by 9–14% (LeSuer 1997).                                                                                                                |

**Illustration in kilograms (central values).** The starting values are
illustrative CONVENTION, not data. Results are rounded to plates.

| Persona start                                                   | 8 weeks                  | 16 weeks                       | 26 weeks                 | 52 weeks                 |
| --------------------------------------------------------------- | ------------------------ | ------------------------------ | ------------------------ | ------------------------ |
| Novice man: bench 60 / squat 70 / deadlift 90 / OHP 40          | 67.5 / 82.5 / 105 / 45   | 72.5–75 / 90 / 117.5 / 47.5–50 | 77.5 / 97.5 / 125 / 52.5 | 85 / 105 / 135 / 55      |
| Novice woman: bench 30 / squat 45 / deadlift 55 / OHP 20        | 34 / 53 / 65 / 22.5      | 37.5 / 58.5 / 71.5 / 25        | 40 / 62 / 76 / 27        | 42.5 / 67.5 / 82.5 / 29  |
| Intermediate man: bench 100 / squat 140 / deadlift 170 / OHP 60 | 104 / 147 / 178.5 / 62.5 | 106 / 150 / 182 / 63.5         | 108 / 152.5 / 185 / 65   | 110 / 157.5 / 190 / 66   |
| Intermediate woman: bench 50 / squat 85 / deadlift 110 / OHP 35 | 52 / 89 / 115.5 / 36.5   | 53 / 91 / 117.5 / 37           | 54 / 92.5 / 120 / 38     | 55 / 95 / 123 / 38.5     |
| Advanced man: bench 140 / squat 200 / deadlift 240 / OHP 85     | 142 / 204 / 245 / 86     | 143.5 / 206 / 247 / 87         | 144 / 208 / 250 / 87.5   | 145.5 / 210 / 252 / 88.5 |

### 4.3 Projected muscle size

WEAK–MODERATE.

- **Novice:**
  - muscle thickness in trained muscles +4–8% at 8 weeks, +7–14% at 16 weeks
    and +12–25% at 52 weeks, with arms gaining more than legs;
  - lean mass for men +1.5–3.5 kg in 16 weeks in a surplus;
  - for women about 50–70% of men's absolute gain.
- **Intermediate:** thickness +2–6% per 16 weeks. Lean mass +0.5–2 kg for men
  and +0.3–1.2 kg for women, in a surplus.
- **Advanced:** thickness +0–3% per 16 weeks. Lean mass +0–1 kg.
- **Popular convention** (McDonald; Aragon) [K]: roughly 1–1.5% of
  bodyweight a month in year 1, about half that in year 2 and a quarter in
  year 3, for men under ideal conditions. Treat these as optimistic upper
  bounds. Research cohorts sit lower.
- **Spread:** wide. In Ahtiainen 2016, size changes ran −11% to +30% around a
  +4.8% mean.

### 4.4 The virtual lifter: a response model to build and calibrate

Each component carries a grade. The model is deliberately modular, so the
run can swap one assumption and report the outcome _ranges_ across variants.
The response model encodes assumptions, so its outputs are not evidence that
one programme is better.

**State per lifter:**

- for each lift, base strength **B**, a heavy-load skill term **S** and a
  ceiling **B\***;
- for each muscle, a size index **M** (1 at the start) and a ceiling **M\***;
- acute fatigue **F** for the upper and lower body, and a slow
  accumulated-fatigue term;
- training age, and a detraining clock;
- fixed responder multipliers: r_s (strength), r_h (hypertrophy) and r_v
  (volume responsiveness).

**Weekly hypertrophy.**

ΔM = k_h · r_h · H(V_frac) · E(RIR) · N · A_h · C_h · (1 − M/M\*)

| Term   | Meaning                                                                                                                             | Source and grade                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| V_frac | Weekly fractional hard sets (within ~4 reps in reserve). Indirect sets count 0.5. Sets past ~11 per muscle per session add nothing. | Pelland 2025; Remmert 2025 (MODERATE / WEAK) |
| H      | Log-shaped. Smallest detectable dose ~4 sets a week; ~0.37 percentage points per extra set mid-range; flat past ~25–30.             | MODERATE shape                               |
| E      | 0 RIR 1.0; 1–2 RIR 0.9–0.95; 3–4 RIR 0.75–0.85; 5 or more ≤0.6.                                                                     | Robinson 2024 direction; magnitudes WEAK     |
| N      | Surplus 1.0; maintenance ~0.8; deficit 0.5–0.7.                                                                                     | Murphy & Koehler (WEAK–MODERATE)             |
| A_h    | Age: 0.6–0.8 at 60 and over.                                                                                                        | WEAK                                         |
| C_h    | Concurrent: 0.9–1.0 for the legs at high mileage.                                                                                   | Lundberg 2022; Schumann 2022                 |

**Weekly base strength.**

ΔB = k_s · r_s · D(V_dir) · Fq(f) · I(load) · C_s · (1 − B/B\*)^γ

| Term  | Meaning                                                                                                                                                                                                                                               | Source and grade                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| V_dir | Weekly direct hard sets of the lift or a close variant.                                                                                                                                                                                               | —                                                             |
| D     | Saturating: ~0.35–0.45 at 1 set a week, ~0.8 at 3, ~0.9–0.95 at 5–6, 1.0 at 8 or more.                                                                                                                                                                | Pelland; Androulakis-Korakakis (MODERATE shape, WEAK numbers) |
| Fq    | At equal volume: 1×/week 0.85–0.9, 2× 1.0, 3× 1.05–1.1.                                                                                                                                                                                               | Pelland direction; magnitude WEAK — extract from the paper    |
| I     | ≤8RM loads 1.0; 9–15RM 0.85–0.9; >15RM 0.6–0.7.                                                                                                                                                                                                       | Lopez 2021 (MODERATE)                                         |
| RIR   | Flat from 0 to 4 reps in reserve (strength).                                                                                                                                                                                                          | Robinson 2024 (MODERATE)                                      |
| γ     | 1–1.5, giving the log-like curves of Latella 2020 and Steele 2023.                                                                                                                                                                                    | WEAK                                                          |
| B\*   | The ceiling. Rises with muscle size, B\* = B\*₀·M_prime^α with α ≈ 1, so size raises the ceiling and heavy training realises it. B\*₀ comes from normative percentiles of tested lifters by sex, bodyweight and age, scaled down for non-competitors. | van den Hoek 2024 [K] (WEAK)                                  |
| C_s   | Concurrent. Lower body: men, trained, running more than ~30–40 km a week, 0.6–0.85. Women or untrained, ~1.0. Upper body 1.0. Explosive strength lower still.                                                                                         | Huiberts 2024; Petré 2021; Wilson 2012 (WEAK as a multiplier) |

**Skill and expression.** True 1RM = B · (1 + S).

- S rises toward S_max (about 0.05–0.08) with a time constant of 2–4 weeks
  when heavy specific work is present: sets of 5 reps or fewer at ≥85%.
- It decays toward a floor with a time constant of 4–8 weeks when that work
  is absent.
- This reproduces Mattocks 2017, the front-loading of RCT gains, and the
  benefit of peaking. Direction MODERATE; magnitudes WEAK.

**Fatigue and day-to-day performance.**

- Performance P(t) = 1RM · (1 − F) · e^ε, with ε ~ N(0, σ_day²).
- σ_day ≈ 0.025–0.035 for trained lifters and 0.035–0.05 for novices. Grgic
  2020's median CV of 4.2% includes test noise, so it is an upper bound.
- F decays with a time constant of 2–4 days after each session, scaled by the
  session's hard sets and closeness to failure.
- A slow component (time constant 10–14 days) accumulates when weekly load
  exceeds tolerance and dissipates in a lighter week.
- This is a Banister-family structure (fitness time constant 30–60 days if a
  fitness term is used, fatigue gain 1.5–3× the fitness gain). Use it only for
  short-term dynamics such as the deload rebound or a taper of +1–3%. Its
  parameters are unstable for individuals (Hellard 2006; Stephens Hemingway
  2020). WEAK.

**Reps achieved and effort reported.**

- Maximum reps at a load = Nuzzo's mean curve for that exercise class at
  (load ÷ today's P), plus a fixed personal offset with Nuzzo's
  between-person SD.
- The lifter stops at the target or at failure.
- Reported reps in reserve = true reps in reserve − 1 + noise (SD 1–1.5),
  worse past 12 reps (Halperin 2022). MODERATE.

**Responders.**

- r_s ~ lognormal(0, 0.35) and r_h ~ lognormal(0, 0.45), correlated about
  0.3.
- About 40% of lifters gain clearly more from higher volume (Hammarström
  2020).
- Shrink observed spreads by about 30% to remove measurement noise (Dankel &
  Loenneke 2020).
- WEAK–MODERATE.

**Detraining and retraining.**

- No loss over the first 2–3 weeks off. After that, a decline of about 1–2% of
  the accumulated gain a week, with size falling more slowly early on.
- On return, k is multiplied by 1.5–2 until the previous best.
- WEAK–MODERATE (Bosquet 2013; Ogasawara 2013; Seaborne 2018; Psilander
  2019).

**Acute effects of running.**

- Leg sessions within 24 hours of a long or hard run perform at ×0.93–0.97
  (WEAK; Doma & Deakin show impairment in the other direction too).

**Calibration.** Fit k_s and k_h so that a novice at the reference dose hits
the §4.2 and §4.3 central values, then check:

- the shape against Latella 2020 and Steele 2023;
- the 8-week trained RCT gains (Helms 2018) as an upper tail after a
  programme change;
- Ahtiainen 2016's spread;
- that Lift4's own outputs reproduce sensible miss rates.

### 4.5 Personas

All WEAK, model-based, from §4.2 and §4.4.

**1. Novice man, bench 60 kg, 16 weeks, 3 days a week.** The bench or a press
variant runs twice a week.

| Measure                  | Projection         |
| ------------------------ | ------------------ |
| Expected 1RM at 16 weeks | About 75 kg (+25%) |
| Middle 50%               | 70–80 kg           |
| 80% interval             | 67.5–85 kg         |
| Chance of 80 kg or more  | About 25–30%       |
| Chance of 90 kg or more  | Under 5%           |
| At 8 weeks               | About 67.5–70 kg   |
| Lean mass, in a surplus  | +1.5–3 kg          |

- _In Lift4's Get stronger, beginner:_ 3 × 5 at about 50 kg, stepping
  2.5 kg each successful session. Misses probably begin in weeks 5–8, when the
  five-rep weight nears 62–65 kg. The plan should end near 3 × 5 at 65 kg,
  which implies a 1RM of about 75 kg.
- A 1RM test adds ±3 kg of noise.

**2. Intermediate, bench 100 kg, wants +10 kg in 16 weeks. Is that
realistic?**

- _The base rate:_ intermediates gain about +4–10% in 16 weeks, so the
  central estimate is about 106 kg, with an 80% interval of 102.5–110 kg.
- _Chance of 110 kg or more:_

  | Programme                                                                                                                                   | Chance  |
  | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
  | General programme, bench 1–2× a week                                                                                                        | ~15–25% |
  | Bench-specific block: bench 2–3× a week, 6–12 direct hard sets, mostly 3–6 reps at RPE 7–9, singles in the last 4–6 weeks, a 1–2-week taper | ~30–45% |
  | Heavy running or a calorie deficit                                                                                                          | ~10–20% |

- _Better odds when:_
  - bodyweight rises 3–5 kg;
  - the lifter is coming back from a layoff;
  - they have never trained heavy singles (a skill gap to close);
  - their bench is low for their bodyweight;
  - their "intermediate" status is by calendar time but they still progress
    like a novice.
- _Worse odds when:_ the bench is already about 1.4× bodyweight or more.
- _Lab context:_ Helms 2018's trained men did gain about 10 kg in 8 weeks.
  Such samples are often late novices, and their gains include test practice
  and novelty, so treat that result as an upper tail.
- _Honest copy:_ "Possible, not typical. Plan for about +5 kg; +10 kg is a
  stretch."

**3. Intermediate woman, hypertrophy, 16 weeks, 3–4 days a week.**

| Measure                           | Projection                                                            |
| --------------------------------- | --------------------------------------------------------------------- |
| Muscle thickness, trained muscles | +3–7% (central about 4–5%)                                            |
| Lean mass, small surplus          | +0.5–1.2 kg                                                           |
| Lean mass, at maintenance         | About 0–0.5 kg                                                        |
| Lean mass, in a deficit           | About 0, while strength still rises                                   |
| Strength on trained lifts         | +4–10%; higher in kilograms on squats and hip thrusts than on presses |

- _Dose:_ 10–20 fractional sets per priority muscle a week, twice a week, 0–2
  reps in reserve with isolations to failure, 6–20 reps, at least 90 seconds'
  rest.
- _Relative to men:_ similar relative gains (Roberts 2020; Refalo 2025 [K]).
- _Spread:_ perhaps a fifth show no measurable change in 16 weeks, and a fifth
  exceed +8%.

**4. A lifter training for a marathon in 12 months who wants to keep or
improve strength.** Intermediate, two lifting sessions a week in the base
phase, one or two in the build with Lift4's leg trim, loads kept heavy.

| Measure                        | Projection over the year                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Upper-body 1RMs                | +2–8% (central +4%)                                                                                   |
| Lower-body 1RMs, men           | −5% to +5% (central 0 to +2%), most gains in months 1–6, a small dip at peak mileage and in the taper |
| Lower-body 1RMs, women         | Interference smaller on average (Huiberts 2024): central about +2–4%                                  |
| If lifting stops for the build | Expect −5–10% lower-body strength by race day                                                         |
| Running economy                | +2–8% from heavy strength work (Blagrove 2018 [V*])                                                   |
| Muscle size                    | Roughly maintained                                                                                    |

### 4.6 Reconciling the owner's coaching anchors

`owner-lifting-sources.md` records Oreb's timelines for coached men of
80–100 kg: a 100 kg bench inside year 1, 140 kg in about two years, and a
double-bodyweight squat in one to two years. Against §4.2:

- **100 kg inside a year from an untrained 60 kg bench (+67%).** Near the top
  decile (central +40%, 80% upper bound +60%). Plausible for coached high
  responders gaining bodyweight. Not the median.
- **140 kg in two years (+133% from 60 kg).** Beyond the two-year 80% interval
  (a central of roughly +55–65%). It suits lifters who start stronger or
  heavier, or the top few percent.
- **A double-bodyweight squat (160–180 kg) in one to two years from a 70–80 kg
  start (+110–150%).** The upper tail, plausible in two years for some.

Use these as checks that the simulator's 90th–95th percentiles reach them,
not as pass/fail medians. That is how the owner-sources file itself framed
them.

### 4.7 Simulation experiments worth running

Report each as ranges across model variants.

1. **Intermediate and advanced strength progression.** Compare Lift4's Get
   stronger as built (session-to-session fixed 5s, two misses then −10%)
   with:
   - a weekly step;
   - a step gated on effort (hold when the last set is RPE 9 or more);
   - e1RM-based load selection;
   - an Oreb-style 16-week effort-wave cycle with singles and a test.

   Outcomes: the 1RM distribution at 16, 26 and 52 weeks; drops per 16 weeks;
   the share of sets at RPE 9.5 or more; sessions spent below the previous
   working weight.

2. **The miss drop.** 10% against 5% for advanced lifters.
3. **Small plates.** On against off, for the overhead press and women's bench.
4. **Lighter-week cadence.** Every 4th week, every 6th, and none. Expect small
   differences, and note that the model is WEAK here.
5. **The volume ceiling for advanced hypertrophy lifters with time.** 20
   against 25 against 30 fractional sets for one to three priority muscles.
6. **ADR-0010's counting.** 0.5 against 1.0, scored against Pelland's
   fractional model.
7. **The race leg trim.** On against off, for men and women.
8. **Peaking.** A two-week taper with singles against none, for test-day 1RM.

---

## 5. Adaptive lifting apps

### 5.1 How the apps describe their models

All [K]: published descriptions as remembered. They were not re-read this
session. Re-read each vendor's help pages before relying on any detail.

- **JuggernautAI (Juggernaut Training Systems).**
  - An AI strength coach, originally for powerlifting.
  - Builds a plan from a questionnaire, adjusts upcoming sessions from logged
    performance against targets, RPE and a readiness check, and peaks for a
    meet date.
  - The closest commercial analogue to a "meet mode".
- **RP Hypertrophy app (Renaissance Periodization).**
  - Mesocycles of a few weeks with a deload.
  - After each muscle's work the lifter rates soreness or recovery, pump,
    perceived workload and joint pain. The app adds or holds that muscle's
    sets the following week.
  - The target reps in reserve fall across the mesocycle, and per-set load
    and rep suggestions come from prior performance.
  - The best-known feedback-driven volume model. Its feedback rules have no
    published validation.
- **MacroFactor Workouts.**
  - A 2025 workout app from the makers of MacroFactor, whose team overlaps
    with Stronger By Science.
  - Its published progression description could not be re-read this session.
    The next run should read its help centre before characterising it.
- **Fitbod.**
  - Generates each workout from per-muscle "recovery" (a fatigue state that
    recovers over days), estimated strength (e1RM from logged sets),
    equipment and goals.
  - The 2026 Marzagao preprint [V] uses Fitbod's 37.7 million logged sets,
    which shows e1RM at the centre of its model.
- **Alpha Progression.**
  - A plan generator with per-set progression suggestions from the last
    performance and reported reps in reserve, plus volume tracking per muscle.
- **Gravl.**
  - AI-generated workouts that adapt weights and reps from logs, with a muscle
    recovery view.
- **Contrast:** Hevy and Strong are loggers with templates and no adaptive
  model. That matches the repo's reference-app notes in `GLOSSARY.md`.

### 5.2 What a state-of-the-art adaptive model would include

Grades are on the evidence for each component, not for the whole.

1. **Per-lift e1RM with uncertainty.**
   - Update it from every working set: load, reps and reported reps in
     reserve.
   - Weight sets of 3–8 reps highest, discount sets above 10–12 (Reynolds
     2006), correct the deadlift, and use a load-dependent formula
     (Marzagao 2026).
   - This drives stall detection, expectation bands and starting loads after
     swaps and returns.
   - MODERATE for the inputs, CONVENTION for Bayesian updating.
2. **A personal reps–%1RM curve.** Nuzzo 2024's means as a prior, updated
   from the person's own sets. MODERATE.
3. **Load selection from target reps and reps in reserve, for intermediate and
   advanced users who rate effort.** Helms 2018; Graham & Cleather 2021;
   Hickmott 2022. MODERATE.
4. **Fractional volume per muscle with session caps.** Goal-specific weekly
   targets that allocate sets with diminishing returns in mind (Pelland 2025;
   Remmert 2025). MODERATE.
5. **Fatigue-aware volume.** Add sets only while the e1RM trend and recovery
   reports allow, and reduce them when the trend falls beyond noise.
   CONVENTION or WEAK: RP-style feedback rules are not validated.
6. **Blocks with peaks, for strength users.** Accumulation, intensification
   and realisation, then a taper of 1–3 weeks at −40–60% volume with
   intensity kept. MODERATE that periodization helps strength (Williams 2017;
   Moesgaard 2022). WEAK for specific block designs (Travis 2020; Pritchard
   2016).
7. **Priority muscles and lifts, chosen by the user.** Extra volume for one to
   three targets, with maintenance doses elsewhere (Spiering 2021;
   Androulakis-Korakakis 2020). MODERATE.
8. **Awareness of concurrent running.** Leg volume, session placement and
   expectations adjusted to running load (Huiberts 2024; Schumann 2022;
   Robineau 2016). MODERATE.
9. **Stall detection against noise.** Judge an e1RM slope over 3–6 exposures
   against a σ of about 3–4%, not one or two sessions. MODERATE for the noise
   data, CONVENTION for the rule.
10. **Expectation bands.** Projections from training age and distance to the
    ceiling (§4). WEAK.

### 5.3 Where the evidence runs out

- **Personal volume landmarks.** No validated measure of an individual's
  MEV, MAV or MRV exists. The apps' feedback loops are plausible but untested.
- **Readiness and wellness questionnaires** have weak support as automatic
  load adjusters for lifting. HRV and readiness were not researched here.
- **Individual response prediction** is unreliable. Observed spread is
  inflated by noise.
- **Fitness–fatigue models** do not identify individual parameters.
- **No trial compares an adaptive app with a sound fixed programme.**
- **Long horizons are missing.** There are almost no RCTs longer than six
  months.
- **Women, older adults and advanced lifters** are underrepresented.

---

## 6. Lift4 gap analysis, clause by clause

The clause numbers follow the locked row in
`.claude/plans/programme-run-followups.md`, line 665.

**Verdict key:**

| Verdict | Meaning                                         |
| ------- | ----------------------------------------------- |
| SUP     | Supported by the evidence.                      |
| DEF     | A defensible simplification.                    |
| SHORT   | Likely to fall short; the column says for whom. |

| #   | Lift4 clause                                                                                                                                                                       | Verdict                                                                       | Evidence and grade                                                                                                                                                                                             | Falls short for                                                                                                                                                            | What the evidence would suggest                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | (1) The next session starts from the weight lifted, heavier or lighter                                                                                                             | SUP                                                                           | Autoregulated loading ≥ fixed loading (Helms 2018; Graham & Cleather 2021; Hickmott 2022), MODERATE                                                                                                            | — (one lucky heavy day can over-reach; the miss rule catches it)                                                                                                           | For advanced lifters, optionally smooth with the e1RM trend                                                                                                                                                                                                                |
| L2  | (2) The engine steps, drops, runs lighter and race weeks; everything else waits for a yes; it never swaps on its own                                                               | DEF                                                                           | Exercise stability helps skill and comparison (specificity, MODERATE); planned variation for stalls and regions is CONVENTION or WEAK (Kassiano 2022)                                                          | Advanced powerlifters and physique lifters who use block-wise variants                                                                                                     | Keep. If revisited, offer a variant at block end for a lift whose e1RM has been flat for 6+ weeks (the owner declined one suggestion per cycle; with only CONVENTION behind it, declining is defensible)                                                                   |
| L3  | (3) Silent by default; one line when the plan lowers a lift; ranges shown                                                                                                          | DEF                                                                           | Product UX; no evidence dimension. Showing ranges matches double progression                                                                                                                                   | —                                                                                                                                                                          | —                                                                                                                                                                                                                                                                          |
| L4  | (4) Four goals as dials; Lose fat = Build muscle + a cut                                                                                                                           | SUP for Build muscle, Lose fat, General, Running. SHORT for strength athletes | Deficits blunt lean-mass gains, not strength (Murphy & Koehler 2022 [K]); keep load in a cut (Helms 2014/2015 [K])                                                                                             | Powerlifters (no competition-lift frequency floor, no heavy exposure, no peak or meet date); powerbuilders (no dial, and Get stronger's accessories use the strength band) | Add a powerbuilding dial (strength main lifts with Build muscle's accessories and band). Add an optional dated test or meet to Get stronger, reusing the race-week machinery                                                                                               |
| L5  | (5) One generator; every muscle twice a week on 2+ days                                                                                                                            | SUP                                                                           | Schoenfeld 2016 and 2019; ACSM 2026, STRONG                                                                                                                                                                    | Strength users: the floor is per muscle, not per lift                                                                                                                      | On strength goals, add a per-lift frequency floor: bench 2–3×, squat 2×, deadlift or hinge 1–2× where days allow (Pelland 2025, MODERATE)                                                                                                                                  |
| L6  | (5) Session length decides volume; the weekly bands are only a ceiling, in two tiers; counting per ADR-0010                                                                        | DEF on time-first. SHORT on currency and the advanced ceiling                 | Volume drives growth (Pelland 2025); 12–20 is a sound default (Baz-Valle 2022); 0.5 counting fits hypertrophy best and direct-only fits strength best (Pelland 2025, MODERATE)                                 | Advanced hypertrophy lifters with time, capped at 20; ADR-0010's 1:1 flip (landed 2026-08-03) moved away from the best-fitting currency                                    | Re-open ADR-0010: return to 0.5, re-derive the bands in fractional currency from Pelland, and count direct sets only for strength main-lift volume. Allow 1–3 user-chosen priority muscles up to ~25 fractional sets with maintenance (4–8) elsewhere, inside the time fit |
| L7  | (5) Three sets by default; beginners 3 on mains and 2 elsewhere; 4 on strength mains from intermediate                                                                             | SUP                                                                           | Multiple sets beat one (Krieger 2010 [K]); minimal doses work for novices (Androulakis-Korakakis 2020)                                                                                                         | —                                                                                                                                                                          | —                                                                                                                                                                                                                                                                          |
| L8  | (5) Rep table by goal and role                                                                                                                                                     | SUP for Build muscle, General and Running. DEF for Get stronger               | Load-independence near failure (Schoenfeld 2017; Lopez 2021, STRONG); ≥80% for strength (ACSM 2026). Five reps at 2 reps in reserve is about a 7RM effort, ~80–83%                                             | Powerlifters and strength-focused intermediates and advanced lifters: no exposure to 1–3 reps at 85–95% (specificity, Mattocks 2017, MODERATE)                             | For intermediate and advanced Get stronger, an optional top single or triple at RPE 7–9 before the 5s, and heavier phases (3s, then singles) before a dated test                                                                                                           |
| L9  | (5) Heavier and lighter days (±2 reps) for intermediates, unlabelled                                                                                                               | SUP                                                                           | Periodized and undulating beat non-periodized for strength (Williams 2017; Moesgaard 2022, MODERATE); neutral for hypertrophy (Grgic 2017)                                                                     | —                                                                                                                                                                          | —                                                                                                                                                                                                                                                                          |
| L10 | (5) Straight sets; top sets and back-offs logged, not prescribed                                                                                                                   | DEF for novices and intermediates. SHORT for strength athletes                | No RCT shows top set plus back-offs beats straight sets (CONVENTION); RPE top sets are how Helms 2018-style autoregulation is usually run                                                                      | Intermediate and advanced powerlifters and powerbuilders                                                                                                                   | Opt-in "top set + back-offs" on strength main lifts for intermediate and up (owner call; already flagged as a gap in owner-sources)                                                                                                                                        |
| L11 | (5) Effort cue: 2 reps to spare on compounds; the last set to the limit on isolations and machines; comfortably easy in a lighter week                                             | SUP                                                                           | Robinson 2024; Refalo 2023; Grgic 2022; ACSM 2026, MODERATE–STRONG                                                                                                                                             | A small gap for advanced hypertrophy lifters (compounds at ~1 rep to spare would add a little)                                                                             | Optional "1 rep to spare" for advanced Build muscle. Remember ratings are about ±1 rep (Halperin 2022)                                                                                                                                                                     |
| L12 | (5) Warm-ups: today's ramp plus 85% × 2 before sets of 6 reps or fewer                                                                                                             | DEF                                                                           | CONVENTION; the 85% double also gives a little heavy-load practice                                                                                                                                             | —                                                                                                                                                                          | —                                                                                                                                                                                                                                                                          |
| L13 | (5) Rest by role (3 / 2½ / 2 minutes / 75 s); 30-minute plans rest less                                                                                                            | SUP / DEF                                                                     | 3 min > 1 min (Schoenfeld 2016); >60 s helps growth slightly (Singer 2024); >2 min for strength (Grgic 2018 [K]), MODERATE                                                                                     | 75 s isolations sit at the low edge                                                                                                                                        | 90 s for isolations when time allows. Short rests in 30-minute plans are a fair trade (small growth cost)                                                                                                                                                                  |
| L14 | (5) Starting weights estimated; unknown level = beginner; no bodyweight means start from the bar; sex factor 0.75 (LIFT-EV-07)                                                     | DEF                                                                           | Starting loads are a first guess corrected in session one; sex barely moderates reps-at-load (Nuzzo 2024); women's relative upper-body strength is lower than lower-body [K]                                   | Women's lower-body lifts (a single 0.75 factor under-shoots them)                                                                                                          | Upper- and lower-body factors, or ask for one recent set ("a weight you can lift about 8 times")                                                                                                                                                                           |
| L15 | (6) Double progression on ranges; fixed targets step when every set hits; fixed for strength and running mains and every beginner's mains                                          | SUP for ranges and beginners. DEF / SHORT for intermediate strength mains     | Rep vs load progression similar (Plotkin 2022 [K]); novice linear progression is CONVENTION supported by fast novice gains. Intermediates progress weekly or slower (Rippetoe; ACSM 2009 rates)                | Intermediate and advanced Get stronger: session-to-session steps outrun physiology, giving a sawtooth of steps, two misses, −10%, then four or more sessions climbing back | Test in the simulation (§4.7 #1): a weekly step for intermediate strength mains, or hold the step when the last set is RPE 9 or more (show the effort row by default on Get stronger from intermediate), or e1RM-based loads                                               |
| L16 | (6) Steps follow the equipment; small plates off by default; never an automatic step over ~15%                                                                                     | DEF                                                                           | —                                                                                                                                                                                                              | Light lifts: 2.5 kg is 6% of a 40 kg OHP and 8% of a 30 kg bench. Many women's presses and every early OHP progress in coarse jumps                                        | Suggest small plates at onboarding when a main lift's working weight is under ~50 kg, or default them on for the OHP. The 15% guard is good                                                                                                                                |
| L17 | (6) Optional effort row (default for advanced); a logged 9.5 or more holds the step                                                                                                | SUP                                                                           | Autoregulation (MODERATE); ratings are more accurate near failure (Zourdos 2016)                                                                                                                               | Intermediate strength users (row hidden by default)                                                                                                                        | Show by default on Get stronger from intermediate. Consider 9 as the hold threshold for sets of 5 reps or fewer                                                                                                                                                            |
| L18 | (7) A miss counts only at the planned weight, judged on total reps; the first holds silently                                                                                       | SUP                                                                           | The day-to-day noise floor (CV ~3–4%, Grgic 2020) makes a single miss uninformative, MODERATE                                                                                                                  | —                                                                                                                                                                          | —                                                                                                                                                                                                                                                                          |
| L19 | (7) Two misses in a row: 10% lighter (at least a step), then a step a session back                                                                                                 | DEF (novices). SHORT (advanced)                                               | CONVENTION (Starting Strength, Madcow and 5/3/1-style resets)                                                                                                                                                  | Advanced lifters progressing ~0.1–0.3% a week: 10% costs about four sessions and repeats often                                                                             | Scale the drop by level (novice 10%, intermediate 7.5%, advanced 5%), or decide on the e1RM trend over 3–6 exposures. Test in the simulation (§4.7 #2)                                                                                                                     |
| L20 | (7) A leg miss within 24 h of a hard run counts half; counts reset after a lighter week or a break                                                                                 | SUP                                                                           | Leg strength and running interfere acutely for up to ~24 h (Doma & Deakin [V*]; Robineau 2016)                                                                                                                 | —                                                                                                                                                                          | —                                                                                                                                                                                                                                                                          |
| L21 | (8) Short or easier sessions count; can move a weight up, never down                                                                                                               | DEF                                                                           | —                                                                                                                                                                                                              | —                                                                                                                                                                          | —                                                                                                                                                                                                                                                                          |
| L22 | (9) A lighter week every 4th trained week, for intermediate and up on 3+ days; none for beginners or 1–2-day plans                                                                 | DEF                                                                           | WEAK evidence overall. In practice athletes deload every 5.6 ± 2.3 weeks (Rogerson 2024); 4 is inside that range. No data for beginners                                                                        | Powerlifters: deloads should line up with tests and meets                                                                                                                  | Keep 4. Line a lighter week up before a dated test (meet mode)                                                                                                                                                                                                             |
| L23 | (9) Recipe: half the working sets, same weights; one at a time; take one any time                                                                                                  | SUP                                                                           | Matches the Delphi (cut volume, keep intensity) and practice (fewer sets, more reps in reserve), WEAK–MODERATE. A week fully off cost strength (Coleman 2024)                                                  | —                                                                                                                                                                          | Keep the "comfortably easy" cue: practice also adds reps in reserve. (Oreb makes week 4 the hardest week at half volume; that variant is CONVENTION)                                                                                                                       |
| L24 | (10) Race build: leg sets cut by a third at the same weights                                                                                                                       | SUP                                                                           | Intensity maintains strength while volume falls 33–66% (Spiering 2021; Bickel 2011; Rønnestad 2010); lower-body interference in men and trained lifters (Huiberts 2024; Petré 2021), MODERATE                  | —                                                                                                                                                                          | Defaulting to yes for women matters less (Huiberts: no lower-body interference in women). The single default is still defensible                                                                                                                                           |
| L25 | (10) Last two weeks before a race lighter; race-week session at least 3 days out (no lifting in the last 2 days); the week after light                                             | SUP / DEF                                                                     | Endurance tapers: ~2 weeks at −41–60% volume (Bosquet 2007 [K]); powerlifters' last heavy session ~3.7 days out (Pritchard 2016); next-day running impairment after leg work (Doma & Deakin)                   | —                                                                                                                                                                          | —                                                                                                                                                                                                                                                                          |
| L26 | (10) Heavy legs before a long or key run: a note, nothing moves                                                                                                                    | DEF                                                                           | Doma & Deakin; Robineau 2016                                                                                                                                                                                   | Runners for whom the key run matters most                                                                                                                                  | Fine as a choice; the note is evidence-backed                                                                                                                                                                                                                              |
| L27 | (11) Session order carries over; no catch-up                                                                                                                                       | DEF                                                                           | No evidence that the weekday matters; frequency per muscle holds over the cycle                                                                                                                                | —                                                                                                                                                                          | —                                                                                                                                                                                                                                                                          |
| L28 | (11) Welcome back from 2 weeks away; ease back 10% (3–8 weeks) or 20% (longer), a set fewer the first week, a step a session back                                                  | SUP / DEF                                                                     | Little loss within 2–3 weeks; fast regain (Bosquet 2013; Ogasawara 2013; Seaborne 2018 [K]); the set fewer protects against soreness from lost repeated-bout protection (CONVENTION)                           | Possibly too conservative for 3–4 weeks away                                                                                                                               | Fine. A 5% drop at 3–5 weeks would also be defensible                                                                                                                                                                                                                      |
| L29 | (12) Blocks of 4, 8 or 12 weeks; level changes set how lifts progress and whether lighter weeks come                                                                               | DEF                                                                           | Periodization helps strength modestly                                                                                                                                                                          | Strength athletes (no block has a peak)                                                                                                                                    | A peak block with a date for Get stronger (L4)                                                                                                                                                                                                                             |
| L30 | (13) Retirements: set wave, adjustment rule, fatigue shave, automatic whole-body lighter week, cut and bulk nudges, accessory rotation, plateau swap, per-muscle "Eased this week" | SUP                                                                           | No validated per-muscle fatigue measure; cut-driven set cuts lack evidence; untrained rotation and automatic plateau swaps work against specificity. Progressive set waves are CONVENTION with limited support | Advanced hypertrophy users who like set progression across a mesocycle                                                                                                     | Keep retired. If advanced users want it, offer it as an opt-in mesocycle, not a default                                                                                                                                                                                    |
| L31 | (handoff non-adoptions) No %1RM programming, AMRAP testing or peaking by default                                                                                                   | DEF for defaults                                                              | ACSM 2026: complex periodization not needed for average adults                                                                                                                                                 | Powerlifters                                                                                                                                                               | Keep for defaults; deliver through an opt-in strength track (L4, L8, L10, L29)                                                                                                                                                                                             |

**The ten Lift4 clauses most at odds with the evidence, by user type:**

| User type              | Clauses                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| Powerlifter            | L4, L5 (per-lift frequency), L8 (no heavy exposure), L10, L15, L19, L29 |
| Hypertrophy (advanced) | L6 (ceiling and currency), L11 (minor)                                  |
| Powerbuilder           | L4 (no dial), L10                                                       |

**Novices, general fitness, and runners who lift:** Lift4 is well aligned with
the evidence everywhere.

---

## 7. Rules not to adopt as defaults

Each is tempting, and the evidence does not support it as a universal default.

1. **Training to failure on every set, or on barbell compounds.** It adds
   fatigue for little or no extra growth, and none for strength (Grgic 2022;
   Refalo 2023; Robinson 2024; ACSM 2026).
2. **More sets is always better, or a high default** (20–30 sets per muscle).
   Returns diminish, the per-session cap is real, the time cost is high,
   individuals vary, and strength gains nothing from it (Pelland 2025;
   Remmert 2025).
3. **One set is enough for everyone.** The minimal dose works but is not
   optimal (Krieger 2010; Androulakis-Korakakis 2020).
4. **A fixed 3:1 or 4:1 deload cadence presented as physiology, or a deload
   that means a week off.** No trial supports any cadence, and a week fully
   off cost strength (Coleman 2024). Tropos's every-4th is a policy and
   should be described as one.
5. **Mandatory periodization models (block, DUP) for hypertrophy.** No
   benefit (Moesgaard 2022; Grgic 2017).
6. **Rep zones as switches.** "8–12 for size, 15+ to tone" is not supported:
   hypertrophy is load-independent near failure (Schoenfeld 2017, 2021).
7. **Frequent rotation or "muscle confusion".** It costs skill and
   comparability (specificity; Kassiano 2022).
8. **Sex-specific programming,** such as higher reps or less rest for women.
   Reps-at-load barely differ by sex (Nuzzo 2024), and relative gains are
   similar (Roberts 2020 [K]).
9. **Personal MEV, MAV or MRV presented as measured numbers.** No validated
   method exists, and the repo already bars this.
10. **An e1RM from high-rep sets (more than 10–12) treated as a 1RM.** The
    error is large (Reynolds 2006), and formulas run low on the deadlift
    (LeSuer 1997).
11. **Daily maxes or weekly max-effort days for consumers.** They come from
    elite or equipped contexts, with no evidence for novices.
12. **Prilepin's chart as a volume rule.** It comes from Olympic lifts and was
    never validated.
13. **Lengthened partials replacing full range of motion by default.** The
    evidence is early and mostly in untrained people. Choosing exercises that
    load the muscle at long length is the safe step.
14. **"Running kills gains."** Average interference on hypertrophy and
    maximal strength is small (Schumann 2022). The cost is mainly lower-body
    strength in men and trained lifters, and explosive strength.
15. **Velocity-based training as a default.** It needs hardware, and the
    benefits depend on the velocity-loss threshold chosen (Hickmott 2022).
16. **Very short rests (30–60 seconds) for "metabolic stress".** Longer rests
    grow at least as much (Schoenfeld 2016; Singer 2024).
17. **Outcome promises** ("+10 kg in 16 weeks", "bench bodyweight by
    summer"). Response heterogeneity is large (Hubal 2005; Ahtiainen 2016).
    Give ranges.
18. **Cutting training volume because the person is on a cut.** No evidence
    supports it. Keep the stimulus (Helms 2014/2015 [K]). Lift4 already
    retired this.
19. **Readiness questionnaires or HRV adjusting loads automatically.** Not
    researched here, and the support is weak.
20. **A per-person fitness–fatigue fit as a predictor.** Its parameters are
    unstable (Hellard 2006). Use it for population simulation dynamics only.

---

## 8. Open questions, and what to verify before coding

**Unknown in the literature:**

- individual volume landmarks;
- whether any deload cadence beats autoregulated deloads;
- long-term (over 12 months) comparisons of progression models;
- how intermediates and advanced lifters, women and older adults respond
  beyond 16 weeks;
- whether app algorithms beat good fixed programmes;
- how accurately consumers rate reps in reserve over months;
- the size of the frequency effect on strength once volume is controlled
  (its direction is known).

**Verify first.** Ordered by how load-bearing each is for the model:

1. **Pelland 2025.**
   - The fitted curves and coefficients for weekly fractional sets
     (hypertrophy) and direct sets (strength).
   - The strength threshold (~3 fractional vs ~5 direct).
   - The frequency slopes.
   - The model-comparison result for counting methods.
2. **Nuzzo 2024.** The reps-at-%1RM tables, both means and SDs, including the
   bench and leg-press tables.
3. **Latella 2020 and Steele 2023.** Annual gain rates and the fitted
   long-term curve shapes.
4. **Roberts 2020, Refalo 2025 and Jones 2021.** Effect sizes for sex
   differences.
5. **Wilson 2012, Schumann 2022, Huiberts 2024 and Petré 2021.** Numbers by
   running volume.
6. **Bickel 2011, Psilander 2019 and Bosquet 2013.** Detraining rates.
7. **Remmert 2025.** Whether the preprint is now published.
8. **Busso 1990.** The weightlifting fitness–fatigue parameters.
9. **App help pages.** JuggernautAI, RP, MacroFactor Workouts, Fitbod, Alpha
   Progression and Gravl.
10. **Unread recent papers.** Enes 2024 on weekly set progression, and the
    2026 _J Sci Sport Exerc_ paper on the upper limits of volume.

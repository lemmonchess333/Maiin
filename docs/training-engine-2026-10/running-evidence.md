# Running programming for Tropos: evidence ledger and synthesis

Prepared 2026-10-06 by a Claude research agent, as input for a later multi-agent
run that will (a) improve the run-plan generator, (b) write plain-English
explanations of every session type, and (c) simulate synthetic runners over
16–52 weeks. This is planning material. It is not a lock, a feature spec, or
medical advice.

> Integrated 2026-10-06 into `docs/training-engine-2026-10/`. Planning
> material, not a lock. Verification status, corrections and read order:
> [README.md](README.md).

It **extends, and does not repeat**, `docs/running-programming-claude-handoff.md`
lines 54–164. That section already covers Magness (_The Science of Running_),
Pfitzinger & Latter (_Faster Road Racing_), Pfitzinger & Douglas
(_Advanced Marathoning_, 3rd ed.), Campos 2022, Rosenblat 2025, Wang 2023
(taper), Damsted 2018 (load and injury review), Llanos-Lagos 2024 (strength and
running economy) and the Runna help pages. Those are cited here only as
cross-references.

---

## 0. Read this first: how the evidence was gathered and how far to trust it

**Access was restricted, and that limits how much of this was checked.**

- The organisation's egress policy blocked WebFetch and shell access to PubMed,
  PMC, Europe PMC, Crossref, Semantic Scholar, every publisher site tried
  (Springer, BMJ, Frontiers, MDPI, Wiley, LWW, Human Kinetics), Wikipedia,
  nhs.uk and every coaching site tried. **No full text or abstract page was
  opened directly.** Only the web-search tool worked. Search results include
  abstract or summary text from the indexed page, and that text is the basis
  for every claim marked [V].
- The web-search tool has a cap of 200 searches per turn, shared by all agents
  running in parallel. This agent hit the cap after about 70 searches, while
  working on the minimal-dose and concurrent-training sources. Everything after
  that point comes from recalled knowledge and is marked [R].

**Verification markers** (on every source and on load-bearing numbers):

| Marker | Meaning                                                                                                                                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [V]    | Confirmed this session from abstract or summary text that search surfaced, cross-checked across more than one result where possible. The full text was not read.                                                     |
| [V2]   | Confirmed only through a secondary source, such as a coaching blog or a council page summarising the primary one. The primary source is named.                                                                       |
| [R]    | Recalled from prior knowledge. The citation is believed accurate, but the DOI and the numbers have **not** been re-verified this session. Check them before quoting in product copy or encoding them as constants.   |
| [C]    | Computed here from a published formula: the Daniels–Gilbert VDOT equations, Riegel, Tanda 2011 and the Banister model. The script is `harnesses/vdot_calc.py.txt` in this folder, and the outputs are in Appendix A. |

**Evidence grades** (on claims): **STRONG** means meta-analyses or consistent
RCTs. **MODERATE** means some RCTs or a large well-run cohort, with caveats.
**WEAK** means a single small study, indirect evidence or expert opinion.
**CONVENTION** means coaching practice with no trial behind it.

**Population caveat.** Most training trials recruit trained or club-level
"recreational" runners who are much fitter than Tropos's users. Muñoz et al.
2014's "recreational" group ran 10K in about 39 minutes, which is VDOT ≈ 53
[C]. Tropos's typical user is VDOT 25–45. Evidence for beginners and
intermediates is mostly extrapolated, and this document says so wherever that
happens.

---

## 1. Source ledger

Rows marked "(repo)" are already in the running handoff and are listed only for
completeness. The bracketed marker in the Source column shows how the source was
checked; it is not part of the citation.

| Source                                                                                                                                                                                    | Type               | Year                                              | Best product use                                                                                                                                                                                 | Key limitation                                                                                                    | Link / DOI / ISBN                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **BOOKS AND COACHING SYSTEMS**                                                                                                                                                            |                    |                                                   |                                                                                                                                                                                                  |                                                                                                                   |                                                                                       |
| [V] Daniels J. _Daniels' Running Formula_, 4th ed. (Human Kinetics)                                                                                                                       | book               | 2021 (some catalogues list 2022)                  | Shared intensity vocabulary (E/M/T/I/R), purpose of each, per-session volume caps, VDOT pace engine (already in `runPaces.ts`)                                                                   | Paces are formula outputs that assume trained-runner economy; the caps are coaching rules, not trial results      | ISBN 978-1-7182-0366-2 (pbk); 978-1-7182-0367-9 (ebook)                               |
| [V] Humphrey L, Hanson K, Hanson K. _Hansons Marathon Method_, revised ed. (VeloPress)                                                                                                    | book               | 1st ed. 2012; revised 2016 (2023 printing listed) | Cumulative fatigue; 3 "SOS" sessions a week (speed, strength, goal-pace tempo); a long-run cap set by time, not distance                                                                         | Assumes about 6 running days a week; the 16-mile cap is untested against plans with 20-mile runs                  | ISBN 978-1-937715-48-9                                                                |
| [V] Fitzgerald M. _80/20 Running_ (Berkley/NAL)                                                                                                                                           | book               | 2014                                              | Plain words for "most running easy"; first ventilatory threshold (VT1) as the ceiling for easy running                                                                                           | Turns a description of elite training into a prescription; the 80/20 split itself is not trial-proven for novices | ISBN 978-0-451-47088-1                                                                |
| [V] Hudson B, Fitzgerald M. _Run Faster from the 5K to the Marathon_ (Broadway)                                                                                                           | book               | 2008                                              | Hill sprints as cheap neuromuscular work; adaptive (responsive) planning; specific-endurance progression                                                                                         | Coach-authored, with little trial support                                                                         | ISBN 978-0-7679-2822-9                                                                |
| [V2] Higdon H. Novice 1 marathon plan (halhigdon.com; listed on TrainingPeaks)                                                                                                            | coach plan         | current                                           | Benchmark for the most-used beginner marathon plan: 18 weeks, 4 runs and 1 cross-training day, no speedwork, peak of one 20-mile run                                                             | Mileage only, one size fits all, no individual progression                                                        | halhigdon.com                                                                         |
| [V2] Galloway J. Run-walk-run method; "Magic Mile"                                                                                                                                        | coach system       | 1970s–present                                     | Run:walk ratios by pace; a 1-mile benchmark; treats walking as a legitimate method                                                                                                               | The ratios and the claimed time savings are the author's own; primary validation is thin                          | jeffgalloway.com                                                                      |
| [V2] NHS _Couch to 5K_                                                                                                                                                                    | public-health plan | current                                           | 9 weeks × 3 sessions, run-walk progression, rest days between                                                                                                                                    | Ends at 30 minutes of continuous running, which is about 2.8–3.8 km for typical novices [C], not 5 km             | nhs.uk/live-well/exercise/running-and-aerobic-exercises/get-running-with-couch-to-5k/ |
| [V2] Lydiard A, Gilmour G. _Running to the Top_ (Meyer & Meyer); orig. _Run to the Top_ (1962)                                                                                            | book               | 1997                                              | Phase order: aerobic base, then hills, then at most about 4 weeks anaerobic, then coordination and races, then taper                                                                             | Elite and club context, high volume, historical                                                                   | ISBN not verified                                                                     |
| [V2] Canova R. Marathon "special block" and specific-period methodology (articles and forum posts; summarised by fastrunning.com and RunnersConnect)                                      | coach              | 2000s–                                            | "Funnel" toward race pace; race-specific volume rises late in the build                                                                                                                          | Elite Kenyan and Italian marathoners; no trials; **not** a recreational default                                   | fastrunning.com/training/marathon-training/building-special-blocks/33861              |
| [V] Vigil J. _Road to the Top: A Systematic Approach to Training Distance Runners_ (Morning Star)                                                                                         | book               | 1995                                              | Patient aerobic development; long-term athlete development                                                                                                                                       | Out of print; collegiate and elite runners                                                                        | ISBN 1-880047-34-9                                                                    |
| [R] Roche D, Roche M. _The Happy Runner_ (VeloPress)                                                                                                                                      | book               | 2019                                              | Strides and hill strides as frequent, low-cost neuromuscular work                                                                                                                                | Coach opinion                                                                                                     | ISBN not verified                                                                     |
| [R] Noakes T. _Lore of Running_, 4th ed. (Human Kinetics)                                                                                                                                 | book               | 2003                                              | History; "laws of training" (alternate hard and easy, train gently, rest before racing, keep a log)                                                                                              | 2003 physiology; its central-governor framing is contested                                                        | ISBN 978-0-87322-959-6 [R]                                                            |
| [R] Johnston S, House S. _Training for the Uphill Athlete_ (Patagonia)                                                                                                                    | book               | 2019                                              | Aerobic base, an aerobic-threshold check by heart-rate drift, strength for endurance                                                                                                             | Written for mountain and ultra athletes; "aerobic deficiency syndrome" is not validated                           | ISBN 978-1-938340-84-0 [R]                                                            |
| [R] McMillan Running calculator                                                                                                                                                           | coach tool         | online                                            | Race equivalents and pace zones; a benchmark for Tropos predictions                                                                                                                              | Proprietary, with no published validation                                                                         | mcmillanrunning.com                                                                   |
| [R] Viada A. _The Hybrid Athlete_ (Juggernaut)                                                                                                                                            | book               | 2015                                              | How a practitioner schedules lifting alongside running                                                                                                                                           | Not peer reviewed                                                                                                 | ISBN not verified                                                                     |
| [R] Fitzgerald M, Rosario B. _Run Like a Pro (Even If You're Slow)_                                                                                                                       | book               | 2020                                              | Elite-style structure scaled down for amateurs                                                                                                                                                   | Coach opinion                                                                                                     | ISBN not verified                                                                     |
| [R] Maffetone P. MAF "180 − age" heart-rate formula                                                                                                                                       | coach heuristic    | 1980s–                                            | Cited **only as a non-adoption** (§8)                                                                                                                                                            | No validation                                                                                                     | philmaffetone.com                                                                     |
| (repo) Magness 2014; Pfitzinger & Latter 2015; Pfitzinger & Douglas 2020                                                                                                                  | books              | —                                                 | See the handoff                                                                                                                                                                                  | —                                                                                                                 | handoff lines 61–66                                                                   |
| **INTENSITY DISTRIBUTION**                                                                                                                                                                |                    |                                                   |                                                                                                                                                                                                  |                                                                                                                   |                                                                                       |
| [V] Seiler S. "What is best practice for training intensity and duration distribution in endurance athletes?" _IJSPP_ 5(3):276–91                                                         | narrative review   | 2010                                              | The 3-zone model; "about 80% of sessions low" as a description of elite practice; extra HIIT in well-trained athletes shows no proven long-term gain                                             | Describes elites                                                                                                  | PMID 20861519; doi:10.1123/ijspp.5.3.276 [R]                                          |
| [V] Stöggl T, Sperlich B. "Polarized training has greater impact on key endurance variables…" _Front Physiol_ 5:33                                                                        | RCT, 4 arms        | 2014                                              | Polarized beat threshold, HIIT and high-volume groups on VO2peak (+11.7%) over 9 weeks                                                                                                           | Well-trained athletes from mixed sports; small groups                                                             | doi:10.3389/fphys.2014.00033                                                          |
| [V] Muñoz I et al. "Does polarized training improve performance in recreational runners?" _IJSPP_ 9(2):265–72                                                                             | RCT                | 2014                                              | Over 10 weeks both arms improved 10K (polarized −5.0%, between-thresholds −3.6%; difference not significant)                                                                                     | Club runners (VDOT ≈ 53 [C]); compliance problems                                                                 | PMID 23752040                                                                         |
| [V] Festa L et al. Polarized vs focused (threshold) training in recreational runners, _Front Sports Act Living_                                                                           | RCT                | 2020 (online Jan)                                 | Over 8 weeks both models improved 2 km speed by 3.0–3.5%, with no difference between them                                                                                                        | Short and small                                                                                                   | doi:10.3389/fspor.2019.00070                                                          |
| [V] Esteve-Lanao J et al. "Impact of training intensity distribution on performance in endurance athletes." _JSCR_ 21(3):943–9                                                            | RCT                | 2007                                              | More zone-1 time (80/12/8) improved more than more zone-2 time (67/25/8) over 5 months                                                                                                           | 12 sub-elite runners                                                                                              | JSCR 21(3):943–9                                                                      |
| [V] Esteve-Lanao J et al. "How do endurance runners actually train?" _MSSE_ 37(3):496–504                                                                                                 | cohort             | 2005                                              | Zone-1 time was strongly related to cross-country performance (r = −0.97 for the longer race)                                                                                                    | 8 runners                                                                                                         | MSSE 37(3):496–504                                                                    |
| [V] Filipas L et al. 16 weeks of pyramidal vs polarized training, _Scand J Med Sci Sports_                                                                                                | RCT                | 2022                                              | Pyramidal then polarized was the best sequence (about 1.5% on a 5 km time trial)                                                                                                                 | Well-trained men                                                                                                  | PMC9299127                                                                            |
| [V] Casado A, González-Mohíno F, González-Ravé JM, Foster C. Training of highly trained and elite distance runners, _IJSPP_ 17(6):820–33                                                  | systematic review  | 2022                                              | Elites run a pyramidal distribution in preparation and a polarized one near competition, on a hard/easy day pattern                                                                              | Descriptive; 10 studies                                                                                           | doi:10.1123/IJSPP.2021-0435                                                           |
| [V] Haugen T et al. "The Training Characteristics of World-Class Distance Runners…" _Sports Med Open_                                                                                     | integrative review | 2022                                              | ≥80% of volume at low intensity; race-pace volume rises toward competition; 7–10 day taper                                                                                                       | Elite only                                                                                                        | Sports Med Open 2022; doi:10.1186/s40798-022-00438-7 [R]                              |
| [V] Casado A, Foster C, Bakken M, Tjelta LI. Lactate-guided threshold intervals within high-volume, low-intensity training, _IJERPH_ 20(5):3782                                           | narrative review   | 2023                                              | Explains the Norwegian "double threshold" approach and why sub-threshold intervals buy more threshold volume                                                                                     | Elite, lactate-meter-guided, more than 150 km a week; no recreational trials                                      | doi:10.3390/ijerph20053782                                                            |
| [V] Tjelta LI. "Three Norwegian brothers all European 1500 m champions: what is the secret?" _Int J Sports Sci Coach_                                                                     | case study         | 2019                                              | 140–160 km a week; about 23–25% of sessions at or just below threshold; lactate monitoring                                                                                                       | n = 3 world-class runners                                                                                         | IJSSC 2019 (DOI not verified)                                                         |
| [V] Oliveira PS, Boppre G, Fonseca H. Polarized vs other distributions: meta-analysis, _Sports Med_                                                                                       | meta-analysis      | 2024                                              | Polarized had a small edge on VO2peak (SMD 0.24 [0.01, 0.48]); time trials were equivalent                                                                                                       | Mostly trained athletes; short trials                                                                             | PMC11329428                                                                           |
| [V] Rosenblat MA, Perrotta AS, Vicenzino B. Polarized vs threshold: meta-analysis, _JSCR_                                                                                                 | meta-analysis      | 2019                                              | Time-trial effect size −0.66 (−1.17 to −0.15), favouring polarized                                                                                                                               | Few, small trials                                                                                                 | PMID 29863593                                                                         |
| (repo) Campos 2022; Rosenblat 2025 network meta-analysis                                                                                                                                  | reviews            | —                                                 | See the handoff                                                                                                                                                                                  | —                                                                                                                 | handoff lines 157–158                                                                 |
| [R] Seiler S, Tønnessen E. "Intervals, thresholds, and long slow distance…" _Sportscience_ 13:32–53                                                                                       | review             | 2009                                              | Olympiatoppen 5-zone heart-rate and lactate scale, used for the heart-rate guides                                                                                                                | Anchors derived from elites                                                                                       | sportsci.org/2009/ss.htm                                                              |
| [R] Storoschuk KL et al. "Much Ado About Zone 2…" _Sports Med_                                                                                                                            | narrative review   | 2025                                              | Zone 2 is not uniquely superior for mitochondrial capacity or VO2max in the general population                                                                                                   | Narrative review                                                                                                  | DOI not verified                                                                      |
| **VO2MAX, INTERVALS, SPEED, RESPONSE VARIABILITY**                                                                                                                                        |                    |                                                   |                                                                                                                                                                                                  |                                                                                                                   |                                                                                       |
| [R] Helgerud J et al. Aerobic high-intensity intervals improve VO2max more than moderate training, _MSSE_ 39(4):665–71                                                                    | RCT                | 2007                                              | 4 × 4 minutes at 90–95% HRmax raised VO2max in 8 weeks                                                                                                                                           | Moderately trained men                                                                                            | doi:10.1249/mss.0b013e3180304570 [R]                                                  |
| [R] Milanović Z, Sporiš G, Weston M. HIIT vs continuous training for VO2max, _Sports Med_ 45(10):1469–81                                                                                  | meta-analysis      | 2015                                              | Both raise VO2max substantially, HIIT slightly more; lower starting fitness gives larger gains                                                                                                   | Not specific to runners                                                                                           | doi:10.1007/s40279-015-0365-0 [R]                                                     |
| [R] Bacon AP et al. VO2max trainability and HIIT, _PLoS One_ 8(9):e73182                                                                                                                  | meta-analysis      | 2013                                              | Size of VO2max gains from interval training                                                                                                                                                      | Mixed populations                                                                                                 | doi:10.1371/journal.pone.0073182 [R]                                                  |
| [R] Bouchard C et al. HERITAGE familial aggregation of VO2max response, _J Appl Physiol_ 87(3):1003–8                                                                                     | cohort             | 1999                                              | Large person-to-person spread in response, used for simulation variance                                                                                                                          | Sedentary people, cycling                                                                                         | doi:10.1152/jappl.1999.87.3.1003 [R]                                                  |
| [R] Montero D, Lundby C. Refuting the myth of non-response, _J Physiol_ 595(11):3377–87                                                                                                   | RCT                | 2017                                              | "Non-responders" respond to a higher dose                                                                                                                                                        | Cycling                                                                                                           | doi:10.1113/JP273480 [R]                                                              |
| [R] Buchheit M, Laursen PB. High-intensity interval training, parts I and II, _Sports Med_ 43                                                                                             | review             | 2013                                              | Interval design (time near VO2max, recovery formats, 30/30s)                                                                                                                                     | Narrative review                                                                                                  | doi:10.1007/s40279-013-0029-x [R]                                                     |
| [R] Gunnarsson TP, Bangsbo J. The 10-20-30 training concept, _J Appl Physiol_ 113(1):16–24                                                                                                | RCT                | 2012                                              | Short near-maximal bursts on less volume improved 5 km in moderately trained runners                                                                                                             | 7 weeks; small sample                                                                                             | doi:10.1152/japplphysiol.00334.2012 [R]                                               |
| [V] Skovgaard C et al. Speed-endurance training with reduced volume, _Physiol Rep_                                                                                                        | controlled trial   | 2018                                              | 10 sessions of 5–10 × 30 s maximal running, with 36% less volume, improved running economy                                                                                                       | Trained runners, n = 20                                                                                           | doi:10.14814/phy2.13601 [R]                                                           |
| **LOAD PROGRESSION AND INJURY**                                                                                                                                                           |                    |                                                   |                                                                                                                                                                                                  |                                                                                                                   |                                                                                       |
| [V] Buist I et al. GRONORUN: graded (10%-rule) vs standard programme, _Am J Sports Med_ 36(1):33–9                                                                                        | RCT                | 2008                                              | The 10% rule did not reduce injuries: 20.8% vs 20.3% (P = .90) in 532 novices                                                                                                                    | One trial, novices, a 4-mile event                                                                                | doi:10.1177/0363546507307505 [R]                                                      |
| [V] Nielsen RO et al. Excessive progression in weekly distance, _JOSPT_ 44(10):739–47                                                                                                     | cohort             | 2014                                              | More than 30% over 2 weeks, compared with less than 10%: hazard ratio 1.59 (0.96–2.66) for "distance-related" injuries                                                                           | Novices; the confidence interval crosses 1                                                                        | doi:10.2519/jospt.2014.5164                                                           |
| [V] Frandsen JSB et al. "How much running is too much? Identifying high-risk running sessions in a 5200-person cohort study" (Garmin-RUNSAFE), _Br J Sports Med_                          | cohort             | 2025                                              | A single run more than 10% longer than the longest run in the previous 30 days raised the injury rate (HRR about 1.64 / 1.52 / 2.28 by spike size); week-to-week change was not associated       | Observational; self-reported injuries; mean age 46; 22% female                                                    | PMC12421110                                                                           |
| [V] Videbæk S et al. Running-related injuries per 1000 h, _Sports Med_ 45(7):1017–26                                                                                                      | meta-analysis      | 2015                                              | 17.8 (16.7–19.1) injuries per 1000 h for novices vs 7.7 (6.9–8.7) for recreational runners; used as base hazards                                                                                 | Injury definitions vary between studies                                                                           | PMID 25951917                                                                         |
| [V] Kluitenberg B et al. NLstart2run: incidence in novices                                                                                                                                | cohort             | 2015                                              | 10.9% of 1,696 novices injured during a 6-week Start to Run programme                                                                                                                            | Short; Dutch population                                                                                           | J Sci Med Sport 2015 (DOI not verified)                                               |
| [V] Kluitenberg B et al. Injury proportions across populations of runners, _Sports Med_                                                                                                   | systematic review  | 2015                                              | Injury proportions range from 3.2% to 84.9% depending on population                                                                                                                              | Definitions vary                                                                                                  | doi:10.1007/s40279-015-0331-x [R]                                                     |
| [V] Damsted C et al. ProjectRun21, _J Sci Med Sport_                                                                                                                                      | cohort             | 2019                                              | 136 of 784 runners (about 17%) injured during a 14-week half-marathon plan; fewer injuries trended with more than 15 km a week of prior running or a pace faster than 6 min/km (not significant) | Estimates not significant                                                                                         | JSAMS 2019 (DOI not verified)                                                         |
| (repo) Damsted C et al. Training-load change and injury, systematic review, _IJSPT_                                                                                                       | systematic review  | 2018                                              | See the handoff                                                                                                                                                                                  | —                                                                                                                 | PMC6253751                                                                            |
| [V] Impellizzeri FM et al. "Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls," _IJSPP_                                                                            | methods critique   | 2020                                              | Do not encode ACWR as an injury predictor                                                                                                                                                        | —                                                                                                                 | doi:10.1123/ijspp.2019-0864 [R]                                                       |
| [V] Fokkema T et al. INSPIRE online multifactorial prevention, _Br J Sports Med_ 53(23):1479                                                                                              | RCT                | 2019                                              | No effect: 37.5% vs 36.7% injured among 2,378 event entrants                                                                                                                                     | Programme was advice only                                                                                         | bjsm.bmj.com/content/53/23/1479                                                       |
| [V] Toresdahl BG et al. Strength programme for New York City Marathon runners, _Sports Health_ 12(1)                                                                                      | RCT                | 2020                                              | A 12-week, 10-minute, 3-times-a-week programme did not change injury-related non-completion (7.1% vs 7.3%)                                                                                       | Self-directed; low adherence                                                                                      | doi:10.1177/1941738119877180                                                          |
| [R] Hulme A et al. Risk and protective factors for running injury, _Sports Med_ 47(5):869–86                                                                                              | systematic review  | 2017                                              | Previous injury is the most consistent risk factor                                                                                                                                               | Many low-quality studies                                                                                          | doi:10.1007/s40279-016-0636-4 [R]                                                     |
| [R] Lauersen JB, Bertelsen DM, Andersen LB. Exercise to prevent sports injuries, _Br J Sports Med_ 48(11):871–7                                                                           | meta-analysis      | 2014                                              | Strength training reduced sports injuries (risk ratio about 0.3); stretching had no effect                                                                                                       | Mostly sports other than running                                                                                  | doi:10.1136/bjsports-2013-092538 [R]                                                  |
| [R] Nielsen RO et al. Foot pronation and injury in novices wearing neutral shoes, _Br J Sports Med_ 48(6):440–7                                                                           | cohort             | 2014                                              | Pronation was not linked to more injuries                                                                                                                                                        | Novices                                                                                                           | doi:10.1136/bjsports-2013-092202 [R]                                                  |
| [R] Heiderscheit BC et al. Step rate and joint mechanics, _MSSE_ 43(2):296–302                                                                                                            | lab study          | 2011                                              | Raising step rate 5–10% lowers knee and hip loading                                                                                                                                              | Lab only; no injury outcome                                                                                       | doi:10.1249/MSS.0b013e3181ebedf4 [R]                                                  |
| **MARATHON OUTCOME, TAPER, PREDICTION**                                                                                                                                                   |                    |                                                   |                                                                                                                                                                                                  |                                                                                                                   |                                                                                       |
| [V] Doherty C et al. Training determinants of marathon performance: meta-regression, _J Sci Med Sport_ 23(2):182–8                                                                        | meta-regression    | 2020                                              | Weekly distance, runs per week, longest run, number of runs of 32 km or more, training pace and weekly hours were each associated with faster marathons                                          | Compares cohorts, not individuals; confounded by ability                                                          | PMID 31704026                                                                         |
| [V] Tanda G. Predicting marathon time from training indices, _J Hum Sport Exerc_ 6(3)                                                                                                     | regression         | 2011                                              | Marathon pace from weekly km and training pace over 8 weeks (SEE about 4 minutes)                                                                                                                | 22 runners; 2:47–3:36 marathoners                                                                                 | doi:10.4100/jhse.2011.63.05 [R]                                                       |
| [V] Smyth B, Lawlor A. "Longer Disciplined Tapers Improve Marathon Performance for Recreational Runners," _Front Sports Act Living_                                                       | big-data cohort    | 2021                                              | In more than 158,000 runners, a strict 3-week taper was associated with a median 5:32 (2.6%) faster finish than a minimal taper                                                                  | Observational (training-app data)                                                                                 | doi:10.3389/fspor.2021.735220                                                         |
| [V] Smyth B, Muniz-Pumares D. Critical speed from raw training data in recreational marathoners, _MSSE_                                                                                   | big-data cohort    | 2020                                              | Critical speed (CS) from best efforts in training; marathons were run at about 85% of CS; a first half above about 94% of CS predicted collapse                                                  | Observational; about 8% prediction error                                                                          | PMC7664951                                                                            |
| [V] Vickers AJ, Vertosick EA. Race times in recreational endurance runners, _BMC Sports Sci Med Rehabil_ 8:26                                                                             | survey cohort      | 2016                                              | Riegel was accurate up to the half marathon but ≥10 minutes too fast at the marathon for half of runners; adding a second race and weekly mileage improved predictions                           | Self-reported data                                                                                                | doi:10.1186/s13102-016-0052-y                                                         |
| [V] Riegel PS. "Athletic records and human endurance," _Am Sci_ 69(3):285–90                                                                                                              | model              | 1981                                              | T2 = T1 × (D2/D1)^1.06                                                                                                                                                                           | Derived from world records; valid for efforts of about 3.5 minutes to about 4 hours                               | JSTOR (no DOI)                                                                        |
| [V] Keogh A et al. Prediction equations for marathon performance: systematic review, _IJSPP_                                                                                              | systematic review  | 2019                                              | 114 equations; standard errors from 0.27 to 27.4 minutes; no single best equation                                                                                                                | —                                                                                                                 | IJSPP 2019 (DOI not verified)                                                         |
| [V] Emig T, Peltonen J. "Human running performance from real-world big data," _Nat Commun_ 11:4936                                                                                        | big-data model     | 2020                                              | An aerobic-power index and an endurance index from about 14,000 runners' logs predicted race time to about 2%                                                                                    | Device data; selected sample                                                                                      | doi:10.1038/s41467-020-18737-6                                                        |
| [V] Bosquet L et al. Effects of tapering on performance: meta-analysis, _MSSE_ 39(8):1358–65                                                                                              | meta-analysis      | 2007                                              | About 2 weeks, volume cut 41–60% exponentially, intensity and frequency kept                                                                                                                     | Mixed sports                                                                                                      | doi:10.1249/mss.0b013e31806010e0                                                      |
| (repo) Wang 2023 taper review                                                                                                                                                             | meta-analysis      | 2023                                              | See the handoff                                                                                                                                                                                  | —                                                                                                                 | PMC10171681                                                                           |
| [R] Deaner RO et al. "Men are more likely than women to slow in the marathon," _MSSE_ 47(3):607–16                                                                                        | cohort             | 2015                                              | Women pace more evenly                                                                                                                                                                           | Observational                                                                                                     | doi:10.1249/MSS.0000000000000432 [R]                                                  |
| [R] Smyth B. Late-race pacing collapse ("hitting the wall") in recreational marathoners, _PLoS One_                                                                                       | big-data cohort    | 2021                                              | How often runners hit the wall and what it costs                                                                                                                                                 | Observational                                                                                                     | doi:10.1371/journal.pone.0251513 [R]                                                  |
| [R] Daniels J, Gilbert J. _Oxygen Power_ (self-published)                                                                                                                                 | formula book       | 1979                                              | Source of the VDOT equations used in Appendix A                                                                                                                                                  | Assumes elite economy                                                                                             | —                                                                                     |
| **DETRAINING AND RETURN**                                                                                                                                                                 |                    |                                                   |                                                                                                                                                                                                  |                                                                                                                   |                                                                                       |
| [V] Mujika I, Padilla S. Detraining, parts I and II, _Sports Med_ 30(2):79–87 and 30(3):145–54                                                                                            | review             | 2000                                              | In trained athletes VO2max falls 4–14% within 4 weeks of stopping; recently gained fitness is fully lost after more than 4 weeks                                                                 | Old, small studies                                                                                                | PMID 10966148; doi:10.2165/00007256-200030030-00001 (part II)                         |
| [V2] Coyle EF et al. Time course of loss of adaptations after stopping endurance training, _J Appl Physiol_ 57(6):1857–64                                                                 | longitudinal       | 1984                                              | VO2max about −7% by 2–3 weeks and about −15–16% by 8–12 weeks, then stable                                                                                                                       | n ≈ 7                                                                                                             | doi:10.1152/jappl.1984.57.6.1857 [R]                                                  |
| [V2] Hickson RC et al. Reduced training intensities and loss of aerobic power, _J Appl Physiol_ 58(2):492–9                                                                               | experiment         | 1985                                              | Keeping intensity while cutting frequency or duration by a third to two thirds kept VO2max for 15 weeks; cutting intensity did not                                                               | Small sample                                                                                                      | doi:10.1152/jappl.1985.58.2.492 [R]                                                   |
| **HILLS AND STRIDES**                                                                                                                                                                     |                    |                                                   |                                                                                                                                                                                                  |                                                                                                                   |                                                                                       |
| [V] Barnes KR, Hopkins WG, McGuigan MR, Kilding AE. Uphill interval programmes, _IJSPP_ 8(6):639–47                                                                                       | RCT                | 2013                                              | 6 weeks of uphill intervals improved a 5 km time trial by about 2%; the highest intensity was best for running economy (+2.4%)                                                                   | 20 well-trained runners                                                                                           | PMID 23538293                                                                         |
| [V] Ferley DD et al. Incline vs level high-intensity treadmill intervals, _JSCR_ 27(6):1549–58                                                                                            | RCT                | 2013                                              | Similar running-economy gains from both; level intervals improved run-to-exhaustion more                                                                                                         | Treadmill only                                                                                                    | JSCR 27(6):1549–58                                                                    |
| [R] Barnes KR et al. Warm-up with a weighted vest (strides), _J Sci Med Sport_ 18(1):103–8                                                                                                | crossover          | 2015                                              | Acute running-economy and speed effects of strides done with a vest                                                                                                                              | Acute effect only                                                                                                 | doi:10.1016/j.jsams.2013.12.005 [R]                                                   |
| **STRENGTH AND CONCURRENT TRAINING**                                                                                                                                                      |                    |                                                   |                                                                                                                                                                                                  |                                                                                                                   |                                                                                       |
| [V] Blagrove RC, Howatson G, Hayes PR. Strength training and the determinants of distance-running performance, _Sports Med_ 48(5):1117–49                                                 | systematic review  | 2018                                              | Running economy improved 2–8% in most of the 20 studies that measured it                                                                                                                         | Trained runners; heterogeneous studies                                                                            | doi:10.1007/s40279-017-0835-7 [R]                                                     |
| (repo) Llanos-Lagos C et al. Strength training and running economy at different speeds, _Sports Med_ 54(4):895–932                                                                        | meta-analysis      | 2024                                              | Heavy and combined methods improve economy across 8.6–17.9 km/h; plyometrics only at ≤12 km/h                                                                                                    | —                                                                                                                 | PMID 38165636                                                                         |
| [V] Llanos-Lagos C et al. Strength training methods and athletic performance in distance runners, _Sports Med_ 54(7):1801–33                                                              | meta-analysis      | 2024                                              | Heavy-load strength training improves time trials and time to exhaustion; combining methods may add more; trivial effect on VO2max                                                               | —                                                                                                                 | doi:10.1007/s40279-024-02018-z                                                        |
| [V] Eihara Y et al. Heavy resistance vs plyometric training for running economy and time trials, _Sports Med Open_ 8:138                                                                  | meta-analysis      | 2022                                              | Heavy (≥90% 1RM) beat plyometrics for economy (g −0.32 vs −0.13) and time trial (−0.24 vs −0.17)                                                                                                 | —                                                                                                                 | doi:10.1186/s40798-022-00511-1                                                        |
| [R] Beattie K et al. Strength training and performance indicators in distance runners, _JSCR_ 31(1):9–23                                                                                  | RCT                | 2017                                              | 40 weeks of strength training improved economy in competitive runners                                                                                                                            | Small sample                                                                                                      | doi:10.1519/JSC.0000000000001464 [R]                                                  |
| [R] Paavolainen L et al. Explosive-strength training and 5 km time, _J Appl Physiol_ 86(5):1527–33                                                                                        | RCT                | 1999                                              | Explosive training improved 5 km time and economy                                                                                                                                                | Trained runners                                                                                                   | doi:10.1152/jappl.1999.86.5.1527 [R]                                                  |
| [V] Wilson JM et al. Concurrent training: meta-analysis of interference, _JSCR_ 26(8):2293–307                                                                                            | meta-analysis      | 2012                                              | Interference grows with endurance frequency and duration; running interferes more than cycling; power suffers most                                                                               | Older studies                                                                                                     | doi:10.1519/JSC.0b013e31823a3e2d [R]                                                  |
| [V] Schumann M et al. Compatibility of concurrent aerobic and strength training, _Sports Med_ 52(3):601–12                                                                                | meta-analysis      | 2022                                              | No interference for hypertrophy or maximal strength; explosive strength blunted, especially when both are in the same session rather than ≥3 h apart                                             | —                                                                                                                 | doi:10.1007/s40279-021-01587-7                                                        |
| [V] Huiberts RO, Wüst RCI, van der Zwaard S. Concurrent training by sex and training status, _Sports Med_                                                                                 | meta-analysis      | 2024                                              | Lower-body strength blunted in men (−0.43) but not women (0.08); VO2max impaired only in untrained people (also in the lift handoff)                                                             | —                                                                                                                 | PMID 37847373                                                                         |
| [V] Lundberg TR et al. Concurrent training and muscle-fibre hypertrophy, _Sports Med_                                                                                                     | meta-analysis      | 2022                                              | A small negative effect on fibre hypertrophy, possibly larger with running than with cycling                                                                                                     | —                                                                                                                 | doi:10.1007/s40279-022-01688-x                                                        |
| [V] Petré H et al. Maximal strength during concurrent training by training status, _Sports Med_ 51:991–1010                                                                               | meta-analysis      | 2021                                              | Lower-body 1RM blunted only in trained people                                                                                                                                                    | —                                                                                                                 | doi:10.1007/s40279-021-01426-9                                                        |
| [V] Murlasits Z, Kneffel Z, Thalib L. Concurrent training sequence, _J Sports Sci_                                                                                                        | meta-analysis      | 2018                                              | Strength before endurance favours lower-body strength; aerobic gains are unaffected by order                                                                                                     | —                                                                                                                 | doi:10.1080/02640414.2017.1364405 [R]                                                 |
| [R] Eddens L, van Someren K, Howatson G. Intra-session exercise sequence, _Sports Med_ 48(1):177–88                                                                                       | meta-analysis      | 2018                                              | Same conclusion on order                                                                                                                                                                         | —                                                                                                                 | doi:10.1007/s40279-017-0784-1                                                         |
| [V] Robineau J et al. Concurrent effects depend on recovery duration, _JSCR_                                                                                                              | RCT                | 2016                                              | 0 h between sessions was worst; 24 h was best for VO2peak; avoid less than 6 h between conflicting sessions                                                                                      | Amateur rugby players                                                                                             | PMID 25546450                                                                         |
| [V] Doma K, Deakin GB. Strength sessions and next-day running (three papers; titles verified, details recalled)                                                                           | lab studies        | 2013–14                                           | Lower-body strength work impairs running economy and run-to-exhaustion at 6 h and the next day                                                                                                   | Small samples                                                                                                     | researchonline.jcu.edu.au/26183/ ; /28717/ ; /26103/                                  |
| [R] Spiering BA, Mujika I, Sharp MA, Foulis SA. "Maintaining Physical Performance: The Minimal Dose…," _JSCR_ 35(5):1449–58                                                               | review             | 2021                                              | Endurance is kept with intensity maintained and volume cut by 33–66%; strength is kept with about 1 session a week                                                                               | Military and general populations                                                                                  | doi:10.1519/JSC.0000000000003964 [R]                                                  |
| [R] Bickel CS, Cross JM, Bamman MM. Exercise dosing to retain resistance-training adaptations, _MSSE_ 43(7):1177–87                                                                       | RCT                | 2011                                              | One ninth of the original dose kept strength and size in young adults for 32 weeks; older adults needed more                                                                                     | Not runners                                                                                                       | doi:10.1249/MSS.0b013e318207c15d [R]                                                  |
| [R] Rønnestad BR, Hansen EA, Raastad T. In-season strength maintenance, _Eur J Appl Physiol_ 110(6):1269–82                                                                               | RCT                | 2010                                              | One heavy session a week kept strength gains in cyclists                                                                                                                                         | Cyclists                                                                                                          | doi:10.1007/s00421-010-1622-4 [R]                                                     |
| [R] Iversen VM et al. "No Time to Lift?" _Sports Med_ 51(10):2079–95                                                                                                                      | narrative review   | 2021                                              | Time-efficient lifting designs                                                                                                                                                                   | —                                                                                                                 | doi:10.1007/s40279-021-01490-1 [R]                                                    |
| **ENVIRONMENT, ANCHORING, CRITICAL SPEED, RUN-WALK**                                                                                                                                      |                    |                                                   |                                                                                                                                                                                                  |                                                                                                                   |                                                                                       |
| [R] Ely MR et al. Impact of weather on marathon running, _MSSE_ 39(3):487–93                                                                                                              | race-data cohort   | 2007                                              | Marathons slow as wet-bulb globe temperature rises, and slower runners slow more                                                                                                                 | Race data only                                                                                                    | doi:10.1249/mss.0b013e31802d3aba [R]                                                  |
| [R] El Helou N et al. Environmental parameters and marathon performance, _PLoS One_ 7(5):e37407                                                                                           | race-data cohort   | 2012                                              | Best performances at about 4–10 °C; slowing with heat                                                                                                                                            | Race data only                                                                                                    | doi:10.1371/journal.pone.0037407 [R]                                                  |
| [R] Racinais S et al. Training and competing in the heat: consensus, _Br J Sports Med_ 49(18):1164–73                                                                                     | consensus          | 2015                                              | Heat acclimatisation and pacing                                                                                                                                                                  | Consensus                                                                                                         | doi:10.1136/bjsports-2015-094915 [R]                                                  |
| [R] Jones AM, Doust JH. A 1% treadmill grade matches outdoor running, _J Sports Sci_ 14(4):321–7                                                                                          | lab study          | 1996                                              | Treadmill guidance                                                                                                                                                                               | Trained men                                                                                                       | doi:10.1080/02640419608727717 [R]                                                     |
| [R] Minetti AE et al. Energy cost of running on slopes, _J Appl Physiol_ 93(3):1039–46                                                                                                    | lab study          | 2002                                              | Basis for grade-adjusted pace                                                                                                                                                                    | Lab only                                                                                                          | doi:10.1152/japplphysiol.01177.2001 [R]                                               |
| [R] Foster C et al. Session RPE, _JSCR_ 15(1):109–15                                                                                                                                      | method             | 2001                                              | Load = CR10 rating × minutes, usable without devices                                                                                                                                             | —                                                                                                                 | JSCR 15(1):109–15                                                                     |
| [R] Persinger R et al. Talk test consistency, _MSSE_ 36(9):1632–6; Foster C et al. 2008, _J Cardiopulm Rehabil Prev_ 28(1):24–30; Reed JL, Pipe AL 2014, _Curr Opin Cardiol_ 29(5):475–80 | method, review     | 2004–14                                           | The talk test tracks the first ventilatory threshold, giving a device-free easy-pace check                                                                                                       | Mostly clinical and lab settings                                                                                  | doi:10.1249/01.MSS.0000074670.03001.98 [R]                                            |
| [R] Tanaka H, Monahan KD, Seals DR. Age-predicted maximal heart rate revisited, _J Am Coll Cardiol_ 37(1):153–6                                                                           | meta-analysis      | 2001                                              | HRmax ≈ 208 − 0.7 × age, with about ±10 bpm individual error                                                                                                                                     | Population formula                                                                                                | doi:10.1016/S0735-1097(00)01054-8 [R]                                                 |
| [R] Jones AM, Vanhatalo A 2017, _Sports Med_ 47(S1):65–78; Poole DC et al. 2016, _MSSE_ 48(11):2320–34; Jones AM et al. 2019, _Physiol Rep_ 7:e14098                                      | reviews            | 2016–19                                           | Critical speed as the boundary between the heavy and severe domains; maximal metabolic steady state                                                                                              | —                                                                                                                 | doi:10.1007/s40279-017-0688-0 [R]                                                     |
| [R] Galbraith A et al. A 1-year study of endurance runners, _IJSPP_ 9(6):1019–25                                                                                                          | cohort             | 2014                                              | A field test for critical speed and how it changes over a year                                                                                                                                   | Trained runners                                                                                                   | doi:10.1123/ijspp.2013-0508 [R]                                                       |
| [R] Hottenrott K et al. Run/walk strategy in recreational marathon runners, _J Sci Med Sport_ 19(1):64–8                                                                                  | RCT                | 2016                                              | Run-walk gave similar finish times with less muscle pain and fatigue                                                                                                                             | n = 42                                                                                                            | doi:10.1016/j.jsams.2014.12.004 [R]                                                   |
| **FEMALE, MASTERS, RECOVERY SIGNALS, MODELLING**                                                                                                                                          |                    |                                                   |                                                                                                                                                                                                  |                                                                                                                   |                                                                                       |
| [R] McNulty KL et al. Menstrual cycle phase and performance, _Sports Med_ 50(10):1813–27                                                                                                  | meta-analysis      | 2020                                              | On average the effects are trivial, so phase-based plans should not be a default                                                                                                                 | Low-quality studies                                                                                               | doi:10.1007/s40279-020-01319-3 [R]                                                    |
| [R] Mountjoy M et al. IOC consensus on REDs (relative energy deficiency in sport), _Br J Sports Med_ 57(17):1073–97                                                                       | consensus          | 2023                                              | Screening for and referral of low energy availability; relevant because Tropos also runs a nutrition engine                                                                                      | Consensus                                                                                                         | doi:10.1136/bjsports-2023-106994 [R]                                                  |
| [R] Tanaka H, Seals DR. Endurance performance in masters athletes, _J Physiol_ 586(1):55–63                                                                                               | review             | 2008                                              | Age-related decline in endurance performance                                                                                                                                                     | —                                                                                                                 | doi:10.1113/jphysiol.2007.141879 [R]                                                  |
| [R] Goom T, Donnelly G, Brockwell E. Returning to running postnatal (guideline)                                                                                                           | expert guideline   | 2019                                              | A conservative return no earlier than about 12 weeks after birth, with screening; the product must defer to clinicians                                                                           | Expert consensus                                                                                                  | guideline PDF (no DOI)                                                                |
| [R] Vesterinen V et al. 2016, _MSSE_ 48(7):1347–54; Kiviniemi AM et al. 2007, _Eur J Appl Physiol_ 101:743–51                                                                             | RCTs               | 2007/2016                                         | Training guided by heart-rate variability gives modest benefits; no readiness score follows from it                                                                                              | Small samples                                                                                                     | doi:10.1249/MSS.0000000000000910 [R]                                                  |
| [R] Banister EW et al. 1975, _Aust J Sports Med_ 7:57–61; Morton RH, Fitz-Clarke JR, Banister EW 1990, _J Appl Physiol_ 69(3):1171–7                                                      | model              | 1975/1990                                         | The fitness–fatigue impulse-response model                                                                                                                                                       | Fitted to few subjects                                                                                            | doi:10.1152/jappl.1990.69.3.1171 [R]                                                  |
| [R] Busso T. Variable dose-response, _MSSE_ 35(7):1188–95                                                                                                                                 | model              | 2003                                              | The fatigue gain rises with load (a nonlinear model)                                                                                                                                             | Small sample                                                                                                      | doi:10.1249/01.MSS.0000074465.13621.37 [R]                                            |
| [R] Hellard P et al. Limitations of the Banister model, _J Sports Sci_ 24(5):509–20                                                                                                       | methods            | 2006                                              | Parameters are unstable and predictions poor, so treat the model as descriptive                                                                                                                  | Swimmers                                                                                                          | doi:10.1080/02640410500244697 [R]                                                     |
| [R] Clarke DC, Skiba PF. Teaching the modelling of training, _Adv Physiol Educ_ 37(2):134–52                                                                                              | tutorial           | 2013                                              | Equations and typical parameter values                                                                                                                                                           | —                                                                                                                 | doi:10.1152/advan.00078.2011 [R]                                                      |

---

## 2. Findings that should drive decisions

Each finding has a grade and a product consequence. Section numbers point to the
detail.

1. **Keep most running genuinely easy. The evidence supports the principle much
   better than any exact percentage split.** Elites run at least 80% of their
   volume at low intensity (Seiler 2010 [V]; Haugen 2022 [V]). Trials that
   compare distributions find small differences: polarized training has a small
   edge on VO2peak (SMD 0.24) and no edge on time trials (Oliveira 2024 [V]).
   In recreational runners, polarized and threshold-heavy plans improved about
   equally, by 3–5% over 8–10 weeks (Muñoz 2014; Festa 2020 [V]).
   **MODERATE.** Product: protect easy days and explain them. Show the
   intensity distribution as information. Do not enforce 80/20. (§4.1–4.2)
2. **The best-supported injury signal is a single run that is much longer than
   anything run recently, not the weekly percentage increase.** In 5,205 runners
   followed for 18 months, any run more than 10% longer than the longest run in
   the previous 30 days raised the injury rate, with an HRR of about 1.5–2.3
   depending on spike size. Week-to-week change was not associated, and ACWR
   spikes even looked protective (Frandsen 2025 [V]). The only RCT of the 10%
   rule found no effect (Buist 2008 [V]). **MODERATE** (one large cohort and
   one RCT). Product: replace any weekly-percentage cap with a
   "longest run in the last 30 days" guard. Keep it advisory, and label it a
   Tropos heuristic built on an observational finding. (§4.3, §6.3)
3. **Base injury rates for the simulation.** Novices sustain about 17.8
   injuries per 1000 h of running and recreational runners about 7.7
   (Videbæk 2015 [V]). Programme-level proportions: 10.9% over a 6-week novice
   programme, about 20% over 8–13 weeks, about 17% over a 14-week
   half-marathon plan, about 37% over 4–5 months among event entrants, and 35%
   over 18 months among watch users (all [V]). **MODERATE.** (§6.3)
   Prevention programmes are not proven either: online prevention advice
   (Fokkema 2019 [V]) and a short self-directed strength routine
   (Toresdahl 2020 [V]) did not reduce injuries. Strength training should not
   be sold as injury protection. **MODERATE** for the null result.
4. **Taper for 2–3 weeks: cut volume about 40–60% and keep intensity and run
   frequency** (Bosquet 2007 [V]; Wang 2023 in the repo). In more than 158,000
   recreational marathoners, a strict 3-week taper was associated with a 2.6%
   (about 5.5 minutes) faster finish than a minimal taper (Smyth & Lawlor
   2021 [V]). **STRONG** for the pooled effect; **MODERATE** for the recreational
   marathon size. (§4.5)
5. **Marathon results track volume and long-run exposure, and simple
   predictors are too optimistic at the marathon.** More weekly volume, more
   runs of 32 km or longer and a longer longest run are all associated with
   faster marathons (Doherty 2020 [V], compared across cohorts). Riegel and
   VDOT predictions from short races were at least 10 minutes too fast for half
   of recreational marathoners (Vickers & Vertosick 2016 [V]). Across 114
   published equations there is no single best (Keogh 2019 [V]). **MODERATE.**
   Product: show marathon predictions as a range with a mileage-aware
   correction, never as a promise. (§4.4, §4.15)
6. **Heavy strength training two or more times a week for 8–12 weeks or longer
   improves running economy (about 2–8%) and time trials (small effect)**
   (Blagrove 2018; Eihara 2022; Llanos-Lagos 2024 [V]). Heavy loads beat
   plyometrics. **MODERATE.** Product: present strength as a useful,
   evidence-backed addition, not mandatory and not a guarantee against
   injury. (§4.9)
7. **Interference between lifting and running is real but selective.** Overall,
   hypertrophy and maximal strength are not compromised (Schumann 2022 [V]).
   Explosive strength is blunted, especially when lifting and running share a
   session. Lower-body strength gains are blunted in trained men
   (Petré 2021; Huiberts 2024 [V]). Muscle-fibre growth suffers slightly, more
   with running than cycling (Lundberg 2022 [V]). Endurance gains are not harmed
   in trained people (Huiberts 2024 [V]). Interference grows with how often and
   how long the endurance sessions are (Wilson 2012 [V]). **MODERATE.**
   Product: the lifting plan should expect slower lower-body progress during
   high-volume running phases. Upper-body progress is largely unaffected.
   (§4.10)
8. **Leave at least 6 hours between a hard lift and a hard run; 24 hours is
   better.** Order by priority: strength first when strength matters most, run
   first when the run matters most (Robineau 2016; Murlasits 2018 [V]).
   Lower-body lifting impairs running economy for 6–24 hours (Doma &
   Deakin [V titles, details R]). **WEAK–MODERATE.** The coaching default of
   heavy legs on hard-run days and never the day before a long run is
   **CONVENTION** consistent with this evidence. (§4.10, §7)
9. **Fitness can be maintained on a small dose.** Strength holds for months on
   about 1 session a week with 1–3 heavy sets. Endurance holds when intensity is
   kept and volume is cut by a third to two thirds (Spiering 2021; Bickel 2011;
   Rønnestad 2010 [R]; Hickson 1985 [V2]). **MODERATE**, but the studies are on
   non-runners. Product: in a marathon block, the lifting plan should switch to
   maintenance rather than stop. (§4.11)
10. **Detraining is fast.** Trained athletes lose 4–14% of VO2max within
    4 weeks off. Recently gained fitness is gone after more than 4 weeks
    (Mujika & Padilla 2000 [V]). VO2max falls about 7% by 2–3 weeks and about
    15–16% by 8–12 weeks (Coyle 1984 [V2]). **MODERATE.** Product: this supports
    Run15's re-entry restraint and gives detraining rates for the simulation.
    (§4.6, §6.4)
11. **Strides and hill sprints cost little and every major coach recommends
    them, but no trial isolates strides.** Short maximal running, uphill
    intervals and speed-endurance work have indirect support for running
    economy (Barnes 2013; Skovgaard 2018 [V]). **WEAK / CONVENTION.** Product:
    reasonable low-cost defaults, explained honestly. (§4.7, §5.11–5.12)
12. **Every session needs an effort fallback that works without a device.** The
    talk test tracks the first ventilatory threshold [R]. Age-based HRmax
    formulas are off by about ±10 bpm for an individual (Tanaka 2001 [R]).
    **MODERATE.** Product: pair every pace target with a talk-test and RPE
    cue, and use heart-rate zones only from a measured or field-tested
    maximum. (§4.13)
13. **Couch to 5K ends at 30 minutes of continuous running.** For typical
    novices (VDOT 20–30) that is about 2.8–3.8 km at easy pace [C], not 5 km.
    Product: honest expectation copy ("30 minutes non-stop"), or a 10–12-week
    route for runners who need to cover the distance. (§5.18, §6.5)
14. **Two of the requested personas need honest odds rather than promises.**
    A runner with a 50:00 10K (VDOT 40.0) who trains for a year has a likely
    first marathon of about 3:45–3:50 (central), with an 80% range of about
    3:35–4:10 [C, WEAK]. Going from 3:45 to
    sub-3:30 in 16 weeks needs about +3.6 VDOT (≈7%), which is above typical
    16-week gains of about 3–6%. It is plausible mainly when the 3:45 was run
    below the runner's actual fitness. **WEAK** (model-based). (§6.5)

---

## 3. Books and coaching systems: what each contributes, and its limit

| System                                                     | What Tropos can take from it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Limit                                                                                                                                                                                                                                                   | Grade                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Daniels, _Running Formula_ 4th ed.** [V]                 | The cleanest **intensity vocabulary**: E (easy/long; 59–74% VO2max, 65–79% HRmax [V]); M (marathon pace); T ("comfortably hard", 88–92% HRmax, about the pace you could race for an hour, as a 20-minute tempo or as cruise intervals [V]); I (95–100% VO2max, 98–100% HRmax, 3–5-minute repeats [V]); R (about mile race pace, short repeats with full recovery [R]). **Per-session caps:** I no more than about 8% of weekly volume [V], or 10 km [R]; R no more than the lesser of 5% of weekly volume or 5 miles (8 km) [V]; T no more than about 10% of weekly volume [R]; long run no more than the lesser of 25–30% of weekly volume or 150 minutes [R]. VDOT ties all paces to one current-fitness number. Tropos already uses VDOT in `runPaces.ts`. | The VDOT tables come from the Daniels–Gilbert equations, which assume trained-runner economy, so they are optimistic at the marathon for low-mileage runners (Vickers 2016 [V]). The caps are expert rules.                                             | Paces [C] reproduce the published tables (Appendix A); the caps are **CONVENTION** |
| **Hansons Marathon Method** [V]                            | Three "SOS" (something of substance) sessions: speed (5K–10K pace), "strength" (about 10 s/mile faster than goal marathon pace [R]) and goal-pace tempo. **Cumulative fatigue**: no single huge day, steady moderate fatigue all week. The long run is capped at 16 miles (about 3 hours or less), a time-based alternative to the "you must run 20 miles" convention.                                                                                                                                                                                                                                                                                                                                                                                        | Assumes about 6 running days a week. The 16-mile cap is not tested against 20-milers, and Doherty 2020's correlation (more runs of 32 km or longer go with faster times) points the other way, though that evidence compares cohorts and is confounded. | **CONVENTION**                                                                     |
| **Fitzgerald, _80/20 Running_** [V]                        | Easy means below VT1, the point where you can still talk comfortably. Moderate and hard come from 20% of the time. Strong user-facing language for "slow down".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | The 80/20 number describes elites. Trials in recreational runners show no clear advantage over other splits (§4.2).                                                                                                                                     | Principle **MODERATE**; split **CONVENTION**                                       |
| **Hudson & Fitzgerald, _Run Faster_** [V]                  | **Hill sprints** (about 8–10 s, near-maximal, full recovery) all year as low-cost strength and power work. **Adaptive running**: change the plan in response to the athlete. Gradual progression of race-specific work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Coach-authored.                                                                                                                                                                                                                                         | **WEAK / CONVENTION**                                                              |
| **Higdon Novice 1** [V2]                                   | The reference beginner marathon plan: 18 weeks, 4 runs a week plus 1 cross-training day, no speedwork, peak long run of one 20-miler. Useful as a ceiling on complexity for first-timers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Distance only; no individual dose; the 20-mile peak is long in time for slow runners (about 3.5–4 hours or more).                                                                                                                                       | **CONVENTION**                                                                     |
| **Galloway run-walk-run** [V2]                             | Run:walk ratios matched to pace, taken from the start rather than once exhausted (for example 3:1 minutes at about 10 min/mile, 2:1 at about 12, 1:1 at about 13, 30 s:30 s at about 14). A "Magic Mile" field test. It makes walking a legitimate method.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | The specific ratios and claimed time savings come from the author. One small RCT supports similar marathon times with less discomfort (Hottenrott 2016 [R]).                                                                                            | **WEAK**                                                                           |
| **NHS Couch to 5K** [V2]                                   | Proven public-health structure: 9 weeks of 3 sessions, at least one rest day between, run-walk progression starting at 60 s run / 90 s walk for 20 minutes after a 5-minute walking warm-up. The talk test is used as the effort cue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Ends at 30 minutes of continuous running, which is often well short of 5 km [C]. Progression is fixed and does not adapt to the runner.                                                                                                                 | **CONVENTION** (a widely used programme, not an RCT-optimised one)                 |
| **Lydiard** [V2]                                           | The **order of phases**: aerobic base, then hills (about 4–6 weeks), then a short anaerobic phase (about 4 weeks or less), then coordination and sharpening with races, then taper. The template for "general before specific".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Built for elite and club runners on high volume. Many details are historical.                                                                                                                                                                           | **CONVENTION**                                                                     |
| **Canova** [V2]                                            | The **funnel**: training speeds converge on race pace from both sides as the race nears (for example 90–110% of marathon pace narrowing to 95–105%), and the amount done at race-adjacent speeds grows. "Special blocks" put two demanding sessions in one day, every 3–4 weeks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Elite marathoners only. **Special blocks are not a recreational default.**                                                                                                                                                                              | **CONVENTION**                                                                     |
| **Vigil, _Road to the Top_** [V]                           | Patient, years-long aerobic development and a systematic approach to development.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Collegiate and elite; out of print.                                                                                                                                                                                                                     | **CONVENTION**                                                                     |
| **Seiler** (research-practitioner) [V]                     | The 3-zone model (below VT1 / between thresholds / above VT2). The descriptive "about 80% easy" pattern. The finding that adding HIIT for well-trained athletes lacks long-term evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Mostly elite and well-trained populations.                                                                                                                                                                                                              | **MODERATE** (descriptive)                                                         |
| **Norwegian double threshold** (Bakken; Ingebrigtsens) [V] | Threshold work split into intervals at controlled lactate (about 2–3, up to 4.5 mmol/L) so more of it fits into a week. Two threshold sessions in one day, about twice a week, plus one hill or VO2 session, on a large easy base (Casado 2023 [V]; Tjelta 2019 [V]). The transferable lesson for consumers is **"sub-threshold intervals are a sustainable way to accumulate threshold work"**, which supports cruise intervals as the default threshold format.                                                                                                                                                                                                                                                                                             | Elite, guided by lactate meters, 140–160 km a week or more. **Double threshold days are not a recreational default.**                                                                                                                                   | Idea **WEAK**; recreational transfer **CONVENTION**                                |
| **Roche** [R]                                              | Frequent **strides and hill strides** (about 20–30 s, fast but relaxed, full recovery) after easy runs, as low-cost economy and form work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Coach opinion.                                                                                                                                                                                                                                          | **CONVENTION**                                                                     |
| **Noakes, _Lore of Running_** [R]                          | Durable training "laws": train gently and consistently, alternate hard and easy, build distance before speed, rest before racing, keep a log, and do not race in training.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 2003; parts of its physiology are contested.                                                                                                                                                                                                            | **CONVENTION**                                                                     |
| **Johnston & House, _Uphill Athlete_** [R]                 | Aerobic base building, an aerobic-threshold check from heart-rate drift on a steady run, muscular-endurance strength work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Written for mountain and ultra athletes; "aerobic deficiency syndrome" is not validated.                                                                                                                                                                | **WEAK / CONVENTION**                                                              |
| **McMillan calculator** [R]                                | A benchmark to compare Tropos predictions and zones against.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Proprietary and unvalidated.                                                                                                                                                                                                                            | —                                                                                  |
| **Newer books (2022–2026)**                                | Not found. The search budget ran out before a dedicated sweep. The newest major texts in scope are new editions (Daniels 4th, 2021; Advanced Marathoning 3rd, 2020, already in the repo). The 2022–2026 primary research (Frandsen 2025, Oliveira 2024, Llanos-Lagos 2024, Huiberts 2024, Storoschuk 2025) changes decisions more than any recent book is likely to.                                                                                                                                                                                                                                                                                                                                                                                          | **Open gap**: see §9.                                                                                                                                                                                                                                   | —                                                                                  |

**How the systems agree.** They agree on more than they disagree.
(a) Most volume should be easy. (b) Have 1–3 key sessions a week, separated by
easier days. (c) Build general fitness before race-specific work.
(d) Reach the peak long run gradually. (e) Taper before the goal race.
(f) Build speed in small, low-fatigue doses (strides, hill sprints, short
reps).

**Where they disagree.** The peak long run (Hansons 16 miles vs Higdon and
Pfitzinger 20 miles or more), how much threshold work is right (Norwegian and
Hansons more; 80/20 less) and whether moderate "steady" running has a place
(pyramidal elites yes; strict polarized no). Evidence does not settle any of
these, so they should be **user-visible parameters with a sensible default**,
not hidden truths.

---

## 4. Research by topic

### 4.1 Intensity distribution

- Elite runners do at least 80% of their volume at low intensity
  (Haugen 2022 [V]; Seiler 2010 [V]). In preparation phases they train
  **pyramidally** (most in zone 1, then zone 2, least in zone 3) and shift
  toward **polarized** near competition (Casado 2022 [V]). Race-pace volume
  rises as the competition approaches (Haugen 2022 [V]). **MODERATE**
  (descriptive).
- Intervention evidence in trained athletes slightly favours polarized
  training for VO2peak (Stöggl & Sperlich 2014 [V]: +11.7% in 9 weeks;
  Oliveira 2024 [V]: SMD 0.24). It does not consistently favour it for
  time-trial performance (Oliveira 2024 [V]: equivalent; Rosenblat 2019 [V]:
  ES −0.66 from few studies; Rosenblat 2025 in the repo emphasises moderation
  at the athlete level). **MODERATE: no universal winner.**
- Sequencing may matter more than the distribution itself: pyramidal then
  polarized produced the best 16-week result in well-trained runners
  (Filipas 2022 [V]). **WEAK** (one trial).
- "Zone 2" marketing: a 2025 narrative review found no evidence that zone 2 is
  uniquely effective for mitochondrial capacity or VO2max in the general
  population (Storoschuk 2025 [R]). **MODERATE** (review).

**Where evidence runs out.** No trial tests intensity distribution in true
beginners (VDOT 25–35) over months. In that group, the dominant driver of
improvement is almost certainly consistency and total volume (Doherty 2020 [V]
and Tanda 2011 [V] support this in marathoners; it is extrapolated to
beginners).

### 4.2 Recreational-runner trials

| Trial                 | Who                                               | Duration | Arms                            | Result                                                                          |
| --------------------- | ------------------------------------------------- | -------- | ------------------------------- | ------------------------------------------------------------------------------- |
| Muñoz 2014 [V]        | 30 club runners (10K about 39 min, VDOT ≈ 53 [C]) | 10 weeks | Polarized vs between-thresholds | 10K −5.0% vs −3.6% (not significant); compliant runners did better on polarized |
| Festa 2020 [V]        | 38 recreational                                   | 8 weeks  | 77/3/20 vs 40/50/10             | Both +3.0–3.5% on 2 km speed; no difference                                     |
| Esteve-Lanao 2007 [V] | 12 sub-elite                                      | 5 months | 80/12/8 vs 67/25/8              | Zone-1-heavy improved more (−157 s vs −121 s)                                   |
| Filipas 2022 [V]      | 60 well-trained men                               | 16 weeks | 4 periodisations                | Pyramidal then polarized best (about −1.5% on 5 km)                             |

**Takeaway.** Trained recreational runners improve about 3–5% in 8–10 weeks of
structured training under either distribution. **MODERATE.** The extra effect
of distribution is small next to the effect of training consistently.

### 4.3 Volume progression and injury

- **The 10% rule:** in an RCT of 532 novices, a graded 13-week programme gave
  the same injury rate as an 8-week one (20.8% vs 20.3%; Buist 2008 [V]).
  **MODERATE** evidence against it as a protective rule.
- **Big weekly jumps:** in novices, more than 30% over 2 weeks compared with
  less than 10% gave HR 1.59 (0.96–2.66) for "distance-related" injuries such
  as patellofemoral pain, ITB syndrome and medial tibial stress syndrome
  (Nielsen 2014 [V]). **WEAK–MODERATE** (the confidence interval crosses 1).
- **Single-session spikes** (Frandsen 2025 [V]: 5,205 runners in 87 countries,
  588,071 sessions, 35% injured, mean age 45.8, 22% female). The injury rate
  rose when one run was more than 10% longer than the longest run in the
  previous 30 days:
  - 10–30% longer: HRR about 1.64
  - 30–100% longer: HRR about 1.52
  - more than 100% longer: HRR about 2.28
    These figures come from secondary summaries and the confidence intervals were
    not seen. Week-to-week change was not associated, and ACWR spikes were
    associated with **lower** risk. **MODERATE**: one large prospective cohort,
    with injuries self-reported and confounding possible.
- **ACWR:** there are conceptual and mathematical problems, including a random
  chronic load predicting as well as the real one (Impellizzeri 2020 [V]).
  **Do not encode it as a predictor.** `trainingLoad.ts` already labels its
  ramp line a Tropos heuristic; keep it advisory or retire it (§8).
- **Base incidence:** novices 17.8 and recreational runners 7.7 injuries per
  1000 h (Videbæk 2015 [V]). Previous injury is the most consistent risk
  factor (Hulme 2017 [R]). **MODERATE.**
- **Prevention programmes:** online multifactorial advice had no effect
  (Fokkema 2019 [V]), and a 10-minute self-directed strength routine had no
  effect on injury-related marathon non-completion (Toresdahl 2020 [V]).
  Strength training reduces injuries in sport generally (Lauersen 2014 [R]),
  but running-specific trial evidence is null or absent. **MODERATE** for "not
  proven in runners".

**Product rule this supports (advisory, labelled a heuristic).** Flag any
planned run whose distance or duration is more than 10% above the longest run
completed in the previous 30 days. Progress the long run by **time** with that
bound. Treat weekly percentage changes as context, not a limit.

### 4.4 Long runs, volume and marathon outcome

- Across 137 cohorts, weekly distance, runs per week, the biggest week, the
  number of runs of 32 km or more, the longest run, training pace and weekly
  hours were each associated with faster marathon times (R² 0.38–0.81;
  Doherty 2020 [V]). **MODERATE association** that compares cohorts, so it is
  confounded: faster runners also train more.
- An individual-level regression (Tanda 2011 [V]) predicts marathon pace from
  weekly km K and mean training pace P over the final 8 weeks:
  Pm = 17.1 + 140·exp(−0.0053·K) + 0.55·P (s/km), with SEE about 4 minutes.
  It fits 2:47–3:36 runners. **WEAK–MODERATE.** Useful for the simulation's
  "what volume buys" curve (Appendix A).
- Large app-data studies: marathons are run at about 85% of critical speed on
  average (93% for 2:30 runners, 79% for 6-hour runners). Running the first
  half above about 94% of CS predicts a collapse of more than 25% in the
  second half (Smyth & Muniz-Pumares 2020 [V]). **MODERATE** (observational).
  Product: a pacing guard for race day.
- Men slow more than women in the second half of marathons (Deaner 2015 [R]).

### 4.5 Taper

- Pooled across sports: about 2 weeks, volume reduced 41–60% (exponentially
  shaped), intensity and frequency maintained (Bosquet 2007 [V]). **STRONG.**
- Recreational marathoners: tapers up to 3 weeks long and strict were
  associated with faster finishes (a median 2.6% for a strict 3-week taper vs a
  minimal one; Smyth & Lawlor 2021 [V]). **MODERATE.**
- Elites taper for 7–10 days (Haugen 2022 [V]). Recreational marathoners appear
  to benefit from longer tapers. One explanation, untested and offered here only
  as a hypothesis, is that their accumulated marathon-block fatigue takes
  longer to clear relative to their fitness.
- The Banister model gives the same answer from a different direction: with
  common parameters, a session's net benefit peaks about 2–4 weeks later [C]
  (§6.2).

### 4.6 Detraining and return

- In trained athletes, less than 4 weeks off costs 4–14% of VO2max. In recently
  trained people, the recent gains are completely lost after more than 4 weeks
  (Mujika & Padilla 2000 [V]). VO2max falls about 7% by about 2–3 weeks and
  about 15–16% by 8–12 weeks, then stabilises (Coyle 1984 [V2]). **MODERATE.**
- Reduced training can **maintain** VO2max for about 15 weeks if intensity is
  kept and frequency or duration is cut by a third to two thirds. Cutting
  intensity loses the gains (Hickson 1985 [V2]). **MODERATE.** Product: a
  "maintenance week" during travel or illness recovery keeps short hard efforts
  and drops volume. Never stack missed quality work (that rule is already in
  the handoff).
- **Where evidence runs out:** there is no trial-based return-to-run ramp after
  a layoff. Coaches typically take roughly as many weeks to rebuild as were
  missed, starting at 50–70% of the previous volume with no quality work for
  1–2 weeks. That is **CONVENTION**, and consistent with Run15.

### 4.7 Strides, sprints and neuromuscular work

- **No trial isolates strides.** The indirect evidence is: near-maximal
  speed-endurance work (5–10 × 30 s) with 36% less volume improved running
  economy in trained runners (Skovgaard 2018 [V]); short near-maximal bursts
  improved 5 km in moderately trained runners (10-20-30; Gunnarsson & Bangsbo
  2012 [R]); weighted-vest strides had acute economy effects (Barnes 2015 [R]);
  and high-intensity uphill work gave the largest neuromuscular and economy
  gains (Barnes 2013 [V]). **WEAK** (indirect) for strides; **MODERATE** for
  sprint-type work improving economy in trained runners.
- Why coaches use strides anyway: they cost almost nothing, practise fast and
  relaxed mechanics, and prepare the legs for workouts and races
  (**CONVENTION**: Daniels, Pfitzinger, Roche, Hudson).

### 4.8 Hills

- Six weeks of uphill intervals at any intensity improved a 5 km time trial by
  about 2%. The highest intensity was best for economy (+2.4%) and for
  neuromuscular measures (Barnes 2013 [V]). Incline intervals (10%, 30 s) and
  level intervals improved economy equally, and level intervals did more for
  run-to-exhaustion at vVO2max (Ferley 2013 [V]). **MODERATE**: hills are a
  valid, lower-impact form of hard work but not a magic one.
- Lydiard placed a 4–6-week hill phase between base and speed (Lydiard [V2]).
  **CONVENTION.**

### 4.9 Strength training for runners

- Running economy improves about 2–8% in most trials (Blagrove 2018 [V]).
- Heavy loads (≥90% of 1RM) improve economy (g −0.32) and time trials (g −0.24)
  more than plyometrics do (−0.13 and −0.17; Eihara 2022 [V]).
- High-load and combined methods improve economy across a wide range of speeds
  (8.6–17.9 km/h). Plyometrics help only at slower speeds (≤12 km/h)
  (Llanos-Lagos 2024a, in the repo [V]).
- High-load training improves time trials and time to exhaustion. Combining two
  or more methods may give more. The effect on VO2max is trivial
  (Llanos-Lagos 2024b [V]).
- A 40-week programme improved economy in competitive runners (Beattie 2017 [R]).
  Explosive training improved 5 km time (Paavolainen 1999 [R]).
- Typical effective dose in trials: 2–3 sessions a week for 6–24 weeks, heavy
  multi-joint lower-body lifts (squat, deadlift and variants, step-ups, calf
  raises), often with plyometrics (Llanos-Lagos 2024a [V]: 1–4 sessions a week,
  6–24 weeks). **MODERATE.**
- **Limits.** Almost all trials are in trained runners. Effects on recreational
  marathon time are inferred, not measured. The injury-prevention evidence in
  runners is null or absent (§4.3).

### 4.10 Concurrent-training interference (lifting plus running)

| Question                                           | Answer                                                                                 | Source                                      | Grade                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------- |
| Does running hurt hypertrophy or maximal strength? | Not overall                                                                            | Schumann 2022 [V]                           | MODERATE                      |
| Muscle-fibre hypertrophy?                          | Small negative effect, possibly larger with running than cycling                       | Lundberg 2022 [V]                           | WEAK–MODERATE                 |
| Explosive strength and power?                      | Blunted, especially when lifting and running share a session (vs ≥3 h apart)           | Schumann 2022 [V]; Wilson 2012 [V]          | MODERATE                      |
| Lower-body maximal strength in trained lifters?    | Blunted in trained people, not in untrained or moderately trained                      | Petré 2021 [V]                              | MODERATE                      |
| Sex?                                               | Lower-body strength blunted in men (−0.43) but not women                               | Huiberts 2024 [V]                           | MODERATE                      |
| Does lifting hurt endurance gains?                 | Not in trained people; VO2max gains are impaired in untrained people                   | Huiberts 2024 [V]                           | MODERATE                      |
| What drives interference?                          | How often and how long the endurance sessions are; running more than cycling           | Wilson 2012 [V]                             | MODERATE                      |
| Order within one session?                          | Strength first gives better lower-body strength; aerobic gains are unaffected by order | Murlasits 2018 [V]; Eddens 2018 [R]         | MODERATE                      |
| Gap between sessions?                              | 0 h worst; ≥6 h acceptable; 24 h best for VO2peak and some strength measures           | Robineau 2016 [V]                           | WEAK (one RCT, rugby players) |
| Does a leg session hurt the next run?              | Running economy and time to exhaustion are impaired 6 h later and the next day         | Doma & Deakin 2013–14 [V titles; R details] | WEAK                          |

### 4.11 Minimum dose to keep strength (and running fitness)

- Strength and muscle size held for up to 32 weeks on one ninth of the original
  dose in young adults (1 session a week, 1 set per exercise). Older adults
  needed about a third of the dose to keep muscle size (Bickel 2011 [R]).
- A narrative synthesis: strength is maintained with about 1 session a week of
  1 or more heavy sets per exercise, and endurance is maintained by keeping
  intensity while cutting frequency to as little as 2 sessions a week or volume
  by 33–66% (Spiering 2021 [R]; Hickson 1985 [V2]).
- One heavy session a week in season kept preseason strength gains in cyclists
  (Rønnestad 2010 [R]).
- **MODERATE**, but none of these populations were runners in a marathon block.
  Product: "Maintain" is a real lifting mode during marathon-specific phases,
  typically 1–2 sessions a week of heavy, low-volume work done short of
  failure.

### 4.12 Heat, hills, terrain and treadmill

- **Heat:** marathon times worsen steadily as temperature rises above about
  4–10 °C, and slower runners lose more (El Helou 2012; Ely 2007 [R]).
  Acclimatisation takes about 1–2 weeks (Racinais 2015 [R]). **MODERATE.**
  Product: on hot days, convert pace targets to effort, heart-rate or talk-test
  bands and show a one-line reason (roadmap B2). Do not mark a hot-day run as a
  "miss".
- **Hills:** the energy cost of running changes predictably with gradient
  (Minetti 2002 [R]), which is the basis of grade-adjusted pace. Product: run
  hills by effort, and judge hilly runs by grade-adjusted pace or effort, not
  raw pace.
- **Treadmill:** a 1% incline approximates the energy cost of running outdoors
  (Jones & Doust 1996 [R]).

### 4.13 Anchoring easy pace: heart rate, RPE and the talk test

- **Talk test:** being able to speak comfortably tracks VT1. The point where
  speech becomes "equivocal" sits near the ventilatory threshold (Persinger
  2004; Foster 2008; Reed & Pipe 2014 [R]). **MODERATE.** It is the best
  device-free easy-pace check; NHS Couch to 5K uses it.
- **Session RPE** (CR10 rating × minutes) is a validated, device-free load
  measure (Foster 2001 [R]). **MODERATE.**
- **Heart rate:** use a **measured or field-tested HRmax** or lactate-threshold
  heart rate. Age formulas err by about ±10 bpm for an individual (Tanaka
  2001 [R]). Heart rate lags on short repeats and drifts upward in heat and on
  long runs, so it is a poor target for strides, repetitions and hill sprints.
  **MODERATE.**
- Reference bands (Olympiatoppen 5-zone, Seiler & Tønnessen 2009 [R]): I1
  60–72% HRmax; I2 72–82%; I3 82–87%; I4 87–92%; I5 92–97%. Daniels' bands: E
  65–79%, T 88–92%, I 98–100% [V]; M 80–90% [R].

### 4.14 Critical speed

- Critical speed (CS) is the fastest speed with a metabolic steady state, the
  boundary between the heavy and severe intensity domains (Jones & Vanhatalo
  2017; Poole 2016; Jones 2019 [R]). In race terms it is roughly the speed a
  runner can hold for about 20–40 minutes. That is near 10K pace for
  well-trained runners, and between 5K and 10K pace for slower runners whose
  10K takes more than about 45 minutes. Threshold work sits just below it. The
  concept is **MODERATE**; the race-pace mapping is an approximation [R].
- CS can be estimated from the best efforts in a runner's own training log
  (fastest 400–5000 m) without a dedicated test, and it predicts marathon
  performance with about 8% error (Smyth & Muniz-Pumares 2020 [V]). **MODERATE.**
  Product: a passive fitness estimate that fits behind RUN-EV-08's consent gate.

### 4.15 Race-time prediction and its error

- Riegel's formula T2 = T1·(D2/D1)^1.06 [V] and VDOT agree closely. Both
  convert a 50:00 10K into about 3:50 for the marathon [C].
- For recreational runners, Riegel holds up to the half marathon but
  **underestimates marathon time**, by 10 minutes or more for half of
  runners. Models that use two races plus weekly mileage do better
  (Vickers & Vertosick 2016 [V]). **MODERATE.**
- There is no single best equation; reported errors range from 0.27 to 27.4
  minutes (Keogh 2019 [V]). Models built from device data can reach about 2%
  error (Emig & Peltonen 2020 [V]).
- Product: show a **range**, widen it when weekly volume is low or the longest
  recent run is short, and explain why.

### 4.16 Run-walk for beginners

- Couch to 5K's run-walk structure works well as a public-health on-ramp
  (CONVENTION; widely used). In recreational marathoners, a run-walk strategy
  gave similar finish times with less muscle pain and fatigue (Hottenrott
  2016 [R]). Claims that run-walk prevents injury are unproven. **WEAK.**
- Product: run-walk should be first-class. It is not a fallback or a failure
  state.

### 4.17 Female and masters runners (only where evidence is reasonably strong)

- **Menstrual cycle:** on average, the effects on performance are trivial
  (McNulty 2020 [R]). **Do not default to cycle-phase programming**; let users
  log symptoms and choose. **MODERATE.**
- **Low energy availability / REDs:** an IOC consensus [R]. Tropos also runs a
  nutrition engine, so it should avoid aggressive calorie deficits during big
  running blocks and use "worth discussing with a clinician" copy for missed
  periods or repeated bone-stress injuries, never a diagnosis.
  **MODERATE–STRONG** (consensus).
- **Pregnancy and postpartum:** defer to clinicians. Postnatal guidance is a
  conservative return no earlier than about 12 weeks after birth, with
  screening (Goom 2019 [R], expert consensus). This is already a "stop
  automated progression" state in the handoff.
- **Pacing:** women pace marathons more evenly than men (Deaner 2015 [R]).
- **Concurrent training:** lower-body strength interference appears in men but
  not women (Huiberts 2024 [V]).
- **Masters:** endurance performance declines slowly into the 50s and faster
  after about 60–70 (Tanaka & Seals 2008 [R]). Relative trainability is
  broadly preserved. Keeping strength training matters more with age.
  Recovery may take longer, but the evidence is mixed. Product: age-graded
  comparisons are fine; age-based caps on intensity are not.

---

## 5. Session dictionary

This section is the basis for (a) plan generation and (b) the plain-English
explainers the owner asked for: "it says easy, hard, strides … and it's not
explanatory what this actually is".

### 5.0 Shared anchors

**Effort scale (1–10).** An adaptation of Borg's CR10 in the form running
coaches use. It is **CONVENTION**, offered as a consistent in-app scale.

| RPE | Feel                                | Typical sessions                                                                 |
| --- | ----------------------------------- | -------------------------------------------------------------------------------- |
| 1–2 | Very easy; could do it all day      | Recovery, shakeout, walk breaks                                                  |
| 3–4 | Easy; relaxed breathing             | Easy, long, medium-long, run-walk running segments                               |
| 5   | Steady; brisk but controlled        | Steady, the early part of a progression run                                      |
| 6   | Marathon to half-marathon effort    | Marathon-pace work                                                               |
| 7   | "Comfortably hard"; focused         | Tempo, cruise intervals                                                          |
| 8   | Hard; 10K–5K race effort            | VO2max intervals, hill repeats, fartlek surges                                   |
| 9   | Very hard; 3K-to-mile effort, short | End of VO2 repeats, time trials                                                  |
| 10  | All-out                             | The finish of a time trial (hill sprints are near-maximal but last only seconds) |

**Talk test.** T1 is a full conversation. T2 is full sentences with a little
more breath. T3 is short phrases. T4 is a word or two. T5 is no talking. T1–T2
sits below VT1, which is "easy" (Persinger 2004; Reed & Pipe 2014 [R]).

**Pace anchors** use the runner's _current_ fitness (VDOT in `runPaces.ts`),
never a hoped-for goal. Daniels' codes: E, M, T, I, R. As a computed example,
a VDOT 40 runner (10K 50:00) gets roughly E 6:07–6:44/km, M 5:27, half-marathon
pace 5:15, T 5:06, 10K pace 5:00, 5K pace 4:49, I 4:41 and R 4:23 [C,
Appendix A].

**Heart-rate guides** are given as a percentage of a **measured** HRmax. Heart
rate is not used for strides, repetitions or hill sprints, where it lags too
much to be useful (§4.13).

### 5.0b Quick reference

| Session                | Family                   | RPE                     | Talk             | Pace anchor              | %HRmax (rough)                   | Recovery cost | Typical frequency (recreational)         |
| ---------------------- | ------------------------ | ----------------------- | ---------------- | ------------------------ | -------------------------------- | ------------- | ---------------------------------------- |
| Easy                   | easy                     | 3–4                     | T1–T2            | E                        | 65–79                            | low           | most runs                                |
| Recovery               | easy                     | 1–2                     | T1               | slow end of E or slower  | below about 70–75                | very low      | optional, day after hard                 |
| Long                   | easy (endurance)         | 3–4, may reach 5 late   | T1–T2            | E                        | 65–79                            | moderate–high | 1/week                                   |
| Medium-long            | easy (endurance)         | 3–4                     | T1–T2            | E                        | 65–79                            | moderate      | 0–1/week (half or full marathon builds)  |
| Steady / aerobic       | moderate                 | 5                       | T2               | between E and M          | 75–85                            | moderate      | 0–1/week                                 |
| Marathon pace          | moderate (race-specific) | 6                       | T2–T3            | M                        | 80–90                            | moderate–high | 0–1/week in marathon blocks              |
| Tempo (continuous)     | hard (threshold)         | 7                       | T3               | T                        | 88–92                            | moderate–high | 0–1/week                                 |
| Cruise intervals       | hard (threshold)         | 7                       | T3               | T                        | 88–92                            | moderate      | 0–1/week                                 |
| VO2max intervals       | hard                     | 8–9                     | T4               | I                        | 90–100 by the end of each repeat | high          | 0–1/week                                 |
| Repetitions            | hard (speed)             | 8 (short)               | T5 during        | R                        | not useful                       | moderate      | 0–1/week (5K/10K focus)                  |
| Strides                | speed (low cost)         | 6–7, relaxed            | —                | about mile to 5K effort  | not useful                       | very low      | 2–4/week                                 |
| Hill sprints           | speed / power            | near-maximal for 8–10 s | —                | effort                   | not useful                       | low–moderate  | 1–2/week                                 |
| Hill repeats           | hard                     | 7–9                     | T4               | 5K–3K effort             | 85–95                            | high          | 0–1/week                                 |
| Fartlek                | mixed                    | 3–8                     | varies           | surges at 10K–5K effort  | varies                           | moderate      | 0–1/week                                 |
| Progression            | mixed                    | 3, rising to 6–7        | T1, ending at T3 | E rising to M or T       | rising                           | moderate      | 0–1/week                                 |
| Race-pace long run     | race-specific            | 3–4, then 6             | T1, then T2–T3   | E + M                    | rising                           | very high     | every 2–3 weeks late in a marathon block |
| Shakeout               | easy                     | 1–2                     | T1               | very easy                | below about 70                   | negligible    | before races                             |
| Run-walk               | easy                     | 2–4                     | T1–T2            | E for the running bits   | below about 80                   | low           | novice default; any long event           |
| Time trial / benchmark | test                     | 9–10                    | T5               | all-out for the distance | 95+                              | high          | every 4–8 weeks at most                  |

### 5.1 Easy run

- **Purpose.** The aerobic base: improvements in cardiac output and stroke
  volume, capillary and mitochondrial density, fat use, and tissue tolerance to
  the repetitive load of running, all at low fatigue cost. Daniels lists injury
  resistance, a stronger heart, better blood delivery and favourable muscle
  fibre changes [V]. Most of the weekly volume belongs here (Seiler 2010;
  Haugen 2022 [V]). **MODERATE** that "mostly easy" works. The mechanism
  claims for low intensity specifically are **CONVENTION** (Storoschuk
  2025 [R]).
- **Feel.** RPE 3–4. T1–T2 (full sentences). Breathing relaxed and
  unhurried.
- **Pace.** Daniels E. About 1:00–2:00/km slower than 5K race pace for most
  recreational runners (VDOT 40: 6:07–6:44/km against a 5K pace of
  4:49/km [C]). Below VT1. Slower on hills, in heat and when tired; go by
  effort.
- **Heart rate.** About 65–79% of HRmax (Daniels [V]); Olympiatoppen zones
  I1–I2.
- **Dose and progression.** 20–60 minutes; for novices 15–30 minutes or
  run-walk. Progress by adding minutes (about 5–10 per run every 1–3 weeks)
  before adding days (**CONVENTION**). Use time rather than distance for slower
  runners, so the stress is similar across paces (**CONVENTION**).
- **Recovery cost and placement.** Low. Fills the days around key sessions.
  Can carry strides.
- **Common mistakes.** Drifting into moderate effort (the "grey zone"),
  chasing a pace on a hot or hilly day, racing friends or app segments, and
  treating "easy" as "wasted".
- **Plain English.** "An easy run should feel relaxed enough to talk in full
  sentences. It builds the aerobic base that every faster session depends on,
  and it's easy on purpose, so you arrive fresh for the harder days. If in
  doubt, slow down."

### 5.2 Recovery run

- **Purpose.** Adds a little volume and blood flow with almost no fatigue.
  Claims that it actively _speeds recovery_ are unproven (**CONVENTION**;
  Pfitzinger [R]). For people running 4 or fewer days a week, rest or easy
  cross-training is usually the better use of the day.
- **Feel.** RPE 1–2. T1. Shorter than an easy run.
- **Pace.** The slowest end of E or slower; no target.
- **Heart rate.** Below about 70–75% of HRmax (Pfitzinger uses an upper limit
  in this region [R]).
- **Dose.** 20–40 minutes, the day after a hard session or long run.
  Optional.
- **Common mistakes.** Too fast, too long, or done instead of a rest day the
  body needed.
- **Plain English.** "A short, very gentle run the day after a hard effort.
  It isn't building fitness. It keeps you moving without adding fatigue.
  Walk breaks are fine, and a rest day is a fine swap."

### 5.3 Long run

- **Purpose.** Endurance specific to long races: muscle glycogen storage, fat
  use at running speed, musculoskeletal durability over long durations, and
  rehearsal of fuelling and pacing. Across marathon cohorts, a longer longest
  run and more runs of 32 km or longer are associated with faster finishes
  (Doherty 2020 [V]; **MODERATE association**, confounded). The dose is
  **CONVENTION**.
- **Feel.** RPE 3–4 for most of it; RPE 5 late is normal. T1–T2.
- **Pace.** E. Marathoners often run 10–20% slower than marathon pace
  (Pfitzinger [R]). Heart rate drifts upward late, more so in heat.
- **Heart rate.** The E band; accept some drift late.
- **Dose and progression.** Beginners 45–75 minutes. Half-marathon builds
  90–120 minutes. Marathon peaks in the sources range from 16 miles or about
  3 hours (Hansons [V]) to 20 miles or more (Higdon [V2]; Pfitzinger [R]).
  Daniels caps the long run at the lesser of 25–30% of weekly volume or
  150 minutes [R]. Tropos already uses a 150-minute ceiling, labelled a
  heuristic (RUN-EV-06). Progress so that no run exceeds the longest run of the
  previous 30 days by more than about 10% (Frandsen 2025 [V],
  observational), with a cutback every 3–4 weeks (**CONVENTION**).
- **Recovery cost and placement.** Moderate to high; 1–2 easy days after. Put
  it on the day with the most free time, at least 48 h after a VO2max or
  hill-repeat session and at least 48 h after heavy lower-body lifting
  (**CONVENTION**, consistent with Doma [R] and Robineau [V]).
- **Common mistakes.** Too fast; big jumps in length; no fuel on runs over
  about 75–90 minutes (standard sports-nutrition practice [R]); scheduling it
  the day after a hard leg session.
- **Plain English.** "Your long run builds endurance, the ability to keep
  going for a long time. Run it at an easy, chatty effort. The time on your
  feet does the work, not the speed. Add length gradually: this is the run
  most likely to cause trouble if it grows too fast."

### 5.4 Medium-long run

- **Purpose.** A second endurance stimulus in midweek: more aerobic volume
  without a second weekend long run (Pfitzinger [R]; in Tropos as the
  `easy_60/75/90` templates).
- **Feel.** RPE 3–4. T1–T2.
- **Pace.** E, at the upper end at most.
- **Dose.** 60–90 minutes, or about 60–75% of the long run's length, once a
  week in half-marathon and marathon builds. Usually not for runners on 3 days
  a week.
- **Placement.** Midweek, at least 2 days from the long run, ideally not the
  day after intervals or a heavy leg session.
- **Common mistakes.** Turning it into a second hard day.
- **Plain English.** "A longer-than-usual easy run in the middle of the week.
  It adds endurance without the cost of a second long run. Same easy effort as
  your long run."

### 5.5 Steady or aerobic run

- **Purpose.** Aerobic work in the upper easy to moderate range, around and
  just above VT1. Pyramidal elite training includes plenty of it
  (Casado 2022 [V]). It is the backbone of Lydiard-style and Norwegian
  aerobic running. **CONVENTION.** Strict 80/20 advocates would keep it
  minimal.
- **Feel.** RPE 5. T2: you could talk in sentences but would rather not.
- **Pace.** Between E and M, roughly marathon pace plus 15–30 s/km
  (**CONVENTION**).
- **Heart rate.** About 75–85% of HRmax (I2 to low I3) [R].
- **Dose.** 30–60 minutes, or steady segments inside an easy run. At most once
  a week for recreational runners. It counts as **moderate** load, not easy.
- **Common mistakes.** Every run quietly becomes steady, which removes the
  easy days.
- **Plain English.** "A comfortably brisk run: quicker than easy but still
  well under control. It's a step up in effort without being a hard workout.
  Keep it to one a week so your easy days stay easy."

### 5.6 Marathon-pace run

- **Purpose.** Race specificity: familiarity with the pace, running economy
  and fuel use at race intensity, and fuelling practice. Hansons' "tempo" is
  run at goal marathon pace [V]. Pfitzinger puts marathon-pace segments in long
  runs [R]. Elites increase race-pace volume as competition nears (Haugen
  2022 [V]). **CONVENTION** with descriptive support.
- **Feel.** RPE about 6, controlled early. T2–T3 (short sentences).
- **Pace.** Current-fitness marathon pace (Daniels M; VDOT 40 → 5:27/km [C]).
  **Set it from current fitness, not the goal.** If the goal pace feels like
  RPE 7 or more in the first few kilometres, the goal is ahead of the runner's
  fitness.
- **Heart rate.** About 80–90% of HRmax (Daniels [R]).
- **Dose and progression.** Start with 3–5 km (15–20 minutes) inside an easy
  run. Build to 12–20 km in the final 8–10 weeks (Hansons up to 10 miles [R];
  Daniels: no more than the lesser of 110 minutes or 18 miles [R]). Weekly or
  every other week in marathon blocks.
- **Recovery cost and placement.** Moderate to high when long. A key session;
  not after heavy legs.
- **Common mistakes.** Running at the goal pace the runner hopes for; doing too
  much too early; skipping fuel practice.
- **Plain English.** "Running at the pace you plan to hold on race day. It
  teaches your legs, breathing and fuelling what that pace feels like. It
  should feel controlled. If it feels hard early on, the target may be ahead of
  your current fitness."

### 5.7 Tempo or threshold run (continuous)

- **Purpose.** Raises the fastest pace you can hold without lactate building
  up (the lactate threshold / maximal steady state / critical-speed region),
  which improves speed endurance (Daniels T [V]). In trials, threshold-focused
  training improves performance about as much as polarized training in
  recreational runners (Muñoz 2014; Festa 2020 [V]). It is central to modern
  elite training (Casado 2023 [V]). **MODERATE.**
- **Feel.** "Comfortably hard" (Daniels [V]). RPE about 7. T3 (a few words).
  Breathing deep and rhythmic, not gasping.
- **Pace.** About the pace you could race for an hour (Daniels [R]): between
  10K and half-marathon pace for most recreational runners, and close to 10K
  pace for runners whose 10K takes about an hour or more. VDOT 40 →
  5:06/km [C].
- **Heart rate.** 88–92% of HRmax (Daniels [V]); I3–I4.
- **Dose and progression.** 15–20 minutes to start (or 2 × 10 minutes), then
  20–30 minutes; Daniels' classic tempo is 20 minutes steady [V]. Marathoners
  sometimes go up to about 40 minutes (Pfitzinger [R]). Keep total T at no
  more than about 10% of weekly volume (Daniels [R]).
- **Recovery cost and placement.** Moderate to high. Leave at least 48 h
  before the next hard session.
- **Common mistakes.** Racing it (turning it into 10K pace or faster),
  holding a pace target on hot or hilly days, doing too long too early.
- **Plain English.** "A sustained run at a 'comfortably hard' effort: you
  could say a few words, but you wouldn't want to chat. It trains you to hold a
  strong pace for longer. It should feel controlled from start to finish. If
  you're straining at the end, it was too fast."

### 5.8 Cruise intervals (threshold intervals)

- **Purpose.** The same adaptation as a tempo run, with more total time at T
  thanks to short rests (Daniels [V]). The consumer version of the Norwegian
  sub-threshold-interval idea (Casado 2023 [V]). **MODERATE / CONVENTION.**
- **Feel.** RPE about 7 during each repeat; breathing settles within about a
  minute.
- **Pace.** T pace, **the same for every repeat**.
- **Heart rate.** 88–92% by the end of each repeat.
- **Dose.** For example 3–5 × 5–8 minutes, or 3–6 × 1–2 km, with about
  1 minute of jogging per 5 minutes of running (Daniels [R]; a secondary
  source gives 20–25% rest [V2]). Total T time 20–40 minutes for recreational
  runners.
- **Recovery cost.** Moderate, and often lower perceived cost than a
  continuous tempo of the same total time. **A good default threshold format
  for recreational runners.**
- **Common mistakes.** Speeding up across the repeats; taking long rests that
  turn it into an interval session.
- **Plain English.** "Threshold running split into chunks with short jogs in
  between. The breaks let you spend more total time at that 'comfortably hard'
  effort with less strain. Every repeat should feel the same, so resist
  speeding up."

### 5.9 VO2max intervals

- **Purpose.** Time near maximal oxygen uptake, which raises VO2max and the
  speed at VO2max (Daniels I [V]; Helgerud 2007 [R]; Milanović 2015 [R];
  Buchheit & Laursen 2013 [R]). **MODERATE–STRONG** for VO2max gains in
  untrained and moderately trained people.
- **Feel.** RPE 8, reaching 9 by the end of each repeat. T4. Heavy
  breathing.
- **Pace.** I pace: about what you could race for 10–12 minutes, roughly 3K
  to 5K race pace (Daniels [R]). VDOT 40 → about 4:41/km [C].
- **Heart rate.** Reaches about 90–100% by the end of 3–5-minute repeats
  (Daniels: 98–100% [V]). Heart rate lags, so pace and effort are better
  guides.
- **Dose and progression.** 3–5-minute repeats with equal or slightly shorter
  jogging recovery (Daniels [V]); 12–20 minutes in total at I, and no more
  than about 8% of weekly volume (Daniels [V]). Accessible variants: 4 × 4
  minutes (Helgerud [R]); 30 s/30 s for beginners (Buchheit & Laursen [R]).
  Progress by adding repeats, then lengthening them.
- **Recovery cost and placement.** High. Leave 48–72 h before the next hard
  session and keep it off the day before a long run. Novices should introduce
  it only after 6–8 weeks of consistent easy running (**CONVENTION**).
- **Common mistakes.** Running faster than I pace (which makes it an
  anaerobic session), doing too much, taking too little recovery early on,
  doing it on legs tired from squats.
- **Plain English.** "Hard repeats of a few minutes each, with easy jogging in
  between. They stretch the top end of your aerobic engine: how much oxygen
  your body can use. They're tough by design, so they're kept short and spaced
  away from other hard days."

### 5.10 Repetitions (speed)

- **Purpose.** Speed, economy and neuromuscular coordination at fast paces,
  with full recovery so the quality of movement stays high; anaerobic capacity
  is secondary (Daniels R [V]). Short near-maximal work improves economy in
  trained runners (Skovgaard 2018 [V]; Gunnarsson & Bangsbo 2012 [R]).
  **WEAK–MODERATE.**
- **Feel.** Fast but relaxed. RPE about 8 but brief. No talking during;
  full recovery between.
- **Pace.** R: about current mile race pace (Daniels [R]). VDOT 40 →
  4:23/km [C].
- **Dose.** 200–400 m repeats (2 minutes or less), with 2–3 times the repeat
  duration as walking or jogging recovery; 2–5 km in total, and no more than
  the lesser of 5% of weekly volume or 8 km (Daniels [V]).
- **Recovery cost.** Moderate: more neuromuscular than metabolic.
- **Common mistakes.** Recoveries too short (which turns it into intervals),
  sprinting all-out, letting form fall apart.
- **Plain English.** "Short, fast repeats, around the pace you could race a
  mile, with full rest between. The goal is smooth, quick running, not
  exhaustion. If your form starts to fall apart, stop there."

### 5.11 Strides (definition requested explicitly)

**Definition (a synthesis of the sources; CONVENTION).** 4–8 repeats (up to
10 for experienced runners) of about **15–30 seconds** (about 80–150 m). Each
one starts by accelerating smoothly for the first third, holds **fast but
relaxed** running at roughly **mile-to-5K race effort** for the middle, then
eases off. It is **not an all-out sprint**. Recover fully between repeats:
45–90 s of walking or jogging, or until breathing settles. Run them on flat
ground, grass or a gentle downhill.

- Daniels: light, quick runs of 15–20 s at about R pace (mile race pace) with
  about 1 minute of recovery; not sprints [R].
- Pfitzinger: about 100 m, accelerating to about 95% of top speed and then
  floating; 6–10 after easy runs or before quality sessions [R].
- Roche: 20–30 s, fast but relaxed, frequently after easy runs; also
  "hill strides" [R].

**Why runners do them.** To practise fast, efficient mechanics and
neuromuscular coordination; to keep some speed during base periods; to prime
the legs before workouts and races; all at almost no fatigue cost. There is no
direct trial; the indirect evidence is sprint-type work improving economy
(§4.7). **WEAK / CONVENTION.**

**When in the week.** At the end of 2–4 easy runs a week, including the day
before a workout or race. As part of a warm-up before quality sessions and
races. Not on recovery days for anyone nursing a calf or Achilles problem, and
not as a first session after a layoff.

- **Feel.** RPE 6–7, with the emphasis on _relaxed_. Shoulders and jaw loose.
- **Progression.** Start with 4 × 15–20 s and build to 6–8 × 20–30 s.
- **Common mistakes.** Sprinting and tensing up; too little recovery; doing
  them cold instead of after a warm-up or easy run; dropping them because "it's
  an easy day".
- **Plain English.** "Strides are short, smooth bursts of fast running, about
  20 seconds each, done at the end of an easy run. Build up to quick but
  relaxed (not a sprint), ease off, and recover fully before the next one. They
  practise good, fast form without making you tired."

### 5.12 Hill sprints

- **Purpose.** Maximal recruitment of the running muscles, power and tendon
  stiffness, with low impact because uphill running reduces braking forces
  (Hudson & Fitzgerald [V]). In Barnes 2013 the highest-intensity uphill work
  gave the largest neuromuscular and economy gains [V]. **WEAK.**
- **Feel.** Near-maximal effort, but only 8–10 s, so breathing barely rises.
  Full recovery between.
- **Pace.** Effort only, on a steep grade (about 6–10%).
- **Dose.** Start with 1–2 × 8 s and add 1–2 repeats a week up to 8–10 ×
  8–12 s. Walk down, then rest 1.5–3 minutes in total between repeats. Once or
  twice a week, after an easy run.
- **Recovery cost.** Low to moderate, but they load the calf and Achilles, so
  introduce them gradually and skip them if either is sore.
- **Common mistakes.** Running them too long (20–60 s turns them into hill
  repeats), short rests, too many too soon.
- **Plain English.** "Very short, all-out bursts up a steep hill, 8 to 10
  seconds each, with full rest between. They build power and strength in your
  running muscles with less pounding than flat sprinting. Keep them short: the
  full rest is part of the session."

### 5.13 Hill repeats

- **Purpose.** Strength-endurance and VO2max stimulus with less impact. Uphill
  interval programmes improved 5 km time by about 2% in 6 weeks (Barnes
  2013 [V]). Incline intervals improved economy as much as level intervals
  (Ferley 2013 [V]). Lydiard's hill phase [V2]. **MODERATE.**
- **Feel.** RPE 7–9 depending on length. T4.
- **Pace.** Effort only: about 5K effort for 1–3-minute repeats, about 3K
  effort for 30–60 s repeats, on a 4–8% grade.
- **Heart rate.** Rises toward 90% or more on 2–3-minute repeats.
- **Dose.** 6–10 × 30–90 s, or 4–6 × 2–3 minutes, jogging or walking down to
  recover; 6–15 minutes of uphill running in total.
- **Recovery cost.** High: a hard session, with eccentric loading on the way
  down.
- **Common mistakes.** Chasing flat-ground pace, running the downhills hard,
  using a grade too steep for longer repeats.
- **Plain English.** "Repeats up a hill at a hard effort, jogging back down to
  recover. Hills make you work hard while sparing your legs some of the impact
  of fast flat running. Judge it by effort, not pace: slowing down on the hill
  is normal."

### 5.14 Fartlek

- **Purpose.** Unstructured "speed play" (Swedish, 1930s–40s [R]): a
  low-pressure way to bring faster running into a week, with some threshold
  and VO2 stimulus. **CONVENTION.**
- **Feel.** Surges at RPE 6–8; recoveries at RPE 2–3.
- **Pace.** Surges at about 10K–5K effort; recoveries easy.
- **Dose.** 30–45 minutes in total with 6–12 surges of 30 s to 3 minutes (for
  example 8 × 1 minute fast, 1 minute easy, or "to the next lamp-post").
- **Recovery cost.** Moderate.
- **Common mistakes.** Making every surge all-out; turning it into a race with
  a friend; skipping the easy parts.
- **Plain English.** "Fartlek is Swedish for 'speed play'. During a run you
  add faster bursts, to the next lamp-post or for a minute, then ease back
  until you're ready for another. It's a relaxed way to bring some speed into
  your week."

### 5.15 Progression run

- **Purpose.** Aerobic volume that finishes at moderate to threshold
  intensity. It teaches pacing discipline and finishing strong on tired legs
  (**CONVENTION**; Magness, in the repo).
- **Feel.** Starts at RPE 3 and finishes at RPE 6–7.
- **Pace.** E, then steady, then M, then T in the final 10–20 minutes.
- **Dose.** 40–75 minutes, with the last 20–30% faster, or run in thirds.
- **Recovery cost.** Moderate; a lighter quality session.
- **Common mistakes.** Starting too fast; finishing at race effort.
- **Plain English.** "Start easy and gradually pick up the pace, so the last
  part is comfortably hard. It's a gentle way to practise finishing strong.
  Don't let the first half creep faster than easy."

### 5.16 Race-pace long run

- **Purpose.** Marathon or half-marathon specificity under fatigue: a long run
  with segments at marathon or half-marathon pace (Pfitzinger marathon-pace
  long runs [R]; Canova's specific long runs [V2]). **CONVENTION.**
- **Feel.** RPE 3–4 for the easy part, about 6 for the race-pace part, rising
  late.
- **Pace.** For example the last 8–16 km at M, or alternating kilometres.
- **Dose.** In the final 8–10 weeks, every 2–3 weeks. The race-pace portion
  progresses from about 5 km to 12–16 km for recreational runners, and
  further for experienced ones.
- **Recovery cost.** Very high: the hardest session of its week, followed by
  2–3 easy days.
- **Common mistakes.** Doing too many; setting the pace from the goal instead
  of current fitness; not practising fuelling; doing the full version within
  about 2 weeks of the race.
- **Plain English.** "A long run with a chunk at your goal race pace, usually
  near the end. It rehearses race day on tired legs: pace, fuelling and focus.
  It's one of the hardest sessions in a marathon plan, so the easy days around
  it matter."

### 5.17 Shakeout

- **Purpose.** Loosening up, routine and nerves. No fitness effect
  (**CONVENTION**).
- **Feel.** RPE 1–2. T1.
- **Dose.** 10–25 minutes easy, plus 2–4 strides if wanted. The day before a
  race, or the morning of a short one.
- **Common mistakes.** Running too long or too fast; "testing" fitness the day
  before.
- **Plain English.** "A short, very easy jog the day before a race, or that
  morning, to loosen up and settle nerves. It won't add fitness; it's just to
  feel ready. Keep it short and easy. A few strides are optional."

### 5.18 Run-walk

- **Purpose.** Lets novices, and anyone in a long event, build up running time
  with less strain per running bout. It is the basis of Couch to 5K [V2].
  Run-walk marathons give similar times with less muscle pain and fatigue
  (Hottenrott 2016 [R]). Injury-prevention claims are unproven. **WEAK.**
- **Feel.** Running segments at RPE 3–4 (conversational); brisk walking.
- **Pace.** E for the running segments.
- **Dose and progression.** Couch to 5K week 1: a 5-minute brisk walk, then
  60 s running and 90 s walking for 20 minutes [V2], 3 times a week with rest
  days between. Progress the running share each week until about 30 minutes of
  continuous running in week 9. For long events, ratios by pace (Galloway
  [V2]): about 3:1 minutes at 10 min/mile (6:13/km), 2:1 at 12 min/mile
  (7:27/km), 1:1 at 13 min/mile (8:05/km).
- **Common mistakes.** Running the running segments too fast; waiting until
  exhausted before walking; treating walking as failure.
- **Plain English.** "Short running and walking segments, alternated from the
  start. Walk breaks let you cover more distance with less strain, and they're
  a proper training method, not giving up. As you get fitter, the running parts
  get longer."
- **Honesty note.** Thirty minutes of easy running covers about 2.8–3.8 km for
  typical novices (VDOT 20–30) [C]. The Couch to 5K end state is "30 minutes
  non-stop", not necessarily 5 km.

### 5.19 Time trial or benchmark

- **Purpose.** Measures current fitness to set paces (VDOT or critical speed)
  and track progress. Galloway's Magic Mile [V2]. Critical speed from 2–3 best
  efforts (Jones & Vanhatalo [R]), or from best efforts in the training log
  (Smyth & Muniz-Pumares 2020 [V]). **MODERATE** that a recent all-out effort
  predicts better than a formula built from a goal.
- **Feel.** RPE 9–10 for the distance. T5.
- **Format.** A mile, 3K, 5K (a parkrun works) or a 30-minute effort; an even
  effort throughout.
- **Dose.** Every 4–8 weeks at most, replacing a quality session. Warm up with
  strides. Flat route, mild weather, rested legs.
- **Recovery cost.** Like a hard session for a 5K; more for longer efforts.
- **Common mistakes.** Testing too often; testing when tired, hot or on hills
  and then lowering paces from that one bad day; uneven pacing. RUN-EV-08
  already requires provenance and consent before a benchmark changes the
  prescription.
- **Plain English.** "A timed effort, such as a mile or a 5K at your best
  sustainable pace, to see where your fitness is now. The result sets your
  training paces, so do it fresh, on a flat route, in mild weather. One off day
  doesn't define you: the trend is what counts."

### 5.20 Composing the week (recreational defaults)

| Rule                                                                                                                                                         | Source                                                                                          | Grade                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------ |
| No more than 2 quality sessions plus 1 long run per week. Novices: no structured quality work for the first 6–8 weeks; strides and hill sprints are allowed. | Daniels, Pfitzinger, Higdon (no speedwork for novices), Hansons (3 SOS for experienced runners) | CONVENTION               |
| At least 1 easy or rest day between hard sessions (about 48 h)                                                                                               | Every system; Noakes' hard/easy law                                                             | CONVENTION               |
| Strides on 2–3 easy days                                                                                                                                     | Daniels, Roche, Pfitzinger                                                                      | CONVENTION               |
| Long run at least 48 h after VO2max or hill sessions and at least 48 h after heavy leg lifting                                                               | Doma [R], Robineau [V]                                                                          | WEAK / CONVENTION        |
| Add intensity in this order: strides and hill sprints, then fartlek and hills, then threshold, then VO2, then race-specific work                             | Lydiard [V2], Hudson [V], Canova [V2], Magness (repo)                                           | CONVENTION               |
| Volume before intensity; a cutback week every 3–4 weeks                                                                                                      | Every system                                                                                    | CONVENTION               |
| Single-run guard: no run more than about 10% longer than the longest run of the previous 30 days                                                             | Frandsen 2025 [V]                                                                               | MODERATE (observational) |
| Threshold as cruise intervals by default; continuous tempo as the progression                                                                                | Daniels [V]; Casado 2023 [V]                                                                    | CONVENTION               |
| Never "catch up" missed quality work                                                                                                                         | Already in the handoff                                                                          | CONVENTION               |

---

## 6. Expected progress: inputs for the simulation

Everything here is a **planning prior with stated uncertainty**. Use these
values to generate distributions, not point predictions. Where the evidence
runs out, the text says "ASSUMPTION" so the simulation team can sweep the
value.

### 6.1 Improvement rates by training status and horizon

The figures are race-time change at 5K–10K. VDOT equivalents are computed: at
VDOT 30, +1 VDOT ≈ −2.7% on 5K time; at VDOT 40, +1 VDOT ≈ −2.1% [C].

| Starting status                                                             | 12 weeks                                                                           | 16 weeks                              | 26 weeks                       | 52 weeks                                                                   | Basis and grade                                                                                                                                                                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sedentary to first continuous run** (first measurable 5K at VDOT ≈ 20–30) | Goal is to finish 30 minutes or a 5K; the first 5K usually takes 30–40 minutes [C] | First measured 5K becomes 3–8% faster | 8–15% faster than the first 5K | 12–25% faster than the first 5K                                            | VO2max rises about 10–15% in 6–12 weeks in untrained people (Milanović 2015; HERITAGE [R]), plus gains in economy and pacing. **WEAK** (extrapolated); very wide spread; dropout is the main risk                   |
| **Novice runner** (under a year; VDOT 25–35; 10–20 km a week)               | −4–8% (+1.5–3 VDOT)                                                                | −5–10%                                | −7–13%                         | −10–20% (+4–8 VDOT)                                                        | **WEAK** (extrapolated from trainability and low training age)                                                                                                                                                      |
| **Recreational** (1–5 years; VDOT 35–45; 20–40 km a week)                   | −2–5% (+1–2.5 VDOT)                                                                | −3–6% (+1.5–3)                        | −4–8% (+2–4)                   | −5–10% (+2.5–5), **mostly if volume rises**                                | 8–16-week anchors: Muñoz −3.6 to −5.0% in 10 weeks; Festa about 3–3.5% in 8 weeks; Esteve-Lanao about 4–5% in 5 months [V]. Trial runners were fitter (VDOT ≈ 50+), so **MODERATE** to 16 weeks and **WEAK** beyond |
| **Well-trained** (VDOT 50+; 50+ km a week)                                  | −1–3%                                                                              | −1.5–3%                               | −2–4%                          | −2–5%                                                                      | Filipas about 1.5% in 16 weeks; Barnes about 2% in 6 weeks [V]. **MODERATE**                                                                                                                                        |
| **Masters (55+)**                                                           | As above for the same training status                                              | —                                     | —                              | Subtract an age decline of about 0.5–1% a year (steeper after about 65–70) | Tanaka & Seals 2008 [R]. **WEAK** on the magnitude                                                                                                                                                                  |

**Variability (ASSUMPTION, informed by HERITAGE and Montero & Lundby [R]).**
People differ widely in how much they respond. Model an individual
responsiveness multiplier drawn from a lognormal distribution with median 1.0
and log-SD about 0.4 (a 90% range of roughly 0.5× to 1.9× the mean gain). Let
a higher dose rescue low responders (Montero & Lundby 2017 [R]).

**Diminishing returns (ASSUMPTION).** Gains per block shrink as training age
grows and as the runner approaches a volume-specific ceiling. Tanda's term
140·exp(−0.0053·K) [V] is a usable shape for "what weekly km buys" at marathon
distance, holding training pace fixed. Going from 30 to 50 km a week is worth
about 12 s/km at marathon pace (about 8 minutes over the race), and 50 to
70 km a week about 11 s/km (about 7.6 minutes) [C]. The real effect is larger,
because training pace also gets faster as fitness rises (the 0.55·P term).

### 6.2 The Banister impulse-response (fitness–fatigue) model

**Model.** p(t) = p₀ + k₁·Σ w(s)·e^(−(t−s)/τ₁) − k₂·Σ w(s)·e^(−(t−s)/τ₂),
where w is the daily training load (Banister 1975; Morton 1990 [R]).

**Published ranges** [R]: fitness time constant τ₁ about **30–60 days** (often
40–50); fatigue time constant τ₂ about **5–15 days**; fatigue gain larger than
fitness gain (**k₂/k₁ about 1.5–3**, sometimes higher). The **42/7** defaults
used by TrainingPeaks' CTL/ATL and by Tropos's `trainingLoad.ts` are
**conventions inside that range, not values fitted to runners**. In nonlinear
variants, the fatigue gain rises with load (Busso 2003 [R]), which is the
mechanism behind overreaching. Fits to individuals are unstable and predict
poorly (Hellard 2006 [R]). **WEAK** as a predictor, **MODERATE** as a
descriptive smoother.

**What the parameters imply** for a single session [C]. The session's net
effect turns positive after t_n = (τ₁τ₂/(τ₁−τ₂))·ln(k₂/k₁) and peaks at
t_p = (τ₁τ₂/(τ₁−τ₂))·ln(k₂τ₁/(k₁τ₂)).

| τ₁ / τ₂ / k₂:k₁ | Net positive after | Peak benefit at |
| --------------- | ------------------ | --------------- |
| 42 / 7 / 1.5    | 3.4 days           | 18.5 days       |
| 42 / 7 / 2.0    | 5.8 days           | 20.9 days       |
| 42 / 7 / 3.0    | 9.2 days           | 24.3 days       |
| 50 / 11 / 2.0   | 9.8 days           | 31.1 days       |
| 45 / 15 / 2.0   | 15.6 days          | 40.3 days       |

Common parameters therefore put the benefit of a hard session 2–4 weeks out.
That matches the 2–3-week taper findings (Bosquet 2007; Smyth & Lawlor
2021 [V]) and is a useful consistency check for the simulation.

**Suggested priors (ASSUMPTION).** τ₁ ~ N(42, 8) truncated to [25, 65];
τ₂ ~ N(9, 3) truncated to [4, 18]; k₂/k₁ lognormal with median 2 and IQR
1.5–2.8. Calibrate k₁ so that a recreational runner's 16-week block yields a
3–6% gain (§6.1). Add a ceiling or saturation term: the plain model grows
without limit as load rises, which is unrealistic. Load units: the session RPE
(CR10) × minutes method (Foster 2001 [R]), or Tropos's effort-weighted minutes
with a quality factor of 1.3, used consistently.

### 6.3 Injury hazard inputs

| Input                                                                          | Value                                   | Uncertainty                                                        | Source            | Grade                |
| ------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------ | ----------------- | -------------------- |
| Base incidence, novice                                                         | 17.8 per 1000 h of running              | 95% CI 16.7–19.1; injury definitions vary                          | Videbæk 2015 [V]  | MODERATE             |
| Base incidence, recreational                                                   | 7.7 per 1000 h                          | 6.9–8.7                                                            | Videbæk 2015 [V]  | MODERATE             |
| Single run 10–30% longer than the 30-day longest                               | HRR ≈ 1.64                              | CI not seen; observational; self-reported injuries                 | Frandsen 2025 [V] | MODERATE             |
| Single run 30–100% longer                                                      | HRR ≈ 1.52                              | as above (not monotonic, so CIs probably overlap)                  | Frandsen 2025 [V] | MODERATE             |
| Single run more than 100% longer                                               | HRR ≈ 2.28                              | as above                                                           | Frandsen 2025 [V] | MODERATE             |
| Week-to-week distance ratio                                                    | no association                          | —                                                                  | Frandsen 2025 [V] | MODERATE             |
| More than 30% over 2 weeks vs under 10% (novices; "distance-related" injuries) | HR 1.59 (0.96–2.66)                     | Not significant                                                    | Nielsen 2014 [V]  | WEAK                 |
| Previous injury                                                                | Raised risk; the most consistent factor | Size varies; about 1.5–2× is a reasonable sweep range (ASSUMPTION) | Hulme 2017 [R]    | MODERATE (direction) |
| 10%-rule progression vs faster progression                                     | No difference                           | One RCT                                                            | Buist 2008 [V]    | MODERATE             |

**Calibration targets** for the simulation's outputs [V]:

- 10.9% of novices injured during a 6-week Start to Run programme.
- About 20% of novices injured over 8–13 weeks toward a 4-mile event.
- About 17% injured over a 14-week half-marathon plan.
- About 37% of event entrants injured over 4–5 months.
- 35% of watch users injured over 18 months.
- About 7% of first-time marathoners had an overuse injury that stopped them
  starting or finishing (12-week window).

**Consistency check [C].** A Couch-to-5K-like plan is about 1.5 h a week for
9 weeks, which is 13.5 h. At 17.8 per 1000 h that is 0.24 expected injuries,
so P(at least one) ≈ 21% (Poisson). That matches Buist's about 20%.

**Severity mix (ASSUMPTION, unverified).** Not every injury stops training.
Model three tiers: "modify training" (about 50%), "time-loss of 1–3 weeks"
(about 35%) and "time-loss of more than 3 weeks" (about 15%). Draw layoff
lengths from a lognormal distribution with a median of about 14–21 days. Sweep
all of these.

### 6.4 Detraining and return inputs

| Situation                                                                            | Effect                                                                                                                         | Source                            | Grade      |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------- |
| Up to 4 weeks off, trained runner                                                    | VO2max −4% to −14%                                                                                                             | Mujika & Padilla 2000 [V]         | MODERATE   |
| Time course                                                                          | About −7% by 2–3 weeks; about −15–16% by 8–12 weeks, then a plateau                                                            | Coyle 1984 [V2]                   | MODERATE   |
| Recently trained person, more than 4 weeks off                                       | Recent VO2max gains fully lost                                                                                                 | Mujika & Padilla 2000 [V]         | MODERATE   |
| Reduced training: intensity kept, frequency or duration cut by a third to two thirds | VO2max held for about 15 weeks                                                                                                 | Hickson 1985 [V2]                 | MODERATE   |
| Reduced training: intensity cut                                                      | Gains lost                                                                                                                     | Hickson 1985 [V2]                 | MODERATE   |
| Return ramp                                                                          | Start at about 50–70% of the previous volume, no quality work for 1–2 weeks, rebuild over roughly as many weeks as were missed | CONVENTION; consistent with Run15 | CONVENTION |

A simulation mapping (ASSUMPTION): a performance (VDOT) loss of about 0–2% for
1 week off, 3–6% for 2–4 weeks, and 8–15% for 8–12 weeks in trained runners.
Novices return toward their pre-training baseline proportionally faster.

### 6.5 Personas

All VDOT numbers are computed with the Daniels–Gilbert equations (Appendix A),
which reproduce Daniels' published tables to within a few seconds. Every
"likely range" is **WEAK** (model-based): it combines §6.1–6.4 and the
prediction evidence in §4.15.

#### A. Sedentary adult to 5K in 9–12 weeks

- **Plan shape.** Couch to 5K: 3 run-walk sessions a week, at least one rest
  day between, the running share growing weekly to 30 minutes continuous by
  week 9 [V2]. Add weeks 10–12 to stretch from 30 minutes to 5 km. No pace
  targets, only talk-test cues. Strides are optional from week 6. No quality
  sessions.
- **Expected outcome.** Most who keep going can run 30 minutes non-stop by
  weeks 9–12 (ASSUMPTION: there is no verified completion-rate data). Thirty
  minutes covers about 2.8–3.8 km at easy pace for VDOT 20–30 [C], so a
  continuous 5 km often needs the extra 1–3 weeks. A first 5K effort typically
  lands at **30–40 minutes** (VDOT about 22–31 [C]); slower runners using
  run-walk take 40 minutes or more. That is fine and should be framed as fine.
- **Injury.** P(at least one running-related injury) is about **10–20%** over
  6–12 weeks (10.9% over 6 weeks; about 20% over 8–13 weeks [V]; 21% by the
  Poisson check [C]).
- **6 and 12 months.** If they keep running 3 times a week and add duration,
  their 5K could be 8–15% faster than the first 5K at 26 weeks and 12–25%
  faster at 52 weeks (WEAK; for example a 36:00 first 5K becoming 27–32
  minutes in a year).
- **With lifting.** Untrained people doing concurrent training show _smaller
  VO2max gains_ (Huiberts 2024 [V]; the size was not seen). They will still
  make large strength gains. Simulation multiplier on aerobic gains: about
  0.85–0.95 (ASSUMPTION).

#### B. A runner on 30 km a week with a 50-minute 10K, training 52 weeks for a first marathon and wanting their lifting to improve

- **Baseline [C].** A 10K in 50:00 is VDOT 40.0. The marathon equivalent is
  3:49:37 by VDOT and 3:50:01 by Riegel. Tanda's formula at the _current_
  training load (30 km a week at about 6:30/km) gives **4:06:51**. Vickers and
  Vertosick [V] warn that Riegel-type equivalents are at least 10 minutes too
  optimistic for half of recreational marathoners, especially at low mileage.
- **How the year should go.** See §7: about 24 weeks of base and strength,
  about 8 weeks of half-marathon preparation (with a tune-up half as a
  benchmark), 16 weeks of marathon-specific work, a 2–3-week taper and the
  race. Running builds from 30 km to a peak of about 50–65 km a week over about
  9 months, by time, with the single-run guard. The long run builds from about
  12–15 km to 30–32 km, or about 2:45–3:00, whichever comes first.
- **Expected fitness at race time.** If no major injury interrupts: VDOT +2 to
  +5 over the year (median about +3), a 10K of about 45:30–48:00 (WEAK).
- **Likely marathon finish.** Tanda at a peak of 55–65 km a week with
  training pace about 5:50–6:00/km gives **3:37–3:45** [C]. The VDOT-43
  equivalent is 3:36 [C], which is optimistic for a first-timer. **Central
  estimate about 3:45–3:50; 80% range about 3:35–4:10**, covering weather,
  pacing and fuelling. Heat can cost several percent at this level (El Helou
  2012; Ely 2007 [R]). A collapse after a first half above about 94% of
  critical speed costs far more (Smyth & Muniz-Pumares 2020 [V]). **WEAK.**
- **Getting to the start line.** A crude proration of 35% injured over
  18 months gives about 25% injured at some point in 12 months, many of them
  minor. About 7% of first-timers have an injury that stops them starting or
  finishing in the last 12 weeks [V]. P(starts and finishes) ≈ **80–90%**
  (WEAK).
- **Lifting.** The first 6 months are the window for lifting progress: running
  volume is still moderate, and interference grows with how often and how long
  the runs are (Wilson 2012 [V]). From about month 7, expect lower-body
  strength to plateau, especially for a trained man (Petré 2021; Huiberts
  2024 [V]), with upper-body progress continuing slowly (Schumann 2022 [V]).
  The marathon block should be framed as **maintenance** (§4.11). Heavy
  strength work twice a week can be expected to improve running economy and
  time trials a little (MODERATE) — perhaps 1–3% on a time trial (WEAK) —
  not to "make the marathon".

#### C. A 3:45 marathoner targeting sub-3:30 in 16 weeks

- **The gap [C].** 3:45:00 is VDOT 41.0 and 3:29:59 is VDOT 44.6: a gain of
  **+3.6 VDOT**, or about 7% on finish time.
- **The typical 16-week gain** for a recreational runner is −3% to −6%, or
  about +1.5–3 VDOT (§6.1). Sub-3:30 is therefore **above the typical
  outcome**.
- **What makes it plausible.** (a) The 3:45 was run below the runner's actual
  fitness: a positive split or collapse, heat, or poor fuelling. Pacing alone
  can be worth minutes (Smyth & Muniz-Pumares 2020 [V]). (b) The last
  marathon had a minimal taper; a strict 3-week taper is associated with about
  2.6% (about 6 minutes) by itself (Smyth & Lawlor 2021 [V]). (c) The runner
  has room to raise volume, or is early in their running life.
- **A precondition check [C, WEAK].** VDOT 44.6 corresponds to a half
  marathon of about 1:41. Recreational marathons tend to come in slower than half-marathon
  equivalents (Vickers 2016 [V]), so a recent half of about **1:37–1:38 or
  faster** is a practical sign that sub-3:30 is realistic. A recent half of
  about 1:45 (VDOT 42.6) makes it unlikely in 16 weeks.
- **Odds (model-based, WEAK).** About 10–25% for a runner whose 3:45 reflected
  their fitness; about 40–60% where there is evidence of underperformance.
- **Product.** A/B/C goals (roadmap A7): A = 3:29, B = about 3:35, C = sub-3:45.
  Re-test at about week 8 with a 10K or half marathon, and move the pace
  targets only with consent (RUN-EV-08).
- **Lifting.** Maintenance, 1–2 sessions a week, from week 1. Do not start
  heavy eccentric work mid-block: soreness impairs running economy for 1–3
  days (Doma [R]; CONVENTION).

#### D. (Extra) A returning runner after 6 weeks off sick

- **Expected loss.** VO2max −7–12% (between Coyle's 2–3-week and 8–12-week
  points [V2]); performance about −5–10% (ASSUMPTION).
- **Plan.** Run15-style re-entry (no quality work, a conservative tier), then
  rebuild over about 6 weeks. Re-benchmark before restoring the old paces.

### 6.6 How concurrent lifting changes these expectations

All of these are **ASSUMPTIONS** that map the meta-analytic effect sizes onto
simulation rate multipliers. They are **WEAK** and should be swept.

| Effect                                                                                   | Suggested multiplier                                                                                     | Evidence behind the direction                     |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Endurance gains, trained runner, heavy lifting at least 8 weeks, about 2 sessions a week | ×1.00 on VO2max; +0.5–2% on time-trial performance through economy                                       | Huiberts 2024; Llanos-Lagos 2024; Eihara 2022 [V] |
| Aerobic gains, untrained beginner doing both                                             | ×0.85–0.95                                                                                               | Huiberts 2024 [V] (size not seen)                 |
| Lower-body maximal strength, trained man, run volume 50+ km a week                       | ×0.5–0.8                                                                                                 | Petré 2021; Huiberts 2024 (SMD −0.43) [V]         |
| Lower-body maximal strength, woman                                                       | ×0.9–1.0                                                                                                 | Huiberts 2024 [V]                                 |
| Upper-body strength and hypertrophy                                                      | ×0.9–1.0                                                                                                 | Schumann 2022 [V]                                 |
| Explosive strength and power                                                             | ×0.5–0.8; worse when in the same session                                                                 | Schumann 2022; Wilson 2012 [V]                    |
| Leg-muscle hypertrophy with high running volume                                          | ×0.8–0.95                                                                                                | Lundberg 2022 [V]                                 |
| Run quality within 24 h after a heavy leg session                                        | Economy and time to exhaustion impaired; down-weight that session's stimulus by about 5–15% (ASSUMPTION) | Doma & Deakin [R]                                 |
| Maintenance block                                                                        | 1 heavy session a week holds strength for 3–8 months                                                     | Bickel 2011; Spiering 2021; Rønnestad 2010 [R]    |

### 6.7 Suggested simulation skeleton

These are modelling choices, not evidence.

1. **Time step:** daily sessions, with weekly planning.
2. **State per runner:** true VDOT, Banister fitness and fatigue, longest run
   in the last 30 days, injury state and history, training age, adherence
   propensity, upper- and lower-body strength indices, sex and age band.
3. **Load per session:** session RPE × minutes, or Tropos's effort-weighted
   minutes, used consistently.
4. **Performance:** VDOT_obs = VDOT_base + k₁·fitness − k₂·fatigue, with a
   ceiling that rises slowly with training age and volume (Tanda's shape for
   the marathon).
5. **Injury:** per-session hazard = base rate per hour × hours × spike
   multiplier × prior-injury multiplier. On injury, draw the severity tier and
   layoff length, then apply detraining.
6. **Adherence (ASSUMPTION):** probability of completing a planned session of
   about 0.75–0.95 depending on persona, with dropout for novices. **This is
   likely to dominate outcomes**; sweep it.
7. **Race day:** time = VDOT equivalent × marathon low-volume correction (sweep
   +3–8% when weekly volume is under about 50 km or the longest recent run is
   under about 28 km; WEAK, after Vickers 2016) × heat factor × pacing-collapse
   risk (when the planned first half exceeds about 94% of critical speed).
8. **Validation targets:** the injury proportions in §6.3; 16-week
   recreational gains of 3–6%; a strict taper worth 2–3% over none; and
   Riegel at least 10 minutes optimistic for half of first-time marathoners.

---

## 7. A year ending in a marathon, while still lifting

**Evidence vs convention.** The _direction_ of each rule below comes from
evidence (§4.9–4.11). The _specific calendar_ is coaching **CONVENTION**:
there is no trial of a 52-week hybrid marathon plan.

### 7.1 Phases for persona B (adaptable)

| Weeks                               | Running emphasis                                                                                              | Running dose (indicative)                                                     | Lifting emphasis                                                                                        | Lifting dose                                                                                                                                  | Basis                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1–12, base I                        | Consistency, easy volume, strides, hill sprints, one fartlek or steady run a week                             | 4 runs; 30 → 40 km a week; long run 12 → 16 km (time-based; single-run guard) | **Build**: hypertrophy and strength. The best lifting window of the year.                               | 3 sessions a week (2 full-body with lower-body emphasis, 1 upper); 3–4 sets of 6–12 reps                                                      | Interference is small at moderate running volume (Wilson 2012 [V]); guard from Frandsen 2025 [V] |
| 13–24, base II                      | Hill repeats, then threshold (cruise intervals), one quality session a week                                   | 4–5 runs; 40 → 48 km; long run 16 → 22 km                                     | **Max strength**: heavy 3–6 reps; low-volume plyometrics                                                | 2 lower-body sessions + 1 upper a week                                                                                                        | Heavy loads give the best economy effect (Eihara 2022; Llanos-Lagos 2024 [V])                    |
| 25–32, half-marathon block          | Threshold + VO2 intervals; **tune-up half marathon at about week 30–32** as the benchmark for marathon pacing | 5 runs; 48 → 55 km; long run to 24–26 km                                      | **Strength maintenance-plus**                                                                           | 2 heavy sessions a week, 2–3 sets, leg sessions on hard-run days                                                                              | Maintenance evidence (Spiering 2021; Bickel 2011 [R]); placement is CONVENTION                   |
| 33–48, marathon-specific (16 weeks) | Marathon-pace runs, race-pace long runs every 2–3 weeks, threshold, a cutback every 3–4 weeks                 | 5 runs; 55 → about 60–65 km peak; long run to 30–32 km or about 3 h           | **Maintenance**                                                                                         | 1–2 sessions a week; heavy (about RPE 7–8, 2–3 reps short of failure); no new exercises; deload lifting in the same weeks as running cutbacks | Rønnestad 2010; Bickel 2011 [R]; CONVENTION                                                      |
| 49–51, taper                        | Volume −40–60% over 2–3 weeks; keep intensity and the number of runs                                          | 5 shorter runs                                                                | Last heavy lower-body session about 10 days out; light upper-body and mobility until about 4–5 days out | Minimal                                                                                                                                       | Running: Bosquet 2007 (STRONG); Smyth & Lawlor 2021 (MODERATE) [V]. Lifting: CONVENTION          |
| 52, race and after                  | Race; then 1–2 weeks easy or off                                                                              | —                                                                             | Resume after about a week; the next cycle starts with a strength-emphasis block                         | —                                                                                                                                             | CONVENTION                                                                                       |

### 7.2 Placing the leg session

**Evidence.** Leave at least 6 hours between a hard lift and a hard run, and
ideally 24 hours (Robineau 2016 [V]). In a combined session, the first item is
the one that benefits (Murlasits 2018 [V]). Explosive strength suffers most in
same-session pairings (Schumann 2022 [V]). A leg session impairs running
economy for 6–24 hours afterwards (Doma [R]).

**Convention.** "Hard days hard, easy days easy": put heavy lower-body work on
the **same day as a quality run**, run first, then lift at least 6 hours later
or straight after the run if time forces it. Keep heavy legs **at least
48 hours before the long run** and before race-pace long runs. Never do heavy
legs the day before a key run.

**The trade-off.** Robineau found 24 h of separation best for adaptation.
Stacking on the same day protects the easy days. **Tropos should show this
trade-off and let the stated priority decide** (the handoff's "coordinate
strength work" rule):

- Running priority: stack the lift on quality days, run first.
- Lifting priority (base phase): lift first, or on a separate day, with the
  next quality run at least 24 hours later.

### 7.3 Example weeks

**4 runs + 2 lifts (base phase)**

| Day | Session                                                                                      |
| --- | -------------------------------------------------------------------------------------------- |
| Mon | Rest or mobility                                                                             |
| Tue | Quality run (fartlek, then hills, then cruise intervals); lower-body heavy lift that evening |
| Wed | Upper-body lift                                                                              |
| Thu | Easy run + strides                                                                           |
| Fri | Rest                                                                                         |
| Sat | Long run                                                                                     |
| Sun | Easy run + hill sprints                                                                      |

**5 runs + 2 lifts (marathon-specific phase)**

| Day | Session                                                       |
| --- | ------------------------------------------------------------- |
| Mon | Rest, or an upper-body lift                                   |
| Tue | Threshold run; lower-body maintenance lift at least 6 h later |
| Wed | Easy run                                                      |
| Thu | Marathon-pace run or medium-long run                          |
| Fri | Easy run + strides; light upper-body or core work             |
| Sat | Rest                                                          |
| Sun | Long run or race-pace long run                                |

**3 runs + 3 lifts (busy hybrid)**

| Day | Session                                  |
| --- | ---------------------------------------- |
| Mon | Lower-body heavy lift                    |
| Tue | Easy run + strides                       |
| Wed | Upper-body lift                          |
| Thu | Quality run (72 h after the leg session) |
| Fri | Full-body light lift (upper-biased)      |
| Sat | Long run                                 |
| Sun | Rest                                     |

All three templates are **CONVENTION**. Each is consistent with the spacing
evidence.

### 7.4 What the lifting looks like

Two to four heavy multi-joint lower-body movements: squat or deadlift
variants, split squats or step-ups, and calf and soleus work. Low-volume
plyometrics (hops, bounds, pogo jumps) in the base phases. Upper-body work as
desired.

During heavy running weeks, stop 2–3 reps short of failure, and avoid new or
very eccentric-heavy exercises within about 3 days of a key run (CONVENTION,
to limit soreness). The effective doses come from the trials (§4.9). Exercise
selection is convention.

### 7.5 What to tell the user

"During the marathon-specific weeks your lifting goal is to hold your
strength, not set new records. The months before and after the marathon are
where your lifting moves forward."

This is honest (§4.10–4.11) and fits the dual-ontology scheduler: lifts are
split-ordered and runs are date-pinned (ADR-0002).

---

## 8. Non-adoptions: tempting rules the evidence does not support as universal defaults

| Tempting rule                                                                      | Why it is not a universal default                                                                                         | What to do instead                                                                                                                                                             | Sources                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| **The 10% weekly rule**                                                            | Its only RCT found no injury benefit. Week-to-week change was not associated with injury in 5,205 runners.                | Guard single sessions against the longest run of the previous 30 days. Show weekly change as context. Label the guard a heuristic.                                             | Buist 2008; Frandsen 2025 [V]                                    |
| **An ACWR "sweet spot" (0.8–1.3) as an injury predictor**                          | Mathematical coupling, arbitrary time windows, and ACWR spikes that looked _protective_ in the big running cohort.        | Advisory copy at most. Never a red risk number. `trainingLoad.ts` already calls its ramp line a heuristic; consider retiring the ratio wording.                                | Impellizzeri 2020; Frandsen 2025 [V]                             |
| **Strict 80/20 enforcement**                                                       | The split differences are small. Recreational trials show both models working.                                            | Protect easy days, explain why, and show the distribution as information.                                                                                                      | Oliveira 2024; Muñoz 2014; Festa 2020 [V]; Rosenblat 2025 (repo) |
| **Heart-rate zones from 220 − age**                                                | About ±10 bpm of individual error.                                                                                        | Measured or field-tested HRmax or threshold heart rate, with a talk-test and RPE fallback.                                                                                     | Tanaka 2001 [R]                                                  |
| **MAF "180 − age"**                                                                | Not validated.                                                                                                            | Talk test or a measured VT1 or heart rate.                                                                                                                                     | [R]                                                              |
| **"Zone 2" as uniquely effective**                                                 | Not supported for the general population.                                                                                 | Say "easy" and explain it honestly.                                                                                                                                            | Storoschuk 2025 [R]                                              |
| **A mandatory 20-mile run, or a universal 16-mile cap**                            | The sources disagree. The association evidence compares cohorts. Time on feet matters more than miles for slower runners. | Cap the long run by **time** (Tropos already uses 150 minutes), adjust by experience, apply the single-run guard. Surface Hansons vs Higdon as a choice only if users want it. | Hansons [V]; Higdon [V2]; Doherty 2020 [V]                       |
| **Long run as a fixed percentage of weekly volume**                                | Coaching convention only. It breaks down for 3-day runners.                                                               | Time cap + single-run guard + training age.                                                                                                                                    | Daniels [R]                                                      |
| **A fixed taper template**                                                         | Pooled evidence gives ranges, not one recipe.                                                                             | 2–3 weeks, volume −40–60%, intensity and frequency kept, plus a short explanation.                                                                                             | Bosquet 2007; Smyth & Lawlor 2021 [V]; Wang 2023 (repo)          |
| **"Strength training prevents running injuries"**                                  | The running RCT was null (with low adherence). The positive meta-analysis is mostly other sports.                         | Offer strength for performance and general health. Do not promise injury protection.                                                                                           | Toresdahl 2020 [V]; Lauersen 2014 [R]                            |
| **Stretching to prevent injury**                                                   | No effect in a meta-analysis.                                                                                             | Optional for comfort and mobility.                                                                                                                                             | Lauersen 2014 [R]                                                |
| **A universal cadence target of 180**                                              | Raising step rate 5–10% reduces joint loading for some runners, but there is no universal number.                         | Display cadence as a metric only (roadmap A10).                                                                                                                                | Heiderscheit 2011 [R]                                            |
| **Shoes prescribed by pronation or foot type**                                     | Pronation in neutral shoes was not linked to injury.                                                                      | Comfort-based choice; mileage tracking only.                                                                                                                                   | Nielsen 2014 (BJSM) [R]                                          |
| **Race predictions shown as promises**                                             | Riegel and VDOT are optimistic at the marathon for recreational runners; equation errors range widely.                    | Ranges, mileage-aware widening, and the reason shown.                                                                                                                          | Vickers 2016; Keogh 2019 [V]                                     |
| **Cycle-phase programming for every woman**                                        | Effects are trivial on average.                                                                                           | Optional symptom logging and user-chosen adjustments.                                                                                                                          | McNulty 2020 [R]                                                 |
| **Readiness scores or HRV "go/no-go"**                                             | Modest benefits in small trials; the precision is spurious.                                                               | Signals in, one factual reason out (the existing easierToday register).                                                                                                        | Vesterinen 2016; Kiviniemi 2007 [R]; roadmap §3                  |
| **Double threshold days, special blocks or lactate-guided training for consumers** | Elite methods at 140–220 km a week with lactate meters.                                                                   | Borrow only the idea that sub-threshold intervals are a sustainable format (cruise intervals).                                                                                 | Casado 2023; Tjelta 2019 [V]; Canova [V2]                        |
| **"Never two hard days in a row" as an absolute law**                              | Hansons' cumulative-fatigue model and the Norwegian double-threshold days are deliberate exceptions.                      | Keep it as the recreational default (CONVENTION) and allow exceptions for experienced users.                                                                                   | Hansons [V]; Casado 2023 [V]                                     |
| **Age-based caps on intensity for masters runners**                                | No evidence. Trainability is broadly preserved.                                                                           | Individualise by history and recovery.                                                                                                                                         | Tanaka & Seals 2008 [R]                                          |
| **Formulas that boost the dose from a fitness score alone**                        | Already non-adopted in the handoff. Gains depend on exposure, consistency and response.                                   | An exposure model with provenance (RUN-EV-04).                                                                                                                                 | Handoff                                                          |
| **Catching up missed quality work**                                                | Already non-adopted in the handoff.                                                                                       | Keep, move, drop or replace with something easier.                                                                                                                             | Handoff                                                          |

---

## 9. Gaps, and what to verify before shipping numbers

Searches were capped before these could be done, so they are **open**:

1. **Re-verify every [R] row**, especially the numbers the generator or copy
   would encode:
   - Daniels' caps (T no more than 10% of weekly volume; I no more than 10 km;
     long run no more than the lesser of 25–30% or 150 minutes; marathon-pace
     runs no more than 110 minutes or 18 miles).
   - The minimum-dose findings (Spiering 2021; Bickel 2011; Rønnestad 2010).
   - Hottenrott 2016 (run-walk).
   - The talk-test papers.
   - The Olympiatoppen zone percentages.
   - The Banister parameter ranges.
   - The Doma & Deakin details.
2. **Frandsen 2025.** Read the full text (PMC12421110): the confidence
   intervals for each spike category, how injury was defined, whether the
   result holds for novices, and the reference category.
3. **The 2022–2026 book sweep did not happen.** Search publisher catalogues
   (Human Kinetics, VeloPress, Penguin) for new running-programming editions
   and hybrid-training books.
4. **No source was found on beginner adherence and dropout** (Couch to 5K
   completion rates, how long people stay with an app plan). The simulation
   should treat this as its largest unknown and sweep it.
5. **There is no direct trial of strides**; the support is indirect only. A
   targeted search (for example "strides" + "running economy" + RCT) may find
   small studies.
6. **Long-term (26–52-week) improvement data in recreational runners is
   missing.** Look for Strava or Garmin longitudinal analyses (Smyth et al.;
   the Emig & Peltonen follow-ups) and parkrun first-timer improvement curves.
7. **Severity and time-loss distributions for running injuries** were not
   found; the §6.3 assumption needs a source.
8. **ISBNs** to verify: _Running to the Top_, _The Happy Runner_,
   _The Hybrid Athlete_, _Run Like a Pro_; confirm _Lore of Running_ 4th ed.
   and _Training for the Uphill Athlete_.
9. **Heat-adjustment magnitudes** (Ely 2007; El Helou 2012; and Mantzios et al.
   2022 in _MSSE_, recalled [R] and not yet in the ledger) need exact slopes
   before any heat-adjusted pace band ships (roadmap B2).

---

## Appendix A. Computed reference values [C]

These come from the Daniels–Gilbert 1979 equations:

- VO₂(v) = −4.60 + 0.182258·v + 0.000104·v² (v in m/min)
- %VO₂max(t) = 0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t)
  (t in minutes)

The script is `harnesses/vdot_calc.py.txt` in this folder. The equations reproduce the
published VDOT tables to within a few seconds; for example VDOT 40 gives a
5K of 24:06 against the book's 24:08. **Compare with `runPaces.ts` before
using any of these.**

**Race equivalents by VDOT**

| VDOT | 5K    | 10K     | Half    | Marathon |
| ---- | ----- | ------- | ------- | -------- |
| 25   | 35:39 | 1:14:15 | 2:43:54 | 5:34:14  |
| 28   | 32:29 | 1:07:36 | 2:29:32 | 5:06:02  |
| 30   | 30:41 | 1:03:49 | 2:21:17 | 4:49:49  |
| 33   | 28:20 | 58:54   | 2:10:31 | 4:28:34  |
| 35   | 26:59 | 56:02   | 2:04:13 | 4:16:06  |
| 38   | 25:10 | 52:15   | 1:55:51 | 3:59:30  |
| 40   | 24:06 | 50:01   | 1:50:54 | 3:49:37  |
| 41   | 23:36 | 48:58   | 1:48:35 | 3:45:00  |
| 42   | 23:08 | 47:58   | 1:46:22 | 3:40:33  |
| 43   | 22:40 | 47:01   | 1:44:14 | 3:36:17  |
| 44   | 22:14 | 46:06   | 1:42:12 | 3:32:12  |
| 44.5 | 22:01 | 45:40   | 1:41:12 | 3:30:13  |
| 45   | 21:49 | 45:13   | 1:40:14 | 3:28:16  |
| 46   | 21:24 | 44:23   | 1:38:21 | 3:24:29  |
| 48   | 20:38 | 42:48   | 1:34:48 | 3:17:19  |
| 50   | 19:56 | 41:20   | 1:31:31 | 3:10:40  |

**Anchor VDOTs:**

| Performance                   | VDOT |
| ----------------------------- | ---- |
| 10K 50:00                     | 40.0 |
| Marathon 3:45:00              | 41.0 |
| Marathon 3:30:00              | 44.6 |
| 5K 25:00                      | 38.3 |
| 5K 30:00                      | 30.8 |
| 5K 32:00                      | 28.5 |
| 5K 35:00                      | 25.6 |
| 5K 36:00                      | 24.7 |
| 5K 40:00                      | 21.7 |
| Half 1:36                     | 47.3 |
| Half 1:38                     | 46.2 |
| Half 1:40                     | 45.1 |
| Half 1:45                     | 42.6 |
| 10K 39:18 (Muñoz 2014 cohort) | 53.0 |

**Illustrative training paces** (E at 62–70% of the VDOT oxygen cost; T at 88%;
I at 97.5%; R at 106%)

| VDOT | E (per km) | M    | Half | T    | 10K  | 5K   | I    | R    |
| ---- | ---------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| 25   | 8:47–9:36  | 7:55 | 7:46 | 7:23 | 7:25 | 7:08 | 6:49 | 6:23 |
| 30   | 7:39–8:23  | 6:52 | 6:42 | 6:24 | 6:23 | 6:08 | 5:54 | 5:31 |
| 35   | 6:47–7:28  | 6:04 | 5:53 | 5:40 | 5:36 | 5:24 | 5:13 | 4:53 |
| 40   | 6:07–6:44  | 5:27 | 5:15 | 5:06 | 5:00 | 4:49 | 4:41 | 4:23 |
| 45   | 5:34–6:08  | 4:56 | 4:45 | 4:38 | 4:31 | 4:22 | 4:16 | 3:59 |
| 50   | 5:07–5:38  | 4:31 | 4:20 | 4:15 | 4:08 | 3:59 | 3:55 | 3:39 |

At VDOT 25–30 the computed T pace is within a few seconds of 10K race pace. At
VDOT 25 it is even slightly faster (7:23 against 7:25/km). This follows from
the definition: T is "about what you could race for an hour", and for these
runners a 10K takes longer than an hour. It is not a bug. For slow runners,
make "comfortably hard" effort the primary cue and treat the T pace as a
ceiling.

**Riegel from a 10K of 50:00:** 5K 23:59, half 1:50:19, marathon 3:50:01.

**Tanda 2011 marathon predictions** (K = weekly km over the last 8 weeks,
P = mean training pace)

| K (km/week) | P (/km) | Predicted marathon pace | Predicted marathon |
| ----------- | ------- | ----------------------- | ------------------ |
| 30          | 6:30    | 5:51/km                 | 4:06:51            |
| 45          | 6:15    | 5:34/km                 | 3:54:38            |
| 50          | 6:00    | 5:23/km                 | 3:46:48            |
| 55          | 6:00    | 5:20/km                 | 3:44:50            |
| 60          | 5:50    | 5:11/km                 | 3:39:02            |
| 65          | 5:50    | 5:09/km                 | 3:37:10            |
| 70          | 5:40    | 5:01/km                 | 3:31:28            |
| 80          | 5:30    | 4:50/km                 | 3:24:06            |

Tanda's formula was fitted to 2:47–3:36 marathoners, so values outside that
band are extrapolations.

**Banister single-impulse timing:** see the table in §6.2.

---

## Appendix B. Copy-ready session lines (drafts for `runSessionExplainer.ts` and labels)

These are plain-English, one-to-two-sentence drafts. They contain no safety
promises and no physiology measurements. Check them against the house voice in
`CODING_STANDARDS.md` before shipping.

| Session            | Short label             | What it is                                                                                   | Why it's in your plan                                                                    |
| ------------------ | ----------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Easy               | Easy run                | Relaxed running; you can talk in full sentences.                                             | Builds the aerobic base everything else depends on, and keeps you fresh for harder days. |
| Recovery           | Recovery jog            | A short, very gentle run. Walk breaks are fine.                                              | Keeps you moving after a hard day without adding fatigue. A rest day is a fine swap.     |
| Long               | Long run                | Your longest run of the week, at an easy, chatty effort.                                     | Builds endurance. Time on your feet matters more than speed.                             |
| Medium-long        | Midweek longer run      | A longer-than-usual easy run in the middle of the week.                                      | Adds endurance without a second long run.                                                |
| Steady             | Steady run              | Brisk but controlled; quicker than easy.                                                     | A step up in effort without being a hard workout.                                        |
| Marathon pace      | Race-pace run           | Running at the pace you plan to hold on race day.                                            | Teaches your body, breathing and fuelling what race pace feels like.                     |
| Tempo              | Tempo run               | A sustained "comfortably hard" effort; you could say a few words.                            | Trains you to hold a strong pace for longer.                                             |
| Cruise intervals   | Threshold repeats       | Comfortably hard chunks with short jogs between.                                             | More time at a strong effort with less strain than one long push.                        |
| VO2max intervals   | Hard intervals          | Hard repeats of a few minutes, with easy jogs between.                                       | Stretches the top end of your aerobic fitness.                                           |
| Repetitions        | Speed reps              | Short, fast repeats with full rest.                                                          | Smooth, quick running and better form at speed.                                          |
| Strides            | Strides                 | 4–8 smooth 20-second bursts at the end of an easy run, fast but relaxed, with full recovery. | Practise fast, efficient form without getting tired.                                     |
| Hill sprints       | Hill sprints            | 8–10-second all-out bursts up a steep hill, with full rest.                                  | Builds power with less pounding than flat sprinting.                                     |
| Hill repeats       | Hill repeats            | Hard efforts up a hill, jogging back down.                                                   | Hard work with less impact; judge by effort, not pace.                                   |
| Fartlek            | Fartlek ("speed play")  | Faster bursts whenever you feel like it during a run, then ease back.                        | A relaxed way to add speed.                                                              |
| Progression        | Progression run         | Start easy and finish comfortably hard.                                                      | Practise finishing strong without overdoing it.                                          |
| Race-pace long run | Long run with race pace | A long run with a section at goal race pace near the end.                                    | Rehearses race day on tired legs: pace, fuel and focus.                                  |
| Shakeout           | Shakeout                | 10–25 very easy minutes before a race.                                                       | Loosens you up and settles nerves; it won't add fitness.                                 |
| Run-walk           | Run-walk                | Alternating running and walking from the start.                                              | Covers more distance with less strain. A real method, not giving up.                     |
| Time trial         | Fitness check           | A timed best effort, such as a mile or a 5K.                                                 | Sets your training paces. Run it fresh, flat and in mild weather.                        |

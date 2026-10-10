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

**Verification pass (2026-10-07).** All 120 sources then in the ledger were
checked (rows added since carry their own markers) against PubMed, Europe PMC full text, Crossref, the publisher, or the book or
web page itself, and a second agent re-checked 146 claims. Across all claims,
341 were confirmed, 131 corrected and 38 unsupported, and 41 could not be
checked. The main corrections:

- Frandsen 2025: the HRRs for a first overuse injury after a run more than
  10–30%, 30–100% and 100% longer than the longest of the previous 30 days
  hold, at 1.64 (95% CI 1.31–2.05), 1.52 (1.16–2.00) and 2.28 (1.50–3.48). But
  the paper measured distance only and gives no novice estimate; a duration
  bound is a Tropos extrapolation.
- Daniels caps the long run at 30% of weekly mileage below 64 km a week, and at
  the lesser of 25% or 150 minutes from 64 km a week.
- The computed VDOT E bands run about 11–12 s/km slower than Daniels' table at
  their fast end and 4–9 s/km at their slow end; T pace matches the table.
- Taper: Bosquet 2007 supports 8–14 days with volume cut by 41–60%; the 3-week
  end rests on Wang 2023 and Smyth & Lawlor 2021, whose 2.6% is against a
  relaxed 1-week taper, not none.
- Vickers & Vertosick 2016 tested Riegel at k = 1.07, never VDOT, in
  recreational runners rather than first-time marathoners, and its low-mileage
  correction has no volume or long-run threshold.
- Smyth & Muniz-Pumares 2020: running 2–16 km above 94% of critical speed
  modestly raised the share who slowed by more than 25% over the last 12.2 km
  (men 20.5% to 26.0%, women 9.6% to 15.6%); it does not predict a collapse.
- Strength: Blagrove 2018's 2–8% economy gain covers every strength modality.
  "Heavy beats plyometrics" has no formal comparison behind it: Eihara 2022's
  point estimates favour heavy loads, and Llanos-Lagos 2024's economy
  meta-analysis found heavy loads significant across speeds and plyometrics
  only at 12 km/h or slower, with combined methods largest. Heavy loads are at
  least as effective as plyometrics, and likely better at faster speeds.
- Easy effort: NHS Couch to 5K does not use the talk test, and Persinger 2004
  has no five-level talk-test scale; its comfortable speech sits at or just
  below VT1.

Of the 41, these load-bearing claims stay unverified ([U]; do not encode
them): Seiler 2010's three-zone model; Foster 2008 on the talk test's equivocal
point; Reed & Pipe 2014's talk-test levels; Tanaka & Seals on masters runners'
trainability and on age-based intensity caps; Pfitzinger's stride prescription;
the Banister parameter ranges as cited to Clarke & Skiba and Morton 1990 (§6.2
now takes its ranges from the Peng 2023 collection instead [C]);
Milanović 2015's "6–12 weeks"; Wilson 2012's "small at moderate running
volume".

---

## 0. Read this first: how the evidence was gathered and how far to trust it

**How the evidence was gathered.** The first draft was written on 2026-10-06,
while the organisation's egress policy blocked WebFetch and shell access to
PubMed, PMC, Europe PMC, Crossref, Semantic Scholar, every publisher site tried
(Springer, BMJ, Frontiers, MDPI, Wiley, LWW, Human Kinetics), Wikipedia, nhs.uk
and every coaching site tried. No full text or abstract page was opened then.
The draft rested on abstract and summary text from about 70 web searches, and
on recall once the web-search cap (200 searches per turn, shared by every agent
running in parallel) was reached. On 2026-10-07 the sources themselves were
read: the full text where it was open (PMC and Europe PMC, J-STAGE, HAL and
author-hosted PDFs), and otherwise the PubMed abstract, Crossref record,
publisher page, the book, or the web page (NHS, coaching sites). A few sites
stayed blocked, among them journals.physiology.org, Springer and
journals.lww.com. A paywalled paper was checked against its abstract, and a
claim the abstract does not state is marked [U].

**Verification markers** (on every source and on load-bearing numbers):

| Marker | Meaning                                                                                                                                                                                                                                                                           |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [VF]   | Checked against the full text on 2026-10-07.                                                                                                                                                                                                                                      |
| [VA]   | Checked against the abstract, or the book or web page itself, on 2026-10-07.                                                                                                                                                                                                      |
| [U]    | The source was identified, but this claim could not be checked: the paper is paywalled, or the abstract does not state it.                                                                                                                                                        |
| [R]    | Still not identified or not checked. Do not encode it.                                                                                                                                                                                                                            |
| [C]    | Computed by this doc's own script from a published formula: the Daniels–Gilbert VDOT equations, Riegel at the usual calculator exponent of 1.06, Tanda 2011 and the Banister model. The script is `harnesses/vdot_calc.py.txt` in this folder, and the outputs are in Appendix A. |

These replace the first draft's markers, which recorded search snippets, a
secondary source and recall. [R] no longer means recalled.

**Evidence grades** (on claims): **STRONG** means meta-analyses or consistent
RCTs. **MODERATE** means some RCTs or a large well-run cohort, with caveats.
**WEAK** means a single small study, indirect evidence or expert opinion.
**CONVENTION** means coaching practice with no trial behind it.

**Population caveat.** Most training trials recruit trained or club-level
"recreational" runners who are much fitter than Tropos's users. Muñoz et al.
2014's "recreational" group started at a 10K of 39:18–39:24 [VA], which is
VDOT ≈ 53 [C]. Festa 2020 is the exception: its runners averaged 13.8–13.9 km/h
over a 2 km time trial [VF], which is VDOT ≈ 42 [C]. Tropos's typical user is
VDOT 25–45. Evidence for beginners and intermediates is mostly extrapolated,
and this document says so wherever that happens.

---

## 1. Source ledger

Rows marked "(repo)" are already in the running handoff and are listed only for
completeness. The bracketed marker in the Source column shows how the source was
checked; it is not part of the citation.

| Source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Type                                                           | Year                                       | Best product use                                                                                                                                                                                                                                                                                                                                                  | Key limitation                                                                                                                                                                                                                                                                                                                                              | Link / DOI / ISBN                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **BOOKS AND COACHING SYSTEMS**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |                                                                |                                            |                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                        |
| [VA] Daniels J. _Daniels' Running Formula_, 4th ed. (Human Kinetics)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | book                                                           | 2021 (some catalogues list 2022)           | Shared intensity vocabulary (E/M/T/I/R), purpose of each, per-session volume caps, VDOT pace engine (already in `runPaces.ts`)                                                                                                                                                                                                                                    | Paces are formula outputs that assume trained-runner economy; the caps are coaching rules, not trial results; text checked through readers' verbatim highlights of the 4th ed.                                                                                                                                                                              | ISBN 978-1-7182-0366-2 (pbk); 978-1-7182-0367-9 (ebook)                                                                                                                                                |
| [VA] Humphrey L, with Hanson K, Hanson K. _Hansons Marathon Method_, 2nd ed. (VeloPress)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | book                                                           | 1st ed. 2012; 2nd ed. 2016                 | Cumulative fatigue; 3 "SOS" days a week (speed early in the plan, then strength; a goal-pace tempo; the long run); a long-run cap set by time, not distance                                                                                                                                                                                                       | Assumes about 6 running days a week; the 16-mile cap is untested against plans with 20-mile runs; checked through the publisher's preview and the author's own articles                                                                                                                                                                                     | ISBN 978-1-937715-48-9 (1st ed.: 978-1-934030-85-1)                                                                                                                                                    |
| [VA] Fitzgerald M. _80/20 Running_ (Berkley/NAL)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | book                                                           | 2014                                       | Plain words for "most running easy"; the ventilatory threshold (VT1 in other sources) as the ceiling for easy running                                                                                                                                                                                                                                             | Turns a description of elite training into a prescription; the 80/20 split itself is not trial-proven for novices; text checked through readers' verbatim highlights                                                                                                                                                                                        | ISBN 978-0-451-47088-1                                                                                                                                                                                 |
| [VA] Hudson B, Fitzgerald M. _Run Faster from the 5K to the Marathon_ (Broadway)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | book                                                           | 2008                                       | Hill sprints (maximal, 8–10 s, full recovery) as cheap neuromuscular work; adaptive (responsive) planning [U]; specific-endurance progression                                                                                                                                                                                                                     | Coach-authored, with little trial support; the book's text was not reached                                                                                                                                                                                                                                                                                  | ISBN 978-0-7679-2822-9                                                                                                                                                                                 |
| [VA] Higdon H. Marathon Novice 1 plan (halhigdon.com; TrainingPeaks plan tp-139218)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | coach plan                                                     | current                                    | Benchmark for the most-used [U] beginner marathon plan: 18 weeks, 4 runs and 1 cross-training day, no speedwork, peak of one 20-mile run                                                                                                                                                                                                                          | Mileage only, one size fits all, no individual progression                                                                                                                                                                                                                                                                                                  | halhigdon.com; trainingpeaks.com/training-plans/running/marathon/tp-139218/hal-higdon-marathon-novice-1                                                                                                |
| [VA] Galloway J. Run Walk Run method; "Magic Mile" (jeffgalloway.com)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | coach system                                                   | 1970s–present                              | Run:walk ratios by pace (the current chart gives them in seconds, e.g. 90/30 at 9:30–10:45 /mile); a 1-mile benchmark; treats walking as a legitimate method                                                                                                                                                                                                      | The ratios and the claimed time savings are the author's own; primary validation is thin                                                                                                                                                                                                                                                                    | jeffgalloway.com/training/run-walk/; jeffgalloway.com/training/magic-mile/                                                                                                                             |
| [VA] NHS Better Health. _Couch to 5K_ (landing page and week-by-week plan)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | public-health plan                                             | current                                    | 9 weeks × 3 sessions, run-walk progression, rest days between                                                                                                                                                                                                                                                                                                     | Ends at 30 minutes of continuous running, which the NHS copy equates with 5K; at easy pace that is about 2.8–3.8 km for typical novices (VDOT 20–30) [C]. The NHS cites no outcome data                                                                                                                                                                     | nhs.uk/better-health/get-active/get-running-with-couch-to-5k/ (plan: .../couch-to-5k-running-plan/)                                                                                                    |
| [VA] Lydiard A, Gilmour G. _Running to the Top_ (Meyer & Meyer Sport); orig. _Run to the Top_ (Herbert Jenkins, 1962)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | book                                                           | 1997                                       | Phase order: aerobic base (including fast aerobic running just under "steady state"), then hills (4–6 weeks), then at most about 4 weeks anaerobic, then coordination and races, then taper                                                                                                                                                                       | Elite and club context, high volume, historical; the book's text was not reached, so the phases were checked against Lydiard's own 1999 lecture guide and secondary accounts                                                                                                                                                                                | ISBN 3-89124-440-1 (978-3-89124-440-1)                                                                                                                                                                 |
| [VA] Canova R. Marathon "special block" and specific-period methodology (primary: Arcelli E, Canova R. _Marathon Training: A Scientific Approach_, IAAF, 1999; summarised by Fast Running and RunnersConnect)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | coach                                                          | 2000s–                                     | "Funnel" toward race pace (e.g. 90–110% of marathon pace narrowing to 95–105%); race-specific volume rises late in the build                                                                                                                                                                                                                                      | Elite Kenyan and Italian marathoners; no trials; **not** a recreational default; the funnel figures come from the RunnersConnect page                                                                                                                                                                                                                       | fastrunning.com/training/marathon-training/building-special-blocks/33861; runnersconnect.net/special-block-training/                                                                                   |
| [U] Vigil JI. _Road to the Top: A Systematic Approach to Training Distance Runners_ (Morning Star Communications)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | book                                                           | 1995                                       | Patient aerobic development; long-term athlete development                                                                                                                                                                                                                                                                                                        | Out of print; collegiate and elite runners                                                                                                                                                                                                                                                                                                                  | ISBN 1-880047-34-9 (978-1-880047-34-7)                                                                                                                                                                 |
| [VA] Roche D, Roche M. _The Happy Runner: Love the Process, Get Faster, Run Longer_ (Human Kinetics)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | book                                                           | 2019                                       | Strides and hill strides as frequent, low-cost neuromuscular work                                                                                                                                                                                                                                                                                                 | Coach opinion; checked through the authors' own plans and interviews, not the book text                                                                                                                                                                                                                                                                     | ISBN 978-1-4925-6764-6                                                                                                                                                                                 |
| [VA] Noakes T. _Lore of Running_, 4th ed. (Human Kinetics)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | book                                                           | 2003                                       | History; "laws of training" (alternate hard and easy, train gently, rest before racing, keep a log)                                                                                                                                                                                                                                                               | 2003 physiology; its central-governor framing is contested; the laws (ch. 5) were checked through secondary sources                                                                                                                                                                                                                                         | ISBN 978-0-87322-959-3                                                                                                                                                                                 |
| [VA] House S, Johnston S, Jornet K. _Training for the Uphill Athlete: A Manual for Mountain Runners and Ski Mountaineers_ (Patagonia)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | book                                                           | 2019                                       | Aerobic base; strength for endurance. The heart-rate-drift check of aerobic threshold is on the authors' website, not in the book                                                                                                                                                                                                                                 | Written for mountain runners and ski mountaineers; "aerobic deficiency syndrome" is not validated                                                                                                                                                                                                                                                           | ISBN 978-1-938340-84-0; drift test: uphillathlete.com/aerobic-training/heart-rate-drift/                                                                                                               |
| [VA] McMillan Running pace calculator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | coach tool                                                     | online                                     | Race equivalents and pace zones; a benchmark for Tropos predictions                                                                                                                                                                                                                                                                                               | Proprietary, with no published validation                                                                                                                                                                                                                                                                                                                   | mcmillanrunning.com                                                                                                                                                                                    |
| [VA] Viada A. _The Hybrid Athlete_ (Juggernaut Training Systems); successor _The Ultimate Hybrid Athlete_ (Victory Belt, 2025)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | book                                                           | 2015                                       | How a practitioner schedules lifting alongside running                                                                                                                                                                                                                                                                                                            | Not peer reviewed                                                                                                                                                                                                                                                                                                                                           | No ISBN (ebook sold by JTS: shop.jtsstrength.com/products/the-hybrid-athlete); 2025 book ISBN 978-1-62860-562-4                                                                                        |
| [VA] Fitzgerald M, Rosario B. _Run Like a Pro (Even If You're Slow): Elite Tools and Tips for Runners at Every Level_ (Berkley)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | book                                                           | 2022                                       | Elite-style structure scaled down for amateurs                                                                                                                                                                                                                                                                                                                    | Coach opinion                                                                                                                                                                                                                                                                                                                                               | ISBN 978-0-593-20191-6                                                                                                                                                                                 |
| [VF] Maffetone P. MAF "180 Formula" (180 − age, adjusted by −10 to +5 for health and training history; the result is the top of a 10-bpm range). Described in Maffetone P, Laursen PB. "Maximum Aerobic Function: Clinical Relevance, Physiological Underpinnings, and Practical Application." _Front Physiol_ 11:296 (2020)                                                                                                                                                                                                                                                                                                                                                                                                                     | coach heuristic                                                | 1980s–                                     | Cited **only as a non-adoption** (§8)                                                                                                                                                                                                                                                                                                                             | No validation                                                                                                                                                                                                                                                                                                                                               | philmaffetone.com/180-formula/; PMID 32300310; doi:10.3389/fphys.2020.00296                                                                                                                            |
| (repo) [VA] Magness 2014; Pfitzinger & Latter 2015; Pfitzinger & Douglas 2020                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | books                                                          | —                                          | See the handoff                                                                                                                                                                                                                                                                                                                                                   | A 4th ed. of _Advanced Marathoning_ (Human Kinetics, ©2026, ISBN 978-1-7182-3747-6) has replaced the 3rd; the 3rd's print ISBN is 978-1-4925-6866-7                                                                                                                                                                                                         | handoff lines 61–65                                                                                                                                                                                    |
| **INTENSITY DISTRIBUTION**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |                                                                |                                            |                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                        |
| [VA] Seiler S. "What is best practice for training intensity and duration distribution in endurance athletes?" _IJSPP_ 5(3):276–91                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | narrative review                                               | 2010                                       | The 3-zone model [U] (the abstract names no VT1 or VT2; Seiler & Kjerland 2006, the next row, does); "about 80% of sessions low" as a description of elite practice; extra HIIT in well-trained athletes shows no proven long-term gain                                                                                                                           | Describes elite endurance athletes in general, not runners; counts sessions, not volume                                                                                                                                                                                                                                                                     | PMID 20861519; doi:10.1123/ijspp.5.3.276                                                                                                                                                               |
| [VA] Seiler & Kjerland. _Scand J Med Sci Sports_ 16:49–56                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | study                                                          | 2006                                       | Uses VT1 and VT2 to define three intensity zones, the primary source for the 3-zone model                                                                                                                                                                                                                                                                         | Cited only for the zone definitions; abstract read                                                                                                                                                                                                                                                                                                          | PMID 16430681                                                                                                                                                                                          |
| [VF] Stöggl T, Sperlich B. "Polarized training has greater impact on key endurance variables than threshold, high intensity, or high volume training." _Front Physiol_ 5:33                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | RCT, 4 arms                                                    | 2014                                       | Polarized had the largest VO2peak gain over 9 weeks (+11.7%), significantly more than threshold and high-volume training; on absolute VO2peak (+10.4%) it beat all three                                                                                                                                                                                          | Well-trained athletes from mixed sports; small groups                                                                                                                                                                                                                                                                                                       | PMID 24550842; doi:10.3389/fphys.2014.00033                                                                                                                                                            |
| [VA] Muñoz I et al. "Does polarized training improve performance in recreational runners?" _IJSPP_ 9(2):265–72                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | RCT                                                            | 2014                                       | Over 10 weeks both arms improved 10K (polarized −5.0%, between-thresholds −3.6%; difference not significant)                                                                                                                                                                                                                                                      | Club runners (VDOT ≈ 53 [C]); compliance problems                                                                                                                                                                                                                                                                                                           | PMID 23752040; doi:10.1123/ijspp.2012-0350                                                                                                                                                             |
| [VF] Festa L et al. "Effects of different training intensity distribution in recreational runners." _Front Sports Act Living_ 1:70                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | RCT                                                            | 2020 (online 15 Jan; vol. 1 is dated 2019) | Over 8 weeks both models improved 2 km speed by 3.0–3.5%, with no difference between them                                                                                                                                                                                                                                                                         | Short and small (38 runners, VDOT ≈ 42 [C])                                                                                                                                                                                                                                                                                                                 | PMID 33344993; doi:10.3389/fspor.2019.00070                                                                                                                                                            |
| [VA] Esteve-Lanao J, Foster C, Seiler S, Lucia A. "Impact of training intensity distribution on performance in endurance athletes." _JSCR_ 21(3):943–9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | RCT                                                            | 2007                                       | More zone-1 time (80/12/8) improved more than more zone-2 time (67/25/8) over 5 months (−157 s vs −121.5 s on a 10.4 km cross-country race)                                                                                                                                                                                                                       | 12 sub-elite runners                                                                                                                                                                                                                                                                                                                                        | PMID 17685689; doi:10.1519/R-19725.1                                                                                                                                                                   |
| [VA] Esteve-Lanao J et al. "How do endurance runners actually train? Relationship with competition performance." _MSSE_ 37(3):496–504                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | cohort                                                         | 2005                                       | Zone-1 time was strongly related to cross-country performance (r = −0.97 for the longer race)                                                                                                                                                                                                                                                                     | 8 runners                                                                                                                                                                                                                                                                                                                                                   | PMID 15741850; doi:10.1249/01.mss.0000155393.78744.86                                                                                                                                                  |
| [VF] Filipas L, Bonato M, Gallo G, Codella R. "Effects of 16 weeks of pyramidal and polarized training intensity distributions in well-trained endurance runners." _Scand J Med Sci Sports_ 32(3):498–511                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | RCT                                                            | 2022 (online 2021)                         | Pyramidal then polarized was the best sequence (−1.5% on a 5 km time trial); the four arms gained 0.6–1.5%                                                                                                                                                                                                                                                        | 60 well-trained men (5 km about 16:26–16:38); every change was below the trial's 3.2% smallest detectable change                                                                                                                                                                                                                                            | PMID 34792817; doi:10.1111/sms.14101; PMC9299127                                                                                                                                                       |
| [VA] Casado A, González-Mohíno F, González-Ravé JM, Foster C. "Training periodization, methods, intensity distribution, and volume in highly trained and elite distance runners: a systematic review." _IJSPP_ 17(6):820–33                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | systematic review                                              | 2022                                       | Elites run a pyramidal distribution in preparation and a polarized one near competition, on a hard/easy day pattern                                                                                                                                                                                                                                               | Descriptive; 10 studies                                                                                                                                                                                                                                                                                                                                     | PMID 35418513; doi:10.1123/ijspp.2021-0435                                                                                                                                                             |
| [VF] Haugen T, Sandbakk Ø, Seiler S, Tønnessen E. "The training characteristics of world-class distance runners: an integration of scientific literature and results-proven practice." _Sports Med Open_ 8:46                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | integrative review                                             | 2022                                       | ≥80% of volume at low intensity; race-pace volume rises toward competition; 7–10 day taper                                                                                                                                                                                                                                                                        | Elite only                                                                                                                                                                                                                                                                                                                                                  | PMID 35362850; doi:10.1186/s40798-022-00438-7                                                                                                                                                          |
| [VF] Casado A, Foster C, Bakken M, Tjelta LI. "Does lactate-guided threshold interval training within a high-volume low-intensity approach represent the 'next step' in the evolution of distance running training?" _IJERPH_ 20(5):3782                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | narrative review                                               | 2023                                       | Explains the Norwegian "double threshold" approach and why sub-threshold intervals buy more threshold volume                                                                                                                                                                                                                                                      | Elite, lactate-meter-guided, more than 150 km a week; no recreational trials, and the authors do not extend it to other runners                                                                                                                                                                                                                             | PMID 36900796; doi:10.3390/ijerph20053782                                                                                                                                                              |
| [VA] Tjelta LI. "Three Norwegian brothers all European 1500 m champions: what is the secret?" _Int J Sports Sci Coach_ 14(5):694–700                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | case study                                                     | 2019                                       | 140–160 km a week, 23–25% of it at and above anaerobic threshold pace; lactate measured in every interval session                                                                                                                                                                                                                                                 | n = 3 world-class runners; a corrigendum (14(6):819) was not read                                                                                                                                                                                                                                                                                           | doi:10.1177/1747954119872321 (not in PubMed)                                                                                                                                                           |
| [VF] Silva Oliveira P, Boppre G, Fonseca H. "Comparison of polarized versus other types of endurance training intensity distribution on athletes' endurance performance: a systematic review with meta-analysis." _Sports Med_ 54(8):2071–95                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | meta-analysis                                                  | 2024                                       | Polarized had a small edge on VO2peak (SMD 0.24 [0.01, 0.48]); time trials were equivalent                                                                                                                                                                                                                                                                        | Mostly trained athletes; short trials                                                                                                                                                                                                                                                                                                                       | PMID 38717713; doi:10.1007/s40279-024-02034-z; PMC11329428                                                                                                                                             |
| [VA] Rosenblat MA, Perrotta AS, Vicenzino B. "Polarized vs. threshold training intensity distribution on endurance sport performance: a systematic review and meta-analysis of randomized controlled trials." _JSCR_ 33(12):3491–500                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | meta-analysis                                                  | 2019                                       | Time-trial effect size −0.66 (−1.17 to −0.15), favouring polarized                                                                                                                                                                                                                                                                                                | Few, small trials                                                                                                                                                                                                                                                                                                                                           | PMID 29863593; doi:10.1519/JSC.0000000000002618                                                                                                                                                        |
| (repo) [VA] Campos 2022; Rosenblat 2025 network meta-analysis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | reviews                                                        | —                                          | See the handoff. Campos's general rule: at least 70% of volume at low intensity and no more than 30% at threshold plus HIIT                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                           | handoff lines 157–158; PMID 34749417 (Campos); PMID 39888556 (Rosenblat)                                                                                                                               |
| [VF] Seiler S, Tønnessen E. "Intervals, thresholds, and long slow distance…" _Sportscience_ 13:32–53                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | review                                                         | 2009                                       | A simplified Norwegian 5-zone scale (VO2, heart rate, lactate, duration), with heart-rate bands of 55–75, 75–85, 85–90, 90–95 and 95–100% HRmax                                                                                                                                                                                                                   | Anchors derived from elites. The authors say the heart-rate column is simplified from the Olympiatoppen scale, so the heart-rate guides' bands are not in this paper. The nearest published bands are Tønnessen et al. 2024, _Sports Med_, PMC11560996 (60–72, 73–82, 83–87, 88–92 and >93% HRmax), and the guides' edges do not match those exactly either | sportsci.org/2009/ss.htm (no DOI; not in PubMed)                                                                                                                                                       |
| [VA] Storoschuk KL, Moran-MacDonald A, Gibala MJ, Gurd BJ. "Much ado about zone 2: a narrative review assessing the efficacy of zone 2 training for improving mitochondrial capacity and cardiorespiratory fitness in the general population." _Sports Med_ 55(7):1611–24                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | narrative review                                               | 2025                                       | Zone 2 is not uniquely superior for mitochondrial capacity in the general population; the same for VO2max [U]                                                                                                                                                                                                                                                     | Narrative review                                                                                                                                                                                                                                                                                                                                            | PMID 40560504; doi:10.1007/s40279-025-02261-y                                                                                                                                                          |
| **VO2MAX, INTERVALS, SPEED, RESPONSE VARIABILITY**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                |                                            |                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                        |
| [VA] Helgerud J et al. "Aerobic high-intensity intervals improve VO2max more than moderate training." _MSSE_ 39(4):665–71                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | RCT                                                            | 2007                                       | 4 × 4 minutes at 90–95% HRmax raised VO2max in 8 weeks                                                                                                                                                                                                                                                                                                            | Moderately trained men                                                                                                                                                                                                                                                                                                                                      | PMID 17414804; doi:10.1249/mss.0b013e3180304570                                                                                                                                                        |
| [VF] Milanović Z, Sporiš G, Weston M. "Effectiveness of high-intensity interval training (HIT) and continuous endurance training for VO2max improvements: a systematic review and meta-analysis of controlled trials." _Sports Med_ 45(10):1469–81                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | meta-analysis                                                  | 2015                                       | Both raise VO2max substantially (+5.5 and +4.9 mL/kg/min against controls), HIIT slightly more (+1.2 mL/kg/min, "possibly small"); lower starting fitness gives larger gains                                                                                                                                                                                      | Not specific to runners; measures VO2max only; its HIIT pools sprint intervals with 90–95% HRmax intervals; publication bias in every analysis                                                                                                                                                                                                              | PMID 26243014; doi:10.1007/s40279-015-0365-0                                                                                                                                                           |
| [VF] Bacon AP, Carter RE, Ogle EA, Joyner MJ. "VO2max trainability and high intensity interval training in humans: a meta-analysis." _PLoS One_ 8(9):e73182                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | meta-analysis                                                  | 2013                                       | Size of VO2max gains from interval training                                                                                                                                                                                                                                                                                                                       | Healthy sedentary or recreationally active adults aged 18–42, about two thirds young men; programmes varied widely (I² = 70); probable publication bias (trim-and-fill 0.37 vs 0.51 L/min)                                                                                                                                                                  | PMID 24066036; doi:10.1371/journal.pone.0073182; PMC3774727                                                                                                                                            |
| [VA] Bouchard C et al. "Familial aggregation of VO2max response to exercise training: results from the HERITAGE Family Study." _J Appl Physiol_ 87(3):1003–8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | single-arm training study (98 families)                        | 1999                                       | Large person-to-person spread in response (mean 384 ± 202 ml/min, about 17–18% (SD 9%), individual changes −5% to +51% over 20 weeks), used for simulation variance                                                                                                                                                                                               | Sedentary people, cycling; no control group                                                                                                                                                                                                                                                                                                                 | PMID 10484570; doi:10.1152/jappl.1999.87.3.1003                                                                                                                                                        |
| [VA] Montero D, Lundby C. "Refuting the myth of non-response to exercise training: 'non-responders' do respond to higher dose of training." _J Physiol_ 595(11):3377–87                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | dose-comparison training study                                 | 2017                                       | "Non-responders" respond to a higher dose                                                                                                                                                                                                                                                                                                                         | Cycling [U]; no non-exercise control; the rescue phase was neither controlled nor randomised                                                                                                                                                                                                                                                                | PMID 28133739; doi:10.1113/JP273480; corrigendum doi:10.1113/JP275942                                                                                                                                  |
| [VA] Buchheit M, Laursen PB. "High-intensity interval training, solutions to the programming puzzle", Parts I and II, _Sports Med_ 43(5):313–38 and 43(10):927–54                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | review                                                         | 2013                                       | Interval design (time near VO2max, recovery formats, 30/30s)                                                                                                                                                                                                                                                                                                      | Narrative review; written for moderately trained to elite athletes, not novices                                                                                                                                                                                                                                                                             | PMID 23539308 (I), 23832851 (II); doi:10.1007/s40279-013-0029-x (I), 10.1007/s40279-013-0066-5 (II)                                                                                                    |
| [VA] Gunnarsson TP, Bangsbo J. "The 10-20-30 training concept improves performance and health profile in moderately trained runners." _J Appl Physiol_ 113(1):16–24                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | RCT [U]                                                        | 2012                                       | Short near-maximal bursts on 54% less volume improved 5 km (−48 s, about 4%) and VO2max (4%) in moderately trained runners; no running-economy result                                                                                                                                                                                                             | 7 weeks; small sample                                                                                                                                                                                                                                                                                                                                       | PMID 22556401; doi:10.1152/japplphysiol.00334.2012                                                                                                                                                     |
| [VF] Skovgaard C et al. "Effect of speed endurance training and reduced training volume on running economy and single muscle fiber adaptations in trained runners." _Physiol Rep_ 6(3):e13601                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | single-group pre–post study                                    | 2018                                       | 10 sessions of 5–10 × 30 s maximal running, with 36% less volume, improved running economy (about 2%)                                                                                                                                                                                                                                                             | Trained runners, n = 20 (26 started); no control group                                                                                                                                                                                                                                                                                                      | PMID 29417745; doi:10.14814/phy2.13601                                                                                                                                                                 |
| **LOAD PROGRESSION AND INJURY**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |                                                                |                                            |                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                        |
| [VA] Buist I et al. GRONORUN: "No effect of a graded training program on the number of running-related injuries in novice runners: a randomized controlled trial." _Am J Sports Med_ 36(1):33–9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | RCT                                                            | 2008                                       | The 10% rule did not reduce injuries: 20.8% vs 20.3% (P = .90) in 532 novices                                                                                                                                                                                                                                                                                     | One trial, novices, a 4-mile event                                                                                                                                                                                                                                                                                                                          | PMID 17940147; doi:10.1177/0363546507307505                                                                                                                                                            |
| [VA] Buist I et al. _Br J Sports Med_ 44(8):598–604                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | cohort                                                         | 2010                                       | 25.9% of 629 novice and recreational runners injured over 8 weeks, 30.1 (25.4–34.7) per 1000 h, counting a 1-day restriction                                                                                                                                                                                                                                      | A short programme; a 1-day definition counts more injuries than a 1-week one                                                                                                                                                                                                                                                                                | doi:10.1136/bjsm.2007.044677; PMID 18487252                                                                                                                                                            |
| [VA] Bredeweg SW et al. _Br J Sports Med_ 46(12):865–70                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | two-arm trial                                                  | 2012                                       | 15.2% and 16.8% of 432 novices injured over a 9-week programme, counting a 1-week restriction                                                                                                                                                                                                                                                                     | One short programme                                                                                                                                                                                                                                                                                                                                         | doi:10.1136/bjsports-2012-091397; PMID 22842237                                                                                                                                                        |
| [VA] Nielsen RØ et al. "Excessive progression in weekly running distance and risk of running-related injuries: an association which varies according to type of injury." _JOSPT_ 44(10):739–47                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | cohort                                                         | 2014                                       | More than 30% over 2 weeks, compared with less than 10%: hazard ratio 1.59 (0.96–2.66) for "distance-related" injuries                                                                                                                                                                                                                                            | Novices; the confidence interval crosses 1                                                                                                                                                                                                                                                                                                                  | PMID 25155475; doi:10.2519/jospt.2014.5164                                                                                                                                                             |
| [VF] Frandsen JSB et al. "How much running is too much? Identifying high-risk running sessions in a 5200-person cohort study" (Garmin-RUNSAFE), _Br J Sports Med_ 59(17):1203–10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | cohort                                                         | 2025                                       | A single run more than 10% longer than the longest run in the previous 30 days raised the rate of first overuse injury (HRR 1.64 [1.31–2.05] / 1.52 [1.16–2.00] / 2.28 [1.50–3.48] by spike size); week-to-week change was not associated                                                                                                                         | Observational; self-reported injuries; mean age 46; 22% female; tests distance only, not duration; no estimate for novices                                                                                                                                                                                                                                  | PMID 40623829; doi:10.1136/bjsports-2024-109380; PMC12421110                                                                                                                                           |
| [VF] Videbæk S et al. "Incidence of running-related injuries per 1000 h of running in different types of runners: a systematic review and meta-analysis." _Sports Med_ 45(7):1017–26                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | meta-analysis                                                  | 2015                                       | 17.8 (16.7–19.1) injuries per 1000 h for novices vs 7.7 (6.9–8.7) for recreational runners; used as base hazards                                                                                                                                                                                                                                                  | Injury definitions vary between studies                                                                                                                                                                                                                                                                                                                     | PMID 25951917; doi:10.1007/s40279-015-0333-8; PMC4473093                                                                                                                                               |
| [VA] Kluitenberg B et al. "The NLstart2run study: incidence and risk factors of running-related injuries in novice runners." _Scand J Med Sci Sports_ 25(5):e515–23                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | cohort                                                         | 2015                                       | 10.9% of 1,696 novices injured during a 6-week Start to Run programme                                                                                                                                                                                                                                                                                             | Short; Dutch population                                                                                                                                                                                                                                                                                                                                     | PMID 25438823; doi:10.1111/sms.12346                                                                                                                                                                   |
| [VF] Kluitenberg B et al. _J Sci Med Sport_ 19(6):470–5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | cohort                                                         | 2016                                       | In a 6-week Start to Run cohort the proportion injured depends on the definition: any running pain 58.0%, training reduced for at least 1 day 28.8%, time lost for at least 1 day 22.5%, at least 1 week 7.5%. The source of the §6.3 severity tiers                                                                                                              | Novices only; durations censored at 6 weeks                                                                                                                                                                                                                                                                                                                 | doi:10.1016/j.jsams.2015.07.003 (read as the accepted manuscript)                                                                                                                                      |
| [VF] Kluitenberg B, van Middelkoop M, Diercks R, van der Worp H. "What are the differences in injury proportions between different populations of runners? A systematic review and meta-analysis." _Sports Med_ 45(8):1143–61                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | systematic review and meta-analysis                            | 2015                                       | Time-loss injury proportions range from 3.2% (cross-country, 1-year follow-up or recall) to 84.9% (novices, one 18-month study)                                                                                                                                                                                                                                   | Injury definitions and follow-up lengths vary and affect the proportions; population alone does not explain the spread                                                                                                                                                                                                                                      | PMID 25851584; doi:10.1007/s40279-015-0331-x; PMC4513221                                                                                                                                               |
| [VA] Damsted C et al. "ProjectRun21: do running experience and running pace influence the risk of running injury—a 14-week prospective cohort study." _J Sci Med Sport_ 22(3):281–7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | cohort                                                         | 2019 (online 2018)                         | 136 of 784 runners (about 17%) injured during a 14-week half-marathon plan; fewer injuries trended with more than 15 km a week of prior running or a pace faster than 6 min/km (not significant)                                                                                                                                                                  | Estimates not significant                                                                                                                                                                                                                                                                                                                                   | PMID 30190100; doi:10.1016/j.jsams.2018.08.014                                                                                                                                                         |
| (repo) [VF] Damsted C et al. "Is there evidence for an association between changes in training load and running-related injuries? A systematic review." _IJSPT_ 13(6):931–42                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | systematic review                                              | 2018                                       | See the handoff                                                                                                                                                                                                                                                                                                                                                   | Tested only week-to-week percentage change in running distance or volume; ACWR is outside its evidence                                                                                                                                                                                                                                                      | PMID 30534459; doi:10.26603/ijspt20180931; PMC6253751                                                                                                                                                  |
| [VA] Impellizzeri FM et al. "Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls," _IJSPP_ 15(6):907–13                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | methods critique                                               | 2020                                       | Do not encode ACWR as an injury predictor                                                                                                                                                                                                                                                                                                                         | The random-chronic-load analysis is a separate paper: Impellizzeri et al. 2021, _Sports Med_ 51(3):581–92, PMID 33332011                                                                                                                                                                                                                                    | PMID 32502973; doi:10.1123/ijspp.2019-0864                                                                                                                                                             |
| [VF] Fokkema T et al. INSPIRE: "Online multifactorial prevention programme has no effect on the number of running-related injuries: a randomised controlled trial." _Br J Sports Med_ 53(23):1479–85                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | RCT                                                            | 2019                                       | No effect: 37.5% vs 36.7% injured among 2,378 event entrants                                                                                                                                                                                                                                                                                                      | Programme was advice only                                                                                                                                                                                                                                                                                                                                   | PMID 30954948; doi:10.1136/bjsports-2018-099744; PMC6900232                                                                                                                                            |
| [VF] Toresdahl BG et al. "A randomized study of a strength training program to prevent injuries in runners of the New York City Marathon." _Sports Health_ 12(1):74–9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | RCT                                                            | 2020                                       | A 12-week, 10-minute, 3-times-a-week programme did not change injury-related non-completion (7.1% vs 7.3%)                                                                                                                                                                                                                                                        | Self-directed; partial, self-reported adherence (mean 2.0 of 3 sessions a week; 56% did 2 or more); controls free to strength-train (31% did)                                                                                                                                                                                                               | PMID 31642726; doi:10.1177/1941738119877180; PMC6931177                                                                                                                                                |
| [VA] Hulme A et al. "Risk and protective factors for middle- and long-distance running-related injury." _Sports Med_ 47(5):869–86                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | systematic review                                              | 2017                                       | Previous injury is the most consistent risk factor (direction only; no pooled size)                                                                                                                                                                                                                                                                               | Heterogeneity prevented pooling; about a third of studies below satisfactory quality                                                                                                                                                                                                                                                                        | PMID 27785775; doi:10.1007/s40279-016-0636-4                                                                                                                                                           |
| [VA] Lauersen JB, Bertelsen DM, Andersen LB. The effectiveness of exercise interventions to prevent sports injuries: a systematic review and meta-analysis of randomised controlled trials, _Br J Sports Med_ 48(11):871–7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | meta-analysis                                                  | 2014                                       | Strength training reduced sports injuries (risk ratio about 0.3); stretching had no effect                                                                                                                                                                                                                                                                        | Mostly sports other than running                                                                                                                                                                                                                                                                                                                            | doi:10.1136/bjsports-2013-092538; PMID 24100287                                                                                                                                                        |
| [VA] Nielsen RO et al. Foot pronation is not associated with increased injury risk in novice runners wearing a neutral shoe: a 1-year prospective cohort study, _Br J Sports Med_ 48(6):440–7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | cohort                                                         | 2014                                       | Pronation was not linked to more injuries in novices wearing a neutral shoe. The result for highly pronated feet was inconclusive (18 feet; risk difference 9.8%, −19.3% to 38.8%)                                                                                                                                                                                | Novices in one neutral shoe                                                                                                                                                                                                                                                                                                                                 | doi:10.1136/bjsports-2013-092202; PMID 23766439                                                                                                                                                        |
| [VF] Heiderscheit BC, Chumanov ES, Michalski MP, Wille CM, Ryan MB. Effects of step rate manipulation on joint mechanics during running, _MSSE_ 43(2):296–302                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | lab study                                                      | 2011                                       | Raising each runner's own step rate by 5% lowered knee loading (knee energy absorption about 20% lower); raising it by 10% lowered knee (about 34%) and hip loading. Targets were relative to each runner's preferred rate (172.6 ± 8.8 steps/min), not 180                                                                                                       | Treadmill only; 45 healthy runners, short-term, group means; no injury outcome                                                                                                                                                                                                                                                                              | doi:10.1249/MSS.0b013e3181ebedf4; PMID 20581720; PMC3022995                                                                                                                                            |
| **MARATHON OUTCOME, TAPER, PREDICTION**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |                                                                |                                            |                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                        |
| [VA] Doherty C, Keogh A, Davenport J, Lawlor A, Smyth B, Caulfield B. An evaluation of the training determinants of marathon performance: a meta-analysis with meta-regression, _J Sci Med Sport_ 23(2):182–8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | meta-regression                                                | 2020                                       | Across 137 cohorts, weekly distance, runs per week, the biggest week, runs of 32 km or more, the longest run, training pace and weekly hours were each associated with faster marathons (R² 0.38–0.81)                                                                                                                                                            | Compares cohorts, not individuals; confounded by ability; each factor was modelled on its own, so none is shown to dominate                                                                                                                                                                                                                                 | doi:10.1016/j.jsams.2019.09.013; PMID 31704026                                                                                                                                                         |
| [VF] Tanda G. Prediction of marathon performance time on the basis of training indices, _J Hum Sport Exerc_ 6(3):511–20                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | regression                                                     | 2011                                       | Marathon pace from mean weekly km and mean training pace over the 8 weeks from 9 weeks to 1 week before the race (SEE 5.77 s/km, about 4 minutes, in-sample). Pace improves with weekly km along an exponential-decay curve, so returns diminish                                                                                                                  | 22 runners (21 men), 46 marathons of 2:47–3:36; inputs ranged 40.4–110.7 km a week and 4:13–5:31 /km, so anything outside is extrapolation; cross-sectional                                                                                                                                                                                                 | doi:10.4100/jhse.2011.63.05 (not in PubMed)                                                                                                                                                            |
| [VF] Smyth B, Lawlor A. Longer disciplined tapers improve marathon performance for recreational runners, _Front Sports Act Living_ 3:735220                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | big-data cohort                                                | 2021                                       | In 158,117 runners, a strict 3-week taper was associated with a median 5:32 (2.6%) faster finish than a relaxed 1-week taper, measured against an expected time from each runner's fastest 10 km training pace (4.16 minutes after adjusting for sex and ability). Strict tapers, with the down weeks consecutive and directly before race day, beat relaxed ones | Observational (Strava data, 2014–17); no size of volume cut was tested; only about 31% of runners tapered strictly                                                                                                                                                                                                                                          | doi:10.3389/fspor.2021.735220; PMID 34651125; PMC8506252                                                                                                                                               |
| [VF] Smyth B, Muniz-Pumares D. Calculation of critical speed from raw training data in recreational marathon runners, _MSSE_ 52(12):2637–45                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | big-data cohort                                                | 2020                                       | Critical speed (CS) from the fastest 400–5000 m efforts in 16 weeks of training predicted marathon time; marathons were run at about 85% of CS (93% at 2:30, 79% at 6 hours). Running 2–16 km above about 94% of CS modestly raised the share who slowed by more than 25% over the last 12.2 km (men 20.5% to 26.0%, women 9.6% to 15.6%)                         | Observational; about 8% prediction error; no finish-time cost of a slowdown reported                                                                                                                                                                                                                                                                        | doi:10.1249/MSS.0000000000002412; PMID 32472926; PMC7664951                                                                                                                                            |
| [VF] Vickers AJ, Vertosick EA. An empirical study of race times in recreational endurance runners, _BMC Sports Sci Med Rehabil_ 8:26                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | survey cohort                                                  | 2016                                       | Riegel (k = 1.07) was accurate up to the half marathon but at least 10 minutes too fast at the marathon for half of runners (median 10:09 too fast). Weekly mileage gave most of the improvement and a second race a little more (MSE 380.7 for Riegel, 227.6 for one race plus mileage, 208.3 for two races plus mileage)                                        | Self-reported data; 156 validation runners; VDOT was not tested; the mileage term is continuous, with no threshold                                                                                                                                                                                                                                          | doi:10.1186/s13102-016-0052-y; PMID 27570626; PMC5000509                                                                                                                                               |
| [U] Riegel PS. Athletic records and human endurance: a time-vs-distance equation describing world-record performances may be used to compare the relative endurance capabilities of various groups of people, _Am Sci_ 69(3):285–90                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | model                                                          | 1981                                       | T2 = T1 × (D2/D1)^k. The fit to open men's world records gave k ≈ 1.08, and to masters men 1.05–1.06; calculators use 1.06                                                                                                                                                                                                                                        | Fitted to world records lasting about 3–3.5 to 230 minutes, so a marathon slower than about 3:50 falls outside the range; the primary was not read, and the exponents and range come from secondary sources                                                                                                                                                 | PMID 7235349; JSTOR (no DOI)                                                                                                                                                                           |
| [VA] Keogh A, Smyth B, Caulfield B, Lawlor A, Berndsen J, Doherty C. Prediction equations for marathon performance: a systematic review, _IJSPP_ 14(9):1159–69                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | systematic review                                              | 2019                                       | 114 equations; standard errors from 0.27 to 27.4 minutes; no single best equation                                                                                                                                                                                                                                                                                 | Only 19 of the 114 equations reported a standard error                                                                                                                                                                                                                                                                                                      | doi:10.1123/ijspp.2019-0360; PMID 31575820                                                                                                                                                             |
| [VF] Emig T, Peltonen J. Human running performance from real-world big data, _Nat Commun_ 11(1):4936                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | big-data model                                                 | 2020                                       | An aerobic-power index and an endurance index from about 14,000 runners' logs fitted each runner's own best efforts to about 2%; predicting a marathon from shorter efforts was accurate to within about 10%                                                                                                                                                      | Device data (fastest GPS efforts, not confirmed race results); selected sample                                                                                                                                                                                                                                                                              | doi:10.1038/s41467-020-18737-6; PMID 33024098; PMC7538888                                                                                                                                              |
| [VA] Bosquet L, Montpetit J, Arvisais D, Mujika I. Effects of tapering on performance: a meta-analysis, _MSSE_ 39(8):1358–65                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | meta-analysis                                                  | 2007                                       | About 2 weeks (8–14 days), volume cut 41–60% exponentially, intensity and frequency kept                                                                                                                                                                                                                                                                          | Competitive athletes from 27 studies; mixed sports [U]                                                                                                                                                                                                                                                                                                      | doi:10.1249/mss.0b013e31806010e0; PMID 17762369                                                                                                                                                        |
| [VF] (repo) Wang Z, Wang YT, Gao W, Zhong Y. Effects of tapering on performance in endurance athletes: a systematic review and meta-analysis, _PLoS One_ 18(5):e0282838                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | meta-analysis                                                  | 2023                                       | Tapers of 21 days or less improved time trials: 8–14 days worked best (SMD −1.47) and 15–21 days also worked (−0.78); 22 days or more did not. Volume cut about 40–60%, intensity and frequency kept                                                                                                                                                              | The 8–14-day estimate rests on one study (18 people); pooled effects do not prescribe one taper shape                                                                                                                                                                                                                                                       | doi:10.1371/journal.pone.0282838; PMID 37163550; PMC10171681                                                                                                                                           |
| [VA] Deaner RO, Carter RE, Joyner MJ, Hunter SK. Men are more likely than women to slow in the marathon, _MSSE_ 47(3):607–16                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | cohort                                                         | 2015                                       | Women pace more evenly; men slow more in the second half                                                                                                                                                                                                                                                                                                          | Observational                                                                                                                                                                                                                                                                                                                                               | doi:10.1249/MSS.0000000000000432; PMID 24983344; PMC4289124                                                                                                                                            |
| [VF] Smyth B. How recreational marathon runners hit the wall: a large-scale data analysis of late-race pacing collapse in the marathon, _PLoS One_ 16(5):e0251513                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | big-data cohort                                                | 2021                                       | How often runners hit the wall and what it costs                                                                                                                                                                                                                                                                                                                  | Observational                                                                                                                                                                                                                                                                                                                                               | doi:10.1371/journal.pone.0251513; PMID 34010308; PMC8133477                                                                                                                                            |
| [VA] Daniels J, Gilbert J. _Oxygen Power: Performance Tables for Distance Runners_ (Tempe, AZ; publisher not confirmed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | formula book                                                   | 1979                                       | Source of the VDOT equations used in Appendix A; they reproduce Daniels' race-time table to within 1–10 s at VDOT 40–50 (VDOT 40 gives a 24:06 5K against the book's 24:08), but their E paces run slower than the book's (§0)                                                                                                                                    | Assumes elite economy [U]                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                                                                      |
| **DETRAINING AND RETURN**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |                                                                |                                            |                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                        |
| [VF] Mujika I, Padilla S. Detraining: loss of training-induced physiological and performance adaptations. Part I: short term insufficient training stimulus, _Sports Med_ 30(2):79–87; Part II: long term insufficient training stimulus, _Sports Med_ 30(3):145–54                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | review                                                         | 2000                                       | In trained athletes VO2max falls 4–14% within 4 weeks of stopping; recently gained fitness is fully lost after more than 4 weeks                                                                                                                                                                                                                                  | Old, small studies                                                                                                                                                                                                                                                                                                                                          | Part I: doi:10.2165/00007256-200030020-00002, PMID 10966148; Part II: doi:10.2165/00007256-200030030-00001, PMID 10999420                                                                              |
| [VA] Coyle EF et al. Time course of loss of adaptations after stopping prolonged intense endurance training, _J Appl Physiol_ 57(6):1857–64                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | longitudinal                                                   | 1984                                       | VO2max about −7% by 2–3 weeks and about −15–16% by 8–12 weeks, then stable. Nothing was measured between day 21 and day 56                                                                                                                                                                                                                                        | n ≈ 7                                                                                                                                                                                                                                                                                                                                                       | doi:10.1152/jappl.1984.57.6.1857; PMID 6511559                                                                                                                                                         |
| [VA] Hickson RC, Foster C, Pollock ML, Galassi TM, Rich S. Reduced training intensities and loss of aerobic power, endurance, and cardiac growth, _J Appl Physiol_ 58(2):492–9 (1985); for frequency: Hickson RC, Rosenkoetter MA. Reduced training frequencies and maintenance of increased aerobic power, _MSSE_ 13(1):13–16 (1981); for duration: Hickson RC, Kanakis C Jr, Davis JR, Moore AM, Rich S. Reduced training duration effects on aerobic power, endurance, and cardiac growth, _J Appl Physiol_ 53(1):225–9 (1982)                                                                                                                                                                                                                | experiments                                                    | 1981–85                                    | With intensity kept, cutting frequency from 6 to 4 or 2 days a week (1981) or duration from 40 to 26 or 13 minutes a day (1982) kept VO2max for at least 15 weeks; at 13 minutes, long-term endurance fell 10%. Cutting intensity by a third or two thirds (1985) lost part of the gain: VO2max fell, and long-term endurance fell 21–30%                         | About 12–13 young adults per study, after 10 weeks of cycling and running; not runners                                                                                                                                                                                                                                                                      | 1985: doi:10.1152/jappl.1985.58.2.492, PMID 3156841; 1981: PMID 7219129; 1982: doi:10.1152/jappl.1982.53.1.225, PMID 6214534                                                                           |
| **HILLS AND STRIDES**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |                                                                |                                            |                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                        |
| [VA] Barnes KR, Hopkins WG, McGuigan MR, Kilding AE. Effects of different uphill interval-training programs on running economy and performance, _IJSPP_ 8(6):639–47                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | randomised trial of 5 uphill programmes                        | 2013                                       | 6 weeks of uphill intervals improved a 5 km time trial by about 2%; the highest intensity was best for running economy (+2.4%)                                                                                                                                                                                                                                    | 20 well-trained runners; no flat-running control, so the 2% is a pre-to-post change                                                                                                                                                                                                                                                                         | doi:10.1123/ijspp.8.6.639; PMID 23538293                                                                                                                                                               |
| [VA] Ferley DD, Osborn RW, Vukovich MD. The effects of uphill vs. level-grade high-intensity interval training on VO2max, Vmax, V(LT), and Tmax in well-trained distance runners, _JSCR_ 27(6):1549–59 (2013); economy outcomes of the same trial: The effects of incline and level-grade high-intensity interval treadmill training on running economy and muscle power in well-trained distance runners, _JSCR_ 28(5):1298–309 (2014)                                                                                                                                                                                                                                                                                                          | partly randomised controlled trial                             | 2013–14                                    | Level intervals improved run-to-exhaustion more (2013). Running economy improved equally in both interval groups and in the control group, which did no intervals, so neither interval type improved economy beyond ordinary training (2014)                                                                                                                      | Treadmill only; 32 well-trained runners; the control group was self-selected and ran more                                                                                                                                                                                                                                                                   | 2013: doi:10.1519/JSC.0b013e3182736923, PMID 22996027; 2014: doi:10.1519/JSC.0000000000000274, PMID 24172721                                                                                           |
| [VA] Barnes KR, Hopkins WG, McGuigan MR, Kilding AE. Warm-up with a weighted vest improves running performance via leg stiffness and running economy, _J Sci Med Sport_ 18(1):103–8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | crossover                                                      | 2015                                       | Acute running-economy and speed effects of strides done with a vest                                                                                                                                                                                                                                                                                               | Acute effect only                                                                                                                                                                                                                                                                                                                                           | doi:10.1016/j.jsams.2013.12.005; PMID 24462560                                                                                                                                                         |
| **STRENGTH AND CONCURRENT TRAINING**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |                                                                |                                            |                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                        |
| [VF] Blagrove RC, Howatson G, Hayes PR. Effects of strength training on the physiological determinants of middle- and long-distance running performance: a systematic review, _Sports Med_ 48(5):1117–49                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | systematic review                                              | 2018                                       | Strength training of any kind (heavy, explosive, plyometric or combined) improved running economy 2–8%, significantly in 14 of the 20 studies that measured it; time trials improved about 2–5%. The methods gave similar results                                                                                                                                 | Trained runners; heterogeneous studies; does not show heavy loads beating plyometrics                                                                                                                                                                                                                                                                       | doi:10.1007/s40279-017-0835-7; PMID 29249083; PMC5889786                                                                                                                                               |
| [VF] (repo) Llanos-Lagos C, Ramirez-Campillo R, Moran J, Sáez de Villarreal E. Effect of strength training programs in middle- and long-distance runners' economy at different running speeds: a systematic review with meta-analysis, _Sports Med_ 54(4):895–932 (2024a)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | meta-analysis                                                  | 2024                                       | Heavy loads (≥80% 1RM) improved economy at 8.64–17.85 km/h (small, ES −0.266), more at higher speeds and higher VO2max. Combined methods gave the largest effect (ES −0.426 without outliers) but only at 10.00–14.45 km/h, with low certainty. Plyometrics helped only at ≤12 km/h                                                                               | No head-to-head comparison of methods; trials used 1–4 sessions a week for 6–24 weeks                                                                                                                                                                                                                                                                       | doi:10.1007/s40279-023-01978-y; PMID 38165636; PMC11052887                                                                                                                                             |
| [VF] Llanos-Lagos C, Ramirez-Campillo R, Moran J, Sáez de Villarreal E. The effect of strength training methods on middle-distance and long-distance runners' athletic performance: a systematic review with meta-analysis, _Sports Med_ 54(7):1801–33 (2024b)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | meta-analysis                                                  | 2024                                       | Heavy loads (≥80% 1RM) improved running performance, time trials and time to exhaustion pooled (ES −0.469, which the authors call moderate); combining methods may add more; trivial effect on VO2max                                                                                                                                                             | Programme length (6–40 weeks) and sessions a week (1–4) did not change the effect; no percentage gain is given                                                                                                                                                                                                                                              | doi:10.1007/s40279-024-02018-z; PMID 38627351; PMC11258194                                                                                                                                             |
| [VF] Eihara Y et al. Heavy resistance training versus plyometric training for improving running economy and running time trial performance: a systematic review and meta-analysis, _Sports Med Open_ 8(1):138                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | meta-analysis                                                  | 2022                                       | Heavy training (≥70% 1RM) improved economy (g −0.32; the ≥90% 1RM subgroup −0.31) against plyometrics (−0.13). Time trial: heavy −0.24, with a CI crossing zero, against plyometrics −0.17. Heavy beats plyometrics on point estimates only                                                                                                                       | The two methods were not compared directly                                                                                                                                                                                                                                                                                                                  | doi:10.1186/s40798-022-00511-1; PMID 36370207; PMC9653533                                                                                                                                              |
| [VF] Beattie K, Carson BP, Lyons M, Rossiter A, Kenny IC. The effect of strength training on performance indicators in distance runners, _JSCR_ 31(1):9–23                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | non-randomised controlled trial                                | 2017                                       | Strength training twice a week improved economy by about 4.8% at 20 weeks (significant). After 20 more weeks at once a week the gain was 3.5% and not significant, although the abstract calls it significant                                                                                                                                                     | Not randomised; 11 strength vs 9 control, all men, competitive 1500–10,000 m runners                                                                                                                                                                                                                                                                        | doi:10.1519/JSC.0000000000001464; PMID 27135468                                                                                                                                                        |
| [VA] Paavolainen L, Häkkinen K, Hämäläinen I, Nummela A, Rusko H. Explosive-strength training improves 5-km running time by improving running economy and muscle power, _J Appl Physiol_ 86(5):1527–33                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | controlled trial                                               | 1999                                       | Explosive training improved 5 km time and economy                                                                                                                                                                                                                                                                                                                 | Well-trained endurance athletes, 10 training vs 8 control; randomisation not stated [U]                                                                                                                                                                                                                                                                     | doi:10.1152/jappl.1999.86.5.1527; PMID 10233114                                                                                                                                                        |
| [VA] Wilson JM, Marin PJ, Rhea MR, Wilson SM, Loenneke JP, Anderson JC. Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises, _JSCR_ 26(8):2293–307                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | meta-analysis                                                  | 2012                                       | Interference grows with endurance frequency and duration; running interferes more than cycling; power suffers most (ES strength-only vs concurrent: hypertrophy 1.23 vs 0.85, strength 1.76 vs 1.44, power 0.91 vs 0.55)                                                                                                                                          | Older studies; no running-volume threshold                                                                                                                                                                                                                                                                                                                  | doi:10.1519/JSC.0b013e31823a3e2d; PMID 22002517                                                                                                                                                        |
| [VF] Schumann M et al. Compatibility of concurrent aerobic and strength training for skeletal muscle size and function: an updated systematic review and meta-analysis, _Sports Med_ 52(3):601–12                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | meta-analysis                                                  | 2022                                       | No interference for lower-body hypertrophy or maximal strength. Explosive strength was blunted, especially when aerobic and strength work shared a session (≤20 minutes apart; SMD −0.31); not significantly when they were ≥3 h apart. By aerobic mode the blunting was significant for cycling, not running                                                     | Lower body only; untrained or active people doing about 2–3 aerobic sessions a week                                                                                                                                                                                                                                                                         | doi:10.1007/s40279-021-01587-7; PMID 34757594; PMC8891239                                                                                                                                              |
| [VF] Huiberts RO, Wüst RCI, van der Zwaard S. Concurrent strength and endurance training: a systematic review and meta-analysis on the impact of sex and training status, _Sports Med_ 54(2):485–503                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | meta-analysis                                                  | 2024                                       | Lower-body strength blunted in men (−0.43) but not women (0.08), and training status did not change this. VO2max gains were slightly blunted only in endurance-untrained people (−0.35) (also in the lift handoff)                                                                                                                                                | No running-volume analysis; "untrained" is set by VO2max                                                                                                                                                                                                                                                                                                    | doi:10.1007/s40279-023-01943-9; PMID 37847373; PMC10933151                                                                                                                                             |
| [VF] Lundberg TR, Feuerbacher JF, Sünkeler M, Schumann M. The effects of concurrent aerobic and strength training on muscle fiber hypertrophy: a systematic review and meta-analysis, _Sports Med_ 52(10):2391–403                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | meta-analysis                                                  | 2022                                       | A small negative effect on fibre hypertrophy (SMD −0.23), possibly larger with running than with cycling (type I fibres −0.81, from 3 running studies)                                                                                                                                                                                                            | Fibre level, which may not carry over to whole muscle; no running-volume analysis; shares authors with Schumann 2022                                                                                                                                                                                                                                        | doi:10.1007/s40279-022-01688-x; PMID 35476184; PMC9474354                                                                                                                                              |
| [VF] Petré H, Hemmingsson E, Rosdahl H, Psilander N. Development of maximal dynamic strength during concurrent resistance and endurance training in untrained, moderately trained, and trained individuals: a systematic review and meta-analysis, _Sports Med_ 51(5):991–1010                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | meta-analysis                                                  | 2021                                       | Lower-body 1RM blunted only in trained people (ES −0.35), and only when lifting and endurance shared a session under 20 minutes apart (−0.66); not with sessions more than 2 h apart (−0.10)                                                                                                                                                                      | Trained groups did about 2.6 endurance sessions of 29 minutes a week, for 6–21 weeks                                                                                                                                                                                                                                                                        | doi:10.1007/s40279-021-01426-9; PMID 33751469; PMC8053170                                                                                                                                              |
| [VA] Murlasits Z, Kneffel Z, Thalib L. The physiological effects of concurrent strength and endurance training sequence: a systematic review and meta-analysis, _J Sports Sci_ 36(11):1212–9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | meta-analysis                                                  | 2018                                       | Strength before endurance favours lower-body strength (1RM +3.96 kg); aerobic gains are unaffected by order (0.39 mL/kg/min)                                                                                                                                                                                                                                      | Measured only lower-body 1RM and aerobic capacity                                                                                                                                                                                                                                                                                                           | doi:10.1080/02640414.2017.1364405; PMID 28783467                                                                                                                                                       |
| [VF] Eddens L, van Someren K, Howatson G. The role of intra-session exercise sequence in the interference effect: a systematic review with meta-analysis, _Sports Med_ 48(1):177–88                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | meta-analysis                                                  | 2018                                       | Same conclusion on order: strength first gives better lower-body strength; aerobic gains are unaffected                                                                                                                                                                                                                                                           | —                                                                                                                                                                                                                                                                                                                                                           | doi:10.1007/s40279-017-0784-1; PMID 28917030; PMC5752732                                                                                                                                               |
| [VA] Robineau J, Babault N, Piscione J, Lacome M, Bigard AX. Specific training effects of concurrent aerobic and strength exercises depend on recovery duration, _JSCR_ 30(3):672–83                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | RCT                                                            | 2016                                       | 0 h between strength and aerobic sessions was worst; 24 h was best for VO2peak; avoid less than 6 h between conflicting sessions. For 1RM, 6 h and 24 h both beat 0 h, with no reported advantage for 24 h. Strength always came first, so order was not tested                                                                                                   | Amateur rugby players; 7-week adaptations, not the quality of the next session                                                                                                                                                                                                                                                                              | doi:10.1519/JSC.0000000000000798; PMID 25546450                                                                                                                                                        |
| [VF] Doma K, Deakin GB. The effects of combined strength and endurance training on running performance the following day, _Int J Sport Health Sci_ 11:1–9 (2013); [VA] Doma K, Deakin GB. The effects of strength training and endurance training order on running economy and performance, _Appl Physiol Nutr Metab_ 38(6):651–6 (2013); [VA] Doma K, Deakin GB. The acute effects intensity and volume of strength training on running performance, _Eur J Sport Sci_ 14(2):107–15 (2014)                                                                                                                                                                                                                                                      | lab studies                                                    | 2013–14                                    | 6 h after high-intensity lower-body or whole-body strength work, time to exhaustion fell; running economy was worse in one study of two, at the faster stage only. The day after a strength-plus-run day, time to exhaustion fell 18–29%, and economy was worse (+5.6% to +10%) only when strength came first. Running did not lower later knee-extensor torque   | 12–15 trained or moderately trained male runners per study; none tested past the next day                                                                                                                                                                                                                                                                   | doi:10.5432/ijshs.201230 (not in PubMed); doi:10.1139/apnm-2012-0362, PMID 23724883; doi:10.1080/17461391.2012.726653, PMID 24533516                                                                   |
| [VA] Doma K et al. _Eur J Appl Physiol_ 115:1789–99                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | lab study                                                      | 2015                                       | After a first heavy leg session, submaximal running was impaired at 24 h but not at 48 h                                                                                                                                                                                                                                                                          | Resistance-untrained men; measured at 24 and 48 h only                                                                                                                                                                                                                                                                                                      | PMID 25828143                                                                                                                                                                                          |
| [VF] Doma K et al. _Sports Med Open_ 5:21                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | lab study                                                      | 2019                                       | After a first 6RM leg session, the energy cost of running rose about 5.3% at 24 h [C] and stayed raised at 48 h                                                                                                                                                                                                                                                   | Lifting-naive men in their first sessions; the effect shrinks after 2–3 sessions (repeated-bout effect)                                                                                                                                                                                                                                                     | PMID 31165339; PMC6548784                                                                                                                                                                              |
| [VA] Spiering BA, Mujika I, Sharp MA, Foulis SA. Maintaining physical performance: the minimal dose of exercise needed to preserve endurance and strength over time, _JSCR_ 35(5):1449–58                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | narrative review                                               | 2021                                       | Endurance is kept for up to 15 weeks with intensity maintained and frequency cut to as little as 2 sessions a week or volume cut by 33–66%. Strength and size are kept for up to 32 weeks on 1 session and 1 set per exercise a week in younger people; older people may need up to 2 sessions and 2–3 sets a week to keep muscle size                            | General populations; the authors say the data are insufficient for athletes or military personnel                                                                                                                                                                                                                                                           | doi:10.1519/JSC.0000000000003964; PMID 33629972                                                                                                                                                        |
| [VF] Bickel CS, Cross JM, Bamman MM. Exercise dosing to retain resistance training adaptations in young and older adults, _MSSE_ 43(7):1177–87                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | RCT                                                            | 2011                                       | After 16 weeks of training, one ninth of the dose (1 session and 1 set a week) kept strength and size in young adults for 32 weeks. Older adults kept strength on either reduced dose but lost fibre size on both. With no training, strength fell only 7%                                                                                                        | Not runners; untrained adults; lower body only                                                                                                                                                                                                                                                                                                              | doi:10.1249/MSS.0b013e318207c15d; PMID 21131862                                                                                                                                                        |
| [VA] Rønnestad BR, Hansen EA, Raastad T. In-season strength maintenance training increases well-trained cyclists' performance, _Eur J Appl Physiol_ 110(6):1269–82                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | RCT                                                            | 2010                                       | One heavy session a week for 13 in-season weeks kept the strength and thigh-size gains from 12 weeks of twice-weekly training in cyclists                                                                                                                                                                                                                         | Cyclists; 6 per group                                                                                                                                                                                                                                                                                                                                       | doi:10.1007/s00421-010-1622-4; PMID 20799042                                                                                                                                                           |
| [VA] Iversen VM, Norum M, Schoenfeld BJ, Fimland MS. No time to lift? Designing time-efficient training programs for strength and hypertrophy: a narrative review, _Sports Med_ 51(10):2079–95                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | narrative review                                               | 2021                                       | Time-efficient lifting designs: at least 4 weekly sets per muscle group at 6–15RM; weekly volume matters more than frequency; supersets, drop sets and rest-pause roughly halve session time                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                           | doi:10.1007/s40279-021-01490-1; PMID 34125411; PMC8449772                                                                                                                                              |
| **ENVIRONMENT, ANCHORING, CRITICAL SPEED, RUN-WALK**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |                                                                |                                            |                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                        |
| [VA] Ely MR, Cheuvront SN, Roberts WO, Montain SJ. Impact of weather on marathon-running performance, _MSSE_ 39(3):487–93                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | race-data cohort                                               | 2007                                       | Marathons slow progressively as wet-bulb globe temperature (WBGT) rises from 5 to 25 °C, and slower runners slow more (top men 1.7% to 4.5% off the course record across the WBGT bands)                                                                                                                                                                          | Race data from 7 marathons; WBGT, not air temperature; the slowest placing tracked (300th) is far faster than 3:45                                                                                                                                                                                                                                          | doi:10.1249/mss.0b013e31802d3aba; PMID 17473775                                                                                                                                                        |
| [VF] El Helou N et al. Impact of environmental parameters on marathon running performance, _PLoS One_ 7(5):e37407                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | race-data cohort                                               | 2012                                       | Best performances at an air temperature of about 4–10 °C (3.8–9.9 °C by level); slowing with heat. Table S3 gives the loss at +5 to +20 °C above each level's optimum (men's median 0.95%, 3.91%, 9.26% and 17.73%)                                                                                                                                               | Race data only (60 races; air temperature, not WBGT or humidity); the authors find heat costs every level alike at the population level                                                                                                                                                                                                                     | doi:10.1371/journal.pone.0037407; PMID 22649525; PMC3359364                                                                                                                                            |
| [VF] Racinais S et al. Consensus recommendations on training and competing in the heat, _Br J Sports Med_ 49(18):1164–73 (also in _Sports Med_ 45(7):925–38 and _Scand J Med Sci Sports_ 25 Suppl 1:6–19)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | consensus                                                      | 2015                                       | Heat acclimatisation (about 1 week, ideally 2, of at least 60 minutes a day), hydration and cooling; no pacing advice for athletes                                                                                                                                                                                                                                | Consensus                                                                                                                                                                                                                                                                                                                                                   | doi:10.1136/bjsports-2015-094915; PMID 26069301; PMC4602249                                                                                                                                            |
| [VF] Mantzios K et al. Effects of weather parameters on endurance running performance, _MSSE_ 54(1):153–61                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | race-data cohort                                               | 2022                                       | Best performance at 7.5–15 °C WBGT (10–17.5 °C air), the marathon at 7.5 °C WBGT; above that, marathon times slow about 0.2% per °C WBGT for the top finishers (§9, item 9)                                                                                                                                                                                       | 1,258 races and 7,867 athletes; the marathon models exclude the well-trained group                                                                                                                                                                                                                                                                          | doi:10.1249/MSS.0000000000002769; PMC8677617                                                                                                                                                           |
| [VA] Ely MR et al. Effect of ambient temperature on marathon pacing is dependent on runner ability, _MSSE_ 40(9):1675–80                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | race-data cohort                                               | 2008                                       | In warmer air, slower placings ran slower from the start rather than fading more, which supports setting the pace at the start                                                                                                                                                                                                                                    | Race data; abstract read                                                                                                                                                                                                                                                                                                                                    | doi:10.1249/MSS.0b013e3181788da9                                                                                                                                                                       |
| [VA] Jones AM, Doust JH. A 1% treadmill grade most accurately reflects the energetic cost of outdoor running, _J Sports Sci_ 14(4):321–7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | lab study                                                      | 1996                                       | A 1% treadmill incline approximates the energy cost of running outdoors                                                                                                                                                                                                                                                                                           | Trained men                                                                                                                                                                                                                                                                                                                                                 | doi:10.1080/02640419608727717; PMID 8887211                                                                                                                                                            |
| [VA] Minetti AE, Moia C, Roi GS, Susta D, Ferretti G. Energy cost of walking and running at extreme uphill and downhill slopes, _J Appl Physiol_ 93(3):1039–46                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | lab study                                                      | 2002                                       | The energy cost of running changes predictably with gradient; grade-adjusted pace calculators are said to use this curve [U]                                                                                                                                                                                                                                      | Lab only                                                                                                                                                                                                                                                                                                                                                    | doi:10.1152/japplphysiol.01177.2001; PMID 12183501                                                                                                                                                     |
| [VF] Foster C et al. A new approach to monitoring exercise training, _JSCR_ 15(1):109–15                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | method                                                         | 2001                                       | Session RPE: load = CR10 rating × minutes, a validated load measure usable without devices                                                                                                                                                                                                                                                                        | —                                                                                                                                                                                                                                                                                                                                                           | doi:10.1519/00124278-200102000-00019; PMID 11708692                                                                                                                                                    |
| [VF] Persinger R, Foster C, Gibson M, Fater DC, Porcari JP. Consistency of the talk test for exercise prescription, _MSSE_ 36(9):1632–6 (2004); [VA] Foster C et al. The talk test as a marker of exercise training intensity, _J Cardiopulm Rehabil Prev_ 28(1):24–30 (2008); [VA] Reed JL, Pipe AL. The talk test: a useful tool for prescribing and monitoring exercise intensity, _Curr Opin Cardiol_ 29(5):475–80 (2014)                                                                                                                                                                                                                                                                                                                    | method, review                                                 | 2004–14                                    | The talk test tracks the first ventilatory threshold (VT1), giving a device-free easy-pace check. It has three stages (positive, equivocal, negative), and comfortable speech sits at or just below VT1                                                                                                                                                           | Mostly clinical and lab settings; Persinger tested 16 young, moderately active adults                                                                                                                                                                                                                                                                       | 2004: PMID 15354048 (the DOI printed on the article resolves to a different paper); 2008: doi:10.1097/01.HCR.0000311504.41775.78, PMID 18277826; 2014: doi:10.1097/HCO.0000000000000097, PMID 25010379 |
| [VF] Tanaka H, Monahan KD, Seals DR. Age-predicted maximal heart rate revisited, _J Am Coll Cardiol_ 37(1):153–6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | meta-analysis                                                  | 2001                                       | HRmax ≈ 208 − 0.7 × age, with about ±10 bpm individual error. 220 − age is also biased: too high under 40 and too low over 40, by about 10 bpm at 70                                                                                                                                                                                                              | Population formula                                                                                                                                                                                                                                                                                                                                          | doi:10.1016/S0735-1097(00)01054-8; PMID 11153730                                                                                                                                                       |
| [VF] Jones AM, Vanhatalo A. The 'critical power' concept: applications to sports performance with a focus on intermittent high-intensity exercise, _Sports Med_ 47(Suppl 1):65–78 (2017); Poole DC, Burnley M, Vanhatalo A, Rossiter HB, Jones AM. Critical power: an important fatigue threshold in exercise physiology, _MSSE_ 48(11):2320–34 (2016); Jones AM, Burnley M, Black MI, Poole DC, Vanhatalo A. The maximal metabolic steady state: redefining the 'gold standard', _Physiol Rep_ 7(10):e14098 (2019)                                                                                                                                                                                                                              | reviews                                                        | 2016–19                                    | Critical speed as the boundary between the heavy and severe domains; maximal metabolic steady state. It can be held for about 20–30 minutes in lab tests (about 15–40 across people), and is measured from 3 or more best efforts of about 2–15 minutes, or a 3-minute all-out test                                                                               | —                                                                                                                                                                                                                                                                                                                                                           | doi:10.1007/s40279-017-0688-0, PMID 28332113; doi:10.1249/MSS.0000000000000939, PMID 27031742; doi:10.14814/phy2.14098, PMID 31124324                                                                  |
| [VA] Galbraith A, Hopker J, Cardinale M, Cunniffe B, Passfield L. A 1-year study of endurance runners: training, laboratory tests, and field tests, _IJSPP_ 9(6):1019–25                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | cohort                                                         | 2014                                       | A field test for critical speed and how it changes over a year                                                                                                                                                                                                                                                                                                    | 14 highly trained men                                                                                                                                                                                                                                                                                                                                       | doi:10.1123/ijspp.2013-0508; PMID 24664950                                                                                                                                                             |
| [VA] Hottenrott K, Ludyga S, Schulze S, Gronwald T, Jäger FS. Does a run/walk strategy decrease cardiac stress during a marathon in non-elite runners?, _J Sci Med Sport_ 19(1):64–8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | RCT                                                            | 2016                                       | Run-walk gave similar finish times with less muscle pain and fatigue; it did not reduce cardiac stress markers                                                                                                                                                                                                                                                    | n = 42                                                                                                                                                                                                                                                                                                                                                      | doi:10.1016/j.jsams.2014.11.010; PMID 25467199                                                                                                                                                         |
| [VF] Relph N et al. _Int J Environ Res Public Health_ 20(17):6682                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | programme evaluation                                           | 2023                                       | In a modified, group-delivered 9-week Couch to 5K (one coached session and two app runs a week), 27.3% of 110 completed it and 19% were injured; drop-out was linked to injury and the week-5 jump in run length                                                                                                                                                  | One small cohort, 81.8% women, mean age 47; not the standard app plan                                                                                                                                                                                                                                                                                       | doi:10.3390/ijerph20176682; PMID 37681822; PMC10487403                                                                                                                                                 |
| **FEMALE, MASTERS, RECOVERY SIGNALS, MODELLING**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |                                                                |                                            |                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                        |
| [VF] McNulty KL et al. The effects of menstrual cycle phase on exercise performance in eumenorrheic women: a systematic review and meta-analysis, _Sports Med_ 50(10):1813–27                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | meta-analysis                                                  | 2020                                       | On average the effects are trivial, so phase-based plans should not be a default; the authors suggest personalising on each woman's own response                                                                                                                                                                                                                  | Low-quality studies; naturally cycling women only                                                                                                                                                                                                                                                                                                           | doi:10.1007/s40279-020-01319-3; PMID 32661839; PMC7497427                                                                                                                                              |
| [VF] Mountjoy M et al. 2023 International Olympic Committee's (IOC) consensus statement on Relative Energy Deficiency in Sport (REDs), _Br J Sports Med_ 57(17):1073–97                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | consensus                                                      | 2023                                       | Screening for and referral of low energy availability, with diagnosis left to a physician; relevant because Tropos also runs a nutrition engine                                                                                                                                                                                                                   | Consensus; written for developing to world-class athletes, not recreational runners                                                                                                                                                                                                                                                                         | doi:10.1136/bjsports-2023-106994; PMID 37752011                                                                                                                                                        |
| [VA] Tanaka H, Seals DR. Endurance exercise performance in Masters athletes: age-associated changes and underlying physiological mechanisms, _J Physiol_ 586(1):55–63                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | review                                                         | 2008                                       | Peak endurance performance holds to about 35, falls modestly until 50–60, then declines more steeply                                                                                                                                                                                                                                                              | —                                                                                                                                                                                                                                                                                                                                                           | doi:10.1113/jphysiol.2007.141879; PMID 17717011; PMC2375571                                                                                                                                            |
| [VA] Goom T, Donnelly G, Brockwell E. Returning to running postnatal: guidelines for medical, health and fitness professionals managing this population                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | expert guideline                                               | 2019                                       | A conservative return no earlier than about 12 weeks after birth, with screening; the product must defer to clinicians                                                                                                                                                                                                                                            | Expert consensus                                                                                                                                                                                                                                                                                                                                            | guideline PDF, March 2019 (no DOI): <https://athleticsni.org/download/files/Returning_to_running_postnatal_guideline_for_medical_health_and_fitness_professionals_managing_this_population.05.pdf>     |
| [VF] Vesterinen V et al. Individual endurance training prescription with heart rate variability, _MSSE_ 48(7):1347–54 (2016); [VA] Kiviniemi AM, Hautala AJ, Kinnunen H, Tulppo MP. Endurance training guided individually by daily heart rate variability measurements, _Eur J Appl Physiol_ 101(6):743–51 (2007)                                                                                                                                                                                                                                                                                                                                                                                                                               | RCTs                                                           | 2007/2016                                  | Training guided by heart-rate variability gave modest benefits (Vesterinen: 3000 m 2.1% faster against 1.1%, with fewer hard sessions). Both trials tested a go/no-go rule: hard sessions only while HRV stayed within an individual range around its recent average. Single-day HRV varies a lot, so Vesterinen used a 7-day average                             | Small samples                                                                                                                                                                                                                                                                                                                                               | doi:10.1249/MSS.0000000000000910, PMID 26909534; doi:10.1007/s00421-007-0552-2, PMID 17849143                                                                                                          |
| [U] Banister EW, Calvert TW, Savage MV, Bach T. A systems model of training for athletic performance, _Aust J Sports Med_ 7(3):57–61 (1975); [VA] Morton RH, Fitz-Clarke JR, Banister EW. Modeling human performance in running, _J Appl Physiol_ 69(3):1171–7 (1990)                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | model                                                          | 1975/1990                                  | The fitness–fatigue impulse-response model; Morton 1990 states its equation                                                                                                                                                                                                                                                                                       | Fitted to few subjects [U]                                                                                                                                                                                                                                                                                                                                  | 1975: no DOI, not in PubMed; 1990: doi:10.1152/jappl.1990.69.3.1171, PMID 2246166                                                                                                                      |
| [VF] Busso T. Variable dose-response relationship between exercise training and performance, _MSSE_ 35(7):1188–95                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | model                                                          | 2003                                       | The fatigue gain rises with load (a nonlinear model): k₂/k₁ 0.91, 1.21 and 1.51 at 300, 400 and 500 units a day. Its eq. 7 gives when a session's net effect turns positive and when it peaks (§6.2)                                                                                                                                                              | 6 untrained adults, cycling, 15 weeks                                                                                                                                                                                                                                                                                                                       | doi:10.1249/01.MSS.0000074465.13621.37; PMID 12840641                                                                                                                                                  |
| [VF] Hellard P, Avalos M, Lacoste L, Barale F, Chatard JC, Millet GP. Assessing the limitations of the Banister model in monitoring training, _J Sports Sci_ 24(5):509–20                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | methods                                                        | 2006                                       | The model fitted performance well (R² 0.79, error about 1%), but its parameters are imprecise and ill-conditioned (bootstrap CVs above 30% for every one; τ₁ and τ₂ correlated at 0.99), and the authors judge them unfit for monitoring training. Fitted τ₂ was 19 ± 11 days and k₂/k₁ about 1.4. This doc therefore treats the model as descriptive             | Swimmers (9)                                                                                                                                                                                                                                                                                                                                                | doi:10.1080/02640410500244697; PMID 16608765; PMC1974899                                                                                                                                               |
| [VA] Clarke DC, Skiba PF. Rationale and resources for teaching the mathematical modeling of athletic training and performance, _Adv Physiol Educ_ 37(2):134–52 (erratum 37(3):270–1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | teaching review                                                | 2013                                       | Equations of the impulse-response (fitness–fatigue) model, alongside the critical power model; typical parameter values [U]                                                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                                           | doi:10.1152/advan.00078.2011; PMID 23728131                                                                                                                                                            |
| [VF] Peng et al. _Int J Perform Anal Sport_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | collection of published model fits                             | 2023                                       | About 100 published Banister parameter sets; the 57 with k₂ > k₁ give the §6.2 ranges [C]                                                                                                                                                                                                                                                                         | Read as the SportRxiv preprint and its data file                                                                                                                                                                                                                                                                                                            | doi:10.1080/24748668.2023.2268480; data: github.com/kenp666/IR-model                                                                                                                                   |
| [VA] Busso T, Chalencon S. _MSSE_ 55(7):1274–85                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | modelling study                                                | 2023                                       | Forecasting ahead, Banister models erred by 2.0–2.7% on average, "not satisfactory for individual training planning"                                                                                                                                                                                                                                              | Abstract read                                                                                                                                                                                                                                                                                                                                               | PMID 36791017                                                                                                                                                                                          |
| [VF] Kontro H et al. _PLoS One_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | paper                                                          | 2026                                       | Says training platforms often fix τ at 42 days for fitness and 7 days for fatigue; its Table 2 gives Morton 1990's two fitted runners                                                                                                                                                                                                                             | A secondary source for both points                                                                                                                                                                                                                                                                                                                          | doi:10.1371/journal.pone.0341721; PMC12880663                                                                                                                                                          |
| **ADHERENCE, LONG-TERM IMPROVEMENT AND INJURY SEVERITY (§9)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |                                                                |                                            |                                                                                                                                                                                                                                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                                                             |                                                                                                                                                                                                        |
| [VA] Fokkema T et al. _J Sci Med Sport_ 22(1):106–11 (2019); [VF] Gilburn AS. _PLOS Glob Public Health_ 3(8):e0001786 (2023); [VA] Grunseit AC et al. _Health Promot Int_ 39(4):daae098 (2024); [VA] Lin Z, Althoff T, Leskovec J. _Proc WWW_ 2018:1501–11; [VA] Scharhag-Rosenberger F et al. _MSSE_ 41(5):1130–7 (2009); [VA] Stevinson C, Hickson M. _J Public Health_ 36(2):268–74 (2014) and 41(4):807–14 (2019); [VF] Feely C et al. _Front Sports Act Living_ 4:1096124; [VF] Nielsen RO et al. _PLoS One_ 9(6):e99877 (2014); [VA] Mulvad B et al. _PLoS One_ 13(10):e0204742 (2018); [VA] Yamato TP et al. _JOSPT_ 45(5):375–80 (2015); [VF] Stachenfeld NS. _Sports Med_ 44(Suppl 1):S97–104 (2014), which reproduces Ely 2007's chart | cohorts, a training study, a review and a consensus definition | 2009–24                                    | The anchors for dropout and return, 12-month improvement, time to recovery, the consensus injury definition and heat slopes by finish time (§9, items 4, 6, 7 and 9)                                                                                                                                                                                              | Mostly abstracts; populations and programmes differ from Tropos's users                                                                                                                                                                                                                                                                                     | DOIs inline in §9                                                                                                                                                                                      |

---

## 2. Findings that should drive decisions

Each finding has a grade and a product consequence. Section numbers point to the
detail.

1. **Keep most running genuinely easy. The evidence supports the principle much
   better than any exact percentage split.** World-class distance runners do at
   least 80% of their running volume at low intensity (Haugen 2022 [VF]).
   Across elite endurance athletes, about 80% of sessions are at low intensity
   (Seiler 2010 [VA]). Trials that compare distributions find small
   differences: polarized training has a small edge on VO2peak (SMD 0.24) and
   no edge on time trials (Oliveira 2024 [VF]). In recreational runners, both
   polarized and threshold-heavy plans improved race times by about 3–5% over
   8–10 weeks. Festa 2020 [VF] found no difference between them. In
   Muñoz 2014 [VA] the difference (5.0% vs 3.6% on a 10K) was not
   significant, but it favoured polarized, and the authors conclude that
   polarized training can work better. **MODERATE.** Product: protect easy days
   and explain them. Show the intensity distribution as information. Do not
   enforce 80/20. (§4.1–4.2)
2. **The best-supported injury signal is a single run that is much longer than
   anything run recently, not the weekly percentage increase.** In 5,205 runners
   followed for up to 18 months, any run more than 10% longer than the longest
   run in the previous 30 days raised the rate of overuse injury. Adjusted HRRs
   were 1.64 (95% CI 1.31–2.05) for a run 10–30% longer, 1.52 (1.16–2.00) for
   30–100% longer and 2.28 (1.50–3.48) for more than double. The study measured
   run distance, not duration. Week-to-week change was not associated. Of the
   acute:chronic workload ratio bands, only a more than doubled ratio went with
   lower risk (HRR 0.75, 0.59–0.96); the smaller bands were null
   (Frandsen 2025 [VF]). The only RCT of the 10% rule found no effect
   (Buist 2008 [VA]). **MODERATE** (one large cohort and one RCT). Product:
   replace any weekly-percentage cap with a "longest run in the last 30 days"
   guard, measured by distance. Keep it advisory, and label it a Tropos
   heuristic built on an observational finding. (§4.3, §6.3)
3. **Base injury rates for the simulation.** Novices sustain about 17.8
   injuries per 1000 h of running and recreational runners about 7.7
   (Videbæk 2015 [VF]). Programme-level proportions depend on the injury
   definition: 10.9% over a 6-week novice programme with a 3-session
   definition (Kluitenberg 2015 [VA]), about 20% over 8–13 weeks with a
   1-week definition (Buist 2008 [VA]) and 25.9% over 8 weeks with a 1-day
   definition (Buist 2010 [VA]). Other figures: about 17% over a 14-week
   half-marathon plan (Damsted 2019 [VA]), about 37% over 4–5 months among
   event entrants (Fokkema 2019 [VF]) and 35% over up to 18 months among watch
   users (Frandsen 2025 [VF]). **MODERATE.** (§6.3)
   Prevention programmes are not proven either: online prevention advice
   (Fokkema 2019 [VF]) and a short self-directed strength routine
   (Toresdahl 2020 [VF]) did not reduce injuries. Strength training should not
   be sold as injury protection. **MODERATE** for the null result.
4. **Taper for about 2 weeks (8–14 days); up to 3 weeks still works. Cut
   volume by about 41–60% and keep intensity and run frequency.** In
   competitive athletes, the best taper lasted 8–14 days, with volume cut
   exponentially by 41–60% (Bosquet 2007 [VA]). In endurance athletes, tapers
   of 21 days or less improved time trials: 8–14 days most (SMD −1.47, but from
   2 data sets in one study, n = 18) and 15–21 days also (SMD −0.78)
   (Wang 2023 [VF]). In more than 158,000 recreational marathoners, a strict
   3-week taper was associated with a median finish 2.6% (5 min 32 s) faster
   than a relaxed 1-week taper; adjusted for sex and fastest 10 km pace, the
   gain was 4.16 minutes (Smyth & Lawlor 2021 [VF]). **STRONG** for the pooled
   effect; **MODERATE** for the recreational marathon size. (§4.5)
5. **Marathon results track volume and long-run exposure, and simple
   predictors are too optimistic at the marathon.** More weekly volume, more
   runs of 32 km or longer and a longer longest run are all associated with
   faster marathons (Doherty 2020 [VA], compared across cohorts). Riegel
   predictions from shorter races were 10 minutes or more too fast for about
   half of recreational marathoners (Vickers & Vertosick 2016 [VF]). Vickers
   did not test VDOT; that VDOT is as optimistic is an inference from how
   closely VDOT and Riegel agree [C]. Across 114 published equations there is
   no single best (Keogh 2019 [VA]). **MODERATE.** Product: show marathon
   predictions as a range with a mileage-aware correction, never as a promise.
   (§4.4, §4.15)
6. **Heavy strength training for 10 weeks or more improves running economy; its
   effect on race performance is small and uncertain.** Strength training
   improves running economy by about 2–8% (Blagrove 2018 [VF]). Heavy loads
   improve economy (g −0.32), more over 10–14 weeks (g −0.45) than over 6–8
   weeks (g −0.21, not significant) (Eihara 2022 [VF]). The economy gain from
   high loads shows above 12 km/h (g −0.71) and in highly trained runners
   (−0.65); below 12 km/h, slower than 5:00 /km, it was not significant
   (g −0.06) (Llanos-Lagos 2024a [VF]). On performance, Eihara's heavy-load
   time-trial effect (g −0.24) is not significant, and Llanos-Lagos found an
   effect it calls moderate (ES −0.47) that pools time trials and time to
   exhaustion (Llanos-Lagos 2024b [VF]). Neither paper supports a minimum number
   of sessions a week: Llanos-Lagos found no effect of sessions a week or
   programme length, and Eihara did not analyse frequency. Heavy loads have
   larger point estimates than plyometrics, but no formal comparison was made.
   **MODERATE** for economy in highly trained runners and above 12 km/h;
   **WEAK** for recreational runners slower than 5:00 /km.
   Product: present strength as a useful, evidence-backed addition, not
   mandatory and not a guarantee against injury. (§4.9)
7. **Interference between lifting and running is real but selective.** In
   untrained and active people, leg hypertrophy and maximal leg strength are
   not compromised overall (Schumann 2022 [VF], which measured the lower body
   only). Explosive strength is blunted, especially when lifting and endurance
   work share a session; Schumann's result pools cycling and running, and by
   mode only cycling was significant. Lower-body strength gains are blunted in
   trained men (Petré 2021 [VF]; Huiberts 2024 [VF]). Muscle-fibre growth
   suffers slightly, more with running than cycling (Lundberg 2022 [VF]).
   Endurance gains are not harmed in trained people (Huiberts 2024 [VF]).
   **MODERATE.** Whether interference grows with how often and how long the
   endurance sessions are is less settled: Wilson 2012 [VA] found that it did,
   but Schumann 2022 found neither frequency nor modality changed it
   (**WEAK–MODERATE**). Product: the lifting plan should expect slower
   lower-body progress for trained men, most when lifting and running share a
   session and, by extrapolation, at high running volume (§6.6). The only
   high-volume trial checked here ran about 4 hours of endurance a week
   (§4.11). Upper-body progress is largely unaffected. (§4.10)
8. **Leave at least 6 hours between a hard lift and a hard run; 24 hours is
   better** (Robineau 2016 [VA]). In a combined session, lifting first protects
   lower-body strength gains, and order does not change aerobic gains (Murlasits
   2018 [VA]). Running first when the run matters most is **CONVENTION**.
   Lower-body lifting can make later running harder. At 6 hours the economy
   evidence is mixed: one study found economy worse at the faster stage only
   (Doma & Deakin 2013, _Int J Sport Health Sci_ [VF]), another found no change
   (Doma & Deakin 2014 [VA]), though time to exhaustion fell after heavy
   sessions. The next day, after a lift-and-run day, running cost was 5.6–10%
   higher when the lift came first and not significantly changed when the run
   came first (Doma & Deakin 2013, _Appl Physiol Nutr Metab_ [VA]). In men new
   to lifting, the energy cost of running stayed raised for up to 48 hours after
   a first heavy leg session (Doma 2019 [VF]). **WEAK–MODERATE.** The coaching
   default of heavy legs on hard-run days and never the day before a long run is
   **CONVENTION** consistent with this evidence. (§4.10, §7)
9. **Fitness can be maintained on a small dose.** Strength holds for months on
   about 1 session a week (Spiering 2021 [VA]; Rønnestad 2010 [VA]). After
   16 weeks of training, 1 session a week of 3 sets or of 1 set kept 1RM for
   32 weeks (Bickel 2011 [VF]). In 60–75-year-olds, neither dose kept muscle
   fibre size. VO2max held through 15 weeks when intensity was kept and
   training dropped from 6 to 4 or 2 days a week (Hickson 1981 [VA]) or
   sessions were cut by a third to two thirds (Hickson 1982 [VA]), though long
   endurance fell 10% at the shortest sessions. Cutting intensity instead lost
   part of the gain (Hickson 1985 [VA]). **MODERATE**, but the studies are on
   recently trained non-runners. Product: in a marathon block, the lifting plan
   should switch to maintenance rather than stop. (§4.11)
10. **Detraining is fast.** Trained athletes lose 4–14% of VO2max within
    4 weeks off. Recently gained fitness is gone after more than 4 weeks
    (Mujika & Padilla 2000 [VF]). VO2max falls about 7% by 2–3 weeks and about
    15–16% by 8–12 weeks (Coyle 1984 [VA]). **MODERATE.** Product: this supports
    Run15's re-entry restraint and gives detraining rates for the simulation.
    (§4.6, §6.4)
11. **Strides and hill sprints cost little and every major coach recommends
    them, but no trial isolates strides.** Short maximal running, uphill
    intervals and speed-endurance work have indirect support for running
    economy (Barnes 2013 [VA]; Skovgaard 2018 [VF]). **WEAK / CONVENTION.** Product:
    reasonable low-cost defaults, explained honestly. (§4.7, §5.11–5.12)
12. **Every session needs an effort fallback that works without a device.** The
    talk test tracks the first ventilatory threshold (Persinger 2004 [VF]).
    Age-based HRmax formulas are off by about ±10 bpm for an individual
    (Tanaka 2001 [VF]). **MODERATE.** Product: pair every pace target with a
    talk-test and RPE cue, and use heart-rate zones only from a measured or
    field-tested maximum. (§4.13)
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

| System                                                      | What Tropos can take from it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Limit                                                                                                                                                                                                                                                                                                          | Grade                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Daniels, _Running Formula_ 4th ed.** [VA]                 | The cleanest **intensity vocabulary**: E (easy/long; 59–74% VO2max, 65–79% HRmax [VA]); M (marathon pace); T ("comfortably hard", 88–92% HRmax, about the pace you could race for an hour, as a 20-minute tempo or as cruise intervals [VA]); I (95–100% VO2max, 98–100% HRmax, 3–5-minute repeats [VA]); R (about mile race pace [VA], short repeats with full recovery). **Per-session caps:** I no more than the lesser of 10 km or about 8% of weekly volume [VA]; R no more than the lesser of 5% of weekly volume or 5 miles (8 km) [VA]; T no more than about 10% of weekly volume [VA]; long run no more than 30% of weekly volume below 40 miles (64 km) a week, and at 40 miles a week or more no more than the lesser of 25% of weekly volume or 150 minutes [VA]. VDOT ties all paces to one current-fitness number. Tropos already uses VDOT in `runPaces.ts`.                                                   | The VDOT tables come from the Daniels–Gilbert equations, which assume trained-runner economy, so they are likely optimistic at the marathon for low-mileage runners. Vickers 2016 [VF] showed this for Riegel, which agrees closely with VDOT [C]; VDOT itself was not tested. The caps are expert rules.      | Paces [C] match the book's race-time table to within 1–10 s at VDOT 40–50 (the VDOT 30 marathon is 32 s slow) and its T pace exactly at VDOT 35, 40, 45 and 50. The computed E band is slower than the book's: about 11–12 s/km at its fast end and 4–9 s/km at its slow end (Appendix A). The caps are **CONVENTION** |
| **Hansons Marathon Method** [VA]                            | Three "SOS" (something of substance) days a week. Tuesday is speed (5K–10K pace) early in the plan, then "strength" (about 10 s/mile faster than goal marathon pace [VA]); Thursday is a goal-pace tempo; Sunday's long run is the third. **Cumulative fatigue**: no single huge day, steady moderate fatigue all week. The long run is capped at 16 miles (about 3 hours or less), a time-based alternative to the "you must run 20 miles" convention.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Assumes about 6 running days a week. The 16-mile cap is not tested against 20-milers, and Doherty 2020's correlation (more runs of 32 km or longer go with faster times) points the other way, though that evidence compares cohorts and is confounded.                                                        | **CONVENTION**                                                                                                                                                                                                                                                                                                         |
| **Fitzgerald, _80/20 Running_** [VA]                        | Easy means below the ventilatory threshold, the point where breathing abruptly deepens; Fitzgerald equates it with running slow enough to hold a conversation. Moderate and hard come from 20% of the time. Strong user-facing language for "slow down".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The 80/20 number describes elites. Trials in recreational runners show no clear advantage over other splits (§4.2).                                                                                                                                                                                            | Principle **MODERATE**; split **CONVENTION**                                                                                                                                                                                                                                                                           |
| **Hudson & Fitzgerald, _Run Faster_** [VA]                  | **Hill sprints** at least once a week, all year, as low-cost strength and power work: 8 s at maximal effort on a steep (about 6–8%) hill, with full recovery jogging slowly back down. Start with 1–2 after an easy run, add 1–2 a week up to 8–10, then move to 10 s on a slightly steeper hill. **Adaptive running**: change the plan in response to the athlete [U]. Gradual progression of race-specific work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Coach-authored.                                                                                                                                                                                                                                                                                                | **WEAK / CONVENTION**                                                                                                                                                                                                                                                                                                  |
| **Higdon Novice 1** [VA]                                    | The reference beginner marathon plan: 18 weeks, 4 runs a week plus 1 cross-training day, no speedwork, peak long run of one 20-miler. Useful as a ceiling on complexity for first-timers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Distance only; no individual dose; the 20-mile peak is long in time for slow runners (about 3.5–4 hours or more).                                                                                                                                                                                              | **CONVENTION**                                                                                                                                                                                                                                                                                                         |
| **Galloway run-walk-run** [VA]                              | Run:walk ratios matched to pace, taken from the start rather than once exhausted. The current chart gives seconds of running and walking: 90/30 at about 6:00 /km, 60/30 at about 7:00 /km, 30/30 at about 8:00 /km and 15/30 at 14:30–15:45 /mile. His 2008–2011 books gave older minute ratios (for example 3:1 at 10:00 /mile), now superseded. A "Magic Mile" field test. It makes walking a legitimate method.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | The specific ratios and claimed time savings come from the author. One small RCT found similar marathon times with less muscle pain and fatigue, though not less cardiac stress (Hottenrott 2016 [VA]).                                                                                                        | **WEAK**                                                                                                                                                                                                                                                                                                               |
| **NHS Couch to 5K** [VA]                                    | A widely used public-health structure: 9 weeks of 3 sessions, at least one rest day between, run-walk progression. Week 1 of the current plan is a 5-minute warm-up walk, then 1 minute running and 1 minute 30 seconds walking 7 times, a final 1-minute run and a 5-minute cool-down walk: 28 minutes 30 seconds in all, 8 minutes of it running. (The old NHS Livewell plan began with 60 s run / 90 s walk for 20 minutes.) The effort cues are a comfortable pace and steady breathing, and in week 4 a breathing rhythm of 3 steps in, 2 out; the plan pages do not mention the talk test.                                                                                                                                                                                                                                                                                                                              | Ends at 30 minutes of continuous running, which is often well short of 5 km [C]. Progression is fixed and does not adapt to the runner. The NHS cites no outcome data. One evaluation of a modified, group-delivered 9-week version (n = 110) found 27.3% completed it and 19% were injured (Relph 2023 [VF]). | **CONVENTION** (a widely used programme, not an RCT-optimised one)                                                                                                                                                                                                                                                     |
| **Lydiard** [VA]                                            | The **order of phases**: aerobic base, then hills (about 4–6 weeks), then a short anaerobic phase (about 4 weeks or less), then coordination and sharpening with races, then taper. The template for "general before specific".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Built for elite and club runners on high volume. Many details are historical.                                                                                                                                                                                                                                  | **CONVENTION**                                                                                                                                                                                                                                                                                                         |
| **Canova** [VA]                                             | The **funnel**: training speeds converge on race pace from both sides as the race nears (for example 90–110% of marathon pace narrowing to 95–105%), and the amount done at race-adjacent speeds grows. "Special blocks" put two demanding sessions in one day, every 3–4 weeks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Elite marathoners only. **Special blocks are not a recreational default.**                                                                                                                                                                                                                                     | **CONVENTION**                                                                                                                                                                                                                                                                                                         |
| **Vigil, _Road to the Top_** [U]                            | Patient, years-long aerobic development and a systematic approach to development.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Collegiate and elite; out of print.                                                                                                                                                                                                                                                                            | **CONVENTION**                                                                                                                                                                                                                                                                                                         |
| **Seiler** (research-practitioner) [VA]                     | The 3-zone model (below VT1 / between thresholds / above VT2) [U]; Seiler & Kjerland 2006 [VA] use VT1 and VT2 to define three zones. The descriptive pattern of about 80% of sessions at low intensity in elite endurance athletes. The finding that adding HIIT for well-trained athletes lacks long-term evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Mostly elite and well-trained populations.                                                                                                                                                                                                                                                                     | **MODERATE** (descriptive)                                                                                                                                                                                                                                                                                             |
| **Norwegian double threshold** (Bakken; Ingebrigtsens) [VF] | Threshold work split into intervals at controlled lactate (typically 2–4.5 mmol/L by session goal: about 2.5 for longer reps, about 3.5 for shorter ones) so more of it fits into a week. Two threshold sessions in one day, about twice a week, plus one hill or VO2 session, on a large easy base (Casado 2023 [VF]; Tjelta 2019 [VA]). The lesson this doc draws for consumers is **"sub-threshold intervals are a sustainable way to accumulate threshold work"**. Using it to make cruise intervals the default threshold format is the doc's own extrapolation: Casado 2023 covers only highly trained runners and would extend the model to other runners only once studies show it works and is safe.                                                                                                                                                                                                                 | Elite, guided by lactate meters, 140–160 km a week or more. **Double threshold days are not a recreational default.**                                                                                                                                                                                          | Idea **WEAK**; recreational transfer **CONVENTION**                                                                                                                                                                                                                                                                    |
| **Roche** [VA]                                              | Frequent **strides and hill strides** after easy runs, as low-cost economy and form work: about 20–30 s, quick but relaxed (about 80–90% of top speed), with 1–2 minutes of easy running between, which is close to a full recovery. Hill strides go on a 6–8% grade, and beginners start uphill because it lowers impact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Coach opinion.                                                                                                                                                                                                                                                                                                 | **CONVENTION**                                                                                                                                                                                                                                                                                                         |
| **Noakes, _Lore of Running_** [VA]                          | Durable training "laws": train gently and consistently, alternate hard and easy, build distance before speed, rest before racing, keep a log, and do not race in training.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 2003; parts of its physiology are contested.                                                                                                                                                                                                                                                                   | **CONVENTION**                                                                                                                                                                                                                                                                                                         |
| **Johnston & House, _Uphill Athlete_** [VA]                 | Aerobic base building and muscular-endurance strength work. The authors' aerobic-threshold check from heart-rate drift (40–60 minutes steady after a 10–15-minute warm-up; drift of 5% or less puts the starting heart rate at or below the aerobic threshold) is on their website, uphillathlete.com, not in the book [VA].                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Written for mountain runners and ski mountaineers; "aerobic deficiency syndrome" is not validated.                                                                                                                                                                                                             | **WEAK / CONVENTION**                                                                                                                                                                                                                                                                                                  |
| **McMillan calculator** [VA]                                | A benchmark to compare Tropos predictions and zones against.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Proprietary and unvalidated.                                                                                                                                                                                                                                                                                   | —                                                                                                                                                                                                                                                                                                                      |
| **Newer books (2022–2026)**                                 | A catalogue sweep on 2026-10-07 found several [VA]. Running: _Advanced Marathoning_ 4th ed. (Pfitzinger & Douglas, Human Kinetics, 2025, ©2026), which supersedes the 3rd ed. (2020) in the repo; _Run Like a Pro (Even If You're Slow)_ (Fitzgerald & Rosario, 2022); _Personal Best Running_ (Human Kinetics, 2023); _Running Past 50_ (Human Kinetics, 2024); _Developing Endurance_ 2nd ed. (NSCA, ©2025). Female physiology: _Next Level_ (Rodale, 2022) and _ROAR_, revised (Rodale, 2024). Hybrid training: _The Ultimate Hybrid Athlete_ (Viada, December 2025). Announced for 2027–2028: _Faster Road Racing_ 2nd ed., _Heart Rate Variability_ and _Train Smarter, Not Longer_ (Human Kinetics), and _Faster_ (Jones, HarperCollins). The 2022–2026 research and reviews (Frandsen 2025, Oliveira 2024, Llanos-Lagos 2024, Huiberts 2024, Storoschuk 2025) change decisions more than any recent book is likely to. | Only the catalogue records were checked; none of these books has been read, and none is evidence (§9, item 3).                                                                                                                                                                                                 | —                                                                                                                                                                                                                                                                                                                      |

**How the systems agree.** They agree on more than they disagree.
(a) Most volume should be easy. (b) Have 1–3 key sessions a week, separated by
easier days. (c) Build general fitness before race-specific work.
(d) Reach the peak long run gradually. (e) Taper before the goal race.
(f) Build speed in small, low-fatigue doses (strides, hill sprints, short
reps).

**Where they disagree.** The peak long run (Hansons 16 miles vs Higdon and
Pfitzinger 20 miles or more), how much threshold work is right (Norwegian and
Hansons more; 80/20 less) and how much work between the two thresholds has a
place (pyramidal elites do more of it, mostly as tempo runs or intervals near
the second threshold; strict polarized very little). Evidence does not settle
any of these, so they should be **user-visible parameters with a sensible
default**, not hidden truths.

---

## 4. Research by topic

### 4.1 Intensity distribution

- World-class distance runners do at least 80% of their running volume at low
  intensity throughout the year (Haugen 2022 [VF]). In elite endurance athletes
  more generally, about 80% of training sessions are at low intensity and about
  20% contain high-intensity work (Seiler 2010 [VA]); that is a count of
  sessions, not of volume. In preparation phases elite runners train
  **pyramidally** (most in zone 1, then zone 2, least in zone 3) and shift
  toward **polarized** near competition (Casado 2022 [VA]). Race-pace volume
  rises as the competition approaches (Haugen 2022 [VF]). **MODERATE**
  (descriptive).
- Intervention evidence in trained athletes slightly favours polarized
  training for VO2peak (Stöggl & Sperlich 2014 [VF]: +11.7% in 9 weeks;
  Oliveira 2024 [VF]: SMD 0.24). It does not consistently favour it for
  time-trial performance (Oliveira 2024 [VF]: equivalent; Rosenblat 2019 [VA]:
  ES −0.66 from few studies; Rosenblat 2025 in the repo emphasises moderation
  at the athlete level). **MODERATE: no universal winner.**
- Sequence and distribution moved performance by similar, small amounts in one
  16-week trial in well-trained runners. Pyramidal then polarized gave the best
  5 km result (−1.5%). Changing only the order changed the result by 0.6
  points, and changing only the distribution by 0.5 points. Every change was
  below the trial's 3.2% smallest detectable change (Filipas 2022 [VF]). The
  evidence does not show that sequencing matters more than distribution.
  **WEAK** (one trial).
- "Zone 2" marketing: a 2025 narrative review found no evidence that zone 2 is
  uniquely effective for mitochondrial capacity or VO2max in the general
  population (Storoschuk 2025 [VA]). **MODERATE** (review).

**Where evidence runs out.** No trial tests intensity distribution in true
beginners (VDOT 25–35) over months. In that group, consistency and total volume
are the likely drivers of improvement, but that is an assumption, not a
finding. The nearest evidence is in marathoners and is cross-sectional. Across
cohorts, more weekly volume goes with faster marathons (Doherty 2020 [VA]). In
2:47–3:36 amateurs, weekly volume and training pace are the two main training
correlates of marathon time (Tanda 2011 [VF]). Neither study measured
consistency or improvement over time.

### 4.2 Recreational-runner trials

| Trial                  | Who                                               | Duration       | Arms                            | Result                                                                                                                      |
| ---------------------- | ------------------------------------------------- | -------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Muñoz 2014 [VA]        | 30 club runners (10K about 39 min, VDOT ≈ 53 [C]) | 10 weeks       | Polarized vs between-thresholds | 10K −5.0% vs −3.6% (not significant); compliant runners did better on polarized                                             |
| Festa 2020 [VF]        | 38 recreational                                   | 8 weeks        | 77/3/20 vs 40/50/10             | Both +3.0–3.5% on 2 km speed; no difference                                                                                 |
| Esteve-Lanao 2007 [VA] | 12 sub-elite                                      | about 5 months | 80/12/8 vs 67/25/8              | Zone-1-heavy improved more on a 10.4 km cross-country course (−157 s vs −121.5 s)                                           |
| Filipas 2022 [VF]      | 60 well-trained men                               | 16 weeks       | 4 periodisations                | Pyramidal then polarized best (−1.5% on 5 km; the other arms −0.6% to −1.1%; all below the 3.2% smallest detectable change) |

**Takeaway.** Trained recreational runners improve about 3–5% in 8–10 weeks of
structured training under either distribution. **MODERATE.** The extra effect
of distribution is small next to the effect of training consistently.

### 4.3 Volume progression and injury

- **The 10% rule:** in an RCT of 532 novices, a graded 13-week programme gave
  the same injury rate as an 8-week one (20.8% vs 20.3%; Buist 2008 [VA]).
  **MODERATE** evidence against it as a protective rule.
- **Big weekly jumps:** in novices, more than 30% over 2 weeks compared with
  less than 10% made no difference to all injuries taken together. For
  "distance-related" injuries such as patellofemoral pain, ITB syndrome and
  medial tibial stress syndrome it gave HR 1.59 (0.96–2.66; P = .07)
  (Nielsen 2014 [VA]). **WEAK–MODERATE** (the confidence interval crosses 1).
- **Single-session spikes** (Frandsen 2025 [VF]: 5,205 Garmin users in 87
  countries, 588,071 sessions, mean age 45.8, 22% female, median running
  experience 9.5 years, followed for up to 18 months; 35% reported any injury
  and 25.2% an overuse injury). The exposure is each run's distance divided by
  the longest run in the previous 30 days; duration was not studied. Against a
  run no longer than that, or up to 10% longer, the overuse-injury rate rose
  when one run was longer still (adjusted HRR, 95% CI):
  - more than 10% to 30% longer: 1.64 (1.31–2.05)
  - more than 30% to 100% longer: 1.52 (1.16–2.00)
  - more than 100% longer: 2.28 (1.50–3.48)

  A run 1–10% longer, against one no more than 1% longer, gave HRR 1.19
  (0.90–1.57). That is not significant, so a step under 10% is not shown to be
  safe either. Week-to-week change was not associated. Of the ACWR bands, only
  the more-than-doubled one was significant, and it went with **lower** risk
  (HRR 0.75, 0.59–0.96). The authors tested no subgroups, so applying these
  figures to novices is an extrapolation. **MODERATE**: one large prospective
  cohort, with injuries self-reported and confounding possible.

- **ACWR:** the ratio has conceptual and mathematical problems
  (Impellizzeri 2020 [VA]). A ratio built on a random chronic load is about as
  strongly associated with injury as one built on the real load, and neither
  predicts injury usefully: a c-statistic of 0.574 for the real ratio, against
  0.5 for a model with no predictor (Impellizzeri 2021 [VF]).
  **Do not encode it as a predictor.** `trainingLoad.ts` already labels its
  ramp line a Tropos heuristic; keep it advisory or retire it (§8).
- **Base incidence:** novices 17.8 and recreational runners 7.7 injuries per
  1000 h (Videbæk 2015 [VF]). The novice figure pools studies: the three with
  8–13 weeks of follow-up gave 30.1–33.0 per 1000 h. Previous injury is the
  most consistent risk factor (Hulme 2017 [VA]), but Hulme gives no pooled
  size. Fokkema 2019 [VF] found an adjusted OR of 2.21 (1.84–2.65) for an
  injury in the previous 12 months. New injuries were common in that cohort, so
  the odds ratio overstates the risk: as a risk ratio it is about 1.6 [C], and
  §6.3 sweeps about 1.5–2×. **MODERATE.**
- **Prevention programmes:** online multifactorial advice had no effect
  (Fokkema 2019 [VF]: OR 1.08, 0.90–1.30), and a 10-minute self-directed
  strength routine had no effect on injury-related marathon non-completion
  (Toresdahl 2020 [VF]: 7.1% vs 7.3%). Strength training reduces injuries in
  sport generally (Lauersen 2014 [VA]), but running-specific trial evidence is
  null or absent. **MODERATE** for "not proven in runners".

**Product rule this supports (advisory, labelled a heuristic).** Flag any
planned run whose distance is more than 10% above the longest run completed in
the previous 30 days. Frandsen measured distance only, so applying the same
bound to duration, and progressing the long run by **time** within it, is a
Tropos extrapolation. The bound covers one session, not a series of steps:
three 10% steps in one week (10 → 11 → 12.1 → 13.3 km) may still be too much,
and a step under 10% is not shown to be safe. Treat weekly percentage changes
as context, not a limit.

#### Verified parameters (2026-10-07)

This block covers §4.3 and §6.3. Checked against PubMed abstracts. Frandsen 2025, Videbæk 2015 and Fokkema 2019 were also read in full. These replace the old snippet-based status of the injury sources in §1, §4.3 and §6.3.

**Frandsen 2025.** Br J Sports Med 59(17):1203–10; doi:10.1136/bjsports-2024-109380; PMID 40623829; PMC12421110. Full text read.

- Cohort: 5,205 Garmin users from 87 countries. Mean age 45.8; 22.1% female; median running experience 9.5 years. 588,071 sessions; median 80 sessions at risk; follow-up up to 18 months.
- Exposure: each run's distance divided by the longest single run in the previous 30 days. Distance only. Duration was not studied.
- Reference: a run no longer than that, or up to 10% longer (ratio 0 to 1.1).
- Outcome: the first self-reported overuse injury (1,311 events). Traumatic injuries were a competing risk. An injury was pain that cut running volume, intensity or frequency; it did not have to stop running.
- Adjusted HRR for overuse injury (Table 1):
  - more than 10% to 30% longer: 1.64 (95% CI 1.31–2.05)
  - more than 30% to 100% longer: 1.52 (1.16–2.00)
  - more than 100% longer: 2.28 (1.50–3.48)
  - no run in the previous 30 days: 0.80 (0.40–1.61)
- The first two intervals overlap. Model them as one band of about 1.5–1.6, and doubling as about 2.3.
- 1–10% longer vs up to 1% longer: HRR 1.19 (0.90–1.57). Not significant. A step under 10% is not shown to be safe.
- Week-to-week ratio: 0.97, 0.88 and 0.91. Every interval includes 1, so there is no association.
- ACWR: 0.94 (0.79–1.12), 0.87 (0.75–1.02) and 0.75 (0.59–0.96). Only the more-than-doubled band is significant, and it is lower.
- No novice result. The authors did not test subgroups. Applying these HRRs to beginners is an extrapolation.
- 35.0% reported any injury (1,820 of 5,205), and 25.2% an overuse injury. Crude overuse rate: 2.2 per 1000 sessions [C].

**Videbæk 2015.** Sports Med 45(7):1017–26; doi:10.1007/s40279-015-0333-8; PMID 25951917. Full text read.

- Novices 17.8 (16.7–19.1) per 1000 h. Recreational runners 7.7 (6.9–8.7) per 1000 h.
- The novice figure mixes studies. Three with 8–13 weeks of follow-up gave 30.1–33.0 per 1000 h. Two that followed people for a year or more gave less.
- For the simulation, use about 30 per 1000 h in a novice's first 8–13 weeks, falling towards 7.7.

**Calibration targets**

| Target                                | Verified value                                                      | Injury definition                                                     | Source                                                                |
| ------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 6-week Start to Run                   | 10.9% of 1,696 novices                                              | hampered running for 3 sessions in a row                              | Kluitenberg 2015, Scand J Med Sci Sports 25(5):e515–23; PMID 25438823 |
| 8–13 weeks to a 4-mile (6.7 km) event | 20.3% (8 weeks) vs 20.8% (13 weeks, 10% rule); P = .90; 532 novices | running restricted for at least 1 week                                | Buist 2008, Am J Sports Med 36(1):33–9; PMID 17940147                 |
| 14-week half-marathon plan            | 136 of 784 (17.3% [C])                                              | not in the abstract                                                   | Damsted 2019, J Sci Med Sport 22(3):281–7; PMID 30190100              |
| Event entrants, mean 4.5 months       | 37.5% vs 36.7%; 2,378 runners                                       | less running for at least 1 week, or a clinician visit, or medication | Fokkema 2019, Br J Sports Med 53(23):1479–85; PMID 30954948           |
| Watch users, up to 18 months          | 35.0% any injury; 25.2% overuse                                     | less running volume, intensity or frequency                           | Frandsen 2025                                                         |
| First-time marathoners, 12 weeks      | 7.1% vs 7.3% stopped by overuse injury; 720 enrolled                | did not start or did not finish the marathon                          | Toresdahl 2020, Sports Health 12(1):74–9; PMID 31642726               |

- Fokkema: 52.1% had an injury in the previous year, and 22.7% still had one at the start. Control group by event: marathon 41.2%, half 38.1%, 10 km 33.8%, 5–7.5 km 28.1%.
- Toresdahl: all race-stopping injuries 8.9%; minor injuries 48.5%.
- More short-programme targets: 25.9% over 8 weeks at 30.1 per 1000 h, counting a 1-day restriction (Buist 2010, PMID 18487252). 15.2–16.8% over 9 weeks, counting a 1-week restriction (Bredeweg 2012, PMID 22842237).
- The definition sets the proportion. Match the simulated injury event to each target's definition.

**Corrections (applied in §4.3, §6.3 and §6.5)**

- The §6.3 Poisson check matches Buist by chance. At 30.1 per 1000 h, 13.5 h gives 33% [C]. Buist 2010's 25.9% implies about 10 h of running in 8 weeks [C]. Calibrate rate and hours together.
- Persona A (§6.5): about 10–25% over 6–12 weeks, depending on the definition.
- Previous injury: Hulme 2017 (Sports Med 47(5):869–86; PMID 27785775) confirms the direction but gives no size. Fokkema found OR 2.21 (1.84–2.65) for an injury in the previous year. The outcome is common, so the OR overstates the risk ratio: the crude RR is 1.51, and the adjusted OR implies RR ≈ 1.63 (1.48–1.79) at a 29.3% baseline [C]. Sweep about 1.5–2×. Do not use 2.21 as a hazard multiplier.
- Nielsen 2014 (PMID 25155475): all injuries showed no difference between groups. Only "distance-related" injuries gave HR 1.59 (0.96–2.66), P = .07.
- Prevention trials were null: Fokkema OR 1.08 (0.90–1.30); Toresdahl RR 0.97 (0.57–1.63).
- The ACWR random-chronic-load result is Impellizzeri 2021, Sports Med 51(3):581–92 (PMID 33332011), not the 2020 IJSPP paper.

**Still unverified**

- Frandsen's R code. The supplement's sensitivity analyses (S4–S8) were read in a later check; §6.3 gives their results.
- Full texts of Buist 2008, Nielsen 2014, Kluitenberg 2015, Damsted 2019 and Hulme 2017. Only their abstracts were read.
- Whether the single-run guard holds for duration, or for novices.
- The severity mix and layoff lengths for runners who are not novices. The novice tiers in §6.3 come from Kluitenberg 2016 (§9, item 7).

### 4.4 Long runs, volume and marathon outcome

- Across 137 cohorts, weekly distance, runs per week, the biggest week, the
  number of runs of 32 km or more, the longest run, training pace and weekly
  hours were each associated with faster marathon times when modelled one at a
  time (R² 0.38–0.81; Doherty 2020 [VA]). **MODERATE association** that
  compares cohorts, so it is confounded: faster runners also train more. It
  cannot show which variable matters most.
- An individual-level regression (Tanda 2011 [VF]) predicts marathon pace from
  weekly km K and mean training pace P over the 8 weeks that end 7 days before
  the race: Pm = 17.1 + 140·exp(−0.0053·K) + 0.55·P (s/km), with SEE 5.77 s/km
  (about 4 minutes). It was fitted on 22 runners and 46 marathons, with
  finishes of 2:47–3:36, K of 40–111 km and P of 4:13–5:31 /km; outside those
  ranges it extrapolates. **WEAK–MODERATE.** Useful for the simulation's "what
  volume buys" curve (Appendix A).
- Large app-data studies: marathons are run at about 85% of critical speed on
  average (93% for 2:30 runners, 79% for 6-hour runners). Runners whose average
  speed over 2–16 km was above about 94% of CS were more likely to slow by more
  than 25% over the last 12.2 km: 26.0% vs 20.5% of men, and 15.6% vs 9.6% of
  women (Smyth & Muniz-Pumares 2020 [VF]). That is a modest rise in risk, not a
  prediction of collapse. **MODERATE** (observational). Product: a pacing guard
  for race day.
- Men slow more than women in the second half of marathons: 15.6% against
  11.7%, and women's odds of slowing by 30% or more were 0.36 times men's
  (Deaner 2015 [VA]).

### 4.5 Taper

- Pooled across sports: about 2 weeks, volume reduced 41–60% (exponentially
  shaped), intensity and frequency maintained (Bosquet 2007 [VA]). **STRONG.**
- Recreational marathoners: tapers up to 3 weeks long and strict (the lighter
  weeks together, just before the race) were associated with faster finishes.
  A strict 3-week taper gave a median 2.6% (5 min 32 s) against a relaxed
  1-week taper, not against no taper. Adjusted for sex and ability, it was
  4.16 min (about 1.8%). A strict 4-week taper did no better (Smyth & Lawlor
  2021 [VF]). **MODERATE** (observational).
- Elites taper for 7–10 days (Haugen 2022 [VF]). Recreational marathoners appear
  to benefit from longer tapers. One explanation, untested and offered here only
  as a hypothesis, is that their accumulated marathon-block fatigue takes
  longer to clear relative to their fitness.
- The Banister model gives the same answer from a different direction: with
  the common 42/7/2 parameters, a session's net benefit peaks about 3 weeks
  later [C]. Published fits put it at about 3–7 weeks, median about 4 (§6.2).

### 4.6 Detraining and return

- In trained athletes, less than 4 weeks off costs 4–14% of VO2max. In recently
  trained people, the recent gains are completely lost after more than 4 weeks
  (Mujika & Padilla 2000 [VF]). VO2max falls about 7% by about 2–3 weeks and
  about 15–16% by 8–12 weeks, then stabilises (Coyle 1984 [VA]). **MODERATE.**
- Reduced training can **maintain** VO2max for up to 15 weeks if intensity is
  kept and frequency drops from 6 to 4 or 2 sessions a week (Hickson &
  Rosenkoetter 1981 [VA]), or session length is cut by about a third or two
  thirds (Hickson 1982 [VA]). These were recently trained young adults, not
  runners, and 2 h endurance fell 10% at 13 minutes a day. Cutting intensity by
  a third or two thirds lost part of the gains. VO2max fell but stayed above
  pretraining after the one-third cut, and long-term endurance fell 21% and 30%
  (Hickson 1985 [VA]). **MODERATE.** Product: a "maintenance week" during
  travel or illness recovery keeps short hard efforts and drops volume. Never
  stack missed quality work (that rule is already in the handoff).
- **Where evidence runs out:** there is no trial-based return-to-run ramp after
  a layoff. Coaches typically take roughly as many weeks to rebuild as were
  missed, starting at 50–70% of the previous volume with no quality work for
  1–2 weeks. That is **CONVENTION**, and consistent with Run15.

### 4.7 Strides, sprints and neuromuscular work

- **No trial isolates strides.** The indirect evidence is: near-maximal
  speed-endurance work (5–10 × 30 s) with 36% less volume improved running
  economy in trained runners (Skovgaard 2018 [VF]); short near-maximal bursts
  improved 5 km in moderately trained runners (10-20-30; Gunnarsson & Bangsbo
  2012 [VA]); weighted-vest strides had acute economy effects (Barnes 2015
  [VA]); and high-intensity uphill work gave the largest neuromuscular and
  economy gains (Barnes 2013 [VA]). **WEAK** (indirect) for strides;
  **MODERATE** for sprint-type work improving economy in trained runners.
- Why coaches use strides anyway: they cost almost nothing, practise fast and
  relaxed mechanics, and prepare the legs for workouts and races
  (**CONVENTION**: Daniels, Pfitzinger, Roche, Hudson).

### 4.8 Hills

- Six weeks of uphill intervals at any intensity improved a 5 km time trial by
  about 2%. The highest intensity was best for economy (+2.4%) and for
  neuromuscular measures (Barnes 2013 [VA]). In well-trained runners, 6 weeks
  of incline intervals (10% grade, 30 s) or level intervals improved economy,
  but the control group improved as much, so the trial shows no economy effect
  of either interval type (Ferley 2014 [VF]). Level intervals did more for
  run-to-exhaustion at vVO2max (Ferley 2013 [VA]). **MODERATE**: hills are a
  valid, lower-impact form of hard work but not a magic one.
- Lydiard placed a 4–6-week hill phase between base and speed (Lydiard 1997
  [VA]). **CONVENTION.**

### 4.9 Strength training for runners

- Running economy improves about 2–8% in most trials (Blagrove 2018 [VF]).
- Heavy resistance training (≥70% of 1RM) improved economy (g −0.32); the
  ≥90% 1RM subgroup was much the same (g −0.31). Plyometrics gave g −0.13. For
  time trials, heavy training gave g −0.24, but its confidence interval
  crossed zero; plyometrics gave −0.17 (−0.27 to −0.06). The authors did not
  compare the two directly (Eihara 2022 [VF]).
- High-load training improved economy across 8.6–17.9 km/h (ES −0.27), with
  the gains above 12 km/h and in highly trained runners; at 12 km/h or slower
  it gave g −0.06. Combined methods improved economy only at 10.0–14.5 km/h
  (ES −0.43, low certainty). Plyometrics helped only at slower speeds
  (≤12 km/h) (Llanos-Lagos 2024a, in the repo [VF]).
- High-load training improves time trials and time to exhaustion (performance
  ES −0.47). Combining two or more methods may give more. The effect on VO2max
  is trivial (Llanos-Lagos 2024b [VF]).
- Strength training twice a week for 20 weeks improved economy by about 4.8%
  in competitive runners. After 20 more weeks at once a week in season, the
  40-week gain (3.5%) was no longer significant (Beattie 2017 [VF]). Explosive
  training improved 5 km time (Paavolainen 1999 [VA]).
- Typical effective dose in trials: 2–3 sessions a week for 6–24 weeks, heavy
  multi-joint lower-body lifts (squat, deadlift and variants, step-ups, calf
  raises), often with plyometrics (Llanos-Lagos 2024a [VF]: 1–4 sessions a
  week, 6–24 weeks; sessions a week did not change the economy effect).
  **MODERATE.**
- **Limits.** Almost all trials are in trained runners. Effects on recreational
  marathon time are inferred, not measured. The injury-prevention evidence in
  runners is null or absent (§4.3).

### 4.10 Concurrent-training interference (lifting plus running)

| Question                                           | Answer                                                                                                                                                                                                                                                                    | Source                                                                                                                          | Grade                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Does running hurt hypertrophy or maximal strength? | Not overall (SMD −0.01 and −0.06)                                                                                                                                                                                                                                         | Schumann 2022 [VF]                                                                                                              | MODERATE                      |
| Muscle-fibre hypertrophy?                          | Small negative effect (−0.23); larger for type I fibres with running (−0.81, 3 studies)                                                                                                                                                                                   | Lundberg 2022 [VF]                                                                                                              | WEAK–MODERATE                 |
| Explosive strength and power?                      | Blunted (−0.28), especially when lifting and endurance work share a session (−0.31; not significant ≥3 h apart). This pools cycling and running; by mode, only cycling was significant                                                                                    | Schumann 2022 [VF]; Wilson 2012 [VA]                                                                                            | MODERATE                      |
| Lower-body maximal strength in trained lifters?    | Blunted in trained people (−0.35), but only when lifting and endurance share a session (−0.66; −0.10 when more than 2 h apart). Not significant in untrained or moderately trained people, though Huiberts found no training-status effect                                | Petré 2021 [VF]; Huiberts 2024 [VF]                                                                                             | MODERATE                      |
| Sex?                                               | Lower-body strength blunted in men (−0.43) but not women (0.08)                                                                                                                                                                                                           | Huiberts 2024 [VF]                                                                                                              | MODERATE                      |
| Does lifting hurt endurance gains?                 | Not in trained people; VO2max gains are impaired in untrained people (−0.35)                                                                                                                                                                                              | Huiberts 2024 [VF]                                                                                                              | MODERATE                      |
| What drives interference?                          | Wilson: how often and how long the endurance sessions are, with running worse than cycling. Later meta-analyses disagree: Schumann found neither frequency nor running vs cycling a moderator, and in Sabag cycling HIIT trended worse than running HIIT (−0.38 vs −0.18) | Wilson 2012 [VA]; Schumann 2022 [VF]; Sabag 2018 [VA]                                                                           | WEAK–MODERATE                 |
| Order within one session?                          | Strength first gives better lower-body strength (+3.96 kg, Murlasits; +6.91%, Eddens); aerobic gains are unaffected by order                                                                                                                                              | Murlasits 2018 [VA]; Eddens 2018 [VF]                                                                                           | MODERATE                      |
| Gap between sessions?                              | 0 h worst for strength (half-squat 1RM +16.7% at 0 h, +31.5% at 6 h, +25.6% at 24 h); VO2peak gains best at 24 h                                                                                                                                                          | Robineau 2016 [VA]                                                                                                              | WEAK (one RCT, rugby players) |
| Does a leg session hurt the next run?              | At 6 h, time to exhaustion falls after heavy sessions; economy is mixed. The day after a lift-and-run day, time to exhaustion falls 18–29% and economy is worse when lifting came first. Effects can last up to 48 h after a first session                                | Doma & Deakin 2013, _Int J Sport Health Sci_ [VF]; Doma & Deakin 2013, _Appl Physiol Nutr Metab_, and 2014 [VA]; Doma 2019 [VF] | WEAK                          |

### 4.11 Minimum dose to keep strength (and running fitness)

- In young adults (20–35), strength and muscle size held for 32 weeks on one
  ninth of the original dose (1 session a week, 1 set per exercise). In older
  adults (60–75), strength held on both a third and a ninth of the dose, but
  neither dose kept the gain in muscle-fibre size. With no training at all,
  strength fell 7% over 32 weeks but stayed 23% above baseline (Bickel 2011
  [VF]).
- A narrative synthesis: strength is maintained with about 1 session a week of
  1 or more heavy sets per exercise, and endurance is maintained by keeping
  intensity while cutting frequency to as little as 2 sessions a week or volume
  by 33–66% (Spiering 2021 [VA]). The primary trials are Hickson &
  Rosenkoetter 1981 [VA] for frequency and Hickson 1982 [VA] for duration. What
  they kept was VO2max and short-term endurance; 2 h endurance fell 10% at
  13 minutes a day.
- One heavy session a week in season kept preseason strength gains in cyclists
  for 13 weeks (Rønnestad 2010 [VA]).
- **MODERATE**, but none of these populations were runners in a marathon block.
  Product: "Maintain" is a real lifting mode during marathon-specific phases,
  typically 1–2 sessions a week of heavy, low-volume work done short of
  failure.

#### Verified parameters (2026-10-07)

This block covers §4.9–4.11 and §6.6. Checked against the primary sources on 2026-10-07. Every source was read as a PubMed abstract. Full text was read for Schumann 2022, Huiberts 2024, Petré 2021, Lundberg 2022, Eddens 2018, Eihara 2022, Blagrove 2018, both Llanos-Lagos 2024 papers, Doma 2019, Doma & Deakin 2013 (IJSHS) and Bickel 2011. [C] marks a figure computed here from a paper's reported means.

**Interference with lifting gains**

| Quantity                                          | Value                                                                                                                                              | Source                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Maximal strength, explosive strength, hypertrophy | SMD −0.06, −0.28, −0.01 (43 studies). Explosive: same session −0.31, ≥3 h apart not significant. Frequency and running vs cycling did not moderate | Schumann 2022, PMID 34757594 |
| Lower-body strength by sex                        | Men −0.43 (95% CI −0.64 to −0.22); women 0.08 (−0.34 to 0.49)                                                                                      | Huiberts 2024, PMID 37847373 |
| Power by sex                                      | Men −0.27; women −0.52                                                                                                                             | Huiberts 2024                |
| Lower-body 1RM by training status                 | Trained −0.35; moderately trained −0.20 (p = 0.08); untrained 0.03. Trained, same session −0.66; >2 h apart −0.10                                  | Petré 2021, PMID 33751469    |
| Ratio of concurrent to lift-only 1RM gain         | Untrained 0.96, moderately trained 0.88, trained 0.83 [C]                                                                                          | Petré 2021, Table 3          |
| Fibre hypertrophy                                 | −0.23 overall; type I with running −0.81 (3 studies)                                                                                               | Lundberg 2022, PMID 35476184 |
| Effect sizes, strength-only vs concurrent         | Size 1.23 vs 0.85; strength 1.76 vs 1.44; power 0.91 vs 0.55                                                                                       | Wilson 2012, PMID 22002517   |

**Does interference scale with running volume?** Partly, and the evidence is weak.

- Wilson 2012: effect sizes fall as endurance frequency (r −0.26 to −0.35) and duration (r −0.29 to −0.75) rise.
- Jones 2013: a 1:1 ratio blunted strength more than 3:1.
- Hickson 1980: 6 × 40 min of endurance a week. Squat +25% vs +44% with strength only (ratio 0.57 [C]).
- Schumann 2022 found no frequency effect.
- Running vs cycling is inconsistent across meta-analyses.
- The pooled trials average 2.6–2.9 endurance sessions a week of about 30–37 min (Petré). No meta-analysis covers marathon-block volumes. The run-volume thresholds in §6.6 are extrapolation.

**Spacing and order**

- Robineau 2016 (rugby players, 7 weeks): 0 h was worst for strength. Half-squat 1RM was +16.7% at 0 h, +31.5% at 6 h, +25.6% at 24 h and +24.6% with strength only. VO2peak gains were best at 24 h.
- Lifting first within a session: lower-body 1RM +3.96 kg (Murlasits 2018) or +6.91% (Eddens 2018). VO2max is unaffected by order.

**A leg session before a run** (male runners or lifting-naive men; small samples)

- At 6 h: running economy is mixed. It was unchanged in Doma & Deakin 2014 and worse in Doma & Deakin 2013 (IJSHS). Time to exhaustion falls after heavy sessions.
- The day after a lift-and-run day: cost of running +5.6–10% when lifting came first. Time to exhaustion falls 18–29% [C] (Doma & Deakin 2013, PMID 23724883).
- After a single session: cost of running +5.3% at 24 h [C], with some effects to 48 h (Doma 2019).
- After 2–3 sessions the submaximal impairment fades (repeated-bout effect; Doma 2017, 2023).
- No study measures a loss of training stimulus.

**Maintenance dose**

- Strength is kept on 1 session a week. Rønnestad 2010: 13 weeks in cyclists. Bickel 2011: 32 weeks, even at 1 set.
- Bickel 2011: with no training, strength fell 7% but stayed 23% above baseline. Neither maintenance dose kept fibre size in 60–75-year-olds.
- Endurance is kept for up to 15 weeks if intensity is kept. Frequency can drop to 2 sessions a week (Hickson 1981), or session length by up to two thirds (Hickson 1982). Cutting intensity loses part of the gains (Hickson 1985). At 13 min a day, 2 h endurance fell 10%.

**Strength for runners**

- Running economy improves 2–8% (Blagrove 2018).
- Heavy training: economy g −0.32. The time-trial effect, g −0.24, is not significant (Eihara 2022).
- High load: economy ES −0.27, with gains at speeds above 12 km/h. At 12 km/h or slower, g −0.06. Combined methods −0.43 at 10–14.5 km/h (Llanos-Lagos 2024a).
- High load: performance ES −0.47; VO2max unchanged (Llanos-Lagos 2024b).
- Sessions a week was not a moderator.

**Simulation multipliers (§6.6) and C_s (lifting-evidence §4.4)**

| Effect                                                            | Supported value                                                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lower-body strength, untrained lifter                             | ×0.9–1.0                                                                                                                                                                       |
| Lower-body strength, trained man, sessions ≥3 h apart             | ×0.85–0.95                                                                                                                                                                     |
| Lower-body strength, trained man, same session or high run volume | ×0.6–0.8 for C_s, keyed to about 4 h or more of endurance a week; §6.6 uses ×0.6–0.85 at 50+ km a week. Both extrapolated; no pooled or single estimate falls below about 0.57 |
| Lower-body strength, woman                                        | ×0.9–1.0                                                                                                                                                                       |
| Upper-body strength                                               | ×0.95–1.0 for C_s; §6.6 keeps ×0.9–1.0. No checked source measured the upper body (ASSUMPTION)                                                                                 |
| Explosive strength and power                                      | ×0.6–0.85                                                                                                                                                                      |
| Leg hypertrophy (C_h)                                             | ×0.9–1.0, sweep to 0.8                                                                                                                                                         |
| VO2max, trained runner                                            | ×1.00                                                                                                                                                                          |
| VO2max, untrained beginner                                        | ×0.85–0.95, swept 0.8–1.0 (ASSUMPTION; Huiberts SMD −0.35, borderline)                                                                                                         |
| Time trial through economy                                        | +0.5–2%, sweep 0–3%                                                                                                                                                            |
| Maintenance block                                                 | 1 heavy session a week holds strength for 3–8 months                                                                                                                           |

**Corrections (applied in §2, §4, §6 and §7)**

- Cite Hickson 1981 and 1982 for frequency and duration cuts. Hickson 1985 is the intensity-cut study.
- Bickel 2011: older adults did not keep size on a third of the dose.
- Eihara: −0.32 is all heavy training, not the ≥90% 1RM subgroup.
- Llanos-Lagos 2024a: the combined-method speed range is 10–14.5 km/h.
- Doma: "6–24 h" should read "6 h to 48 h, mostly after the first sessions".

**Still unverified:**

- Robineau, Wilson, Murlasits, Spiering, Rønnestad and the Hickson papers: full text not read; abstracts and secondary reports only.
- No source here gives a rate multiplier. Every ×value above is a modelling choice calibrated to these effect sizes.
- The 5–15% stimulus down-weight after heavy legs remains an ASSUMPTION.
- The ×0.93–0.97 leg-session penalty after a hard run (lifting-evidence §4.4) is an ASSUMPTION.

### 4.12 Heat, hills, terrain and treadmill

- **Heat:** marathon times worsen as air temperature rises above an optimum of
  about 4–10 °C (3.8–9.9 °C, depending on performance level; El Helou 2012
  [VF]). Ely 2007 [VA] measured heat stress as WBGT: top men ran 1.7% off the
  course record at WBGT 5–10 °C and 4.5% off at 20–25 °C, and slower runners
  slowed more. Cite Ely for the slower-runners point. El Helou's authors found
  that, at population level, temperature has its full effect whatever the
  runner's ability; their own supplementary table shows larger losses for
  slower men but not for slower women, relative to each group's optimum. Do not
  apply Ely's WBGT cut-offs to an air-temperature band. Acclimatisation takes
  about 1–2 weeks (Racinais 2015 [VF]). **MODERATE.** Product: on hot days,
  convert pace targets to effort, heart-rate or talk-test bands and show a
  one-line reason (roadmap B2). Do not mark a hot-day run as a "miss".
- **Hills:** the energy cost of running changes predictably with gradient
  (Minetti 2002 [VA]), which is the basis of grade-adjusted pace. Product: run
  hills by effort, and judge hilly runs by grade-adjusted pace or effort, not
  raw pace.
- **Treadmill:** a 1% incline approximates the energy cost of running outdoors
  (Jones & Doust 1996 [VA]).

### 4.13 Anchoring easy pace: heart rate, RPE and the talk test

- **Talk test:** being able to speak comfortably tracks VT1. In 16 healthy
  young adults, the point where speech first became difficult sat almost
  exactly at the ventilatory threshold (Persinger 2004 [VF]). The last stage at
  which speech was still comfortable tracked VT, with errors biased toward
  passing the test above VT (Foster 2008 [VA]). A review calls it a valid,
  reliable, practical and inexpensive tool (Reed & Pipe 2014 [VA]).
  **MODERATE.** It is a validated device-free easy-pace check; none of these
  studies compares it with other device-free methods.
- **Session RPE** (CR10 rating × minutes) is a validated, device-free load
  measure (Foster 2001 [VF]). **MODERATE.**
- **Heart rate:** use a **measured or field-tested HRmax** or lactate-threshold
  heart rate. Age formulas err by about ±10 bpm for an individual (Tanaka
  2001 [VF]). Heart rate lags on short repeats and drifts upward in heat and on
  long runs, so it is a poor target for strides, repetitions and hill sprints.
  **MODERATE.**
- Reference bands. Seiler & Tønnessen 2009 [VF] give a five-zone scale: zone 1
  55–75% HRmax, zone 2 75–85%, zone 3 85–90%, zone 4 90–95%, zone 5 95–100%.
  A later scale (Tønnessen 2024 [VF]) uses 60–72%, 73–82%, 83–87%, 88–92% and
  above 93% for zones 1–5, with a sixth zone above 10 mmol/L lactate. Daniels'
  bands (Daniels 2021 [VA]): E 65–79%, M 80–89%, T 88–92%, I 98–100%.

### 4.14 Critical speed

- Critical speed (CS) is the fastest speed with a metabolic steady state, the
  boundary between the heavy and severe intensity domains (Jones & Vanhatalo
  2017; Poole 2016; Jones 2019 [VF]). In race terms it is roughly the speed a
  runner can hold for about 20–40 minutes: typically 20–30 minutes in lab
  tests, varying widely between people (about 15–40 minutes). For well-trained
  runners that is near 10K pace; the severe domain spans race distances from
  800 m up to perhaps 10,000 m (Jones & Vanhatalo 2017 [VF]). For slower
  runners whose 10K takes more than about 45 minutes, CS falls between 5K and
  10K pace. That mapping is this doc's inference from the time-to-exhaustion
  window; none of the three reviews gives it. Threshold work sits just below
  CS. The concept is **MODERATE**; the race-pace mapping is an approximation.
- CS can be estimated from the best efforts in a runner's own training log
  (fastest 400–5000 m) without a dedicated test, and it predicts marathon
  performance with about 8% error (Smyth & Muniz-Pumares 2020 [VF]).
  **MODERATE.** Product: a passive fitness estimate that fits behind
  RUN-EV-08's consent gate.

### 4.15 Race-time prediction and its error

- Riegel's formula is T2 = T1·(D2/D1)^k. Riegel's fit gave k ≈ 1.08 for elite
  runners' world records and 1.05–1.06 for men aged 40–70; calculators use
  1.06 (Riegel 1981 [U], as reported by Vickers & Vertosick 2016 [VF]). With
  k = 1.06, Riegel and VDOT agree closely: both convert a 50:00 10K into about
  3:50 for the marathon [C].
- For recreational runners, Riegel (tested with k = 1.07) holds up to the half
  marathon but **underestimates marathon time**, by 10 minutes or more for
  about half of runners (median 10 min 9 s too fast). Models that add weekly
  mileage do better: mean squared error 380.7 for Riegel, 227.6 for one race
  plus mileage and 208.3 for two races plus mileage. These were recreational
  runners, not a first-timer sample: the marathoners ran a median 64 km a week
  (Vickers & Vertosick 2016 [VF]). **MODERATE.**
- There is no single best equation. Across 114 equations, the reported
  standard error ranged from 0.27 to 27.4 minutes, and only 19 equations
  reported one (Keogh 2019 [VA]). A model built from device data fits a
  runner's own best efforts in a season to about 2%; that is a fit, not a
  forecast. Predicting the marathon from shorter efforts was accurate to within
  about 10% (Emig & Peltonen 2020 [VF]).
- Product: show a **range**, widen it when weekly volume is low or the longest
  recent run is short, and explain why.

#### Verified parameters (2026-10-07)

This block covers §4.4, §4.5, §4.15 and §6.5. Checked against the primary sources on 2026-10-07. "Full text" means the whole paper was read. "Abstract" means only the PubMed abstract was read. [C] is computed here.

**Taper**

- Bosquet 2007 (MSSE 39(8):1358–65, PMID 17762369; abstract only, the full text is paywalled). 27 of 182 studies, competitive athletes. Best result: a 2-week taper (ES 0.59 ± 0.33), with volume cut 41–60% exponentially (ES 0.72 ± 0.36) and intensity and frequency kept.
- Wang 2023 (PLoS One 18(5):e0282838, PMID 37163550; full text). 14 studies of trained endurance athletes. Time-trial SMD −0.45. A 41–60% volume cut gave SMD −0.77; cuts of 20% or less, and of 60% or more, were not significant. By duration: 7 days or less −0.36 (17 data sets); 8–14 days −1.47 (2 data sets); 15–21 days −0.78 (3 data sets); 22 days or more not significant (1 data set).
- Smyth & Lawlor 2021 (Front Sports Act Living 3:735220, PMID 34651125; full text). 158,117 Strava marathoners who ran a mean 39–43 km a week. A taper is "strict" when every down week falls together, right before the race. The comparator is a relaxed 1-week taper, not no taper. A strict 3-week taper gave a median 5 min 32 s (2.6%). After adjusting for sex and fastest 10 km pace, the gain is 4.16 min, about 1.8%. A strict 4-week taper did no better (3.67 min). The study is observational and kept only each runner's fastest marathon of the year.
- Haugen 2022 (PMID 35362850; full text). Elite tapers start 7–10 days out.

**Training, pacing and heat**

- Doherty 2020 (J Sci Med Sport 23(2):182–8, PMID 31704026; abstract). 137 cohorts. Each training variable alone gave R² 0.38–0.81. The non-finisher rate was 7.27%; this is not an injury rate.
- Tanda 2011 (J Hum Sport Exerc 6(3):511–20, doi:10.4100/jhse.2011.63.05; full text). Pm (s/km) = 17.1 + 140.0·exp(−0.0053·K) + 0.55·P.
  - K and P are averaged over the 8 weeks that end 7 days before the race, warm-ups included.
  - SEE is 5.77 s/km, about 4 min.
  - It was fitted on 22 runners (21 men) and 46 flat, evenly paced marathons. The fitted ranges are a finish of 2:47–3:36, K of 40–111 km and P of 4:13–5:31 /km. Anything outside those ranges is an extrapolation.
- Tanda 2022 (doi:10.14198/jhse.2022.172.05; search-snippet abstract only). RMSE 5.4 min inside 2:47–3:36 and 9.5 min below 2:47. Not tested above 3:36.
- Smyth & Muniz-Pumares 2020 (MSSE 52(12):2637–45, PMID 32472926; full text).
  - Marathons were run at 84.8% of critical speed (CS): 93.0% for 2:30 finishers and 78.9% for 6:00 finishers. CS predicted finish time to about 8%.
  - The 94% rule applies to 2–16 km pace, not the first half. Above 94% of CS, the share slowing by more than 25% over the last 12.2 km rose from 20.5% to 26.0% in men and from 9.6% to 15.6% in women. That is a modest rise in risk, not a prediction of collapse.
- Deaner 2015 (PMID 24983344; abstract). The second half was slower by 15.6% in men and 11.7% in women. Women's odds of slowing by 30% or more were 0.36 times men's.
- Smyth 2021 (PMID 34010308; full text). 28% of men and 17% of women hit the wall.
- Ely 2007 (PMID 17473775; abstract). Top men were 1.7% slower than the course record at WBGT 5–10 °C and 4.5% slower at 20–25 °C. Slower runners lost more.

**Prediction**

- Vickers & Vertosick 2016 (BMC Sports Sci Med Rehabil 8:26, PMID 27570626; full text and supplement).
  - The marathoners in the sample ran a median 64 km a week. They were not first-timers.
  - Riegel was tested with k = 1.07, not 1.06. It was accurate up to the half marathon. At the marathon it was 10 min or more too fast for about half of runners (median −10:09).
  - MSE: Riegel 380.7; one race plus weekly mileage 227.6; two races plus mileage 208.3.
- Vickers Model 1 (supplement): marathon speed (m/s) = 0.16018617 + 0.83076202 × Riegel speed (k = 1.07) + 0.06423826 × (miles a week ÷ 10). Compared with Riegel at k = 1.06, it is 7–10% slower at 30–50 km a week and 2.5–5% slower at 65–80 km a week [C].
- Riegel 1981. The exponent 1.06 is confirmed only through Vickers. Valid from about 3.5 min to 3:50.
- Keogh 2019 (IJSPP 14(9):1159–69, doi:10.1123/ijspp.2019-0360; abstract). 114 equations. SEE ranged from 0.27 to 27.4 min, and only 19 equations reported one.
- Emig & Peltonen 2020 (PMID 33024098; full text). The 2.0% is how well the model fits a season's own races. It is not a forecast.

**Daniels' caps.** Source: verbatim reader highlights of the 4th edition (ISBN 978-1-7182-0367-9). The long-run rule was then checked in the book itself (ch. 4, p. 53).

- T: no more than 10% of weekly mileage in one workout.
- R: the lesser of 8 km (5 miles) or 5% of weekly mileage.
- M: the lesser of 110 min or 18 miles (29 km).
- Long run: no more than 30% of weekly mileage under 64 km (40 miles) a week; at 64 km a week or more, the lesser of 25% or 150 min.
- I: the lesser of 10 km or 8%. Taken from another reader's highlights; the edition is not confirmed.
- M heart rate: 80–89% of HRmax.

**Personas [C]**

- The VDOT and Riegel anchors are correct.
- Persona B: Tanda's 4:06:51 comes from inputs outside the fitted ranges. Vickers Model 1 gives about 3:43–3:55 for a 45:30–48:00 10K at 55–65 km a week.
- Persona C: the taper is worth about 4–6 min. For sub-3:30, Vickers Model 1 needs a half of about 1:33–1:35 at 50–65 km a week.

**Still unverified:** Bosquet's full text; Riegel 1981 itself; Tanda 2022 beyond a search snippet; a causal number for "pacing is worth minutes" (the 10 minutes in §6.5, persona C, is an association). The Banister ranges were outside this check; see the block after §6.4.

### 4.16 Run-walk for beginners

- Couch to 5K's run-walk structure is a widely used public-health on-ramp
  (CONVENTION). Its outcome evidence is thin: in one evaluation of a modified,
  group-delivered 9-week version (110 people), 27.3% completed it and 19% were
  injured (Relph 2023 [VF]). In recreational marathoners, a run-walk strategy
  gave similar finish times with less muscle pain and fatigue (Hottenrott
  2016 [VA]). Claims that run-walk prevents injury are unproven. **WEAK.**
- Product: run-walk should be first-class. It is not a fallback or a failure
  state.

### 4.17 Female and masters runners (only where evidence is reasonably strong)

- **Menstrual cycle:** on average, the effects on performance are trivial
  (McNulty 2020 [VF]). **Do not default to cycle-phase programming.** McNulty
  recommends personalising on each woman's own response across the cycle.
  Letting users log symptoms and choose any change is Tropos's product
  translation of that, not a recommendation in the review. **MODERATE.**
- **Low energy availability / REDs:** the IOC consensus (Mountjoy 2023 [VF])
  treats low energy availability as a continuum. It says intensified training
  and body-composition change can be periodised safely when experts guide
  them, and that calorie restriction usually brings low carbohydrate
  availability too, which magnifies the harm. An unsupervised app cannot meet
  the expert-guidance condition. So, as Tropos's own precaution drawn from the
  consensus rather than a rule it states, the nutrition engine should avoid
  aggressive calorie deficits during big running blocks. Use "worth discussing
  with a clinician" copy, never a diagnosis: a REDs diagnosis is a physician's
  job. Show it for the consensus's indicators. Primary: 3 or more missed
  periods in a row (12 or more, or primary amenorrhoea, count double); one
  high-risk bone-stress injury (femoral neck, sacrum, pelvis), 2 or more
  low-risk ones in 2 years, or 6 months or more off training for bone-stress
  injury. Secondary: periods more than 35 days apart (8 or fewer a year), or one
  low-risk bone-stress injury. In men: low testosterone (clinically low counts
  double), low libido or fewer morning erections. The consensus is aimed at
  developing to world-class athletes. **MODERATE–STRONG** (consensus).
- **Pregnancy and postpartum:** defer to clinicians. Postnatal guidance is a
  conservative return no earlier than about 12 weeks after birth, with
  screening (Goom 2019 [VA], expert consensus). This is already a "stop
  automated progression" state in the handoff.
- **Pacing:** women pace marathons more evenly than men; their second halves
  were 11.7% slower against men's 15.6% (Deaner 2015 [VA]).
- **Concurrent training:** lower-body strength interference appears in men but
  not women (Huiberts 2024 [VF]).
- **Masters:** peak endurance performance holds to about 35, falls modestly
  until 50–60, then declines progressively more steeply (Tanaka & Seals 2008
  [VA]). The authors put much of the decline down to the lower training
  intensity and volume older athletes can sustain. Relative trainability is
  broadly preserved [U]. Keeping strength training matters more with age.
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
| 10  | All-out                             | The finish of a time trial (hill sprints are all-out too, but last only seconds) |

**Talk test.** T1 is a full conversation. T2 is full sentences with a little
more breath. T3 is short phrases. T4 is a word or two. T5 is no talking. These
five levels are a Tropos convention: the studies score the talk test in three
stages (comfortable, unsure, not comfortable). In Persinger 2004 [VF] the last
stage with comfortable speech sat at or just below VT1, and only the stage where
speech was clearly not comfortable sat above it. Reed & Pipe 2014 [VA] place
comfortable speech below the ventilatory or lactate threshold; their paywalled
full text was not checked for a five-level scale [U]. So T1–T2 is at or below
VT1, and Tropos treats it as easy. In Persinger's young adults VT1 sat at 89%
of peak heart rate on the treadmill, so pair the talk test with the E pace or
heart-rate band rather than using it alone.

**Pace anchors** use the runner's _current_ fitness (VDOT in `runPaces.ts`),
never a hoped-for goal. Daniels' codes: E, M, T, I, R. As a computed example,
a VDOT 40 runner (10K 50:00) gets roughly E 6:07–6:44 /km, M 5:27, half-marathon
pace 5:15, T 5:06, 10K pace 5:00, 5K pace 4:49, I 4:41 and R 4:23 [C,
Appendix A]. The computed E band is slower than Daniels' own table, which gives
5:56–6:38 /km at VDOT 40 [VA].

**Heart-rate guides** are given as a percentage of a **measured** HRmax. Heart
rate is not used for strides, repetitions or hill sprints, where it lags too
much to be useful (§4.13).

### 5.0b Quick reference

| Session                | Family                   | RPE                   | Talk             | Pace anchor              | %HRmax (rough)                   | Recovery cost | Typical frequency (recreational)         |
| ---------------------- | ------------------------ | --------------------- | ---------------- | ------------------------ | -------------------------------- | ------------- | ---------------------------------------- |
| Easy                   | easy                     | 3–4                   | T1–T2            | E                        | 65–79                            | low           | most runs                                |
| Recovery               | easy                     | 1–2                   | T1               | slow end of E or slower  | below about 76                   | very low      | optional, day after hard                 |
| Long                   | easy (endurance)         | 3–4, may reach 5 late | T1–T2            | E                        | 65–79                            | moderate–high | 1/week                                   |
| Medium-long            | easy (endurance)         | 3–4                   | T1–T2            | E                        | 65–79                            | moderate      | 0–1/week (half or full marathon builds)  |
| Steady / aerobic       | moderate                 | 5                     | T2               | between E and M          | 75–85                            | moderate      | 0–1/week                                 |
| Marathon pace          | moderate (race-specific) | 6                     | T2–T3            | M                        | 80–89                            | moderate–high | 0–1/week in marathon blocks              |
| Tempo (continuous)     | hard (threshold)         | 7                     | T3               | T                        | 88–92                            | moderate–high | 0–1/week                                 |
| Cruise intervals       | hard (threshold)         | 7                     | T3               | T                        | 88–92                            | moderate      | 0–1/week                                 |
| VO2max intervals       | hard                     | 8–9                   | T4               | I                        | 90–100 by the end of each repeat | high          | 0–1/week                                 |
| Repetitions            | hard (speed)             | 8 (short)             | T5 during        | R                        | not useful                       | moderate      | 0–1/week (5K/10K focus)                  |
| Strides                | speed (low cost)         | 6–7, relaxed          | —                | about mile to 5K effort  | not useful                       | very low      | 2–4/week                                 |
| Hill sprints           | speed / power            | maximal for 8–10 s    | —                | effort                   | not useful                       | low–moderate  | 1–2/week                                 |
| Hill repeats           | hard                     | 7–9                   | T4               | 5K–3K effort             | 85–95                            | high          | 0–1/week                                 |
| Fartlek                | mixed                    | 3–8                   | varies           | surges at 10K–5K effort  | varies                           | moderate      | 0–1/week                                 |
| Progression            | mixed                    | 3, rising to 6–7      | T1, ending at T3 | E rising to M or T       | rising                           | moderate      | 0–1/week                                 |
| Race-pace long run     | race-specific            | 3–4, then 6           | T1, then T2–T3   | E + M                    | rising                           | very high     | every 2–3 weeks late in a marathon block |
| Shakeout               | easy                     | 1–2                   | T1               | very easy                | below about 70                   | negligible    | before races                             |
| Run-walk               | easy                     | 2–4                   | T1–T2            | E for the running bits   | below about 80                   | low           | novice default; any long event           |
| Time trial / benchmark | test                     | 9–10                  | T5               | all-out for the distance | 95+                              | high          | every 4–8 weeks at most                  |

### 5.1 Easy run

- **Purpose.** The aerobic base: improvements in cardiac output and stroke
  volume, capillary and mitochondrial density, fat use, and tissue tolerance to
  the repetitive load of running, all at low fatigue cost. Daniels lists injury
  resistance, a stronger heart, better blood delivery and favourable muscle
  fibre changes [VA]. Most of the weekly volume belongs here (Seiler 2010 [VA];
  Haugen 2022 [VF]). **MODERATE** that "mostly easy" works. The mechanism
  claims for low intensity specifically are **CONVENTION** (Storoschuk
  2025 [VA]).
- **Feel.** RPE 3–4. T1–T2 (full sentences). Breathing relaxed and
  unhurried.
- **Pace.** Daniels E. About 1:00–2:00 /km slower than 5K race pace for most
  recreational runners (VDOT 40: 6:07–6:44 /km against a 5K pace of
  4:49 /km [C]). Below VT1. Slower on hills, in heat and when tired; go by
  effort.
- **Heart rate.** About 65–79% of HRmax (Daniels [VA]); zones 1–2 on both
  five-zone scales in §4.13.
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
  Claims that it actively _speeds recovery_ are unproven (**CONVENTION**).
  Pfitzinger's plans, quoted second-hand, say the opposite: recovery runs are
  done "to enhance recovery for your next hard workout" [U]. For people
  running 4 or fewer days a week, rest or easy cross-training is usually the
  better use of the day.
- **Feel.** RPE 1–2. T1. Shorter than an easy run.
- **Pace.** The slowest end of E or slower; no target.
- **Heart rate.** Below 76% of HRmax, or below 70% of heart-rate reserve
  (Pfitzinger [VA]).
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
  (Doherty 2020 [VA]; **MODERATE association**, confounded). The dose is
  **CONVENTION**.
- **Feel.** RPE 3–4 for most of it; RPE 5 late is normal. T1–T2.
- **Pace.** E. Pfitzinger sets most long runs 10–20% slower than goal
  marathon pace [VA]. Heart rate drifts upward late, more so in heat.
- **Heart rate.** The E band; accept some drift late.
- **Dose and progression.** Beginners 45–75 minutes. Half-marathon builds
  90–120 minutes. Marathon peaks in the sources range from 16 miles or about
  3 hours (Hansons [VA]) to 20 miles or more (Higdon [VA]; Pfitzinger [VA],
  who builds most marathoners to 21–22 miles, 34–35 km). Daniels caps a single
  long run at 30% of weekly mileage for runners under 64 km (40 miles) a week,
  and at the lesser of 25% of weekly mileage or 150 minutes from 64 km a week
  [VA]. Tropos already uses a 150-minute ceiling, labelled a heuristic
  (RUN-EV-06). Progress so that no run is more than about 10% longer in
  distance than the longest run of the previous 30 days (Frandsen 2025 [VF],
  observational: a run 10–30% longer had an adjusted HRR for overuse injury
  of 1.64, 95% CI 1.31–2.05). Frandsen measured distance only, so applying the
  bound to long-run minutes is a Tropos extrapolation. A step of 1–10% was not
  shown to be safe either (HRR 1.19, 0.90–1.57), and the bound covers one run,
  not a series of 10% steps. Add a cutback every 3–4 weeks (**CONVENTION**).
- **Recovery cost and placement.** Moderate to high; 1–2 easy days after. Put
  it on the day with the most free time, at least 48 h after a VO2max or
  hill-repeat session and at least 48 h after heavy lower-body lifting
  (**CONVENTION**, consistent with Doma 2019 [VF]; Robineau [VA] backs at most a
  24 h gap, not 48 h). In Doma 2019 [VF] the energy cost of running stayed
  raised for up to 48 h after a first heavy leg session in men new to lifting.
- **Common mistakes.** Too fast; big jumps in length; no fuel on runs over
  about 75–90 minutes (standard sports-nutrition practice [R]); scheduling it
  the day after a hard leg session.
- **Plain English.** "Your long run builds endurance, the ability to keep
  going for a long time. Run it at an easy, chatty effort. The time on your
  feet does the work, not the speed. Add length gradually: this is the run
  most likely to cause trouble if it grows too fast."

### 5.4 Medium-long run

- **Purpose.** A second endurance stimulus in midweek: more aerobic volume
  without a second weekend long run. Pfitzinger's medium-long runs are 11–15
  miles (18–24 km), usually midweek [VA]. In Tropos they are the
  `easy_60/75/90` templates.
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
  just above VT1. Elite distance training is pyramidal, with more zone-2 than
  zone-3 volume, but its zone-2 sessions are tempo runs and aerobic intervals
  at about the second threshold (Casado 2022 [VA]). Its abstract does not
  support a large share of steady running near VT1 in elite plans. Lydiard's
  base did include fast aerobic running just under "steady state", for example
  10 miles at three-quarter effort (Lydiard [VA]). **CONVENTION.** Strict
  80/20 advocates would keep it minimal.
- **Feel.** RPE 5. T2: you could talk in sentences but would rather not.
- **Pace.** Between E and M, roughly marathon pace plus 15–30 s/km
  (**CONVENTION**).
- **Heart rate.** About 75–85% of HRmax: zone 2 on Seiler & Tønnessen's
  five-zone scale (Seiler 2009 [VF]), and zone 2 to the bottom of zone 3 on
  the later scale (Tønnessen 2024 [VF]).
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
  run at goal marathon pace [VA]. Pfitzinger puts marathon-pace segments in
  long runs [U]. Elites increase race-pace volume as competition nears (Haugen
  2022 [VF]). **CONVENTION** with descriptive support.
- **Feel.** RPE about 6, controlled early. T2–T3 (short sentences).
- **Pace.** Current-fitness marathon pace (Daniels M; VDOT 40 → 5:27 /km [C]).
  **Set it from current fitness, not the goal.** If the goal pace feels like
  RPE 7 or more in the first few kilometres, the goal is ahead of the runner's
  fitness.
- **Heart rate.** About 80–89% of HRmax (Daniels [VA]).
- **Dose and progression.** Start with 3–5 km (15–20 minutes) inside an easy
  run. Build to 12–20 km in the final 8–10 weeks (Hansons up to 10 miles [VA];
  Daniels: no more than the lesser of 110 minutes or 18 miles, 29 km [VA]).
  Weekly or every other week in marathon blocks.
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
  which improves speed endurance (Daniels T [VA]). In recreational runners, a
  plan with more threshold work improved about as much as a polarized plan
  (Festa 2020 [VF]). In Muñoz 2014 [VA] both groups improved their 10K time
  and the difference was not significant, but the point estimate favoured
  polarized training (5.0% against 3.6%), and the authors conclude that
  polarized training can do more. Muñoz's comparator was not
  threshold-focused: it spent 46% of its time in zone 1, 35% in zone 2 and 19%
  in zone 3. Threshold work is central to modern elite training (Casado 2023
  [VF]). **MODERATE.**
- **Feel.** "Comfortably hard" (Daniels [VA]). RPE about 7. T3 (a few words).
  Breathing deep and rhythmic, not gasping.
- **Pace.** About the pace you could race for an hour (Daniels [VA]): between
  10K and half-marathon pace for most recreational runners, and close to 10K
  pace for runners whose 10K takes about an hour or more. VDOT 40 →
  5:06 /km [C].
- **Heart rate.** 88–92% of HRmax (Daniels [VA]): zones 3–4 on Seiler &
  Tønnessen's scale (Seiler 2009 [VF]) and zone 4 on the later one (Tønnessen
  2024 [VF]).
- **Dose and progression.** 15–20 minutes to start (or 2 × 10 minutes), then
  20–30 minutes; Daniels' classic tempo is 20 minutes steady [VA].
  Pfitzinger's marathoners hold lactate-threshold pace for 20–40 minutes [VA].
  Keep T to no more than 10% of weekly mileage in one workout (Daniels [VA]).
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
  thanks to short rests (Daniels [VA]). It resembles the Norwegian
  lactate-guided threshold intervals, but Casado 2023 [VF] describes those only
  in highly trained 1500–5000 m runners, notes that no controlled study has
  tested them, and would extend them to other runners only once studies show
  they work and are safe. **MODERATE / CONVENTION.**
- **Feel.** RPE about 7 during each repeat; breathing settles within about a
  minute.
- **Pace.** T pace, **the same for every repeat**.
- **Heart rate.** 88–92% by the end of each repeat.
- **Dose.** For example 3–5 × 5–8 minutes, or 3–6 × 1–2 km, with about
  1 minute of jogging per 5 minutes of running (Daniels [VA]; a secondary
  source gives 20–25% rest [R]). Total T time 20–40 minutes for recreational
  runners.
- **Recovery cost.** Moderate, and often lower perceived cost than a
  continuous tempo of the same total time. Daniels names no default between
  the two formats: the steady tempo builds confidence, and cruise intervals
  give a longer total time at T [VA]. Making either one the Tropos default is a
  convention.
- **Common mistakes.** Speeding up across the repeats; taking long rests that
  turn it into an interval session.
- **Plain English.** "Threshold running split into chunks with short jogs in
  between. The breaks let you spend more total time at that 'comfortably hard'
  effort with less strain. Every repeat should feel the same, so resist
  speeding up."

### 5.9 VO2max intervals

- **Purpose.** Time near maximal oxygen uptake, which raises VO2max and the
  speed at VO2max (Daniels I [VA]; Buchheit & Laursen 2013 [VA]; Helgerud 2007
  [VA] for VO2max, [U] for the speed). Milanović 2015 [VF] supports the VO2max
  part only. Across 28
  controlled trials in 723 mostly untrained to recreationally active adults,
  interval training raised VO2max by about 5.5 mL/kg/min against controls, but
  only about 1.2 mL/kg/min more than continuous training, with signs of
  publication bias; its "HIT" also pools sprint intervals with intervals at
  90–95% of HRmax. **MODERATE–STRONG** for VO2max gains in untrained and
  moderately trained people; the edge over continuous running is small.
- **Feel.** RPE 8, reaching 9 by the end of each repeat. T4. Heavy
  breathing.
- **Pace.** I pace: about what you could race for 10–12 minutes, roughly 3K
  to 5K race pace (Daniels [VA]). VDOT 40 → about 4:41 /km [C].
- **Heart rate.** Reaches about 90–100% by the end of 3–5-minute repeats
  (Daniels: 98–100% [VA]). Heart rate lags, so pace and effort are better
  guides.
- **Dose and progression.** 3–5-minute repeats with equal or slightly shorter
  jogging recovery (Daniels [VA]); 12–20 minutes in total at I, and no more
  than the lesser of 10 km or 8% of weekly volume (Daniels [VA]). Accessible
  variants: 4 × 4 minutes (Helgerud [VA]); 30 s/30 s rather than 15 s/15 s for
  less-trained athletes (Buchheit & Laursen [VA]). The review covers
  moderately trained to elite athletes, so using 30 s/30 s for beginners is
  **CONVENTION**. Progress by adding repeats, then lengthening them.
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

- **Purpose.** Daniels gives R three primary purposes: anaerobic power, speed
  and running economy (Daniels R [VA]). Full recovery keeps the quality of
  movement high. In one uncontrolled study, short near-maximal work improved
  economy in trained runners (Skovgaard 2018 [VF]). Gunnarsson & Bangsbo 2012
  [VA] found faster 1,500 m and 5 km times and a 4% VO2max gain on 54% less
  volume in moderately trained runners, but reported no economy result.
  **WEAK–MODERATE.**
- **Feel.** Fast but relaxed. RPE about 8 but brief. No talking during;
  full recovery between.
- **Pace.** R: about current mile race pace (Daniels [VA]). VDOT 40 →
  4:23 /km [C].
- **Dose.** 200–400 m repeats (2 minutes or less), with 2–3 times the repeat
  duration as walking or jogging recovery; 2–5 km in total, and no more than
  the lesser of 5% of weekly volume or 8 km (Daniels [VA]).
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
eases off. It is **not an all-out sprint**. Recover fully or nearly fully
between repeats: 45 s to 2 minutes of walking or easy jogging, or until
breathing settles. Run them on flat ground, grass or a gentle downhill.

- Daniels: light, quick runs of 15–20 s at about R pace (mile race pace), not
  sprints, with 45–60 s rests (1 minute in the 3rd edition) [VA].
- Pfitzinger [U]: his own slides describe short repetitions of 80–120 m run
  fast but relaxed, for example 2 sets of 4 inside a general aerobic run. No
  source was found for "95% of top speed" or for strides before quality
  sessions, and the book's prescription was not checked.
- Roche: 15–30 s, usually 20–30 s, quick but relaxed at about 80–90% of top
  speed (as fast as you can go without sprinting), with 1–2 minutes of easy
  running between for "close to a full recovery"; after easy runs or in their
  second half. Hill strides are 20–30 s on a 6–8% grade [VA].

**Why runners do them.** To practise fast, efficient mechanics and
neuromuscular coordination; to keep some speed during base periods; to prime
the legs before workouts and races; all at almost no fatigue cost. There is no
direct trial; the indirect evidence is sprint-type work improving economy
(§4.7). **WEAK / CONVENTION.**

**When in the week.** At the end of 2–3 easy runs a week, including the day
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
  (Hudson & Fitzgerald [U]). Hudson makes them part of every runner's
  training, at least once a week, to build running-specific strength and
  stride power and to cut injury risk [VA]. In Barnes 2013 the highest-intensity
  uphill work gave the largest neuromuscular and economy gains [VA]. **WEAK.**
- **Feel.** Maximal effort (Hudson calls them all-out), but only 8–10 s, so
  breathing barely rises. Full recovery between.
- **Pace.** Effort only, on a steep grade: about 6–8% to start, slightly
  steeper later (Hudson [VA]).
- **Dose.** Start with 1–2 × 8 s and add 1–2 repeats a week up to 8–10 × 8 s,
  then move to 10 s on a slightly steeper hill (Hudson [VA]). Jog very slowly
  back down and recover fully before the next one. Once or twice a week, after
  an easy run.
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
  2013 [VA]). In Ferley 2014 [VF], neither incline nor level intervals
  improved economy more than the control group's own training, so that trial
  gives hills no economy advantage. Lydiard's hill phase [VA]. **MODERATE.**
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
  long runs [U]; Canova's specific long runs [VA]). **CONVENTION.**
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
  in short running bouts. It is the basis of Couch to 5K [VA]. Run-walk
  marathons give similar times with less muscle pain and fatigue, but no lower
  cardiac stress markers (Hottenrott 2016 [VA]). Injury-prevention claims are
  unproven. **WEAK.**
- **Feel.** Running segments at RPE 3–4 (conversational); brisk walking.
- **Pace.** E for the running segments.
- **Dose and progression.** Couch to 5K week 1 (the current NHS plan): a
  5-minute warm-up walk at a gentle pace, then 1 minute running and 1 minute
  30 s walking, 7 times, and a final 1-minute run, then a 5-minute cool-down
  walk: 28 minutes 30 s in all, 8 minutes of it running [VA]. (The older NHS
  plan said a brisk 5-minute walk, then 60 s running and 90 s walking for 20
  minutes.) Run it 3 times a week with rest days between. Progress the running
  share each week until about 30 minutes of continuous running in week 9. For
  long events, Galloway's current chart gives run/walk ratios in seconds by pace
  [VA]: 90/30 at about 6:00 /km, 60/30 at about 7:00 /km and 30/30 at about
  8:00 /km (9:30–10:45, 10:45–12:15 and 12:15–14:30 per mile), with shorter
  options at each pace. The minute ratios in his older books (3:1 at 10
  min/mile, 1:1 at 13 min/mile) are superseded.
- **Common mistakes.** Running the running segments too fast; waiting until
  exhausted before walking; treating walking as failure.
- **Plain English.** "Short running and walking segments, alternated from the
  start. Walk breaks let you cover more distance and finish less sore and
  tired, and they're a proper training method, not giving up. As you get
  fitter, the running parts get longer."
- **Honesty note.** Thirty minutes of easy running covers about 2.8–3.8 km for
  typical novices (VDOT 20–30) [C]. The Couch to 5K end state is "30 minutes
  non-stop", not necessarily 5 km, although the NHS's own copy equates it with
  5K.

### 5.19 Time trial or benchmark

- **Purpose.** Measures current fitness to set paces (VDOT or critical speed)
  and track progress. Galloway's Magic Mile [VA]. Critical speed from 3 or
  more best efforts, each lasting about 2–15 minutes, or a 3-minute all-out
  test (Jones & Vanhatalo [VF]). It can also come from the fastest 400–5000 m
  efforts in 16 weeks of training logs, which predicted marathon time with an
  error of about 8% (Smyth & Muniz-Pumares 2020 [VF]). No study here compares
  a recent effort with a formula built from a goal; setting paces from the
  recent effort is **CONVENTION**.
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

| Rule                                                                                                                                                                | Source                                                                                                                                                                                                                                                                                                                                                | Grade                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| No more than 2 quality sessions plus 1 long run per week. Novices: no structured quality work for the first 4–6 weeks; strides and hill sprints are allowed.        | Daniels (3 Q days a week, the long run counting as one; 4–6 weeks of easy running and strides after a break, sometimes only 2–3) [VA]; Hansons (3 SOS days: 2 workouts plus the long run; the Beginner plan starts them in week 6) [VA]; Higdon (no speedwork for novices) [VA]; Pfitzinger [U]                                                       | CONVENTION               |
| At least 1 easy or rest day between hard sessions (about 48 h)                                                                                                      | Most systems; Noakes' law 5, alternate hard and easy training [VA]. Daniels sometimes puts 2 Q sessions on back-to-back days [VA]                                                                                                                                                                                                                     | CONVENTION               |
| Strides on 2–3 easy days                                                                                                                                            | Daniels (6–8 strides on at least 2 easy days a week) [VA]; Roche (2–3 times a week once weekly volume reaches about 15 miles, 24 km) [VA]; Pfitzinger [U]                                                                                                                                                                                             | CONVENTION               |
| Long run at least 48 h after VO2max or hill sessions and at least 48 h after heavy leg lifting                                                                      | Doma 2019 [VF]; Robineau [VA] backs only at least 24 h, so the 48 h is convention                                                                                                                                                                                                                                                                     | WEAK / CONVENTION        |
| Add intensity gradually, with race-specific work last. Short maximal work (strides, hill sprints) can start early. The order of the steps between differs by coach. | Hudson [VA] (hill sprints and strides first; then speed from fartlek and short intervals at 10K–3K pace, then specific endurance; threshold runs from the fundamental period); Lydiard [VA] (aerobic base including fast aerobic running, then hills with leg-speed days, then anaerobic repetitions, then coordination); Canova [VA]; Magness (repo) | CONVENTION               |
| Volume before intensity; a cutback week every 3–4 weeks                                                                                                             | Every system                                                                                                                                                                                                                                                                                                                                          | CONVENTION               |
| Single-run guard: no run more than about 10% longer in distance than the longest run of the previous 30 days                                                        | Frandsen 2025 [VF] (distance only)                                                                                                                                                                                                                                                                                                                    | MODERATE (observational) |
| Threshold as a steady tempo or cruise intervals. A default format is a Tropos choice: the sources name none.                                                        | Daniels [VA] (two T formats, each with its own advantage)                                                                                                                                                                                                                                                                                             | CONVENTION               |
| Never "catch up" missed quality work                                                                                                                                | Already in the handoff                                                                                                                                                                                                                                                                                                                                | CONVENTION               |

---

## 6. Expected progress: inputs for the simulation

Everything here is a **planning prior with stated uncertainty**. Use these
values to generate distributions, not point predictions. Where the evidence
runs out, the text says "ASSUMPTION" so the simulation team can sweep the
value.

### 6.1 Improvement rates by training status and horizon

The figures are race-time change at 5K–10K. VDOT equivalents are computed: at
VDOT 30, +1 VDOT ≈ −2.7% on 5K time; at VDOT 40, +1 VDOT ≈ −2.1% [C].

| Starting status                                                             | 12 weeks                                                                           | 16 weeks                              | 26 weeks                       | 52 weeks                                                                                                                                                                 | Basis and grade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sedentary to first continuous run** (first measurable 5K at VDOT ≈ 20–30) | Goal is to finish 30 minutes or a 5K; the first 5K usually takes 30–40 minutes [C] | First measured 5K becomes 3–8% faster | 8–15% faster than the first 5K | 12–25% faster than the first 5K; centre about 12–16%, with 25% the tail (§9, item 6)                                                                                     | VO2max rises about 10–15% with training: +12% (endurance) and +13.5% (HIIT) over control in healthy adults, in trials from 2 weeks up (Milanović 2015 [VF]; it states no 6–12-week window [U]); about 17–18% (SD 9%) after 20 weeks of cycle training in HERITAGE's sedentary adults (Bouchard 1999 [VA]; the percentages from later review tables [VF]). Plus gains in economy and pacing. **WEAK** (extrapolated); very wide spread; dropout is the main risk                                                                                                                                    |
| **Novice runner** (under a year; VDOT 25–35; 10–20 km a week)               | −4–8% (+1.5–3 VDOT)                                                                | −5–10%                                | −7–13%                         | −10–20% (+4–8 VDOT)                                                                                                                                                      | **WEAK** (extrapolated from trainability and low training age)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Recreational** (1–5 years; VDOT 35–45; 20–40 km a week)                   | −2–5% (+1–2.5 VDOT)                                                                | −3–6% (+1.5–3)                        | −4–8% (+2–4)                   | −5–10% (+2.5–5), **mostly if volume rises**                                                                                                                              | Anchors: Muñoz −3.6% and −5.0% in 10 weeks (Muñoz 2014 [VA]; runners VDOT ≈ 53 [C], above this band); Festa about 3.0–3.5% in 8 weeks (Festa 2020 [VF]; runners VDOT ≈ 42 by their 2 km times [C], inside this band). Esteve-Lanao's runners were sub-elite (VDOT ≈ 58 [C]): −157 s and −121.5 s on a 10.4 km cross-country race in about 5 months (Esteve-Lanao 2007 [VA]), about 7.0% and 5.3% on baselines of 37.5 and 37.9 min from a later meta-analysis table [C]; it is not a recreational anchor. No 16-week recreational trial was found, so **MODERATE** to 10 weeks and **WEAK** beyond |
| **Well-trained** (VDOT 50+; 50+ km a week)                                  | −1–3%                                                                              | −0.5–2%                               | −2–4%                          | −2–5%                                                                                                                                                                    | Filipas: −0.6% to −1.5% on 5 km across four arms in 16 weeks; 1.5% was the best arm, and the runners were VDOT ≈ 62 [C] (Filipas 2022 [VF]). Barnes: −2.0% in 6 weeks (Barnes 2013 [VA]). The two bands rest on different trials, so they are not a time course: the 12-week band on Barnes (6 weeks of uphill intervals, no flat-running control) and the 16-week band on Filipas (only the intensity distribution changed). **MODERATE**                                                                                                                                                         |
| **Masters (55+)**                                                           | As above for the same training status                                              | —                                     | —                              | An age decline applies on top. Its yearly rate is unchecked: about 0.5–1% a year [U]. The source puts the steeper decline from about 50–60, so this row is already in it | Tanaka & Seals 2008 [VA] for the shape; the rate [U]. **WEAK** on the magnitude                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Variability (ASSUMPTION, informed by HERITAGE and Montero & Lundby).**
People differ widely in how much they respond. Model an individual
responsiveness multiplier drawn from a lognormal distribution with median 1.0
and log-SD about 0.4–0.5. HERITAGE's raw spread, 384 ± 202 ml/min (CV ≈ 0.5;
Bouchard 1999 [VA]; review table, PMC6818669 [VF]), needs log-SD 0.47–0.49
[C]. HERITAGE's test–retest CV for VO2max is about 5%, with duplicate tests
before and after training (a later HERITAGE paper, PMC10132160 [VF]). With
that error removed, the spread is CV ≈ 0.43, or log-SD ≈ 0.41 [C]. So 0.4 is
the true spread and 0.5 the spread including test noise. Log-SD 0.4 gives a 90% range
of 0.52× to 1.93× the median gain; the multiplier's mean is 1.08, so relative
to the mean gain the range is about 0.48× to 1.78× [C]. The model has no true
non-responders, which matches Montero & Lundby 2017 [VA]: at 1–5 × 60 min a
week for 6 weeks, 69%, 40%, 29%, 0% and 0% did not respond, and all responded
after a further 6 weeks with 120 min a week added. Let a higher dose rescue
low responders.

**Diminishing returns (ASSUMPTION).** Gains per block shrink as training age
grows and as the runner approaches a volume-specific ceiling. Tanda's term
140·exp(−0.0053·K) [VF] is a usable shape for "what weekly km buys" at marathon
distance, holding training pace fixed. K is the mean weekly km over the 8
weeks ending 7 days before the race. Going from 30 to 50 km a week is worth
about 12 s/km at marathon pace (about 8 minutes over the race), and 50 to
70 km a week about 11 s/km (about 7.6 minutes) [C]. Tanda's sample started at
40.4 km a week, so the first step is an extrapolation. The real effect is
larger, because training pace also gets faster as fitness rises (the 0.55·P
term).

### 6.2 The Banister impulse-response (fitness–fatigue) model

**Model.** p(t) = p₀ + k₁·Σ w(s)·e^(−(t−s)/τ₁) − k₂·Σ w(s)·e^(−(t−s)/τ₂),
where w is the daily training load (Banister 1975 [U]; Morton 1990 [VA]).

**Published ranges.** Peng et al. 2023 compiled published parameter sets.
Across the 57 that meet the model's constraints (k₂ > k₁), the fitness time
constant τ₁ has a median of **42 days** (IQR 30–57, range 4–169) and the
fatigue time constant τ₂ a median of **10 days** (IQR 5–16, range 1–69). The
fatigue gain is larger than the fitness gain: **k₂/k₁ median 2.0** (IQR
1.4–4.0), with a long right tail [C]. In untrained people at low load, k₂/k₁
can fall below 1 (Busso 2003 [VF]). Single studies sit away from the centre:
Hellard's nine elite swimmers fitted τ₂ 19 ± 11 days and k₂/k₁ ≈ 1.4
(Hellard 2006 [VF]). Morton 1990 itself was not read. Kontro 2026 and the Peng
collection give its two fitted runners as 50/11 days (k₂/k₁ 1.8) and 40/11
days (2.0); Hellard 2006 and Scarf 2019 quote 45/15 days with k₂ = 2k₁, the
ratio taken from Banister 1975 [U]. The **42/7** defaults used by training
platforms such as TrainingPeaks' CTL/ATL (Kontro 2026 [VF] describes 42/7 as
a common platform setting; TrainingPeaks itself was not checked [U]) and by
Tropos's `trainingLoad.ts` are **conventions inside that range, not values
fitted to runners**. The app's update step, 1 − e^(−1/τ), also implies
k₂/k₁ ≈ 5.7, in the upper tail and not the simulation prior's 2 [C]. In
nonlinear variants, the fatigue gain rises with load: in Busso 2003's
untrained adults, k₂/k₁ was 0.91, 1.21 and 1.51 at 300, 400 and 500 units a
day [VF]. That is the mechanism behind overreaching. Individual fits are
imprecise and ill-conditioned. Bootstrap CVs exceeded 30% for every parameter
(τ₁ 32%, τ₂ 42%, k₁ 64%, k₂ 98%), τ₁ and τ₂ correlated at r = 0.99 and k₁ and
k₂ at 0.91, although the estimation itself was stable. The in-sample fit was
good (R² 0.79, error about 1%), and no forecast was tested (Hellard 2006
[VF]). Forecasting ahead, Banister models erred by 2.0–2.7% on average, "not
satisfactory for individual training planning" (Busso & Chalencon 2023 [VA]).
**WEAK** as a predictor, **MODERATE** as a descriptive smoother.

**What the parameters imply** for a single session [C]. The session's net
effect turns positive after t_n = (τ₁τ₂/(τ₁−τ₂))·ln(k₂/k₁) and peaks at
t_p = (τ₁τ₂/(τ₁−τ₂))·ln(k₂τ₁/(k₁τ₂)). The formula is Busso 2003's eq. 7
[VF].

| τ₁ / τ₂ / k₂:k₁                                      | Net positive after | Peak benefit at |
| ---------------------------------------------------- | ------------------ | --------------- |
| 42 / 7 / 1.5                                         | 3.4 days           | 18.5 days       |
| 42 / 7 / 2.0                                         | 5.8 days           | 20.9 days       |
| 42 / 7 / 3.0                                         | 9.2 days           | 24.3 days       |
| 42 / 7 / 5.7 (`trainingLoad.ts`)                     | 14.6 days          | 29.6 days       |
| 50 / 11 / 2.0 (close to Morton's two fitted runners) | 9.8 days           | 31.1 days       |
| 45 / 15 / 2.0 (the convention quoted for Morton)     | 15.6 days          | 40.3 days       |

The 42/7 convention puts the peak benefit of a hard session about 3 weeks
out. Published fits put it later: median 27 days (IQR 18–48), or about 3–7
weeks [C], and 43 ± 19 days in Hellard's swimmers [VF]. The convention's 3
weeks matches the taper findings, 2 weeks optimal in Bosquet 2007 [VA] and up
to 3 weeks in Wang 2023 [VF] and Smyth & Lawlor 2021 [VF]. That is a useful
consistency check for the simulation.

**Suggested priors (ASSUMPTION).** The spread between athletes inside one
study is τ₁ SD 12–16 days and τ₂ SD 3–11 days, so the priors need to be at
least that wide. τ₁ lognormal, median 42 days, log-SD 0.35, truncated to
[15, 90] (or N(42, 14)); τ₂ lognormal, median 10 days, log-SD 0.6, truncated
to [2, 40]; k₂/k₁ lognormal, median 2, log-SD 0.7. The parameters trade off,
so drawing the three together from published sets, or setting priors on t_n
and t_p as Peng et al. do, is better than independent draws. Calibrate k₁ so
that a recreational runner's 16-week block yields a 3–6% gain (§6.1; WEAK,
extrapolated from 8–10-week trials). Add a ceiling or saturation term: the
plain model grows without limit as load rises, which is unrealistic. Load
units: the session RPE (CR10) × minutes method (Foster 2001 [VF]), or
Tropos's effort-weighted minutes with a quality factor of 1.3, used
consistently.

### 6.3 Injury hazard inputs

| Input                                                                          | Value                                   | Uncertainty                                                                                                                                                                                                                                         | Source                                                            | Grade                |
| ------------------------------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------- |
| Base incidence, novice                                                         | 17.8 per 1000 h of running              | 95% CI 16.7–19.1; injury definitions vary. The three studies with 8–13 weeks of follow-up gave 30.1–33.0, so use about 30 in a novice's first 8–13 weeks, falling towards 7.7 (§4.3)                                                                | Videbæk 2015 [VF]                                                 | MODERATE             |
| Base incidence, recreational                                                   | 7.7 per 1000 h                          | 6.9–8.7                                                                                                                                                                                                                                             | Videbæk 2015 [VF]                                                 | MODERATE             |
| Single run 10–30% longer than the 30-day longest                               | HRR 1.64 (95% CI 1.31–2.05)             | Observational; first self-reported overuse injury                                                                                                                                                                                                   | Frandsen 2025 [VF]                                                | MODERATE             |
| Single run 30–100% longer                                                      | HRR 1.52 (1.16–2.00)                    | Overlaps the 10–30% band heavily; the estimates are not monotonic                                                                                                                                                                                   | Frandsen 2025 [VF]                                                | MODERATE             |
| Single run more than 100% longer                                               | HRR 2.28 (1.50–3.48)                    | as above                                                                                                                                                                                                                                            | Frandsen 2025 [VF]                                                | MODERATE             |
| Week-to-week distance ratio                                                    | no association                          | —                                                                                                                                                                                                                                                   | Frandsen 2025 [VF]                                                | MODERATE             |
| More than 30% over 2 weeks vs under 10% (novices; "distance-related" injuries) | HR 1.59 (0.96–2.66)                     | Not significant                                                                                                                                                                                                                                     | Nielsen 2014 [VA]                                                 | WEAK                 |
| Previous injury                                                                | Raised risk; the most consistent factor | Hulme gives no pooled size. Fokkema: an injury in the previous 12 months, adjusted OR 2.21 (1.84–2.65); crude RR 1.51, and the OR implies RR ≈ 1.63 (1.48–1.79) at a 29.3% baseline [C]. Sweep about 1.5–2×; do not use 2.21 as a hazard multiplier | Hulme 2017 [VA] for the direction; Fokkema 2019 [VF] for the size | MODERATE (direction) |
| 10%-rule progression vs faster progression                                     | No difference                           | One RCT                                                                                                                                                                                                                                             | Buist 2008 [VA]                                                   | MODERATE             |

Frandsen's spike ratio is the run's distance over the longest single run in
the previous 30 days; duration was not studied. The hazards are for the first
self-reported overuse injury (1,311 events), with traumatic injury as a
competing risk, against a run no more than 10% longer, and are adjusted for
age, BMI, sex, previous problems and running experience. The authors still
call the pattern a dose–response. The estimates depend on the outcome and on
how the injury is dated. Counting all injuries gives 1.53 (1.30–1.81), 1.50
(1.25–1.81) and 1.99 (1.50–2.66). Dating the injury by the questionnaire answer
instead of the self-reported date weakens them to 1.25 (0.97–1.61), 1.37
(1.04–1.82) and 1.36 (0.80–2.30), and only the middle band stays significant.
Small and moderate spikes also raised traumatic injuries: 1.56 (1.07–2.26) and
1.63 (1.06–2.49).

**Calibration targets** for the simulation's outputs are below. The checked
values behind this section, with full citations, are in the verified block at
the end of §4.3.

- 10.9% of novices injured during a 6-week Start to Run programme, counting
  running hampered for 3 sessions in a row (Kluitenberg 2015 [VA]).
- About 20% of novices injured over 8–13 weeks toward a 4-mile event, counting
  a 1-week restriction (Buist 2008 [VA]).
- 25.9% of novices injured over 8 weeks, counting a 1-day restriction
  (Buist 2010 [VA]).
- About 17% injured over a 14-week half-marathon plan (Damsted 2019 [VA]).
- About 37% of event entrants injured over 4–5 months (Fokkema 2019 [VF]).
- 35% of watch users had any injury over up to 18 months, and 25.2% an overuse
  injury (Frandsen 2025 [VF]).
- About 7% of first-time marathoners had an overuse injury that stopped them
  starting or finishing (12-week window; Toresdahl 2020 [VF]).

The injury definition sets the proportion. Match the simulated injury event to
each target's definition.

**Consistency check [C].** The NHS Couch to 5K plan has 489 minutes of running
over 9 weeks (8.15 h), or 875 minutes (14.6 h, about 1.6 h a week) counting
the walks (NHS [VA]). At 17.8 per 1000 h that is 0.145–0.26 expected
injuries, so P(at least one) ≈ 13.5–23% (Poisson). Videbæk does not say
whether walk intervals count as hours of running. Relph 2023 found 19% injured
over a modified 9-week Couch to 5K (n = 110) [VF], inside that range. Buist's
about 20% came from 8- and 13-week programmes for a 6.7 km event, not Couch to
5K, so a match with it is chance, not a check. At the short-programme rate of
30.1 per 1000 h, 13.5 h (1.5 h a week for 9 weeks) gives 33%, and Buist 2010's
25.9% at that rate implies about 10 h of running in 8 weeks [C]. Calibrate the
rate and the hours together.

**Severity mix (novices; Kluitenberg 2016 [VF]).** Not every injury stops
training. In a 6-week Start to Run cohort the proportion injured depended on
the definition: any running pain 58.0% (239.6 per 1000 h); training reduced
for at least 1 day 28.8%; time lost for at least 1 day 22.5% (59.4 per
1000 h); time lost for at least 1 week 7.5% (18.7 per 1000 h). Of the
injuries that affected training, about 22% only reduced it, 52% stopped
running for 1–6 days and 26% for a week or more [C]. Median durations were
4–7 days for the 1-day injuries and 20–22 days for the 1-week injuries,
censored at 6 weeks. Use these three tiers for novices and sweep them. For
other runners the mix is not sourced (ASSUMPTION).

### 6.4 Detraining and return inputs

| Situation                                                                            | Effect                                                                                                                                                        | Source                                                 | Grade      |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------- |
| Up to 4 weeks off, highly trained athlete                                            | VO2max −4% to −14%; recently trained people −3.6% to −6% at 2–4 weeks                                                                                         | Mujika & Padilla 2000 [VF]                             | MODERATE   |
| Time course                                                                          | −7% by day 21; −16% by day 56, then stable to day 84, still above sedentary controls (n = 7; VO2max, not race performance)                                    | Coyle 1984 [VA]                                        | MODERATE   |
| Recently trained person, more than 4 weeks off                                       | Recent VO2max gains lost in most studies; some show partial retention                                                                                         | Mujika & Padilla 2000 [VF]                             | MODERATE   |
| Reduced training: intensity kept, frequency or duration cut by a third to two thirds | VO2max held for at least 15 weeks, the length of follow-up; long-term endurance fell 10% at 13 min a day. Recently trained young adults, not runners          | Hickson 1981 (frequency); Hickson 1982 (duration) [VA] | MODERATE   |
| Reduced training: intensity cut                                                      | Gains partly lost: VO2max fell but stayed above pretraining after a one-third cut, and fell further after a two-thirds cut; long-term endurance −21% and −30% | Hickson 1985 [VA]                                      | MODERATE   |
| Return ramp                                                                          | Start at about 50–70% of the previous volume, no quality work for 1–2 weeks, rebuild over roughly as many weeks as were missed                                | CONVENTION; consistent with Run15                      | CONVENTION |

A simulation mapping (ASSUMPTION): a performance (VDOT) loss of about 0–2% for
1 week off, 3–6% for 2–4 weeks, and 8–15% for 8–12 weeks in trained runners.
It sits inside the VO2max losses above. Novices return toward their
pre-training baseline proportionally faster.

#### Verified parameters (2026-10-07)

This block covers §6.1, §6.2 and §6.4. Checked against primary sources on
2026-10-07. [VF] means the full text was read (for Peng et al., the preprint and
its data file), and [VA] the abstract only. [U] means the value comes from a
named secondary source and the primary was not checked. [C] means computed in
this check. Values not listed here carry their own markers in the text.

**Fitness–fatigue (Banister) parameters**

| Quantity                                            | Verified value                                                                                                                                                                                                                                                                                                     | Source                                                                                                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| τ₁ (fitness), published sets                        | Median 42 days; IQR 30–57; range 4–169                                                                                                                                                                                                                                                                             | 57 constraint-satisfying sets from about 40 studies, compiled by Peng et al. 2023, _Int J Perform Anal Sport_, doi:10.1080/24748668.2023.2268480; data at github.com/kenp666/IR-model [C, quantiles computed from the data file] |
| τ₂ (fatigue), published sets                        | Median 10 days; IQR 5–16; range 1–69                                                                                                                                                                                                                                                                               | Same [C]                                                                                                                                                                                                                         |
| k₂/k₁, published sets                               | Median 2.0; IQR 1.4–4.0 (sets with k₂ > k₁ only)                                                                                                                                                                                                                                                                   | Same [C]                                                                                                                                                                                                                         |
| Spread between athletes in one study                | τ₁ SD 12–16 days; τ₂ SD 3–11 days                                                                                                                                                                                                                                                                                  | Hellard 2006 Table 4 [VF]; Busso 2003 Table 3 [VF]; Mujika 1996, via the Peng collection [U]                                                                                                                                     |
| Morton 1990, two recreational runners (the authors) | τ₁ 50 and 40 days; τ₂ 11 days each; k₂/k₁ 1.8 and 2.0                                                                                                                                                                                                                                                              | Kontro 2026 Table 2 (PMC12880663); Peng collection [U]. The often-quoted 45/15 days with k₂ = 2k₁ is Banister's convention, not a fit                                                                                            |
| Elite swimmers (n = 9)                              | τ₁ 38 ± 16 days; τ₂ 19 ± 11 days; k₂/k₁ ≈ 1.4; τ₁ and τ₂ correlate at r = 0.99                                                                                                                                                                                                                                     | Hellard 2006, Tables 4 and 6, PMID 16608765 [VF]                                                                                                                                                                                 |
| Untrained cyclists (n = 6, 15 weeks)                | τ₁ 41 ± 15, then 35 ± 12 days; τ₂ 9 ± 6, then 13 ± 3 days; k₂/k₁ 0.77, then 0.99                                                                                                                                                                                                                                   | Busso 2003 Table 3, PMID 12840641 [VF]                                                                                                                                                                                           |
| Fatigue gain rises with daily load                  | k₂/k₁ 0.91, 1.21 and 1.51 at 300, 400 and 500 units a day                                                                                                                                                                                                                                                          | Busso 2003 Table 4 [VF]                                                                                                                                                                                                          |
| Elite weightlifters (n = 6, 1 year)                 | τ₁ ≈ 23 ± 4 days; τ₂ ≈ 22 ± 4 days (half-lives 16.1 and 15.4 days); gains not given                                                                                                                                                                                                                                | Busso 1990, PMID 2289497; values via the Peng collection [U]                                                                                                                                                                     |
| Hammer thrower (n = 1)                              | τ₁ 60 days; τ₂ 13 days; k₂/k₁ 3.9                                                                                                                                                                                                                                                                                  | Busso 1994, via the Peng collection [U]                                                                                                                                                                                          |
| Other endurance fits                                | Mujika 1996, 17 swimmers: τ₁ 41.4 ± 12.5 days, τ₂ 12.4 ± 6.9 days, k₁ 0.062 and k₂ 0.128, so k₂/k₁ ≈ 2.1 (Hellard 2006 quotes k₁ 0.128 and k₂ 0.055, so the sources conflict). Millet 2002, triathletes' running: τ₁ 20 days, τ₂ 10 days. Busso 1997, two cyclists: τ₁ 60 days, τ₂ 4 and 6 days, k₂/k₁ 3.7 and 3.8 | Mujika 1996, PMID 8775162, via the Peng collection and Scarf 2019 [U]; Millet 2002, PMID 11774068 [VA]; Busso 1997, PMID 9134920, via Scarf 2019 and the Peng collection [U]                                                     |
| When a session nets positive (tn) and peaks (tg)    | tn median 12 days (IQR 5–19); tg median 27 days (IQR 18–48)                                                                                                                                                                                                                                                        | Peng collection [C]; Hellard 2006 Table 5: tn 19 ± 9, tg 43 ± 19 [VF]                                                                                                                                                            |
| Predicting ahead from past data                     | Mean absolute error 2.0–2.7%; "not satisfactory for individual training planning"                                                                                                                                                                                                                                  | Busso & Chalencon 2023, PMID 36791017 [VA]                                                                                                                                                                                       |
| Resistance-training fits                            | Prediction is unsatisfactory when test CV exceeds about 4%                                                                                                                                                                                                                                                         | Stephens Hemingway 2020, doi:10.1177/1747954119887721 (a simulation) [VA]                                                                                                                                                        |

What this means for the model:

- The central published ranges in §6.2 hold. k₂/k₁ has a long right tail. In untrained people at low load it falls below 1.
- Priors need to be at least as wide as the spread between athletes in one study. Use τ₁ lognormal, median 42 days, log-SD 0.35, truncated to 15–90. Use τ₂ lognormal, median 10 days, log-SD 0.6, truncated to 2–40. Use k₂/k₁ lognormal, median 2, log-SD 0.7.
- The parameters trade off (in Hellard, τ₁ with τ₂ at r = 0.99, k₁ with k₂ at 0.91). Prefer drawing the three together from published sets, or set priors on tn and tg, as Peng et al. do.
- Fitted sets put a session's peak benefit 3–7 weeks out (median about 4). The 42/7/2 convention puts it at 3 weeks.
- [C] `trainingLoad.ts` steps fitness and fatigue by 1 − e^(−1/τ). That is a Banister model with k₂/k₁ ≈ 5.7, so a session counts as net negative for about 15 days and peaks at about 30. A simulation that uses k₂/k₁ ≈ 2 is not the model the app's form curve shows.
- Lifting (`lifting-evidence.md` §4.4): the weightlifting fits [U] have fitness and fatigue decaying at similar rates, about 3 weeks each. "Fitness 30–60 days, fatigue gain 1.5–3×" borrows endurance values. The 2–4-day acute fatigue term is an ASSUMPTION.

**Improvement rates**

| Quantity                                                    | Verified value                                                                                                               | Source                                                                    |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Muñoz 2014: 30 club runners, 10 weeks                       | 10K −5.0% (39:18 → 37:19) and −3.6% (39:24 → 38:00); VDOT ≈ 53 [C]                                                           | PMID 23752040 [VA]                                                        |
| Festa 2020: 38 recreational runners, 8 weeks                | 2 km speed +3.5% and +3.0%; VDOT ≈ 42 by their 2 km times [C]                                                                | PMC7739641, Results and Tables 3–4 [VF]                                   |
| Esteve-Lanao 2007: 12 sub-elite runners, about 5 months     | 10.4 km cross-country −157 ± 13 s vs −121.5 ± 7.1 s; no percentage given                                                     | PMID 17685689 [VA]                                                        |
| Filipas 2022: 60 well-trained men, 16 weeks                 | 5 km −0.6%, −1.1%, −1.5% and −0.9% by arm (baseline about 16:30)                                                             | PMC9299127 Table 5 [VF]                                                   |
| Barnes 2013: 20 well-trained runners, 6 weeks               | 5 km −2.0% ± 0.6%                                                                                                            | PMID 23538293 [VA]                                                        |
| Oliveira 2024: 17 studies, n = 437                          | Polarised vs other: VO₂peak SMD 0.24 (0.01–0.48); time trial SMD −0.01 (−0.28 to 0.25)                                       | PMC11329428 [VF]                                                          |
| Milanović 2015: 28 trials, n = 723, baseline 40.8 mL/kg/min | VO₂max +4.9 (endurance) and +5.5 (HIIT) mL/kg/min vs control, about +12% and +13.5%                                          | PMID 26243014 [VF]                                                        |
| HERITAGE: 481 sedentary adults, 20 weeks                    | VO₂max about +17–18% (SD 9%; the two review tables give 17% and 18%), ranging from no gain to over 1 L/min; heritability 47% | Bouchard 1999, PMID 10484570 [VA]; reviews PMC9012529 and PMC6818669 [VF] |
| Montero & Lundby 2017: 78 adults, 6 weeks                   | Non-responders 69%, 40%, 29%, 0% and 0% at 1–5 × 60 min a week; all responded after 6 more weeks with +120 min a week        | PMC5451738 [VA]                                                           |

What this means for the model:

- Festa's runners were VDOT ≈ 42, inside the recreational band. Of the recreational anchors, only Muñoz's and Esteve-Lanao's runners were VDOT 50+.
- Esteve-Lanao's abstract gives seconds, not a baseline time, so no percentage gain comes from the paper itself.
- Well-trained runners' 16-week change is −0.5% to −2%.
- The 16-week recreational target of 3–6% rests on 8–10-week trials (3.0–5.0%). No 16-week recreational trial was found.
- HERITAGE's spread (CV ≈ 0.5, including test noise) supports a responder log-SD of 0.4–0.5.

**Detraining**

| Quantity                                   | Verified value                                                                                                                                                                        | Source                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Coyle 1984: 7 endurance-trained people     | VO₂max −7% by day 21, −16% by day 56, then stable to day 84; still above sedentary (50.8 vs 43.3 mL/kg/min)                                                                           | PMID 6511559 [VA]                                                                                          |
| Under 4 weeks off                          | Highly trained: VO₂max −4% to −14%. Recently trained: −3.6% to −6% at 2–4 weeks. Time to exhaustion −4% to −25%                                                                       | Mujika & Padilla 2000 I, PMID 10966148, §1.1 and §1.8 [VF]                                                 |
| Over 4 weeks off                           | Highly trained: VO₂max −6% to −20%, falling for 8 weeks then stable. Recently trained: back to baseline in most studies. Strength-trained athletes: force −7% to −12% over 8–12 weeks | Mujika & Padilla 2000 II, PMID 10999420, §1.1 and §3.7 [VF]                                                |
| Fewer or shorter sessions, same intensity  | After 10 weeks of training, 15 weeks at 4 or 2 days a week, or at 26 or 13 min a day, kept VO₂max                                                                                     | Hickson 1981, PMID 7219129; Hickson 1982, PMID 6214534 [VA]                                                |
| Lower intensity                            | Cutting intensity by a third or two thirds lost part of the gain; at a third, VO₂max stayed above baseline                                                                            | Hickson 1985, PMID 3156841 [VA]                                                                            |
| Strength, 103 studies                      | SMD −0.46 (maximal force), −0.62 (submaximal), −0.20 (power); larger with longer breaks, over 65 and in inactive people                                                               | Bosquet 2013, PMID 23347054 [VA]; change trivial (g < 0.2) up to 28 days [U, via Stronger by Science 2022] |
| Ogasawara 2013: 14 untrained men, 24 weeks | 3 weeks off after each 6 weeks gave the same bench-press and CSA gains as training throughout                                                                                         | PMID 23053130 [VA]                                                                                         |
| Psilander 2019: 19 adults                  | 10 weeks of training: CSA +17%, strength +20%. After 20 weeks off, size back to baseline and strength still raised ("~60%"). The trained leg did not regain faster                    | PMID 30991013 [VA]                                                                                         |

What this means for the model:

- The Coyle and Mujika rows in §6.4 stand.
- The maintenance finding comes from Hickson 1981 and 1982. Hickson 1985 is the intensity study. Cutting intensity lost part of the gain, not all of it.
- Psilander does not show fast retraining.
- For the lifting model, small losses over 2–3 weeks fit Ogasawara's measured 3-week losses (2.0–3.3% of bench 1RM [VF]); "no loss" for 2 weeks is [U] (lifting-evidence §2.18). "1–2% of the gain a week after that" is an ASSUMPTION.

**Still unverified:**

- Banister 1975 itself, which is not indexed. The k₂ = 2k₁ convention comes via Scarf 2019.
- Morton 1990 itself. The publisher was blocked, and the values come from two secondary sources that agree.
- Busso 1990's model structure and gains.
- Mujika 1996's gains. Hellard 2006 and Scarf 2019 disagree.
- The content of Chiu & Barnes 2003. Its citation is confirmed: doi:10.1519/00126548-200312000-00007.
- Stephens Hemingway 2020's parameter values.
- Esteve-Lanao's baseline time.
- The denominator of Psilander's "~60%".
- Bosquet 2013's time course, which comes from a secondary source only.
- The 42/7 platform convention, which comes via Kontro 2026.
- Tanda 2011, Foster 2001, Tanaka & Seals 2008 and Bosquet 2007 were outside this check; their markers come from the other checks.

### 6.5 Personas

All VDOT numbers are computed with the Daniels–Gilbert equations (Appendix A).
Their race equivalents match Daniels' Table 5.1 (4th ed.) to within 1–10 s at
VDOT 40–50; at VDOT 30 the marathon is 32 s slow. T pace matches Table 5.2
exactly at VDOT 35, 40, 45 and 50, but the computed easy-pace bands run about 11–12 s/km
slower than the book's at their fast end and 4–9 s/km at their slow end. The
book's tables start at VDOT 30, so they cannot check lower values (Daniels
2021 [VA]). Every "likely range" is **WEAK** (model-based):
it combines §6.1–6.4 and the prediction evidence in §4.15.

#### A. Sedentary adult to 5K in 9–12 weeks

- **Plan shape.** Couch to 5K: 3 run-walk sessions a week, at least one rest
  day between, the running share growing weekly to 30 minutes continuous by
  week 9 (NHS [VA]). Add weeks 10–12 to stretch from 30 minutes to 5 km. No
  pace targets, only talk-test cues. Strides are optional from week 6. No
  quality sessions.
- **Expected outcome.** Completion is the main uncertainty. In one evaluation of
  a modified, group-delivered 9-week version, 27.3% of 110 people completed it
  (Relph 2023 [VF]; §9, item 4). That most who keep going can run 30 minutes
  non-stop by weeks 9–12 is an ASSUMPTION. Thirty minutes covers about
  2.8–3.8 km at easy pace for VDOT 20–30 [C], so a continuous 5 km often needs
  the extra 1–3 weeks. A first 5K effort typically lands at **30–40 minutes** (VDOT about
  22–31 [C]); slower runners using run-walk take 40 minutes or more. That is
  fine and should be framed as fine.
- **Injury.** P(at least one running-related injury) is about **10–25%** over
  6–12 weeks, depending on the injury definition: 10.9% over 6 weeks counting
  3 hampered sessions in a row (Kluitenberg 2015 [VA]); 15–21% over 8–13
  weeks counting a 1-week restriction (Buist 2008 [VA]; Bredeweg 2012 [VA]);
  25.9% over 8 weeks counting a 1-day restriction (Buist 2010 [VA]).
- **6 and 12 months.** If they keep running 3 times a week and add duration,
  their 5K could be 8–15% faster than the first 5K at 26 weeks and 12–25%
  faster at 52 weeks, centred on about 12–16% (WEAK; §9, item 6). For example
  a 36:00 first 5K could become 27–32 minutes in a year.
- **With lifting.** Untrained people doing concurrent training show _smaller
  VO2max gains_ (Huiberts 2024 [VF]: SMD −0.35, 95% CI −0.70 to −0.01, a
  borderline effect). They will still make large strength gains. Simulation
  multiplier on aerobic gains: about 0.85–0.95, swept 0.8–1.0 (ASSUMPTION;
  §6.6).

#### B. A runner on 30 km a week with a 50-minute 10K, training 52 weeks for a first marathon and wanting their lifting to improve

- **Baseline [C].** A 10K in 50:00 is VDOT 40.0. The marathon equivalent is
  3:49:37 by VDOT and 3:50:01 by Riegel. Tanda's formula at the _current_
  training load (30 km a week at about 6:30 /km) gives **4:06:51**. That is a
  double extrapolation: Tanda's sample ran from 40.4 km a week and from
  training paces no slower than 330.6 s/km (about 5:31 /km), and the result is
  past the model's 3:36 validity ceiling (Tanda 2011 [VF]). Vickers and
  Vertosick [VF] warn that Riegel-type equivalents are at least 10 minutes too
  optimistic for half of recreational marathoners, especially at low mileage.
- **How the year should go.** See §7: about 24 weeks of base and strength,
  about 8 weeks of half-marathon preparation (with a tune-up half as a
  benchmark), 16 weeks of marathon-specific work, a taper of about 2 weeks (8–14 days; up
  to 3 still works) and the race. Running builds from 30 km to a peak of about 50–65 km a week over about
  9 months, by time, with the single-run guard. The long run builds from about
  12–15 km to 30–32 km, or about 2:45–3:00, whichever comes first.
- **Expected fitness at race time.** If no major injury interrupts: VDOT +2 to
  +5 over the year (median about +3), a 10K of about 45:30–48:00 (WEAK).
- **Likely marathon finish.** Tanda at a peak of 55–65 km a week with
  training pace about 5:50–6:00 /km gives **3:37–3:45** [C]. This is also an
  extrapolation: those paces are slower than any in Tanda's sample, and both
  results are past the 3:36 ceiling. Tanda's K is the mean weekly km over the
  8 weeks ending 7 days before the race, not the peak. With a taper of about 2
  weeks inside that window, plugging in peak km overstates K and biases the
  prediction fast (Tanda 2011 [VF]). The VDOT-43 equivalent is 3:36 [C],
  which is optimistic for a first-timer. **Central estimate about 3:45–3:50;
  80% range about 3:35–4:10**, covering weather, pacing and fuelling. Heat can
  cost several percent: top men ran 1.7% off the course record at WBGT
  5–10 °C and 4.5% off at 20–25 °C, and slower runners slowed more (Ely 2007
  [VA]). El Helou 2012 [VF] found a quadratic temperature effect, but its
  authors read the effect as the same whatever the runner's ability. Running
  2–16 km above about 94% of critical speed raises the share of runners who
  slow by more than 25% over the last 12.2 km by about 6 points, to 26% of men
  and 16% of women (Smyth & Muniz-Pumares 2020 [VF]). The paper gives no
  finish-time cost; a slowdown of that size costs at least about 7% of finish
  time against holding the earlier pace, by construction [C]. **WEAK.**
- **Getting to the start line.** A crude proration of 35% injured over up to
  18 months (Frandsen 2025 [VF]) gives about 25% injured at some point in
  12 months, many of them minor. About 7% of first-timers have an injury that
  stops them starting or finishing in the last 12 weeks (Toresdahl 2020
  [VF]). P(starts and finishes) ≈ **80–90%** (WEAK).
- **Lifting.** The first 6 months are the window for lifting progress, while
  running volume is still moderate. Wilson 2012 [VA] found interference grew
  with how often and how long the endurance sessions were, but a later
  meta-analysis found neither frequency nor modality a moderator (Schumann
  2022 [VF]), so that link is WEAK–MODERATE. From about month 7, expect
  lower-body strength to plateau, especially for a trained man (Petré 2021;
  Huiberts 2024 [VF]). Upper-body progress may continue slowly (ASSUMPTION;
  Schumann 2022 measured only the lower body). The marathon block should be
  framed as **maintenance** (§4.11). Heavy strength work twice a week can be
  expected to improve running economy and time trials a little (MODERATE),
  perhaps 0.5–2% on a time trial (WEAK; §6.6). It will not "make the
  marathon".

#### C. A 3:45 marathoner targeting sub-3:30 in 16 weeks

- **The gap [C].** 3:45:00 is VDOT 41.0 and 3:29:59 is VDOT 44.6: a gain of
  **+3.6 VDOT**, or about 7% on finish time.
- **The typical 16-week gain** for a recreational runner is −3% to −6%, or
  about +1.5–3 VDOT (§6.1; WEAK, extrapolated from 8–10-week trials).
  Sub-3:30 is therefore **above the typical outcome**.
- **What makes it plausible.** (a) The 3:45 was run below the runner's actual
  fitness: a positive split or collapse, heat, or poor fuelling. Even pacers
  (halves within 2%) finished at about 88% of critical speed, against about
  84% for everyone else, roughly 10 minutes at 3:45 [C]. That is an
  association, confounded by ability, since faster runners run closer to
  critical speed anyway (Smyth & Muniz-Pumares 2020 [VF]). (b) The last
  marathon had a minimal taper. Against a relaxed 1-week taper, a strict
  3-week taper is associated with about 4–6 minutes at 3:45: a median
  ability-normalised saving of 2.6% (5 min 32 s), or 4.16 min (about 1.8%)
  adjusted for sex and ability. It is observational, and the authors say their
  method could overestimate the effect (Smyth & Lawlor 2021 [VF]). (c) The
  runner has room to raise volume, or is early in their running life.
- **A precondition check [C, WEAK].** VDOT 44.6 corresponds to a half
  marathon of about 1:41. Recreational marathons come in slower than
  half-marathon equivalents: Riegel is well calibrated up to the half but too
  fast at the marathon (Vickers 2016 [VF]). How much faster the half must be
  depends on weekly volume. For a 3:30 prediction, Vickers's Model 1 needs a
  half of about 1:30:41 at 30 km a week, 1:31:52 at 40, 1:33:06 at 50, 1:34:52
  at 64, 1:36:59 at 80 and 1:39:46 at 100 km [C]. So a recent half of about
  1:37 signals that sub-3:30 is realistic only at about 80 km a week or more;
  at 50–65 km a week it takes about 1:33–1:35. A recent half of about 1:45
  (VDOT 42.6) makes it unlikely in 16 weeks.
- **Odds (model-based, WEAK).** About 10–25% for a runner whose 3:45 reflected
  their fitness; about 40–60% where there is evidence of underperformance.
- **Product.** A/B/C goals (roadmap A7): A = 3:29, B = about 3:35, C = sub-3:45.
  Re-test at about week 8 with a 10K or half marathon, and move the pace
  targets only with consent (RUN-EV-08).
- **Lifting.** Maintenance, 1–2 sessions a week, from week 1. Do not start
  heavy eccentric work mid-block: after the first heavy leg sessions, running
  economy stays impaired for up to 48 h (Doma 2019 [VF]; CONVENTION).

#### D. (Extra) A returning runner after 6 weeks off sick

- **Expected loss.** VO2max about −7% to −16%, about −12% by straight-line
  interpolation [C]: Coyle measured −7% at day 21 and −16% at day 56, and
  nothing in between (Coyle 1984 [VA]). Performance about −5–10%
  (ASSUMPTION).
- **Plan.** Run15-style re-entry (no quality work, a conservative tier), then
  rebuild over about 6 weeks. Re-benchmark before restoring the old paces.

### 6.6 How concurrent lifting changes these expectations

All of these are **ASSUMPTIONS** that map the meta-analytic effect sizes onto
simulation rate multipliers. They are **WEAK** and should be swept.

| Effect                                                                                   | Suggested multiplier                                                                                                                                                                                                                                                      | Evidence behind the direction                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Endurance gains, trained runner, heavy lifting at least 8 weeks, about 2 sessions a week | ×1.00 on VO2max; +0.5–2% on time-trial performance through economy, swept 0–3% (the size is this doc's assumption)                                                                                                                                                        | No strength method improved VO2max; high load improved performance (ES −0.469), probably through economy; mean follow-up 8.1 weeks, and frequency had no effect; one trial gained 2.09% on 5 km (Llanos-Lagos 2024b [VF]). Heavy training improved economy (g −0.32), but its time-trial effect (g −0.24) was not significant (Eihara 2022 [VF]). Huiberts 2024 [VF]. No pooled percentage exists |
| Aerobic gains, untrained beginner doing both                                             | ×0.85–0.95, swept 0.8–1.0                                                                                                                                                                                                                                                 | Huiberts 2024 [VF]: SMD −0.35 (−0.70 to −0.01, P = 0.05), a borderline effect. An SMD cannot become a rate multiplier without the endurance-only gain                                                                                                                                                                                                                                             |
| Lower-body maximal strength, trained man, run volume 50+ km a week                       | ×0.6–0.85 (×0.85–0.95 when lifting and running are at least 3 h apart); no pooled or single estimate falls below about 0.57                                                                                                                                               | Petré 2021; Huiberts 2024 (SMD −0.43) [VF]                                                                                                                                                                                                                                                                                                                                                        |
| Lower-body maximal strength, woman                                                       | ×0.9–1.0                                                                                                                                                                                                                                                                  | Huiberts 2024 [VF]                                                                                                                                                                                                                                                                                                                                                                                |
| Upper-body strength and hypertrophy                                                      | ×0.9–1.0 (ASSUMPTION)                                                                                                                                                                                                                                                     | No checked source measured it: Schumann 2022 [VF] tested only the lower body                                                                                                                                                                                                                                                                                                                      |
| Explosive strength and power                                                             | ×0.6–0.85; worst when in the same session                                                                                                                                                                                                                                 | Schumann 2022 (−0.28; same session −0.31) [VF]; Huiberts 2024 (−0.35) [VF]; Wilson 2012 (ratio 0.60 [C]) [VA]                                                                                                                                                                                                                                                                                     |
| Leg-muscle hypertrophy with high running volume                                          | ×0.9–1.0 (sweep to 0.8)                                                                                                                                                                                                                                                   | Schumann 2022 (whole muscle, SMD −0.01) [VF]; Lundberg 2022 (fibre −0.23; type I fibres with running −0.81, 3 studies) [VF]                                                                                                                                                                                                                                                                       |
| Run quality within 48 h after a heavy leg session                                        | Time to exhaustion falls after heavy sessions; economy at 6 h is mixed. In lifting-naive men, the cost of running rose about 5.3% at 24 h after a first 6RM leg session and was still raised at 48 h [C]. Down-weight that session's stimulus by about 5–15% (ASSUMPTION) | Doma & Deakin 2013, _Int J Sport Health Sci_ [VF]; Doma & Deakin 2013, _Appl Physiol Nutr Metab_, and 2014 [VA]; Doma 2019 [VF]                                                                                                                                                                                                                                                                   |
| Maintenance block                                                                        | 1 heavy session a week holds strength for 3–8 months. In Bickel 2011, 1 day a week (even 1 set) kept 1RM for 32 weeks; it kept fibre size in young adults but not in 60–75-year-olds. With no training at all, 1RM fell only 7% and stayed 23% above baseline             | Bickel 2011 [VF]; Spiering 2021 [VA]; Rønnestad 2010 [VA]                                                                                                                                                                                                                                                                                                                                         |

### 6.7 Suggested simulation skeleton

These are modelling choices, not evidence.

1. **Time step:** daily sessions, with weekly planning.
2. **State per runner:** true VDOT, Banister fitness and fatigue, longest run
   in the last 30 days, injury state and history, training age, adherence
   propensity, upper- and lower-body strength indices, sex and age band.
3. **Load per session:** session RPE × minutes, or Tropos's effort-weighted
   minutes, used consistently.
4. **Performance:** VDOT_obs = VDOT_base + k₁·fitness − k₂·fatigue, with a
   ceiling that rises slowly with volume, following Tanda's exponential-decay
   curve for the marathon [VF], and with training age (ASSUMPTION: Tanda has
   no training-age term, and the number of previous marathons was not
   predictive).
5. **Injury:** per-session hazard = base rate per hour × hours × spike
   multiplier × prior-injury multiplier. On injury, draw the severity tier and
   layoff length, then apply detraining.
6. **Adherence (ASSUMPTION):** probability of completing a planned session of
   about 0.75–0.95 depending on persona, with dropout for novices. **This is
   likely to dominate outcomes**; sweep it.
7. **Race day:** time = VDOT equivalent × marathon low-volume correction × heat
   factor × pacing-collapse risk. For the low-volume correction, use Vickers
   & Vertosick's Model 1 directly: v = 0.16018617 + 0.83076202·v_Riegel
   (exponent 1.07) + 0.06423826·(typical weekly miles ÷ 10), with speeds in
   m/s. It is continuous in weekly volume and does not switch off at 50 km.
   From a 50:00 10K, against Riegel with exponent 1.06, it adds about 11.4% at
   20 km a week, 9.8% at 30, 8.3% at 40, 6.8% at 50, 4.6% at 65, 2.5% at 80 and
   about 0% at 100 km [C]. Its error is about 15 minutes (RMSE; Vickers 2016
   [VF]). Vickers did not collect the longest run, so a long-run trigger needs
   another source. Model the pacing-collapse risk as a probability that rises
   with 2–16 km speed as a share of critical speed, not a switch at 0.94:
   below 0.94, about 20.5% of men and 9.6% of women slowed by more than 25%
   over the last 12.2 km, and above it 26.0% and 15.6%; the women's trend
   across speed bands was not significant, P = 0.13 (Smyth & Muniz-Pumares
   2020 [VF]). The paper gives no finish-time cost to attach.
8. **Validation targets:** the injury proportions in §6.3, each with its own
   injury definition; 16-week recreational gains of 3–6% (WEAK, extrapolated
   from 8–10-week trials); a strict 3-week taper worth about 2.6% over a
   relaxed 1-week taper (median, ability-normalised; about 1.8% in the
   regression adjusted for sex and ability; observational); and Riegel, at
   exponent 1.07, at least 10 minutes optimistic for about half of
   recreational marathoners.

---

## 7. A year ending in a marathon, while still lifting

**Evidence vs convention.** The _direction_ of each rule below comes from
evidence (§4.9–4.11). The _specific calendar_ is coaching **CONVENTION**:
there is no trial of a 52-week hybrid marathon plan.

### 7.1 Phases for persona B (adaptable)

| Weeks                               | Running emphasis                                                                                                                                | Running dose (indicative)                                                     | Lifting emphasis                                                                                        | Lifting dose                                                                                                                                  | Basis                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–12, base I                        | Consistency, easy volume, strides, hill sprints, one fartlek or steady run a week                                                               | 4 runs; 30 → 40 km a week; long run 12 → 16 km (time-based; single-run guard) | **Build**: hypertrophy and strength. The best lifting window of the year.                               | 3 sessions a week (2 full-body with lower-body emphasis, 1 upper); 3–4 sets of 6–12 reps                                                      | Interference rose with endurance frequency and duration, and with running more than cycling (Wilson 2012 [VA]); Schumann 2022 [VF] found neither frequency nor modality a moderator. Wilson's pooled effects do not look small: concurrent training reached about 82% of the strength-only effect for strength, 69% for hypertrophy and 60% for power [C]. That interference is small at moderate running volume is an inference [U]. Guard from Frandsen 2025 [VF]                            |
| 13–24, base II                      | Hill repeats, then threshold (cruise intervals), one quality session a week                                                                     | 4–5 runs; 40 → 48 km; long run 16 → 22 km                                     | **Max strength**: heavy 3–6 reps; low-volume plyometrics                                                | 2 lower-body sessions + 1 upper a week                                                                                                        | Heavy load is the most reliable single method for economy (Llanos-Lagos 2024a [VF]; Eihara 2022 [VF], which compared heavy with plyometric training alone). Combined methods, such as heavy plus plyometric work, gave the largest effect (Llanos-Lagos 2024a and 2024b [VF]), measured at 10–14.5 km/h (2024a). The heavy-load gain appeared only above 12 km/h (5:00 /km) and in highly trained runners; at 12 km/h or slower, only plyometrics helped (ES −0.307) (Llanos-Lagos 2024a [VF]) |
| 25–32, half-marathon block          | Threshold + VO2 intervals; **tune-up half marathon at about week 30–32** as the benchmark for marathon pacing                                   | 5 runs; 48 → 55 km; long run to 24–26 km                                      | **Strength maintenance-plus**                                                                           | 2 heavy sessions a week, 2–3 sets, leg sessions on hard-run days                                                                              | Maintenance evidence (Spiering 2021 [VA]; Bickel 2011 [VF]); placement is CONVENTION                                                                                                                                                                                                                                                                                                                                                                                                           |
| 33–48, marathon-specific (16 weeks) | Marathon-pace runs, race-pace long runs every 2–3 weeks, threshold, a cutback every 3–4 weeks                                                   | 5 runs; 55 → about 60–65 km peak; long run to 30–32 km or about 3 h           | **Maintenance**                                                                                         | 1–2 sessions a week; heavy (about RPE 7–8, 2–3 reps short of failure); no new exercises; deload lifting in the same weeks as running cutbacks | Rønnestad 2010 [VA]; Bickel 2011 [VF]; CONVENTION                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 49–51, taper                        | Cut volume by 41–60% over about 2 weeks, up to 3; keep intensity and the number of runs; make the down weeks consecutive, right before the race | 5 shorter runs                                                                | Last heavy lower-body session about 10 days out; light upper-body and mobility until about 4–5 days out | Minimal                                                                                                                                       | Running: 2 weeks, 41–60% less volume, intensity and frequency kept (Bosquet 2007 [VA]; STRONG, in competitive athletes); up to 3 weeks (Wang 2023 [VF]; Smyth & Lawlor 2021 [VF]; MODERATE); consecutive down weeks right before the race (Smyth & Lawlor 2021 [VF]). Lifting: CONVENTION                                                                                                                                                                                                      |
| 52, race and after                  | Race; then 1–2 weeks easy or off                                                                                                                | —                                                                             | Resume after about a week; the next cycle starts with a strength-emphasis block                         | —                                                                                                                                             | CONVENTION                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### 7.2 Placing the leg session

**Evidence.** Leave at least 6 hours between a hard lift and a hard run, and
ideally 24 hours (Robineau 2016 [VA]). In a combined session, the first item is
the one that benefits (Murlasits 2018 [VA]). Explosive strength suffers most in
same-session pairings (Schumann 2022 [VF]). Six hours after a leg session,
running economy was worse in one study of two, and only at the hardest stage.
In the other, economy was unchanged, but time to exhaustion above threshold
fell after the two high-intensity sessions. The next day, economy was 5.6%
worse at 70% and 10% worse at 90% of ventilatory threshold [C] after a day of
lifting then running, but not after running then lifting (Doma & Deakin 2013,
_Int J Sport Health Sci_ [VF]; Doma & Deakin 2013, _Appl Physiol Nutr Metab_,
and 2014 [VA]). In men new to lifting, a first heavy leg session impaired
submaximal running for 24 hours (Doma 2015 [VA]) and raised its cost for up to
48 hours (Doma 2019 [VF]).

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

| Tempting rule                                                                      | Why it is not a universal default                                                                                                                                                                                                                                                  | What to do instead                                                                                                                                                                                             | Sources                                                                          |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **The 10% weekly rule**                                                            | Its only RCT found no injury benefit. Week-to-week change was not associated with injury in 5,205 runners.                                                                                                                                                                         | Guard single sessions against the longest run of the previous 30 days, by distance as Frandsen measured (a guard on duration is an extrapolation). Show weekly change as context. Label the guard a heuristic. | Buist 2008 [VA]; Frandsen 2025 [VF]                                              |
| **An ACWR "sweet spot" (0.8–1.3) as an injury predictor**                          | Mathematical coupling and arbitrary time windows. In the big running cohort, only the band where acute load more than doubled looked _protective_; the smaller bands showed no association.                                                                                        | Advisory copy at most. Never a red risk number. `trainingLoad.ts` already calls its ramp line a heuristic; consider retiring the ratio wording.                                                                | Impellizzeri 2020 [VA]; Frandsen 2025 [VF]                                       |
| **Strict 80/20 enforcement**                                                       | The split differences are small. Recreational trials show both models working.                                                                                                                                                                                                     | Protect easy days, explain why, and show the distribution as information.                                                                                                                                      | Oliveira 2024 [VF]; Muñoz 2014 [VA]; Festa 2020 [VF]; Rosenblat 2025 (repo) [VA] |
| **Heart-rate zones from 220 − age**                                                | Even a better formula is off by about ±10 bpm for an individual. 220 − age is also biased: too high under 40 and too low over 40, by about 10 bpm at 70, so some older runners are off by more than 20 bpm.                                                                        | Measured or field-tested HRmax or threshold heart rate, with a talk-test and RPE fallback.                                                                                                                     | Tanaka 2001 [VF]                                                                 |
| **MAF "180 − age"**                                                                | Not validated, and its authors say it does not replace lab testing. The formula is 180 − age, adjusted by −10 to +5 for health and training history, and gives the top of a 10-bpm range.                                                                                          | Talk test or a measured VT1 or heart rate.                                                                                                                                                                     | Maffetone 180 Formula; Maffetone & Laursen 2020 [VF]                             |
| **"Zone 2" as uniquely effective**                                                 | Not supported for the general population.                                                                                                                                                                                                                                          | Say "easy" and explain it honestly.                                                                                                                                                                            | Storoschuk 2025 [VA]                                                             |
| **A mandatory 20-mile run, or a universal 16-mile cap**                            | The sources disagree, and the association evidence compares cohorts (Doherty). That time on feet matters more than miles for slower runners is Hansons' coaching reasoning, not a trial finding.                                                                                   | Cap the long run by **time** (Tropos already uses 150 minutes), adjust by experience, apply the single-run guard. Surface Hansons vs Higdon as a choice only if users want it.                                 | Hansons [VA]; Higdon [VA]; Doherty 2020 [VA]                                     |
| **Long run as a fixed percentage of weekly volume**                                | Coaching convention only. It breaks down for 3-day runners.                                                                                                                                                                                                                        | Time cap + single-run guard + training age.                                                                                                                                                                    | Daniels [VA]                                                                     |
| **A fixed taper template**                                                         | Pooled evidence gives ranges, not one recipe.                                                                                                                                                                                                                                      | About 2 weeks (8–14 days) is best, and up to 3 weeks still works. Cut volume by 41–60%, keep intensity and frequency, and make the down weeks consecutive, right before the race. Add a short explanation.     | Bosquet 2007 [VA]; Wang 2023 [VF]; Smyth & Lawlor 2021 [VF]                      |
| **"Strength training prevents running injuries"**                                  | The running RCT was null, with partial, self-reported adherence and a control group free to strength-train. The positive meta-analysis is mostly other sports.                                                                                                                     | Offer strength for performance and general health. Do not promise injury protection.                                                                                                                           | Toresdahl 2020 [VF]; Lauersen 2014 [VA]                                          |
| **Stretching to prevent injury**                                                   | No effect in a meta-analysis.                                                                                                                                                                                                                                                      | Optional for comfort and mobility.                                                                                                                                                                             | Lauersen 2014 [VA]                                                               |
| **A universal cadence target of 180**                                              | Raising each runner's own step rate 5–10% lowered knee loading (and, at 10%, hip loading) on average. The study set targets relative to each runner's preferred rate, not 180.                                                                                                     | Display cadence as a metric only (roadmap A10).                                                                                                                                                                | Heiderscheit 2011 [VF]                                                           |
| **Shoes prescribed by pronation or foot type**                                     | Pronation in neutral shoes was not linked to injury.                                                                                                                                                                                                                               | Comfort-based choice; mileage tracking only.                                                                                                                                                                   | Nielsen 2014 (BJSM) [VA]                                                         |
| **Race predictions shown as promises**                                             | Riegel was 10 minutes or more too fast at the marathon for about half of recreational runners. VDOT was not tested; it agrees closely with Riegel [C], so it is probably optimistic too, but that is an inference. Equation errors range widely.                                   | Ranges, mileage-aware widening, and the reason shown.                                                                                                                                                          | Vickers 2016 [VF]; Keogh 2019 [VA]                                               |
| **Cycle-phase programming for every woman**                                        | Effects are trivial on average.                                                                                                                                                                                                                                                    | No default cycle-phase programming. Personalise on each woman's own response (McNulty). Optional symptom logging and user-chosen adjustments are a Tropos product choice, not from the source.                 | McNulty 2020 [VF]                                                                |
| **Readiness scores or HRV "go/no-go"**                                             | Two small trials found modest benefits from HRV-guided hard days (Vesterinen: 3000 m 2.1% faster against 1.1%, ES 0.42; Kiviniemi: n = 17 over 4 weeks). One morning's HRV varies a lot from day to day, so Vesterinen used a 7-day average.                                       | Signals in, one factual reason out (the existing easierToday register). If HRV is used, compare a 7-day average with the runner's own normal range, not one morning's reading.                                 | Vesterinen 2016 [VF]; Kiviniemi 2007 [VA]; roadmap §3                            |
| **Double threshold days, special blocks or lactate-guided training for consumers** | Elite methods. The Norwegian lactate-guided runners train about 140–185 km a week with lactate meters; Canova's marathoners run about 130–240 km. The cited RunnersConnect page does scale special blocks down for 40–70-mile weeks, so "elite only" is this document's judgement. | Borrow only the idea that sub-threshold intervals are a sustainable format (cruise intervals).                                                                                                                 | Casado 2023 [VF]; Tjelta 2019 [VA]; Canova [VA]                                  |
| **"Never two hard days in a row" as an absolute law**                              | Daniels deliberately puts two quality sessions on back-to-back days. The Norwegian double-threshold days put two sessions on one day but keep a hard day–easy day pattern. Hansons avoids back-to-back hard days.                                                                  | Keep it as the recreational default (CONVENTION) and allow exceptions for experienced users.                                                                                                                   | Daniels [VA]; Hansons [VA]; Casado 2023 [VF]                                     |
| **Age-based caps on intensity for masters runners**                                | No evidence for such caps was found, and trainability seems broadly preserved [U]. The review links much of the age-related decline to lower training intensity and volume, which fits not capping intensity; that is an inference, not a test.                                    | Individualise by history and recovery.                                                                                                                                                                         | Tanaka & Seals 2008 [VA] (decline mechanism only)                                |
| **Formulas that boost the dose from a fitness score alone**                        | Already non-adopted in the handoff. Gains depend on exposure, consistency and response.                                                                                                                                                                                            | An exposure model with provenance (RUN-EV-04).                                                                                                                                                                 | Handoff                                                                          |
| **Catching up missed quality work**                                                | Already non-adopted in the handoff.                                                                                                                                                                                                                                                | Keep, move, drop or replace with something easier.                                                                                                                                                             | Handoff                                                                          |

---

## 9. Gaps, and what to verify before shipping numbers

The first pass ran out of searches before it could close these. The
2026-10-07 pass closed items 2, 3, 7 and 8, narrowed items 1, 4, 6 and 9, and
left item 5 open. The checked values for items 3, 4, 6, 7, 8 and 9 are in the
block after the list.

1. **Re-verify every [R] and [U] row**, especially the numbers the generator
   or copy would encode. Checked on 2026-10-07:
   - Daniels' caps, from the 4th edition [VA]. T: no more than 10% of weekly
     mileage in one workout. I: the lesser of 10 km or a share of weekly
     mileage (the quote seen is cut off; Daniels' worked example, 3.2 miles at
     I in a 40-mile week, is 8%). Long run: no more than 30% of weekly mileage
     under 40 miles (64 km) a week; at 40 miles a week or more, no more than
     the lesser of 25% or 150 minutes. Marathon-pace runs: no more than the
     lesser of 110 minutes or 18 miles (29 km). The long-run rule was read in
     the book; the T, I and M wording comes from verbatim reader highlights.
   - The minimum-dose findings. Bickel 2011 [VF]: after 16 weeks of training,
     a third of the dose (1 day × 3 sets a week) or a ninth (1 day × 1 set)
     kept the strength gained for 32 weeks; stopping lost 7% but stayed 23%
     above baseline. Fibre size held in young adults at both doses, but at
     neither dose in 60–75-year-olds.
     Spiering 2021 [VA]; Rønnestad 2010 [VA].
   - Hottenrott 2016 [VA]: run-walk gave similar marathon finish times with
     less muscle pain and fatigue. It did not lower the cardiac stress
     markers, which was the study's main question. DOI
     10.1016/j.jsams.2014.11.010.
   - The talk-test papers: Foster 2001 and Persinger 2004 [VF]; Foster 2008
     and Reed 2014 [VA].
   - The Banister parameter ranges: checked against published fits (the Peng
     2023 collection [C]; Busso 2003 and Hellard 2006 [VF]); see §6.2 and the
     block after §6.4. Banister 1975 itself could not be checked [U].
   - The Doma & Deakin details (one paper read in full [VF], two as
     abstracts [VA]): see §7.2.
   - Still open: the Olympiatoppen zone percentages [R], and every claim
     marked [U] (the load-bearing ones are listed at the top of this
     document).
2. **Frandsen 2025: closed** [VF], from the full text and the supplement.
   - Adjusted hazard rate ratios for a run longer than the longest of the
     previous 30 days: more than 10% to 30% longer, 1.64 (95% CI 1.31–2.05);
     more than 30% to 100% longer, 1.52 (1.16–2.00); more than 100% longer,
     2.28 (1.50–3.48).
   - Reference category: a ratio of 0 to 1.1, meaning any shorter run or one
     up to 10% longer.
   - Exposure: session distance only. Duration was not studied.
   - Injury: self-reported each week as "painful and irritating, leading to
     a reduction in running activity", with no full stop required. The
     outcome is the first overuse injury, with traumatic injury as a
     competing risk, linked to the last run up to 10 days before it.
   - Novices: there is no subgroup estimate. Median running experience was
     9.5 years (IQR 4–20), and effect modifiers were not modelled, so the
     authors give no advice for subgroups.
   - Sensitivity analyses: counting all injuries, sudden-onset injuries only,
     other cut-offs, or knee and shin injuries keeps the association. Dating
     the injury by the questionnaire weakens it. Gradual-onset overuse
     injuries do not appear to be associated in the same way.
3. **Book sweep: done.** See "Books, 2022–2026" below.
4. **Beginner adherence and dropout: partly closed.** Programme and parkrun
   figures exist (below). No plan-completion rate was found for any running
   app, so the simulation should still treat completion as its largest
   unknown and sweep it.
5. **There is no direct trial of strides**; the support is indirect only. A
   targeted search (for example "strides" + "running economy" + RCT) may find
   small studies.
6. **Long-term improvement: partly closed.** Twelve-month anchors exist
   (below). No within-runner 26–52-week curve for recreational runners was
   found. Strava or Garmin longitudinal analyses (Smyth et al.; the Emig &
   Peltonen follow-ups) are still the place to look.
7. **Injury severity and time loss: closed** for novices. §6.3 now uses the
   sourced tiers below; for other runners the mix is still an assumption.
8. **ISBNs: done.** See the list below.
9. **Heat adjustment: closed for marathons, open for training paces.** See
   below.

### Verified parameters (2026-10-07)

This block covers §9, items 3, 4, 6, 7, 8 and 9. Checked in publisher
catalogues, Open Library and the papers on 2026-10-07. DOIs and links are
inline. [C] marks a value computed here.

**Books, 2022–2026 (item 3)** [VA]. None is evidence. Each is a coach's or a
team's synthesis.

| Book                                                                                                                                                                                                                                                                                                                                                | ISBN                                                                       | What Tropos can take                                                                                                                                                                                                                                                               | Limit                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Pfitzinger P, Douglas S. _Advanced Marathoning_, 4th ed. Human Kinetics (Open Library 2025; HK ©2026)                                                                                                                                                                                                                                               | 978-1-7182-3747-6                                                          | 18- and 12-week plans in four mileage bands, from under 55 to over 85 miles a week. New chapters on masters runners and running several marathons in a season. New guidance on heart-rate training ([HK](https://us.humankinetics.com/products/advanced-marathoning-4th-edition)). | Written for serious marathoners. Supersedes the 3rd ed. (2020) that the repo's handoff cites. |
| Fitzgerald M, Rosario B. _Run Like a Pro (Even If You're Slow)_. Berkley, 2022                                                                                                                                                                                                                                                                      | 978-0-593-20191-6                                                          | Elite-style structure scaled down for amateurs ([Open Library](https://openlibrary.org/isbn/9780593201916)).                                                                                                                                                                       | Coach-authored.                                                                               |
| Coogan M, Douglas S. _Personal Best Running_. Human Kinetics (Open Library 2023)                                                                                                                                                                                                                                                                    | 978-1-7182-1471-2                                                          | Plans from the mile to the marathon. Blocks for several races close together, and for switching quickly between race distances ([HK](https://us.humankinetics.com/products/personal-best-running)).                                                                                | Coach-authored.                                                                               |
| MacMahon C. _Running Past 50_. Human Kinetics (Open Library 2024)                                                                                                                                                                                                                                                                                   | 978-1-7182-1394-4                                                          | Plans for masters runners, and chapters on menopause and "transitional" plans between goals ([HK](https://us.humankinetics.com/products/running-past-50)).                                                                                                                         | Coach-authored.                                                                               |
| Reuter B (ed.). _Developing Endurance_, 2nd ed. NSCA/Human Kinetics, ©2025                                                                                                                                                                                                                                                                          | 978-1-7182-0696-0                                                          | NSCA chapters on resistance training for endurance athletes, running, and overtraining ([HK](https://us.humankinetics.com/products/developing-endurance-2nd-edition)).                                                                                                             | Textbook level.                                                                               |
| Viada A. _The Ultimate Hybrid Athlete_. Victory Belt, 2025, 304 pp                                                                                                                                                                                                                                                                                  | 978-1-62860-562-4                                                          | The successor to _The Hybrid Athlete_ (2015, no ISBN). Hybrid programmes, and managing overtraining and injury when lifting and running together ([publisher](https://www.victorybelt.com/ultimate-hybrid-athlete)).                                                               | Practitioner book. Concurrent-training claims need the §4.10 papers.                          |
| Sims ST, Yeager S. _Next Level_ (Rodale, 2022); _ROAR_, revised ed. (Rodale; Open Library 2024)                                                                                                                                                                                                                                                     | 978-0-593-23315-3; 978-0-593-58192-6                                       | Training through menopause, and female physiology ([Open Library](https://openlibrary.org/isbn/9780593233153)).                                                                                                                                                                    | Promotes cycle-phase programming, which §4.17 does not adopt by default.                      |
| Announced, not yet out: Pfitzinger & Latter, _Faster Road Racing_ 2nd ed. (HK lists ©2028); Laborde, Altini, Mosley & Plews, _Heart Rate Variability_ (HK ©2027); Androulakis-Korakakis, _Train Smarter, Not Longer_ (HK ©2027; minimum effective dose of lifting); Jones A, _Faster_ (HarperCollins; retailers list the paperback for 28 Jan 2027) | 978-1-7182-5913-3; 978-1-7182-3609-7; 978-1-7182-3929-6; 978-0-00-863805-4 | Revisit when published. _Train Smarter, Not Longer_ bears on §4.11.                                                                                                                                                                                                                | Not read. The Jones ISBN is from a retailer listing only.                                     |

**ISBNs for the §1 books (item 8)** [VA]:

- _Running to the Top_: 978-3-89124-440-1 (Meyer & Meyer, 1997); 2011 edition
  978-1-84126-335-9 ([OL](https://openlibrary.org/isbn/9783891244401)).
- _The Happy Runner_: Human Kinetics, 2019. ISBN 978-1-4925-6764-6
  ([HK](https://us.humankinetics.com/products/the-happy-runner)).
- _Lore of Running_, 4th ed.: Human Kinetics, ©2003. ISBN 978-0-87322-959-3
  (ISBN-10 0-87322-959-2)
  ([OL](https://openlibrary.org/isbn/9780873229593)).
- _Training for the Uphill Athlete_: House S, Johnston S, Jornet K
  (Patagonia, 2019). ISBN 978-1-938340-84-0
  ([OL](https://openlibrary.org/isbn/9781938340840)).
- _Run Like a Pro (Even If You're Slow)_: Berkley, 2022. ISBN
  978-0-593-20191-6 (paperback); ebook 978-0-593-20192-3.
- _The Hybrid Athlete_ (Juggernaut, 2015): an ebook sold directly; no ISBN
  found. Its successor is in the table above.

**Beginner adherence and dropout (item 4).** No plan-completion rate was found
for any running app; Runna, Garmin Coach and Strava were searched. Use these
anchors:

- Couch to 5K: 27.3% finished a 9-week programme (n = 110; one coached
  session and two app runs a week). Drop-out was linked to injury and to the
  week-5 jump in run length
  ([doi:10.3390/ijerph20176682](https://doi.org/10.3390/ijerph20176682) [VF]).
- NHS app, 2022: 860,000 people ran at least once and 6.46 million runs were
  logged
  ([gov.uk](https://www.gov.uk/government/news/millions-of-runs-completed-using-couch-to-5k-app) [VA]).
  That is about 7.5 runs per user against 27 in the plan [C, WEAK].
- After a 6-week novice programme, 29.5% had stopped running by 26 weeks.
  Injury was the reason for 48% of them
  ([doi:10.1016/j.jsams.2018.06.003](https://doi.org/10.1016/j.jsams.2018.06.003) [VA]).
- parkrun: 64.2% of first-timers came back at least once. Those finishing
  over 40 minutes returned least
  ([doi:10.1371/journal.pgph.0001786](https://doi.org/10.1371/journal.pgph.0001786) [VF]).
  Over 3 years, 76.4% were "few-timers" (about 4 runs) and 4.3% kept coming
  most weeks
  ([doi:10.1093/heapro/daae098](https://doi.org/10.1093/heapro/daae098) [VA]).
- Over 75% of activity-app users come back after a long gap
  ([doi:10.1145/3178876.3186062](https://doi.org/10.1145/3178876.3186062) [VA]).
  Plan for lapse and return, not only for dropout.

Simulation: sweep 9-week plan completion from 25% to 70%. Make injury the
largest single cause of quitting. Let a share of quitters come back.

**Long-term improvement (item 6)**

- Untrained adults on a fixed, modest dose for 12 months: VO2max rose 16%
  (IQR 9–20%). By 6 months, 65% of that gain had come
  ([doi:10.1249/MSS.0b013e3181935a11](https://doi.org/10.1249/MSS.0b013e3181935a11) [VA]).
  Gains flatten unless the dose rises.
- New parkrunners got about 12% faster over 12 months (n = 354)
  ([doi:10.1093/pubmed/fdy178](https://doi.org/10.1093/pubmed/fdy178) [VA]).
- From first parkrun to best time, all participants improved 10.2% and
  initial non-runners 15.8%. The abstract gives no time window
  ([doi:10.1093/pubmed/fdt082](https://doi.org/10.1093/pubmed/fdt082) [VA]).
- §6.1 sedentary row: keep 8–15% at 26 weeks. At 52 weeks, centre on about
  12–16%, with 25% as the tail.
- No 26–52-week within-runner curve for recreational runners (VDOT 35–45) was
  found. That row stays WEAK.
- Breaks of 7 days or more hit about 55–58% of marathoners in the 16 weeks
  before the race. They cost about 4% (7–13 days) and up to about 10%
  (21–27 days, late) of finish time, compared with the same runner's unbroken
  build-ups
  ([doi:10.3389/fspor.2022.1096124](https://doi.org/10.3389/fspor.2022.1096124) [VF]).
  Use this to check §6.4.

**Injury severity and time loss (item 7).** §6.3's severity mix uses these:

- In 1,696 novices over 6 weeks
  ([doi:10.1016/j.jsams.2015.07.003](https://doi.org/10.1016/j.jsams.2015.07.003),
  Table 2 [VF]):
  - any running pain: 58.0%
  - training reduced for at least 1 day: 28.8%
  - at least 1 day lost: 22.5%
  - at least 1 week lost: 7.5% (18.7 per 1000 h)
- [C] Of injuries that change training, about 22% only reduce it, 52% stop
  running for 1–6 days, and 26% stop it for at least a week. Week-long
  complaints last a median of 20–22 days. That figure is cut off at 6 weeks.
- Diagnosed injuries that restrict running for at least a week take a median
  of 71 days to pain-free running in novices (range 9–617 days; 87% recover)
  ([doi:10.1371/journal.pone.0099877](https://doi.org/10.1371/journal.pone.0099877) [VF]).
  In recreational runners the median is 56 days (IQR 70)
  ([doi:10.1371/journal.pone.0204742](https://doi.org/10.1371/journal.pone.0204742) [VA]).
- Model two durations: full time off (median about 3 weeks, for the ≥1-week
  tier) and reduced running until recovered (lognormal, median 8–10 weeks,
  long right tail).
- Define an injury as the consensus does: running restricted or stopped for
  at least 7 days, or for 3 sessions in a row, or needing a clinician
  ([doi:10.2519/jospt.2015.5741](https://doi.org/10.2519/jospt.2015.5741) [VA]).

**Heat adjustment (item 9): closed for marathons, open for training paces.**

- Mantzios 2022
  ([doi:10.1249/MSS.0000000000002769](https://doi.org/10.1249/MSS.0000000000002769) [VF]):
  - Performance is best at 7.5–15 °C WBGT (10–17.5 °C air); for the
    marathon, at 7.5 °C WBGT.
  - Above that, marathon times slow about 0.2% per °C WBGT for the top
    finishers, and the 5000 m about 0.3% per °C.
  - The authors' reading of Ely 2007 is about 0.6% per °C for well-trained
    runners.
- Ely 2007 chart of slowing by finish time (reproduced in
  [doi:10.1007/s40279-014-0155-0](https://doi.org/10.1007/s40279-014-0155-0),
  Fig. 3 [VF]):
  - A 3:00 marathoner loses about 3, 6, 9 and 12% at 10, 15, 20 and 25 °C
    WBGT.
  - A 2:30 runner loses about 1.3, 2.6, 3.8 and 5.2%.
  - The chart stops at 3:00.
- El Helou 2012, Table S3, uses air temperature
  ([doi:10.1371/journal.pone.0037407](https://doi.org/10.1371/journal.pone.0037407) [VF]):
  - The median male finisher (about 4 hours) is fastest at 6.2 °C.
  - He loses 0.95, 3.91, 9.26 and 17.73% of speed at 5, 10, 15 and 20 °C
    above that.
  - The loss accelerates; it is not linear.
- Slower runners lose more: cite Ely 2007
  ([doi:10.1249/mss.0b013e31802d3aba](https://doi.org/10.1249/mss.0b013e31802d3aba) [VA]).
  El Helou's authors say temperature acts "whatever the initial capacity",
  although their Table S3 (below) shows larger losses for the median and Q3
  men than for the fastest.
- Slower runners run slower from the start in heat; they do not fade more
  ([doi:10.1249/MSS.0b013e3181788da9](https://doi.org/10.1249/MSS.0b013e3181788da9) [VA]).
  This supports setting the pace at the start rather than late in the race.
- Acclimatisation: repeated exercise-heat sessions over 1–2 weeks
  ([doi:10.1136/bjsports-2015-094915](https://doi.org/10.1136/bjsports-2015-094915) [VF]).

El Helou 2012, Table S3 in full [VF]: the optimum air temperature, then the
percentage of speed lost at 5, 10, 15 and 20 °C above it. Levels are as the
table labels them.

| Level         | Optimum (°C) | +5 °C | +10 °C | +15 °C | +20 °C |
| ------------- | ------------ | ----- | ------ | ------ | ------ |
| Men, P1       | 3.81         | 0.36  | 1.44   | 3.29   | 6.0    |
| Men, Q1       | 6.02         | 0.82  | 3.38   | 7.93   | 15.03  |
| Men, median   | 6.24         | 0.95  | 3.91   | 9.26   | 17.73  |
| Men, Q3       | 7.42         | 1.12  | 4.61   | 11.01  | 21.42  |
| Women, P1     | 9.91         | 0.75  | 3.06   | 7.16   | 13.47  |
| Women, Q1     | 6.85         | 0.63  | 2.58   | 6.00   | 11.18  |
| Women, median | 6.75         | 0.70  | 2.84   | 6.63   | 12.43  |
| Women, Q3     | 7.35         | 0.77  | 3.14   | 7.35   | 13.85  |

Losses below the optimum are nearly symmetric: the median man loses 3.77% at
10 °C below it, against 3.91% at 10 °C above [C]. The losses track the rise in
finish time, so they convert straight to pace [C]. They are fits to race-day
air temperature across 60 races (not WBGT or humidity), they describe
populations rather than individuals, and they are quadratic, so there is no
single linear slope.

Product (the heat-adjusted pace band, roadmap B2): for race-pace targets,
slow by about 0.2–0.6% per °C WBGT above about 10 °C, more for slower runners
[C, WEAK]. For runners slower than 3:00 there are no Ely data, so the El Helou
curve is the closest guide. For easy runs, keep effort and heart-rate bands
(§4.12). No source gives pace slopes for training runs.

---

## Appendix A. Computed reference values [C]

These come from the Daniels–Gilbert 1979 equations:

- VO₂(v) = −4.60 + 0.182258·v + 0.000104·v² (v in m/min)
- %VO₂max(t) = 0.8 + 0.1894393·e^(−0.012778·t) + 0.2989558·e^(−0.1932605·t)
  (t in minutes)

The script is `harnesses/vdot_calc.py.txt` in this folder. The equations
reproduce Daniels' race-time table (4th ed., Table 5.1) to within 1–10 s at
VDOT 40–50; for example VDOT 40 gives a 5K of 24:06 against the book's 24:08.
At VDOT 30 the marathon is 32 s slow. T pace matches Table 5.2 exactly at
VDOT 35, 40, 45 and 50, but the E band below runs about 11–12 s/km slower
than the book's at its fast end and 4–9 s/km at its slow end. **Compare with
`runPaces.ts` before using any of these.**

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
VDOT 25 it is even slightly faster (7:23 against 7:25 /km). This follows from
the definition: T is "about what you could race for an hour", and for these
runners a 10K takes longer than an hour. It is not a bug. For slow runners,
make "comfortably hard" effort the primary cue and treat the T pace as a
ceiling.

**Riegel from a 10K of 50:00:** 5K 23:59, half 1:50:19, marathon 3:50:01.

**Tanda 2011 marathon predictions** (K = mean weekly km over the 8 weeks
ending 7 days before the race; P = mean training pace over the same weeks,
warm-ups and recoveries included)

| K (km/week) | P (/km) | Predicted marathon pace | Predicted marathon |
| ----------- | ------- | ----------------------- | ------------------ |
| 30          | 6:30    | 5:51 /km                | 4:06:51            |
| 45          | 6:15    | 5:34 /km                | 3:54:38            |
| 50          | 6:00    | 5:23 /km                | 3:46:48            |
| 55          | 6:00    | 5:20 /km                | 3:44:50            |
| 60          | 5:50    | 5:11 /km                | 3:39:02            |
| 65          | 5:50    | 5:09 /km                | 3:37:10            |
| 70          | 5:40    | 5:01 /km                | 3:31:28            |
| 80          | 5:30    | 4:50 /km                | 3:24:06            |

Tanda's formula was fitted to 2:47–3:36 marathoners training 40.4–110.7 km a
week at mean training paces of 4:13–5:31 /km. K = 30 is below that range, and
7 of the 8 rows use training paces slower than any in the sample, so those rows
are extrapolations. Only the 80 km row sits inside both ranges.

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
| Run-walk           | Run-walk                | Alternating running and walking from the start.                                              | Covers more distance with less muscle pain and tiredness. A real method, not giving up.  |
| Time trial         | Fitness check           | A timed best effort, such as a mile or a 5K.                                                 | Sets your training paces. Run it fresh, flat and in mild weather.                        |

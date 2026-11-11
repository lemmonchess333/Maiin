# Web research, 11 Nov 2026 (condensed from the agent's hand-back; quotes spot-checked where marked)

## Platform rules

- Apple HIG, Activity rings (developer.apple.com/design/human-interface-guidelines/activity-rings): "Never use Activity rings to display other types of data." "Don't replicate or modify Activity rings for other purposes." Other rings must be separated from them by padding, lines, labels, colour or scale.
- Apple HIG, Gauges (/gauges): "Write succinct labels that describe the current value and both endpoints of the range." Nothing on circular vs linear, thickness, or values past the range.
- Apple HIG, Progress indicators: "Circular progress indicators have a track that fills in a clockwise direction." (transient indicators; a calorie ring is a gauge/chart in Apple's terms)
- Apple HIG, Charting data / Charts: prefer common chart types; "Keep a chart simple, letting people choose when they want additional details."; "Avoid relying solely on color..."; "Aid comprehension by adding visual separation between contiguous areas of color."
- Apple HIG, Typography/Accessibility: iOS default text 17 pt, minimum 11 pt; enlarge by at least 200%; control 44x44 pt default, 28x28 minimum; contrast 4.5:1 text, 3:1 at 18 pt or bold.
- Apple HIG, Motion: "Aim for brevity and precision in feedback animations." "In apps, generally avoid adding motion to UI interactions that occur frequently." "don't make people wait for an animation to complete before they can do anything". No duration in seconds. Reduce Motion: replace x/y/z transitions with fades; motion must not be the only carrier (supplement with haptics).
- Apple HIG, Segmented controls: no more than about five segments on iPhone; text or images, not a mix. Text fields: show a hint; trailing end for extra features; show a Clear button. Entering data: "When possible, offer choices instead of requiring text entry."
- WCAG 2.2: 1.4.1 colour not the only cue (A). 1.4.3 text 4.5:1, large (18 pt / 14 pt bold) 3:1 (AA). 1.4.11 graphics 3:1 for "Parts of graphics required to understand the content" (AA); not applicable where "A graphic with text embedded or overlaid conveys the same information, such as labels and values on a chart." (https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). 2.3.3 motion from interaction can be disabled (AAA). 2.5.8 targets 24 px (AA); 2.5.5 44 px (AAA). 1.4.4 resize to 200%. 1.4.10 reflow at 320 px.
- Material (Android components Motion doc): short 50-200 ms, medium 250-400, long 450-600, extra long 700-1000; "duration should increase as the area/traversal of an animation increases". https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md

## Perception

- Skau & Kosara 2016 (CGF 35(3), n=96): donut "as accurate as the traditional pie chart"; only the thinnest ring (hole 97% of radius) "somewhat less accurate"; both "certainly less accurate than bar charts". https://media.eagereyes.org/papers/2016/Skau-EuroVis-2016.pdf
- Blascheck et al. 2023 (IEEE PacificVis, smartwatch, small lab): reading goal progress at a glance: bar 318 ms, radial 397 ms, text 503 ms; error 24%, 26%, 31%; radial rated best-looking. https://tingying-he.github.io/assets/publications/papers/Blascheck_2023_Studies.pdf
- Heer & Bostock 2010 (CHI): position beats length; area and angle worse than position. https://idl.cs.washington.edu/files/2010-MTurk-CHI.pdf
- NN/g 2017 (practitioner): "Circular graphs like pie charts, gauges, and radar charts do not convey well quantitative relationships". https://www.nngroup.com/articles/dashboards-preattentive/

## Behaviour

- Koo & Fishbach 2012 (JCR 39(3); abstract + press release only): motivation is higher when attention goes to the smaller of done and remaining. Tested on loyalty cards (goals), not limits. https://ideas.repec.org/a/oup/jconrs/doi10.1086-663827.html
- Kivetz, Urminsky & Zheng 2006 (JMR 43): goal gradient; a 12-stamp card with two bonus stamps completed in 12.7 vs 15.6 days. https://business.columbia.edu/sites/default/files-efs/pubfiles/1200/goalgradient.pdf
- Nunes & Dreze 2006 (JCR 32(4); abstract only): endowed progress.
- No source tests "left" against "logged" for a calorie limit, or fill against empty.

## Food logging

- Cordeiro, Bales, Cherry & Fogarty, CHI 2015 "Rethinking the Mobile Food Journal" (survey 257; field 27): missed entries: forgetting 54%, too hard to enter 40%; 13% of survey and 45% of field participants skipped logging food that was over budget or unhealthy, none in a journal with no calorie judgments; photo capture cut "too difficult" from 60% to 22%. https://homes.cs.washington.edu/~jfogarty/publications/chi2015-decaf.pdf
- Cordeiro et al., CHI 2015 "Barriers and Negative Nudges" (141 journalers, 5,526 posts): ease of logging 7-point: packaged 6.5, fast food 6.3, home-cooked 4.6, restaurant 3.6. https://pmc.ncbi.nlm.nih.gov/articles/PMC4755274
- Silverman et al. 2022 (JACR 7(4); abstract only): people expect photo logging to be easier; in a week's field study they "log less of what they eat" with photos.
- Harvey et al. 2019 (Obesity 27(3), n=142): 23.2 min/day in month 1, 14.6 in month 6; log-ins a day 1.6 vs 2.4 for under vs over 5% loss. https://pmc.ncbi.nlm.nih.gov/articles/PMC6647027
- Xu et al. 2023 (Obesity 31(7), n=153, funded by the programme's owner; abstract only): tracking on 28.5% of days for 3% loss, 39.4% for 5%, 67.1% for 10%.
- Pai & Sabharwal 2022 (Sensors 22(7), 1,581 diaries): 93% of people repeat breakfast items, 58% dinner; item recurrence 0.65 breakfast, 0.24 dinner. https://pmc.ncbi.nlm.nih.gov/articles/PMC9002488
- Shonkoff et al. 2023 (Annals of Medicine, review of 52 studies): AI photo calories 0.10% to 38.3% relative error; lower for single simple foods. https://pmc.ncbi.nlm.nih.gov/articles/PMC10836267/
- Fridolfsson et al. 2025 (Curr Dev Nutr 9(10), 52 weighed photos): general LLMs 35.8%, 35.8%, 64.2% mean absolute error for energy; worse on large portions. https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/

## Harm avoidance

- Eikey 2021 (BJPsych Open 7(5), qualitative, 24 women with eating disorders): red over-budget numbers distress ("The red number would come... it just freaks me out"); green "remaining" rewards restriction. https://pmc.ncbi.nlm.nih.gov/articles/PMC8485346
- Levinson et al. 2017 (Eating Behaviors 27, clinic survey N=105): 73.1% of 78 users said their tracker contributed to their disorder; no causal claim. https://pmc.ncbi.nlm.nih.gov/articles/PMC5700836
- Anderberg et al. 2025 (Body Image 52, review of 38 studies; abstract only): "No causal conclusions could be drawn."
- Hahn et al. 2021 (JAND 121(12), RCT n=200 low-risk women): a month of tracking did not raise eating-disorder risk. https://pmc.ncbi.nlm.nih.gov/articles/PMC9109125

## Practitioner

- NN/g 2020, Animation duration: "the duration of most animations should be in the range of 100–500 ms"; "At 500ms, animations start to feel like a real drag for users"; "the more frequent the animation, the more subtle and shorter you'll want it to be."; "with 400ms being a very slow animation, to be used only for big movements across large screens." https://www.nngroup.com/articles/animation-duration/
- NN/g 2015, clickable elements: "Make clickable elements obvious to users". https://www.nngroup.com/articles/clickable-elements/
- NN/g 2024, recognition over recall. https://www.nngroup.com/articles/recognition-and-recall/
- Baymard 2022: 4 to 8 suggestions on mobile. https://baymard.com/blog/autocomplete-design
- NIST SI checklist item 15: a space between the value and the unit symbol ("15 g"). https://physics.nist.gov/cuu/Units/checklist.html

## Not found / not read at source

- No study of where the arc starts, a number in the centre, a second lap past 100%, counting numbers, or an item flying to a target.
- Cleveland & McGill 1984 (503s), NICE NG183 (403), Material's own motion pages: not read at source.

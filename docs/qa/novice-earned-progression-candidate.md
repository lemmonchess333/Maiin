# Novice race progression candidate

Status: isolated, opt-in generator candidate. Not activated by any application writer, not migrated, not a deployable end-to-end feature. Based on beginner slice 33f949a. No recovery changes.

## Scope and intent

A runner explicitly adopting the beginner pathway can repeat an established stage instead of advancing merely because signup was six weeks ago. This pathway is the existing nine-stage progression toward 30 continuous minutes, not a complete half-marathon or marathon preparation plan. Existing established plans are unchanged when the new input is absent.

The generator accepts a stage state, explicit session reports, and a current self-reported recovery check. Imported distance, duration, heart rate, and “Mark as done” are not silently promoted into evidence of completing a run-walk stage or being ready to advance.

Two distinct days reported as completing the current stage comfortably can advance one stage at a later calendar-week boundary. Reports must occur after stage adoption and within the previous three weeks. Duplicate dates count once. Conflicting records sharing an activity identity receive no credit until reconciled. Unknown recovery withholds training prescriptions. Missing history holds progression. These numerical choices are transparent product heuristics, not validated injury-prevention thresholds.

Future preview weeks stay at the established stage; they never assume future completions. At stage nine the result requests baseline review. It does not automatically escalate continuous mileage. Race dates remain unchanged, and the event remains in the calendar with readiness explicitly unassessed. The UI must distinguish that event from a recommendation to attempt the race.

## Actual generator replay

The test suite calls generateRacePlanV2 for 5K, 10K, half marathon, and marathon, using seven selected days and a months-old initial stage. With missing evidence, all future training sessions remain stage one, at most three nonconsecutive days each week. Explicitly unknown/not-ready recovery emits no training sessions, while preserving the event date. Existing unopted input produces byte-equivalent output. Duplicate imports, conflicting edits, repeated weeks, and stage-nine completion have dedicated policy cases.

## Outside-training UI and persistence work still required

The existing non-race DayActionSheet “Mark as done” action is the smallest suitable entry point. Today it only stores completedAt and intentionally creates no synthetic saved run. Extend it with an optional separate report: what session was completed, date, actual duration, existing effort vocabulary, and an explicit manageable-session answer. A separate current recovery check is needed; notes must not be mined for pain clearance. Saved sessions can prefill facts, never consent or subjective readiness answers. Ordinary marking done must remain distinct from progression evidence.

Persist authenticated activity references and correction versions, not arbitrary client-submitted stage credit. Persist stage adoption and stage-start date transactionally, scoped to the exact race block. Regeneration and previews must use the same accepted state. Repeated regeneration cannot grant another advancement. Old clients must not overwrite this state or recreate calendar-driven novice prescriptions. These boundaries are not implemented in this candidate.

## Migration and race implications

No automatic migration is supplied. Before activation, preview the current and proposed week with a clear explanation that fewer or repeated sessions can mean insufficient preparation for the existing race date. Preserve saved activities, historical/current claimed slots, and experienced plans. Obtain a deliberate pathway adoption or baseline review rather than infer an initial stage from signup age. Never move the race date or compress missed work automatically. A full return-after-gap policy and genuinely gradual marathon recovery remain separate unfinished work.

## Evidence boundaries

- NHS Couch to 5K supports spaced run-walk sessions and repeating weeks, ending at 30 continuous minutes. It does not validate this app's two-credit rule or marathon readiness: https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/
- Buist 2008 found no injury reduction from a slower nominal 10%-rule program. No safety guarantee is made: https://pubmed.ncbi.nlm.nih.gov/17940147/
- Frandsen 2025 found an association with unusually long single sessions, not a causal safe progression threshold: https://pmc.ncbi.nlm.nih.gov/articles/PMC12421110/

Do not describe this candidate as deployed outside-run reporting, complete earned race progression, medically cleared running, or a validated injury-prevention algorithm.

## Incremental evidence contract (still inactive)

The candidate now reconciles full-session date/duration, effort and explicit completion/manageability answers. Linked activities must exactly match facts supplied by an authenticated same-account reader; invalid or ambiguous linked records receive no credit. Outside reports require a separate `outside:` identity and cannot reuse a known saved activity identity. They remain self-reported, never synthetic saved runs. Conflicting corrections require authoritative revision reconciliation before credit.

A report claiming an entire stage session cannot have a duration shorter than that template's full estimated session duration, including warm-up, walking and cool-down. Shorter activity remains legitimate training, but this candidate routes that report to review instead of inferring full completion. This is a consistency check, not a clinical exercise threshold.

Capacity confirmation must explicitly match the supplied current stage and adopted race distance/date. A lower-stage confirmation cannot authenticate a higher stage. The advanced result is a proposal: the future Apply flow must accept that preview and confirm its stage before using it as current state. No trusted persisted earned-stage lineage exists yet. Injury, post-race and clinical-restriction holds compose independently and are never cleared by capacity or activity reports. The actual generator holds if the adopted race changes.

Still required before activation: authenticated report ingestion and correction revisions, durable transactional adoption/acceptance, current capacity renewal and return-after-gap review, a real outside-training form and review messages, and older-client protection. The supplied `verifiedActivities` argument is not itself an authentication mechanism. A future reader must populate it from the signed-in user's authoritative records. Held race rows still require event-only UI presentation, never a recommendation to run.

The proposal/acceptance distinction is encoded: `proposedState` and `proposedTemplateId` are separate from current `state` and `templateId`. `advance_available` never changes the actual generated prescriptions. They continue at the accepted stage until a separate Apply operation updates the accepted state and matching capacity confirmation. Replaying or merely viewing a proposal cannot promote the plan.

# Home declutter — spec (LOCKED 2026-07-20)

**Trigger:** operator review of four Home screenshots — "too many
things on the page." Inventory confirmed ~14 stacked modules and, on
one screen, three simultaneous coaching messages, two of which
contradicted each other ("Fresh legs today — carbs run higher" vs
"Recovering — quiet week").

**Doctrine applied:** calm over flashy; one voice per screen (the
precedent set when the InsightStrip was removed from Home); the page's
job is "what do I do right now", which is the session, not the
analytics.

## Grill outcomes

Six questions grilled; five locked, one deferred.

1. **Performance card — DEFERRED (kept as-is for now).** The
   header-chip demotion (PI score in the "Week N · phase" subline,
   card moves wholly to Analytics) was recommended but the operator
   held it: "leave 1a alone for now." Revisit after living with the
   rest of the declutter.
2. **Energy → compact row (2a).** TodayEnergy becomes a compact,
   NON-expanding card: label + honest phase chip (HOME-TARGET-01
   mapping untouched), kcal consumed/target + thin bar (over-target
   tick kept), macro-grams-left subline. The whole card is one tap
   target → /food — the Food tab IS the expansion. Dropped: the
   in-place breakdown (macro rings, burned-today rows), the embedded
   nutrition insight, the post-workout protein nudge, the duplicate
   "Log today's meals" / "Log food" affordances. Cold-start keeps a
   single-line log-your-first-meal state.
3. **One voice (3a).** WelcomeBackCard is DELETED (returned daily,
   carried no action). The TodayGuidanceCard slot is arbitrated: it
   renders ONLY when the Performance hero's verb-state isn't
   "recovering" / "backing-off" — when the hero is already telling
   the user to ease off, a second voice saying "fresh legs, carbs
   higher" is a contradiction, so the hero wins and the slot stays
   empty. (Structural fix for the screenshot contradiction.)
4. **Sessions first (4a).** Today-section order becomes: contextual
   tip lane (self-gating, unchanged) → session cards (lift/run/rest —
   the product's primary action) → compact energy row → guidance
   slot → water → weight/steps tiles. StackedCTACards is reduced to
   the session stack; water and weight/steps render directly from
   Home below the energy/guidance pair.
5. **Next Badge off Home (5a).** The permanent "next badge" resident
   is removed. Badges keep their two better moments: the
   BadgeEarnedModal celebration on earn, and the badge grid in
   History.
6. **Pro strip snoozeable (6b).** The post-trial "Upgrade to Pro"
   strip gains a dismiss X with a uid-scoped 30-day snooze
   (localStorage timestamp; the funnel resurfaces monthly rather than
   living permanently at the top of every session). The TRIAL
   countdown strip ("N days left") is exempt — it is time-critical
   billing information and self-expires.

## Non-goals

- No change to the Performance card (deferred, above).
- No change to the WeekStrip / DayPeek, the contextual tip lane
  (already priority-arbitrated + self-gating), or WeeklyReviewEntry
  (already renders only around the week boundary).
- No information deleted from the app — everything demoted remains
  one tap away (Food tab, Analytics, History).

STATUS 2026-07-20 — implemented in the same PR as this spec.

STATUS 2026-07-20 (same day) — operator revision after living with the
shipped page: the 2a compact row lost the card's identity ("doesn't
look as cool as it was before with the circles"). Revised landing
spot: TodayEnergy is a MID-SIZE card — the compact header/kcal/bar
kept, but the three colour-coded macro rings are back, always visible
(no expand step), tap-to-flip preserved; the muted grams line the
rings replace is gone. Additionally the vitals now form a PYRAMID:
energy full-width on top, water + weight as half-width tiles below
(WaterCard gains a `compact` variant keeping the wave/fill identity;
WeightStepsTiles stacks its tiles vertically in the right column).
All other declutter locks unchanged.

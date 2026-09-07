# Tropos — Voice & Tone

How Tropos speaks. The visual side is the design system (CLAUDE.md); this is the words. The app's character is **calm, plain, and on your side** — the verbal twin of "calm over flashy."

When writing or reviewing any user-facing string — button, toast, empty state, insight, banner — run it past this.

## Principles

1. **Plain and specific over hype.** State the fact; the fact is the encouragement. "You hit your protein target 6 of 7 days" beats "Great consistency!". The number already praises.
2. **Calm, not loud.** Exclamation marks are rationed — save them for a genuine one-off moment (a PR, a badge earned), never routine confirmations. "12 items logged" not "12 items logged!".
3. **Positive reinforcement done right** (autonomy-supportive, per self-determination research): acknowledge the _action_ and _progress_, never praise the _person_ generically and never shame. "Quiet week — log when you're back" ✓. Not "You skipped your workouts" ✗, not "You're crushing it!" ✗.
4. **Second person, your-coach voice.** "you", not "we'll handle it" chatbot-speak. Avoid "No worries", "Oops", "Let's do this!".
5. **Every word must be legible.** No metaphor the user has to decode. "Steady" not "Cruising"; "keep it going" not "keep the line"; "balanced week" not "hybrid output". If a runner/lifter wouldn't instantly know what it means, rewrite it.
6. **No gym-bro / hype vocabulary.** Banned: beast mode, crush(ing) it, smash, unleash, grind, savage, go hard, on fire, level up, dialed/locked in (as praise), "execute the plan". These read as cringe and off-brand.
7. **Action copy is a verb, not a sentence.** "Log", "Start run", "Update fitness" — not "Tap to log", "Click here to start".

## Quick swaps (reference)

| Don't                                        | Do                                                |
| -------------------------------------------- | ------------------------------------------------- |
| Beast mode! / Crushing it!                   | Strong work / Great lift                          |
| Great job! / Great consistency!              | (state the number/fact)                           |
| Cruising                                     | Steady                                            |
| keep the line / stay the course              | keep it going                                     |
| solid hybrid output                          | lifting and running both strong                   |
| Plan executed / Disciplined week             | You stuck to the plan / Consistent week           |
| can support your goals / may help your goals | helps recovery / makes your trends easier to read |
| No worries — we'll wrap up your plan         | (drop it; state the fact)                         |
| Tap to log today's meals                     | Log today's meals                                 |
| logged!                                      | logged                                            |

## Where the rules already live (keep them)

`src/lib/performanceInsights.ts` carries an enforced style guide in its header ("Observational, not judgmental: 'Load is high' ✓, 'You're crushing it!' ✗ … No exclamation marks. Calm voice."). That discipline is the model — apply it everywhere, not just there.

## Edge cases

- **Celebration moments** (PR set, badge earned, race day) may be warm and may use a single exclamation — they're rare and earned. Everything routine stays calm.
- **Badge/streak names** can be lightly playful (Duolingo-style: "Week Warrior", "Speed Demon") — but never hype-cringe. Judge each; when in doubt, plainer.
- **Nutrition copy is never judgmental about food** — no "bad", "cheat", or "fail" verdicts. Surplus is stated as a neutral quantity ("200 cal over"), never a telling-off.

## Capitalisation (decided 2026-09-07)

**Sentence case for every user-facing string**, with one closed list of
exceptions. Buttons, settings rows, section titles, card titles, stat
labels, tab labels, placeholders, toasts, empty states — all of it.
"Delete account", not "Delete Account". "Weight trend", not "Weight
Trend".

The exceptions, and nothing else:

| Keeps its capitals                  | Why                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| **Performance Index**               | A named metric with its own tab, tooltip, `PI` abbreviation and stored field. |
| **Progress Vault**                  | A named feature.                                                              |
| **Weekly Review**                   | A named surface with its own route (`/review`).                               |
| **Together**, **Feed**, **Explore** | Tab names. Lowercasing "Open Together" reads as an adverb.                    |
| Real-world names                    | Privacy Policy, Terms of Service, Apple Health, London Marathon 2026.         |
| Acronyms                            | TDEE, PI, GPS, PR.                                                            |

Adding to that table is a deliberate act, not a way to keep a capital you
like. The test is whether the phrase is the NAME of something, not
whether it describes something important.

**What this replaced, and why it is not "codifying what we had".** The
2026-09-05 pass recorded this as a choice between applying sentence case
and writing down the split the app already had — titles Title Case,
controls sentence case. There was no such split. Measured across `src/`
on 2026-09-07: 84 distinct Title Case strings against 416 sentence case,
and the same ROLE appeared in both registers. Buttons read `Start Run`,
`Save Run`, `Sign Out`, `Delete Account` — and also `Block user`, `Apply
deload week`, `Re-plan from today`. Settings rows read `Height Unit`,
`Dark Mode` — and also `Body weight unit`, `Reminder time`. So there was
nothing coherent to write down; the only options were to pick a direction
or leave the coin-flip in place.

`circle` and `space` are common nouns here, settled by counting rather
than taste: running copy had them lowercase 42 and 33 times against 16
and 3 capitalised. So "Share to circle", not "Share to Circle".

Pinned by `src/lib/__tests__/copyCasing.test.ts`.

## Judgment calls (decided in the 2026-06-11 audit)

So the next person doesn't re-litigate these:

**Changed** (and why): "Cruising" → "Steady" (decode-able), "Beast mode!" → "Solid session!" (cringe), "keep the line"/"hybrid output" (jargon), "Disciplined week"/"Plan executed" (robotic), "Great consistency!"/"Great calorie control" (state the number instead), "No worries" ×2 (chatbot), "Great run!" → "Nice run", "Tap to log" → "Log", badge "Locked In" → "Unbroken" (it's on our own banned list), insight "Recovery phase" → "Step-back week", "Fresh week" → "Week ahead", lift CTA "View" → "Start" (the icon is a ▶), "Try adding…" → "Add…".

**Kept on purpose** (good copy; don't churn it):

- **"N cal over"** — standard, neutral nutrition phrasing every app uses; "over" here is a quantity, not a verdict. (The "over as a verdict" ban is about tone like "you went over — bad", not the number.)
- **"Speed Demon" / "Week Warrior"** badge names — badges are the one sanctioned place for light play; these are recognised idioms, not try-hard hype. Stripping all flavour makes badges sterile.
- **"Backing off"** (performance verb) — clear and calm; accurate for the overreach/deload state.
- **The `performanceInsights.ts` load/recovery/adherence templates** — already calm, observational, actionable, no exclamations. The model, not a target.
- **Status labels** like "On track / More lifting needed / Behind this week" — plain, factual, not shaming.

Lesson: over-editing good copy is its own failure mode. Change what's cringe, AI, vague, or shaming — leave what's already plain and clear.

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
- **Nutrition copy is never judgmental about food** — no "bad", "cheat", "over" as a verdict. Surplus is "above target", a neutral fact, not a failure.
